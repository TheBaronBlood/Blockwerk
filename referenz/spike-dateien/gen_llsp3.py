"""Erzeugt SPIKE-App-Projekte (.llsp3, Wortblöcke) für die Musterprogramme der Robotik-AG.

Format nach der hochgeladenen Beispieldatei: llsp3 = ZIP aus manifest.json, scratch.sb3, icon.svg;
scratch.sb3 = ZIP aus project.json (Scratch 3) plus Assets.

Die Dateien enthalten keine Klänge: Der Klang, den die SPIKE-App jedem neuen Projekt mitgibt,
gehört LEGO und darf hier nicht mit ausgeliefert werden. Als Kostüm dient eine leere Datei.
"""
import io, json, os, random, string, zipfile, datetime

random.seed(4711)
SAFE = string.ascii_letters + string.digits
def rid(n=20):
    return ''.join(random.choice(SAFE) for _ in range(n))

HERE = os.path.dirname(os.path.abspath(__file__))
SVG = 'deadc057000000000000000000000000.svg'   # leeres Kostüm

# ---------------- Bausteine der Notation ----------------
def B(op, inputs=None, fields=None, sub=None, sub2=None, mut=None):
    return {'op': op, 'in': inputs or {}, 'f': fields or {}, 'sub': sub, 'sub2': sub2, 'mut': mut}

DIR = {'up': 'forward', 'down': 'back', 'cw': 'clockwise', 'ccw': 'counterclockwise'}
COLOR = {'black': '0', 'green': '6', 'red': '9', 'white': '10'}
PICS = {
    'smiley': ['00000', '09090', '00000', '90009', '09990'],
    'heart':  ['09090', '99999', '99999', '09990', '00900'],
}

def sh(op, value):
    return ('sh', op, 'field_' + op, str(value))

start    = B('flipperevents_whenProgramStarts')
motors   = B('flippermove_setMovementPair', {'PAIR': sh('flippermove_movement-port-selector', 'AB')})
def speed(v): return B('flippermove_movementSpeed', {'SPEED': ('num', v)})
def move(d, v, u): return B('flippermove_move', {'DIRECTION': sh('flippermove_custom-icon-direction', DIR[d]), 'VALUE': ('num', v)}, {'UNIT': u})
def go(d): return B('flippermove_startMove', {'DIRECTION': sh('flippermove_custom-icon-direction', DIR[d])})
def steer(x):
    if isinstance(x, dict):
        return B('flippermove_startSteer', {'STEERING': ('blk', x, sh('flippermove_rotation-wheel', 0))})
    return B('flippermove_startSteer', {'STEERING': sh('flippermove_rotation-wheel', x)})
stop     = B('flippermove_stopMove')
def beep(t, s): return B('flippersound_beepForTime', {'NOTE': sh('flippersound_custom-piano', t), 'DURATION': ('num', s)})
def light_on(pic): return B('flipperlight_lightDisplayImageOn', {'MATRIX': sh('flipperlight_matrix-5x5-brightness-image', ''.join(PICS[pic]))})
light_off = B('flipperlight_lightDisplayOff')
def write(x):
    if isinstance(x, dict): return B('flipperlight_lightDisplayText', {'TEXT': ('blk', x, ('text', 'Hello'))})
    if isinstance(x, tuple): return B('flipperlight_lightDisplayText', {'TEXT': x})
    return B('flipperlight_lightDisplayText', {'TEXT': ('text', x)})
def wait(s): return B('control_wait', {'DURATION': ('pos', s)})
def until(c): return B('control_wait_until', {'CONDITION': ('blk', c, None)})
def forever(body): return B('control_forever', sub=body)
def repeat(k, body): return B('control_repeat', {'TIMES': ('whole', k)}, sub=body)
def if_then(c, body): return B('control_if', {'CONDITION': ('blk', c, None)}, sub=body)
def if_else(c, b1, b2): return B('control_if_else', {'CONDITION': ('blk', c, None)}, sub=b1, sub2=b2)
def color(col): return B('flippersensors_isColor', {'PORT': sh('flippersensors_color-sensor-selector', 'C'), 'VALUE': sh('flippersensors_color-selector', COLOR[col])})
def refl_lt(v): return B('flippersensors_isReflectivity', {'PORT': sh('flippersensors_color-sensor-selector', 'C'), 'VALUE': ('num', v)}, {'COMPARATOR': '<'})
refl     = B('flippersensors_reflectivity', {'PORT': sh('flippersensors_color-sensor-selector', 'C')})
def closer(v): return B('flippersensors_isDistance', {'PORT': sh('flippersensors_distance-sensor-selector', 'D'), 'VALUE': ('num', v)}, {'COMPARATOR': '<', 'UNIT': 'cm'})
dist     = B('flippersensors_distance', {'PORT': sh('flippersensors_distance-sensor-selector', 'D')}, {'UNIT': 'cm'})
pressed  = B('flippersensors_isPressed', {'PORT': sh('flippersensors_force-sensor-selector', 'E')}, {'OPTION': 'pressed'})
yaw      = B('flippersensors_orientationAxis', fields={'AXIS': 'yaw'})
reset_yaw = B('flippersensors_resetYaw')

def _num_or_blk(x, kind):
    return ('blk', x, (kind, '')) if isinstance(x, dict) else (kind, x)
def abs_(x): return B('operator_mathop', {'NUM': _num_or_blk(x, 'num')}, {'OPERATOR': 'abs'})
def gt(a, b): return B('operator_gt', {'OPERAND1': _num_or_blk(a, 'text'), 'OPERAND2': _num_or_blk(b, 'text')})
def not_(x): return B('operator_not', {'OPERAND': ('blk', x, None)})
def minus(a, b): return B('operator_subtract', {'NUM1': _num_or_blk(a, 'num'), 'NUM2': _num_or_blk(b, 'num')})
def times(a, b): return B('operator_multiply', {'NUM1': _num_or_blk(a, 'num'), 'NUM2': _num_or_blk(b, 'num')})
def set_var(v, x): return B('data_setvariableto', {'VALUE': ('text', x)}, {'VARIABLE': ('var', v)})
def ch_var(v, x): return B('data_changevariableby', {'VALUE': ('num', x)}, {'VARIABLE': ('var', v)})
def var(v): return ('varrep', v)
def param(name): return B('argument_reporter_string_number', fields={'VALUE': name})
def define(name, *params): return B('procedures_definition', mut={'name': name, 'params': list(params)})
def call(name, *args): return B('procedures_call', mut={'name': name, 'args': list(args)})

# ---------------- Programme (wie auf der Webseite) ----------------
PROGRAMS = [
 # (Modul, Art, Titel, Skripte)
 (0, 'loesung', 'Begrüßung', [[start, light_on('smiley'), beep(60, 0.3), wait(1), write('Hallo AG')]]),
 (0, 'bug', 'Das Herz bleibt unsichtbar', [[start, light_on('heart'), light_off, beep(72, 0.3)]]),
 (1, 'demo', 'Eine Radumdrehung', [[start, motors, move('up', 1, 'rotations')]]),
 (1, 'loesung', 'Exakt 50 cm', [[start, motors, speed(30), move('up', 50, 'cm'), beep(60, 0.3)]]),
 (1, 'bug', 'Der Roboter will nicht anhalten', [[start, motors, speed(30), move('up', 50, 'rotations'), beep(60, 0.3)]]),
 (2, 'demo', 'Quadrat ohne Schleife', [[start, motors] + [move('up', 20, 'cm'), move('cw', 180, 'degrees')] * 4]),
 (2, 'loesung', 'Quadrat mit Schleife', [[start, motors, repeat(4, [move('up', 20, 'cm'), move('cw', 180, 'degrees')])]]),
 (2, 'bug', 'Aus dem Quadrat wird ein Strich', [[start, motors, repeat(4, [move('up', 20, 'cm')]), move('cw', 180, 'degrees')]]),
 (3, 'demo', 'Was sieht der Sensor', [[start, forever([write(dist), wait(0.5)])]]),
 (3, 'loesung', 'Halt vor der Wand', [[start, motors, speed(30), until(pressed), go('up'), until(closer(10)), stop]]),
 (3, 'bug', 'Der Roboter ignoriert die Wand', [[start, motors, speed(30), go('up'), if_then(closer(10), [stop])]]),
 (4, 'loesung', 'Ampel-Roboter', [[start, motors, speed(30), forever([if_then(color('red'), [stop]), if_then(color('green'), [go('up')])])]]),
 (4, 'bug', 'Der Roboter fährt einfach los', [[start, motors, speed(30), forever([if_else(color('red'), [stop], [go('up')])])]]),
 (5, 'loesung', 'Linienzähler', [[start, set_var('Linien', 0), motors, speed(25), go('up'),
     forever([until(color('black')), ch_var('Linien', 1), write(var('Linien')), until(not_(color('black')))])]]),
 (5, 'bug', 'Der Zähler spinnt', [[start, set_var('Linien', 0), motors, speed(25), go('up'),
     forever([until(color('black')), ch_var('Linien', 1), write(var('Linien'))])]]),
 (6, 'loesung', 'Linienfolger mit zwei Zuständen', [[start, motors, speed(25), forever([if_else(refl_lt(50), [steer(-30)], [steer(30)])])]]),
 (6, 'loesung', '90-Grad-Drehung mit dem Gyrosensor', [[start, motors, speed(20), reset_yaw, go('cw'), until(gt(abs_(yaw), 88)), stop]]),
 (6, 'loesung', 'Proportionalregler', [[start, motors, speed(25), forever([steer(times(minus(refl, 50), 0.8))])]]),
 (6, 'bug', 'Nur die erste Drehung klappt', [[start, motors, speed(20), reset_yaw,
     repeat(4, [move('up', 20, 'cm'), go('cw'), until(gt(abs_(yaw), 88)), stop])]]),
 (7, 'loesung', 'Eigener Block drehe', [
     [define('drehe', 'Winkel'), reset_yaw, go('cw'), until(gt(abs_(yaw), minus(param('Winkel'), 2))), stop],
     [start, motors, speed(20), repeat(4, [move('up', 20, 'cm'), call('drehe', 90)])]]),
 (7, 'loesung', 'Eigener Block fahre bis Linie', [
     [define('fahre bis Linie'), go('up'), until(color('black')), stop],
     [start, motors, speed(25), call('fahre bis Linie')]]),
 (7, 'bug', 'Der Block dreht immer gleich weit', [
     [define('drehe', 'Winkel'), reset_yaw, go('cw'), until(gt(abs_(yaw), 88)), stop],
     [start, motors, speed(20), call('drehe', 45), wait(1), call('drehe', 180)]]),
]
TYPE_LABEL = {'demo': 'Demo', 'bug': 'Bug-Jagd', 'loesung': 'Loesung'}

# ---------------- Übersetzung in Scratch-3-JSON ----------------
class Project:
    def __init__(self):
        self.blocks = {}
        self.vars = {}      # name -> id
        self.procs = {}     # name -> (proccode, [argids], [argnames])
        self.extensions = set()

    def var_id(self, name):
        if name not in self.vars:
            self.vars[name] = rid()
        return self.vars[name]

    def proc(self, name, params=None):
        if name not in self.procs:
            params = params or []
            code = name + ''.join(' %s' for _ in params)
            self.procs[name] = (code, [rid() for _ in params], list(params))
        return self.procs[name]

    def note_ext(self, op):
        prefix = op.split('_')[0]
        if prefix.startswith('flipper'):
            self.extensions.add(prefix)

    def new(self, op, parent, shadow=False, top=False):
        bid = rid()
        self.blocks[bid] = {'opcode': op, 'next': None, 'parent': parent, 'inputs': {}, 'fields': {},
                            'shadow': shadow, 'topLevel': top}
        self.note_ext(op)
        return bid

    def shadow(self, spec, parent):
        _, op, field, value = spec
        sid = self.new(op, parent, shadow=True)
        self.blocks[sid]['fields'][field] = [value, None]
        return sid

    def literal(self, kind, v):
        code = {'num': 4, 'pos': 5, 'whole': 6, 'text': 10}[kind]
        return [code, str(v)]

    def input_value(self, spec, parent):
        kind = spec[0]
        if kind in ('num', 'pos', 'whole', 'text'):
            return [1, self.literal(kind, spec[1])]
        if kind == 'sh':
            return [1, self.shadow(spec, parent)]
        if kind == 'varrep':
            name = spec[1]
            return [3, [12, name, self.var_id(name)], [10, '']]
        if kind == 'blk':
            child, fallback = spec[1], spec[2]
            cid = self.block(child, parent)
            if fallback is None:
                return [2, cid]
            if fallback[0] == 'sh':
                return [3, cid, self.shadow(fallback, parent)]
            return [3, cid, self.literal(fallback[0], fallback[1])]
        raise ValueError(spec)

    def block(self, spec, parent, top=False):
        op = spec['op']
        if op == 'procedures_definition':
            return self.definition(spec, top)
        bid = self.new(op, parent, top=top)
        blk = self.blocks[bid]
        for name, f in spec['f'].items():
            if isinstance(f, tuple) and f[0] == 'var':
                blk['fields'][name] = [f[1], self.var_id(f[1])]
            else:
                blk['fields'][name] = [str(f), None]
        for name, inp in spec['in'].items():
            blk['inputs'][name] = self.input_value(inp, bid)
        if spec['sub'] is not None:
            first = self.stack(spec['sub'], bid)
            blk['inputs']['SUBSTACK'] = [2, first] if first else [1, None]
        if spec['sub2'] is not None:
            first = self.stack(spec['sub2'], bid)
            blk['inputs']['SUBSTACK2'] = [2, first] if first else [1, None]
        if op == 'procedures_call':
            code, argids, _ = self.proc(spec['mut']['name'])
            blk['mutation'] = {'tagName': 'mutation', 'children': [], 'proccode': code,
                               'argumentids': json.dumps(argids), 'warp': 'false'}
            for aid, val in zip(argids, spec['mut']['args']):
                blk['inputs'][aid] = [1, [10, str(val)]]
        return bid

    def definition(self, spec, top):
        name, params = spec['mut']['name'], spec['mut']['params']
        code, argids, argnames = self.proc(name, params)
        did = self.new('procedures_definition', None, top=top)
        pid = self.new('procedures_prototype', did, shadow=True)
        self.blocks[did]['inputs']['custom_block'] = [1, pid]
        proto = self.blocks[pid]
        proto['mutation'] = {'tagName': 'mutation', 'children': [], 'proccode': code,
                             'argumentids': json.dumps(argids), 'argumentnames': json.dumps(argnames),
                             'argumentdefaults': json.dumps(['' for _ in argids]), 'warp': 'false'}
        for aid, aname in zip(argids, argnames):
            a = self.new('argument_reporter_string_number', pid, shadow=True)
            self.blocks[a]['fields']['VALUE'] = [aname, None]
            proto['inputs'][aid] = [1, a]
        return did

    def stack(self, specs, parent, top_xy=None):
        first = prev = None
        for i, s in enumerate(specs):
            is_top = top_xy is not None and i == 0
            bid = self.block(s, prev if prev else (None if is_top else parent), top=is_top)
            if is_top:
                self.blocks[bid]['x'], self.blocks[bid]['y'] = top_xy
            if prev:
                self.blocks[prev]['next'] = bid
                self.blocks[bid]['parent'] = prev
            else:
                first = bid
                if not is_top:
                    self.blocks[bid]['parent'] = parent
            prev = bid
        return first

def check(blocks):
    """Strukturprüfung: Verweise, Eltern, Schatten, Startpositionen."""
    for bid, b in blocks.items():
        if b['next']:
            assert b['next'] in blocks and blocks[b['next']]['parent'] == bid, ('next', bid)
        if b['parent']:
            assert b['parent'] in blocks, ('parent', bid)
        else:
            assert b['topLevel'] and 'x' in b, ('top', bid)
        for name, v in b['inputs'].items():
            for ref in v[1:]:
                if isinstance(ref, str):
                    assert ref in blocks and blocks[ref]['parent'] == bid, ('input', bid, name)

def build(prog):
    module, kind, title, scripts = prog
    p = Project()
    x = 0
    for s in scripts:
        p.stack(s, None, top_xy=(x, 0))
        x += 620
    check(p.blocks)
    sprite = rid()
    project = {
        'targets': [
            {'isStage': True, 'name': 'Stage', 'variables': {}, 'lists': {}, 'broadcasts': {}, 'blocks': {},
             'comments': {}, 'currentCostume': 0,
             'costumes': [{'assetId': SVG[:-4], 'name': 'backdrop1', 'bitmapResolution': 1, 'md5ext': SVG,
                           'dataFormat': 'svg', 'rotationCenterX': 47, 'rotationCenterY': 55}],
             'sounds': [], 'volume': 0, 'tempo': 60, 'videoTransparency': 50, 'videoState': 'on',
             'textToSpeechLanguage': None},
            {'isStage': False, 'name': sprite,
             'variables': {vid: [name, 0] for name, vid in p.vars.items()},
             'lists': {}, 'broadcasts': {}, 'blocks': p.blocks, 'comments': {}, 'currentCostume': 0,
             'costumes': [{'assetId': SVG[:-4], 'name': rid(), 'bitmapResolution': 1, 'md5ext': SVG,
                           'dataFormat': 'svg', 'rotationCenterX': 240, 'rotationCenterY': 180}],
             'sounds': [],
             'volume': 100, 'visible': True, 'x': 0, 'y': 0, 'size': 100, 'direction': 90,
             'draggable': False, 'rotationStyle': 'all around'}],
        'monitors': [],
        'extensions': sorted(p.extensions),
        'meta': {'semver': '3.0.0', 'vm': '0.2.0-prerelease.20200512204241', 'agent': 'Robotik-AG Generator'}
    }
    name = f'M{module} {TYPE_LABEL[kind]} – {title}'
    now = datetime.datetime(2026, 10, 4, 18, 0, 0).isoformat(timespec='milliseconds') + 'Z'
    manifest = {
        'type': 'word-blocks', 'autoDelete': False, 'created': now, 'id': rid(12), 'lastsaved': now,
        'size': 0, 'name': name, 'slotIndex': 0, 'workspaceX': 120, 'workspaceY': 210, 'zoomLevel': 0.675,
        'showAllBlocks': False, 'version': 38, 'hardware': {rid(): {'type': 'flipper'}},
        'extensions': sorted(p.extensions),
        'state': {'playMode': 'download', 'canvasDrawerTab': 'monitorTab', 'canvasDrawerOpen': False},
        'extraFiles': []
    }
    sb3 = io.BytesIO()
    with zipfile.ZipFile(sb3, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('project.json', json.dumps(project, ensure_ascii=False, separators=(',', ':')))
        z.writestr(SVG, b'')
    icon = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 245 87">'
            '<rect x="1" y="12" width="243" height="62" rx="8" fill="#F5C402" stroke="#C8A300"/>'
            f'<text x="16" y="50" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#fff">M{module} {TYPE_LABEL[kind]}</text></svg>')
    out = io.BytesIO()
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_STORED) as z:
        z.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
        z.writestr('scratch.sb3', sb3.getvalue())
        z.writestr('icon.svg', icon)
    return name, out.getvalue()

def ascii_name(s):
    tr = str.maketrans({'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', '–': '-'})
    return ''.join(c for c in s.translate(tr) if c.isalnum() or c in ' -_').replace('  ', ' ').strip()

if __name__ == '__main__':
    outdir = os.path.join(HERE, 'ausgabe')
    os.makedirs(outdir, exist_ok=True)
    files = []
    for prog in PROGRAMS:
        name, data = build(prog)
        folder = 'Nur fuer die Leitung' if prog[1] == 'loesung' else 'Fuer die Teilnehmenden'
        fn = ascii_name(name) + '.llsp3'
        os.makedirs(os.path.join(outdir, folder), exist_ok=True)
        with open(os.path.join(outdir, folder, fn), 'wb') as f:
            f.write(data)
        files.append((folder, fn))
    for f in files: print(*f)
