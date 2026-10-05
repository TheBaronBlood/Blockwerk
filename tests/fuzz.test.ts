// Baut zufällige Programme aus allen Blöcken des Werkzeugkastens und prüft, ob das erzeugte
// Python stimmt – auch in Zusammenstellungen, an die niemand gedacht hat. Der Zufall ist fest
// vorgegeben, das Ergebnis also bei jedem Lauf dasselbe.
import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { toolbox } from '../src/toolbox';

const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);
const tmp = mkdtempSync(join(tmpdir(), 'blockwerk-fuzz-'));
afterAll(() => rmSync(tmp, {recursive:true, force:true}));

type Item = Record<string, unknown> & {type: string};
const HATS = ['pb_start', 'pb_when', 'pb_when_message'];
const LOOPS = ['pb_forever', 'controls_repeat_ext', 'controls_whileUntil', 'controls_for', 'controls_forEach'];
const VARS = [{name:'Zähler', id:'v1'}, {name:'Liste', id:'v2'}, {name:'i', id:'v3'}];
const PROCS = ['Ecke', 'Messen'];

/** Alle Einträge des Werkzeugkastens, dazu die Blöcke aus »Variablen« und »Meine Blöcke«. */
function catalog(){
  const items: Item[] = [];
  for (const cat of (toolbox as unknown as {contents: {contents?: Item[]}[]}).contents)
    for (const item of cat.contents ?? []) if (item.type && !HATS.includes(item.type)) items.push(item);
  for (const v of VARS){
    items.push({type:'variables_get', fields:{VAR:{id:v.id}}});
    items.push({type:'variables_set', fields:{VAR:{id:v.id}}});
    items.push({type:'math_change', fields:{VAR:{id:v.id}}});
  }
  items.push({type:'controls_for', fields:{VAR:{id:'v3'}}});
  items.push({type:'procedures_callnoreturn', extraState:{name:PROCS[0]}});
  items.push({type:'procedures_callreturn', extraState:{name:PROCS[1]}});
  return items;
}

function build(seed: number){
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
  const ws = new Blockly.Workspace();
  for (const v of VARS) ws.getVariableMap().createVariable(v.name, '', v.id);
  const items = catalog();
  const make = (item: Item) => {
    const b = Blockly.serialization.blocks.append(item as unknown as Blockly.serialization.blocks.State, ws);
    // Auswahlfelder zufällig stellen (Farbe Schwarz, Licht aus, andere Rechenart …)
    for (const input of b.inputList) for (const field of input.fieldRow)
      if (field instanceof Blockly.FieldDropdown && field.name !== 'VAR' && rnd() < 0.5) field.setValue(pick(field.getOptions(false))[1] as string);
    return b;
  };
  const checker = ws.connectionChecker;
  const fill = (b: Blockly.Block, depth: number, inLoop: boolean, inProc: boolean) => {
    for (const input of b.inputList){
      const conn = input.connection;
      if (!conn) continue;
      if (conn.type === Blockly.ConnectionType.INPUT_VALUE){
        if (depth <= 0 || rnd() < 0.45) continue;
        for (let tries = 0; tries < 8; tries++){
          const child = make(pick(items));
          if (child.outputConnection && checker.canConnect(conn, child.outputConnection, false) && (inProc ? !child.type.startsWith('procedures_call') : true)){
            conn.connect(child.outputConnection); fill(child, depth - 1, inLoop, inProc); break;
          }
          child.dispose(false);
        }
      } else if (conn.type === Blockly.ConnectionType.NEXT_STATEMENT){
        stack(conn, depth - 1, inLoop || LOOPS.includes(b.type), inProc);
      }
    }
  };
  const stack = (conn: Blockly.Connection, depth: number, inLoop: boolean, inProc: boolean) => {
    const count = depth < 0 ? 0 : Math.floor(rnd() * 4);
    for (let n = 0; n < count; n++){
      let child: Blockly.Block | null = null;
      for (let tries = 0; tries < 8 && !child; tries++){
        const c = make(pick(items));
        // »abbrechen« schaltet Blockly außerhalb von Schleifen ab; eigene Blöcke rufen sich hier nicht selbst auf
        const ok = c.previousConnection && (c.type !== 'controls_flow_statements' || inLoop) && !(inProc && c.type.startsWith('procedures_call'));
        if (ok) child = c; else c.dispose(false);
      }
      if (!child) break;
      conn.connect(child.previousConnection!);
      fill(child, depth, inLoop, inProc);
      if (!child.nextConnection) break;
      conn = child.nextConnection;
    }
  };
  // ein bis vier Ereignisse
  const hats = 1 + Math.floor(rnd() * 4);
  for (let n = 0; n < hats; n++){
    const hat = make({type: n === 0 && rnd() < 0.7 ? 'pb_start' : pick(HATS)});
    fill(hat, 1, false, false);
    stack(hat.nextConnection!, 2, false, false);
  }
  const def1 = make({type:'procedures_defnoreturn', fields:{NAME:PROCS[0]}});
  fill(def1, 2, false, true);
  const def2 = make({type:'procedures_defreturn', fields:{NAME:PROCS[1]}});
  fill(def2, 2, false, true);
  return ws;
}

describe('Zufällige Programme', () => {
  const RUNS = Number(process.env.FUZZ_RUNS) || 400;
  it.skipIf(!python)(`${RUNS} Programme aus zufällig gesteckten Blöcken ergeben stimmiges Python`, () => {
    const sources: Record<string, string> = {};
    let multi = 0;
    for (let seed = 1; seed <= RUNS; seed++){
      const ws = build(seed);
      try {
        const code = generate(ws).lines.map(l => l.text).join('\n') + '\n';
        expect(code).not.toContain('⟦');
        if (code.includes('run_task(')) multi++;
        const name = `fuzz_${String(seed).padStart(4, '0')}.py`;
        sources[name] = code;
        writeFileSync(join(tmp, name), code, 'utf8');
      } finally { ws.dispose(); }
    }
    // beide Arten von Programmen müssen reichlich vorkommen
    expect(multi).toBeGreaterThan(RUNS / 4);
    expect(RUNS - multi).toBeGreaterThan(RUNS / 10);
    const r = spawnSync(python!, [join(__dirname, 'pruefe_python.py'), tmp], {encoding:'utf8'});
    expect(r.stderr).toBe('');
    const failed = r.stdout.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as {file: string; problems: string[]});
    const report = failed.slice(0, 3).map(f => `${f.file}: ${f.problems.join('; ')}\n${sources[f.file]}`).join('\n\n');
    expect(`${failed.length} fehlerhaft\n${report}`).toBe('0 fehlerhaft\n');
  }, 120_000);
});
