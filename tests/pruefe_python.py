"""Prüft erzeugte Pybricks-Programme, ohne sie auszuführen (für tests/fuzz.test.ts).

Aufruf: python3 pruefe_python.py <ordner>  –  gibt je fehlerhafter Datei eine Zeile JSON aus.
Geprüft wird, was `py_compile` nicht sieht: unbekannte Namen, fehlendes oder überflüssiges
`await`, Schleifen, die bei mehreren Ereignissen die anderen Programmteile aussperren.
"""
import ast, builtins, json, os, re, sys

# Methoden, die laut Paket pybricks 4.0.0 ein Awaitable liefern, je Gerätename
AWAITABLE = [
    (r'roboter$', {'straight', 'turn', 'arc'}),
    (r'motor_[A-F]$', {'run_angle', 'run_time', 'run_target'}),
    (r'hub\.speaker$', {'beep'}),
    (r'controller$', {'rumble'}),
    (r'farbe_[A-F]$', {'color', 'reflection'}),
    (r'abstand_[A-F]$', {'distance'}),
    (r'kraft_[A-F]$', {'force', 'pressed'}),
    (r'fernbedienung\.light$', {'on', 'off'}),
]


def dotted(node):
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Attribute):
        return dotted(node.value) + '.' + node.attr
    return '?'


def check(source):
    try:
        tree = ast.parse(source)
        compile(tree, 'programm', 'exec')
    except SyntaxError as err:
        return ['Syntax: %s (Zeile %s)' % (err.msg, err.lineno)]
    problems = []
    async_defs = {n.name for n in tree.body if isinstance(n, ast.AsyncFunctionDef)}
    multi = any(isinstance(n, ast.Call) and dotted(n.func) == 'run_task' for n in ast.walk(tree))
    if not multi and (async_defs or any(isinstance(n, ast.Await) for n in ast.walk(tree))):
        problems.append('async/await in einem Programm mit nur einem Ereignis')

    def awaitable(call):
        name = dotted(call.func)
        if name in async_defs or name == 'wait':
            return True
        if isinstance(call.func, ast.Attribute):
            owner = dotted(call.func.value)
            return any(re.match(pat, owner) and call.func.attr in names for pat, names in AWAITABLE)
        return False

    awaited = {id(n.value) for n in ast.walk(tree) if isinstance(n, ast.Await)}
    if multi:
        for fn in tree.body:
            if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)) or fn.name == 'sende':
                continue
            for n in ast.walk(fn):
                if isinstance(n, ast.Call) and awaitable(n) and id(n) not in awaited:
                    problems.append('ohne await: %s (Zeile %d)' % (dotted(n.func), n.lineno))
                # jede Schleife braucht eine Stelle, an der sicher gewartet wird
                if isinstance(n, (ast.While, ast.For)) and isinstance(fn, ast.AsyncFunctionDef):
                    def sure(stmt):
                        return isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Await)
                    # Ereignis: wartet vor dem Stapel, bis die Bedingung wahr ist, und danach, bis sie
                    # wieder falsch ist – eine der beiden Schleifen läuft in jeder Runde
                    waits = [s for s in n.body if isinstance(s, ast.While) and any(sure(x) for x in s.body)]
                    if not any(sure(s) for s in n.body) and len(waits) < 2:
                        problems.append('Schleife ohne sicheres await (Zeile %d)' % n.lineno)
        # nichts Wartendes außerhalb der Aufgaben
        for n in tree.body:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for c in ast.walk(n):
                if isinstance(c, ast.Call) and awaitable(c) and dotted(c.func) not in async_defs:
                    problems.append('wartender Befehl außerhalb einer Aufgabe (Zeile %d)' % c.lineno)

    # unbekannte Namen
    known = set(dir(builtins))
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            known.update((a.asname or a.name).split('.')[0] for a in n.names)
        elif isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            known.add(n.name)
            known.update(a.arg for a in n.args.args)
        elif isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            known.add(n.id)
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in known:
            problems.append('unbekannter Name: %s (Zeile %d)' % (n.id, n.lineno))

    # eine Variable, die eine Funktion ändert, muss dort als global angemeldet sein
    top = {t.id for n in tree.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)}
    for fn in tree.body:
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        declared = {name for n in ast.walk(fn) if isinstance(n, ast.Global) for name in n.names}
        params = {a.arg for a in fn.args.args}
        for n in ast.walk(fn):
            if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store) and n.id in top and n.id not in declared | params:
                problems.append('ändert %s ohne global (Zeile %d)' % (n.id, n.lineno))
    return sorted(set(problems))


if __name__ == '__main__':
    folder = sys.argv[1]
    for name in sorted(os.listdir(folder)):
        if name.endswith('.py'):
            with open(os.path.join(folder, name), encoding='utf-8') as f:
                found = check(f.read())
            if found:
                print(json.dumps({'file': name, 'problems': found}, ensure_ascii=False))
