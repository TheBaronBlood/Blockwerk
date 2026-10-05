import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { N } from '../src/toolbox';
import { parseExtension, setColour, slug } from '../src/ext/parse';
import { registerExtension, stripBlocks, toolboxBlocks, toolboxCategory, unregisterTypes } from '../src/ext/register';
import { testProgram } from '../src/ext/check';
import { TEMPLATE } from '../src/ext/template';
import { GUIDE } from '../src/ext/guide';
import { encodeModules } from '../src/hub/protocol';

// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2 und kennt kein async
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);
const dir = mkdtempSync(join(tmpdir(), 'blockwerk-ext-'));
function compiles(code: string, name: string){
  if (!python) return;
  const file = join(dir, name + '.py');
  writeFileSync(file, code, 'utf8');
  const res = spawnSync(python, ['-m', 'py_compile', file], {encoding:'utf8'});
  expect(res.stderr).toBe('');
}

let registered: string[] = [];
function install(source: string){
  const {ext, errors} = parseExtension(source);
  expect(errors).toEqual([]);
  registered.push(...registerExtension(ext!));
  return ext!;
}
afterEach(() => { unregisterTypes(registered); registered = []; });

type B = Record<string, unknown>;
/** Übersetzt ein Programm aus Blöcken, die unter »wenn Programm startet« hängen. */
function run(...blocks: B[]){
  const ws = new Blockly.Workspace();
  const chain = blocks.reduceRight<B | undefined>((next, b) => ({...b, ...(next ? {next:{block:next}} : {})}), undefined);
  Blockly.serialization.workspaces.load({blocks:{blocks:[{type:'pb_start', x:0, y:0, ...(chain ? {next:{block:chain}} : {})}]}}, ws);
  const res = generate(ws);
  ws.dispose();
  return {...res, text:res.lines.map(l => l.text)};
}

const SMALL = `# blockwerk: erweiterung Greifer
# blockwerk: farbe #123abc
# blockwerk: beschreibung Auf und zu

# Erklärung, die nicht ins Programm gehört
# blockwerk: kopf
from pybricks.tools import wait, StopWatch
from pybricks.parameters import Stop
import ustruct
from greiflib import kraft

GREIF_TEMPO = 300

def greife(motor, winkel):
    # zufahren
    motor.run_angle(GREIF_TEMPO, winkel, Stop.HOLD)
    wait(50)

# Der nächste Block
# blockwerk: block greife mit Motor %1 um %2 Grad
# blockwerk: beschreibung Schließt den Greifer.
# blockwerk: motor ARM D
# blockwerk: eingabe WINKEL Zahl 90
greife({ARM}, {WINKEL})

# blockwerk: block doppelt so viel wie %1
# blockwerk: id doppelt
# blockwerk: ausgabe Zahl
# blockwerk: eingabe X Zahl 2
{X} * 2

# blockwerk: block Richtung %1 merken
# blockwerk: auswahl RICHTUNG Links=-1, Rechts=1
    richtung = {RICHTUNG}
    if richtung > 0:
        print("rechts")

# blockwerk: block fahre %1 mm
# blockwerk: eingabe WEG Zahl 100
# blockwerk: benutzt fahrbasis
roboter.straight({WEG})

# blockwerk: modul greiflib
def kraft():
    return 3
`;

describe('Erweiterung lesen', () => {
  it('liest Name, Farbe, Kopf, Importe, Module und Blöcke', () => {
    const {ext, errors} = parseExtension(SMALL);
    expect(errors).toEqual([]);
    expect(ext).toMatchObject({id:'greifer', name:'Greifer', colour:'#123ABC', description:'Auf und zu'});
    expect(ext!.fromImports).toEqual([['pybricks.tools', ['wait', 'StopWatch']], ['pybricks.parameters', ['Stop']], ['greiflib', ['kraft']]]);
    expect(ext!.plainImports).toEqual(['import ustruct']);
    expect(ext!.defines).toEqual(['GREIF_TEMPO', 'greife']);
    // Importe sind herausgelöst, der Kommentar vor dem nächsten Abschnitt gehört nicht dazu
    expect(ext!.head[0]).toBe('GREIF_TEMPO = 300');
    expect(ext!.head[ext!.head.length - 1]).toBe('    wait(50)');
    expect(ext!.modules).toEqual([{name:'greiflib', source:'def kraft():\n    return 3\n'}]);
    expect(ext!.blocks.map(b => b.id)).toEqual(['greife_mit_motor_um_grad', 'doppelt', 'richtung_merken', 'fahre_mm']);
    expect(ext!.blocks[0]).toMatchObject({tooltip:'Schließt den Greifer.', output:null, code:['greife({ARM}, {WINKEL})']});
    expect(ext!.blocks[0].inputs).toEqual([{name:'ARM', kind:'device', device:'motor', def:'D'}, {name:'WINKEL', kind:'value', check:'Number', def:'90'}]);
    expect(ext!.blocks[1].output).toEqual({check:'Number'});
    // gemeinsame Einrückung des Codes entfernt, innere bleibt
    expect(ext!.blocks[2].code).toEqual(['richtung = {RICHTUNG}', 'if richtung > 0:', '    print("rechts")']);
    expect(ext!.blocks[3].usesDrive).toBe(true);
  });

  it('meldet Fehler mit Zeile und in ganzen Sätzen', () => {
    const {errors} = parseExtension(`# blockwerk: erweiterung Test
x = 1
# blockwerk: farbe rot
# blockwerk: block eins %1 %3
# blockwerk: eingabe A Zahl viel
# blockwerk: eingabe B Farbe
# blockwerk: bloc tippfehler
mache({C})
# blockwerk: block leer
# blockwerk: block wert
# blockwerk: ausgabe Zahl
a
b
`);
    const at = (line: number) => errors.filter(e => e.line === line).map(e => e.text).join(' ');
    expect(at(2)).toMatch(/gehört zu keinem Abschnitt/);
    expect(at(3)).toMatch(/Farbe muss so aussehen/);
    expect(at(5)).toMatch(/keine Zahl/);
    expect(at(6)).toMatch(/Art »Farbe« gibt es nicht/);
    expect(at(7)).toMatch(/»bloc« kennt Blockwerk nicht/);
    expect(at(4)).toMatch(/%1.*nur 0 Eingabe|%3/);
    expect(at(4)).toMatch(/\{C\}.*keine Eingabe/);
    expect(at(9)).toMatch(/keinen Python-Code/);
    expect(at(10)).toMatch(/nur aus einer Zeile/);
  });

  it('verlangt Namen und mindestens einen Block', () => {
    expect(parseExtension('').ext).toBeNull();
    expect(parseExtension('# blockwerk: erweiterung Leer\n').errors.map(e => e.text).join(' ')).toMatch(/noch keinen Block/);
  });

  it('hängt fehlende Platzhalter an den Text und bildet Bezeichner', () => {
    const {ext} = parseExtension('# blockwerk: erweiterung Ä b!\n# blockwerk: block Größe\n# blockwerk: eingabe A\n# blockwerk: eingabe B\nf({A}, {B})\n');
    expect(ext!.id).toBe('ae_b');
    expect(ext!.blocks[0]).toMatchObject({id:'groesse', message:'Größe %1 %2'});
    expect(slug('PID-Regler 2')).toBe('pid_regler_2');
  });

  it('setzt die Farbe im Quelltext', () => {
    expect(setColour('# blockwerk: erweiterung X\n# blockwerk: farbe #000000\n', '#ff8800')).toContain('# blockwerk: farbe #FF8800');
    expect(setColour('# blockwerk: erweiterung X\n# blockwerk: block a\npass\n', '#ff8800').split('\n')[1]).toBe('# blockwerk: farbe #FF8800');
  });
});

describe('Erweiterung im Programm', () => {
  it('setzt Kopf und Importe einmal ein und trägt Geräte ein', () => {
    const ext = install(SMALL);
    const greife = {type:'ext_greifer_greife_mit_motor_um_grad', fields:{ARM:'D'}, inputs:{WINKEL:N(45)}};
    const res = run(greife, {type:'pb_wait', inputs:{MS:N(100)}}, {...greife, fields:{ARM:'E'}});
    expect(res.warnings).toEqual([]);
    expect(res.text.slice(0, 6)).toEqual([
      'from pybricks.hubs import PrimeHub',
      'from pybricks.parameters import Port, Stop',
      'from pybricks.pupdevices import Motor',
      'from pybricks.tools import wait, StopWatch',
      'from greiflib import kraft',
      'import ustruct'
    ]);
    expect(res.text.filter(l => l === '# Erweiterung: Greifer')).toHaveLength(1);
    expect(res.text.filter(l => l.startsWith('def greife'))).toHaveLength(1);
    expect(res.text).toContain('motor_D = Motor(Port.D)');
    expect(res.text).toContain('motor_E = Motor(Port.E)');
    expect(res.text.slice(-3)).toEqual(['greife(motor_D, 45)', 'wait(100)', 'greife(motor_E, 45)']);
    expect(res.modules).toEqual(ext.modules);
    // der Kopf steht vor dem Programm und hinter den Geräten
    expect(res.text.indexOf('# Erweiterung: Greifer')).toBeGreaterThan(res.text.indexOf('motor_E = Motor(Port.E)'));
    compiles(res.text.join('\n') + '\n', 'greifer');
  });

  it('lässt den Kopf weg, wenn kein Block der Erweiterung benutzt wird', () => {
    install(SMALL);
    const res = run({type:'pb_wait', inputs:{MS:N(100)}});
    expect(res.text.join('\n')).not.toMatch(/Erweiterung|greife|ustruct/);
    expect(res.modules).toEqual([]);
  });

  it('klammert eingesetzte Werte nur, wo es nötig ist', () => {
    install(SMALL);
    const sum = {block:{type:'math_arithmetic', fields:{OP:'ADD'}, inputs:{A:N(1), B:N(2)}}};
    const doppelt = (x: unknown) => ({block:{type:'ext_greifer_doppelt', inputs:{X:x}}});
    // als Argument ohne Klammern, in einer Rechnung mit
    expect(run({type:'ext_greifer_greife_mit_motor_um_grad', fields:{ARM:'D'}, inputs:{WINKEL:sum}}).text.pop()).toBe('greife(motor_D, 1 + 2)');
    expect(run({type:'pb_wait', inputs:{MS:doppelt(sum)}}).text.pop()).toBe('wait((1 + 2) * 2)');
    expect(run({type:'pb_wait', inputs:{MS:doppelt(N(7))}}).text.pop()).toBe('wait(7 * 2)');
    // der Wert des Blocks selbst wird in einer Rechnung geklammert
    const product = {block:{type:'math_arithmetic', fields:{OP:'MINUS'}, inputs:{A:N(10), B:doppelt(N(3))}}};
    expect(run({type:'pb_wait', inputs:{MS:{block:{type:'math_arithmetic', fields:{OP:'POWER'}, inputs:{A:doppelt(N(3)), B:N(2)}}}}}).text.pop()).toBe('wait((3 * 2) ** 2)');
    expect(run({type:'pb_wait', inputs:{MS:product}}).text.pop()).toMatch(/^wait\(10 - \(?3 \* 2\)?\)$/);
  });

  it('übernimmt mehrzeiligen Code samt Einrückung, auch in einer Schleife', () => {
    install(SMALL);
    const res = run({type:'pb_forever', inputs:{DO:{block:{type:'ext_greifer_richtung_merken', fields:{RICHTUNG:'-1'}}}}});
    expect(res.text.slice(-4)).toEqual(['while True:', '    richtung = -1', '    if richtung > 0:', '        print("rechts")']);
    // alle Zeilen gehören zum Block der Erweiterung
    const ids = new Set(res.lines.slice(-3).map(l => l.id));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
    compiles(res.text.join('\n') + '\n', 'richtung');
  });

  it('legt die Fahrbasis an, wenn ein Block sie benutzt', () => {
    install(SMALL);
    const res = run({type:'ext_greifer_fahre_mm', inputs:{WEG:N(250)}});
    expect(res.text.some(l => l.startsWith('roboter = DriveBase('))).toBe(true);
    expect(res.text.pop()).toBe('roboter.straight(250)');
  });

  it('baut Werkzeugkasten-Einträge mit Vorgabewerten', () => {
    const ext = install(SMALL);
    expect(toolboxCategory(ext)).toMatchObject({kind:'category', name:'Greifer', colour:'#123ABC'});
    expect(toolboxBlocks(ext)[0]).toEqual({kind:'block', type:'ext_greifer_greife_mit_motor_um_grad', fields:{ARM:'D'}, inputs:{WINKEL:N(90)}});
    const block = new Blockly.Workspace().newBlock('ext_greifer_doppelt');
    expect(block.outputConnection).toBeTruthy();
    expect(block.getInput('X')).toBeTruthy();
  });

  it('die Vorlage ist fehlerfrei und ergibt gültiges Python', () => {
    const ext = install(TEMPLATE);
    compiles(testProgram(ext), 'vorlage_pruefung');
    const res = run(
      {type:'ext_pid_regler_pid_einstellen_p_i_d', inputs:{P:N(1.2), I:N(0), D:N(0.1)}},
      {type:'pb_forever', inputs:{DO:{block:{type:'ext_pid_regler_folge_der_linie_mit_farbsensor_tempo_sollwert', fields:{SENSOR:'C'}, inputs:{TEMPO:N(120), SOLL:N(50)}}}}});
    expect(res.warnings).toEqual([]);
    expect(res.text).toContain('from pybricks.tools import StopWatch');
    expect(res.text).toContain('pid = PID()');
    expect(res.text.slice(-3)).toEqual(['pid.einstellen(1.2, 0, 0.1)', 'while True:', '    roboter.drive(120, pid.berechne(farbe_C.reflection() - 50))']);
    compiles(res.text.join('\n') + '\n', 'vorlage');
  });
});

describe('Anleitung', () => {
  it('jedes Beispiel der Anleitung lässt sich lesen und ergibt gültiges Python', () => {
    for (const section of GUIDE){
      if (!section.code) continue;
      const source = section.code.includes('blockwerk: erweiterung') ? section.code : '# blockwerk: erweiterung Beispiel\n' + section.code;
      const {ext, errors} = parseExtension(source);
      // Abschnitte, die nur Kopf oder Name zeigen, haben absichtlich keinen Block
      expect(errors.filter(e => !/noch keinen Block/.test(e.text)), section.title).toEqual([]);
      compiles(testProgram(ext!), 'anleitung_' + slug(section.title));
      for (const m of ext!.modules) compiles(m.source, 'anleitung_modul_' + m.name);
    }
  });
});

describe('Drumherum', () => {
  it('entfernt Blöcke einer Erweiterung aus einem gespeicherten Programm', () => {
    const state = {blocks:{blocks:[
      {type:'pb_start', next:{block:{type:'ext_a_x', next:{block:{type:'pb_wait', inputs:{MS:{shadow:{type:'math_number'}, block:{type:'ext_a_wert'}}},
        next:{block:{type:'ext_a_x'}}}}}}},
      {type:'ext_a_x'}
    ]}, variables:[{name:'v'}]};
    const clean = stripBlocks(state, t => t.startsWith('ext_a_'));
    expect(clean).toEqual({blocks:{blocks:[
      {type:'pb_start', next:{block:{type:'pb_wait', inputs:{MS:{shadow:{type:'math_number'}}}}}}
    ]}, variables:[{name:'v'}]});
    expect(state.blocks.blocks).toHaveLength(2);   // das Original bleibt unverändert
  });

  it('packt mehrere Module hintereinander', () => {
    const blob = encodeModules([{name:'__main__', mpy:new Uint8Array([1, 2])}, {name:'lib', mpy:new Uint8Array([3])}]);
    expect([...blob]).toEqual([2, 0, 0, 0, ...new TextEncoder().encode('__main__\0'), 1, 2, 1, 0, 0, 0, ...new TextEncoder().encode('lib\0'), 3]);
  });
});
