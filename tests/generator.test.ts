import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { at, B, cmp, EXAMPLES, S, seq, setup, ws_, type WorkspaceState } from '../src/examples';

function run(state: WorkspaceState){
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, ws);
    const res = generate(ws);
    return {...res, code: res.lines.map(l => l.text).join('\n') + '\n'};
  } finally { ws.dispose(); }
}
const num = (n: number) => ({shadow:{type:'math_number', fields:{NUM:n}}});
const program = (first: object, variables?: object[]): WorkspaceState => ({
  blocks:{languageVersion:0, blocks:[{type:'pb_start', x:0, y:0, next:{block:first}}]}, ...(variables ? {variables} : {})
});

// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2 und kennt kein async
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);
const tmp = mkdtempSync(join(tmpdir(), 'blockwerk-'));
afterAll(() => rmSync(tmp, {recursive:true, force:true}));

describe('Beispiele', () => {
  for (const [name, make] of Object.entries(EXAMPLES)){
    it(`${name}: erzeugter Code bleibt stabil`, () => {
      const res = run(make());
      expect(res.warnings).toEqual([]);
      expect(res.code).toMatchSnapshot();
    });
    it.skipIf(!python)(`${name}: py_compile akzeptiert den Code`, () => {
      const file = join(tmp, name + '.py');
      writeFileSync(file, run(make()).code, 'utf8');
      const r = spawnSync(python!, ['-m', 'py_compile', file], {encoding:'utf8'});
      expect(r.stderr).toBe('');
      expect(r.status).toBe(0);
    });
  }
});

describe('Generator', () => {
  it('gibt nur benutzte Importe aus', () => {
    const {code} = run(EXAMPLES.motor());
    expect(code).toContain('from pybricks.parameters import Port\n');
    expect(code).toContain('from pybricks.pupdevices import Motor\n');
    expect(code).toContain('from pybricks.tools import wait\n');
    expect(code).not.toContain('DriveBase');
    expect(code).not.toContain('Direction');
  });

  it('entfernt die Markerzeilen und ordnet Zeilen ihren Blöcken zu', () => {
    const state = program({type:'pb_forever', id:'schleife', inputs:{DO:{block:{type:'pb_wait', id:'pause', inputs:{MS:num(100)}}}}});
    const {lines, code} = run(state);
    expect(code).not.toContain('⟦');
    expect(lines.find(l => l.text === 'while True:')?.id).toBe('schleife');
    expect(lines.find(l => l.text === '    wait(100)')?.id).toBe('pause');
  });

  it('»ändere um« kommt ohne das Modul numbers aus', () => {
    const {code} = run(EXAMPLES.zaehlen());
    expect(code).toContain('Linien = Linien + 1');
    expect(code).not.toContain('numbers');
  });

  it('transliteriert Umlaute in Variablennamen', () => {
    const state = program({type:'variables_set', fields:{VAR:{id:'v1'}}, inputs:{VALUE:num(0)}}, [{name:'Zähler', id:'v1'}]);
    expect(run(state).code).toContain('Zaehler = 0');
  });

  it('weicht reservierten Gerätenamen aus', () => {
    const state = program({type:'variables_set', fields:{VAR:{id:'v1'}}, inputs:{VALUE:num(0)}}, [{name:'hub', id:'v1'}]);
    const {code} = run(state);
    expect(code).toContain('hub = PrimeHub()');
    expect(code).not.toMatch(/^hub = 0$/m);
  });

  it('nimmt Standardwerte, wenn »Fahrbasis einrichten« fehlt', () => {
    const {code} = run(program({type:'pb_drive_straight', inputs:{DIST:num(100)}}));
    expect(code).toContain('# Fahrbasis (Standardwerte, kein Block »Fahrbasis einrichten« gefunden)');
    expect(code).toContain('roboter = DriveBase(motor_A, motor_B, wheel_diameter=56, axle_track=112)');
  });

  it('nutzt arc() für Kurven', () => {
    const {code} = run(program({type:'pb_drive_arc', inputs:{RADIUS:num(150), ANGLE:num(90)}}));
    expect(code).toContain('roboter.arc(150, 90)');
  });

  it('hält die Reihenfolge der Motor-Argumente ein (Tempo zuerst)', () => {
    const {code} = run(program({type:'pb_motor_run_angle', fields:{PORT:'C'}, inputs:{ANGLE:num(90), SPEED:num(300)}}));
    expect(code).toContain('motor_C.run_angle(300, 90)');
  });

  it('rundet ohne das Modul math; auf- und abrunden kommen aus umath', () => {
    const show = (op: string) => program({type:'pb_display_number', inputs:{NUM:{block:{type:'math_round', fields:{OP:op}, inputs:{NUM:num(3.7)}}}}});
    const plain = run(show('ROUND')).code;
    expect(plain).toContain('hub.display.number(round(3.7))');
    expect(plain).not.toContain('math');
    const up = run(show('ROUNDUP')).code;
    expect(up).toContain('from umath import ceil\n');
    expect(up).toContain('hub.display.number(ceil(3.7))');
    expect(up).not.toContain('import math');
  });

  it('ordnet break dem eigenen Block zu, nicht der Schleife', () => {
    const state = program({type:'controls_repeat_ext', id:'schleife', inputs:{TIMES:num(3), DO:{block:{type:'controls_flow_statements', id:'abbruch', fields:{FLOW:'BREAK'}}}}});
    const {lines} = run(state);
    expect(lines.find(l => l.text.trim() === 'break')?.id).toBe('abbruch');
  });

  it('legt Controller und Fernbedienung nur bei Bedarf an', () => {
    const stick = run(program({type:'pb_display_number', inputs:{NUM:{block:{type:'pb_xbox_stick', fields:{SIDE:'left', AXIS:'1'}}}}})).code;
    expect(stick).toContain('from pybricks.iodevices import XboxController\n');
    expect(stick).toContain('controller = XboxController()\n');
    // davor und danach eine Meldung, an der man sieht, ob der Hub den Controller gefunden hat
    expect(stick).toContain("print('Suche den Xbox-Controller …')\ncontroller = XboxController()\nprint('Xbox-Controller verbunden.')\n");
    expect(stick).toContain('hub.display.number(controller.joystick_left()[1])');
    expect(stick).not.toContain('Remote');

    const remote = run(program({type:'pb_wait_until', inputs:{COND:{block:{type:'pb_remote_button', fields:{BUTTON:'LEFT_PLUS'}}}}})).code;
    expect(remote).toContain('from pybricks.pupdevices import Remote\n');
    expect(remote).toContain("print('Suche die LEGO-Fernbedienung …')\nfernbedienung = Remote()\nprint('LEGO-Fernbedienung verbunden.')\n");
    expect(remote).toContain('while not (Button.LEFT_PLUS in fernbedienung.buttons.pressed()):');
    expect(remote).not.toContain('XboxController');
    expect(run(EXAMPLES.quadrat()).code).not.toMatch(/controller|fernbedienung|steuerung/);
  });

  it('setzt die Steuerfeld-Funktion in den Kopf und meldet usesPad', () => {
    const res = run(EXAMPLES.steuerfeld());
    expect(res.usesPad).toBe(true);
    expect(res.code).toContain('from pybricks.tools import wait, read_input_byte, StopWatch\n');
    expect(res.code).toContain("roboter.drive(steuerung('y') * 3, steuerung('x') * 2)");
    expect(res.code.indexOf('def steuerung(name):')).toBeLessThan(res.code.indexOf('while True:\n    roboter.drive'));
    expect(run(EXAMPLES.quadrat()).usesPad).toBe(false);
  });

  it('nimmt Zufall aus urandom und setzt den Import in den Kopf', () => {
    const {code} = run(program({type:'pb_display_number', inputs:{NUM:{block:{type:'math_random_int', inputs:{FROM:num(1), TO:num(6)}}}}}));
    expect(code).toContain('import urandom as random\n');
    expect(code).toContain('hub.display.number(random.randint(1, 6))');
    expect(code).not.toMatch(/^import random$/m);
    expect(code.indexOf('import urandom as random')).toBeLessThan(code.indexOf('hub = PrimeHub()'));
  });

  it('nimmt Schwarz nur bei Bedarf in die erkennbaren Farben auf', () => {
    const see = (color: string) => run(program({type:'pb_wait_until', inputs:{COND:{block:{type:'pb_color_is', fields:{PORT:'C', COLOR:color}}}}})).code;
    expect(see('BLACK')).toContain('farbe_C = ColorSensor(Port.C)\nfarbe_C.detectable_colors([  # mit Schwarz\n    Color.RED, Color.YELLOW, Color.GREEN, Color.BLUE,\n    Color.WHITE, Color.BLACK, Color.NONE,\n])\n');
    expect(Math.max(...see('BLACK').split('\n').map(l => l.length))).toBeLessThan(80);
    expect(see('BLACK')).toContain('while not (farbe_C.color() == Color.BLACK):');
    expect(see('RED')).not.toContain('detectable_colors');
  });

  it('klammert Vergleiche in »warte bis«, lässt einfache Abfragen aber ohne Klammern', () => {
    const until = (cond: object) => run(program({type:'pb_wait_until', inputs:{COND:{block:cond}}})).code;
    expect(until({type:'pb_force_pressed', fields:{PORT:'E'}})).toContain('while not kraft_E.pressed():');
    expect(until({type:'logic_compare', fields:{OP:'LT'}, inputs:{A:{block:{type:'pb_reflection', fields:{PORT:'C'}}}, B:num(30)}}))
      .toContain('while not (farbe_C.reflection() < 30):');
  });

  it('überschreibt die vorab angelegten Variablen mit einer Erklärung', () => {
    expect(run(EXAMPLES.zaehlen()).code).toContain('\n# Variablen anlegen\nLinien = 0\n\nLinien = 0\n');
    expect(run(EXAMPLES.quadrat()).code).not.toContain('# Variablen anlegen');
  });

  it('legt Parameter eigener Blöcke nicht vorab als Variable an', () => {
    const state = {
      blocks:{languageVersion:0, blocks:[
        {type:'procedures_defnoreturn', x:0, y:0, fields:{NAME:'piep'}, extraState:{params:[{name:'Dauer', id:'p1'}]},
         inputs:{STACK:{block:{type:'pb_wait', inputs:{MS:{block:{type:'variables_get', fields:{VAR:{id:'p1'}}}}}}}}},
        {type:'pb_start', x:0, y:200, next:{block:{type:'variables_set', fields:{VAR:{id:'v1'}}, inputs:{VALUE:num(3)},
          next:{block:{type:'procedures_callnoreturn', extraState:{name:'piep', params:['Dauer']}, inputs:{ARG0:num(100)}}}}}}
      ]},
      variables:[{name:'Runden', id:'v1'}]
    };
    const {code} = run(state);
    expect(code).toContain('def piep(Dauer):\n    global Runden\n    wait(Dauer)\n');
    expect(code).toContain('piep(100)');
    expect(code).toContain('# Variablen anlegen\nRunden = 0\n');
    expect(code).not.toMatch(/Dauer = (None|0)/);
  });

  it('warnt bei doppelt belegtem Anschluss', () => {
    const state = program({type:'pb_motor_run', fields:{PORT:'C'}, inputs:{SPEED:num(100)},
      next:{block:{type:'pb_display_number', inputs:{NUM:{block:{type:'pb_reflection', fields:{PORT:'C'}}}}}}});
    expect(run(state).warnings).toEqual(['Anschluss C wird gleichzeitig als Motor und Farbsensor benutzt.']);
  });

  it('warnt bei Blöcken ohne Startblock und übersetzt sie nicht', () => {
    const res = run({blocks:{languageVersion:0, blocks:[{type:'pb_wait', x:0, y:0, inputs:{MS:num(5)}}]}});
    expect(res.warnings).toEqual(['Ein Block hängt an keinem Startblock und wird nicht übersetzt.']);
    expect(res.code).not.toContain('wait(5)');
    expect(res.code).toContain('# Zieh den Block »wenn Programm startet«');
  });
});

describe('Mehrere Ereignisse', () => {
  const beep = () => B('pb_beep', null, {FREQ:num(440), DUR:num(200)});
  const wait = (ms: number) => B('pb_wait', null, {MS:num(ms)});
  const when = (cond: object, ...blocks: ReturnType<typeof B>[]) => seq(B('pb_when', null, {COND:{block:cond}}), ...blocks);
  const left = () => B('pb_button', {BUTTON:'LEFT'});
  const near = () => cmp('LT', B('pb_distance', {PORT:'D'}), 100);
  const compiles = (name: string, code: string) => {
    if (!python) return;
    const file = join(tmp, name + '.py');
    writeFileSync(file, code, 'utf8');
    const r = spawnSync(python, ['-m', 'py_compile', file], {encoding:'utf8'});
    expect(r.stderr).toBe('');
  };

  it('ein einzelnes Ereignis bleibt ohne async und await', () => {
    for (const [name, make] of Object.entries(EXAMPLES)) if (name !== 'gleichzeitig') expect(run(make()).code).not.toMatch(/\b(async|await|run_task)\b/);
    // ein leerer zweiter Startblock zählt nicht
    const {code} = run(ws_([at(seq(B('pb_start'), wait(100)), 0, 0), at(B('pb_start'), 0, 200)]));
    expect(code).toContain('\nwait(100)\n');
    expect(code).not.toMatch(/\b(async|await)\b/);
  });

  it('ein einzelnes »wenn …« wird zur gewöhnlichen Schleife', () => {
    const {code, warnings} = run(ws_([at(when(B('pb_color_is', {PORT:'C', COLOR:'RED'}), beep()), 0, 0)]));
    expect(warnings).toEqual([]);
    expect(code).toContain([
      'while True:',
      '    while not (farbe_C.color() == Color.RED):',
      '        wait(10)',
      '',
      '    hub.speaker.beep(440, 200)',
      '    while farbe_C.color() == Color.RED:',
      '        wait(10)', ''].join('\n'));
    expect(code).not.toMatch(/\b(async|await)\b/);
    expect(code).not.toContain('Zieh den Block');
    compiles('wenn_einzeln', code);
  });

  it('zwei Startblöcke laufen gleichzeitig', () => {
    const {code, warnings, lines} = run(ws_([
      at(seq(B('pb_start'), setup(), B('pb_drive_straight', null, {DIST:num(200)})), 0, 0),
      at(Object.assign(seq(B('pb_start'), beep(), wait(500)), {id:'zweiter'}), 0, 200)]));
    expect(warnings).toEqual([]);
    expect(code).toContain('from pybricks.tools import wait, multitask, run_task\n');
    expect(code).toContain('async def start():\n    await roboter.straight(200)\n');
    expect(code).toContain('async def start2():\n    await hub.speaker.beep(440, 200)\n    await wait(500)\n');
    expect(code).toContain('# Alle Programmteile gleichzeitig starten\nrun_task(multitask(start(), start2()))\n');
    expect(lines.find(l => l.text === 'async def start2():')?.id).toBe('zweiter');
    expect(lines.find(l => l.text.startsWith('run_task'))?.id).toBeNull();
    compiles('zwei_starts', code);
  });

  it('setzt await vor wartende Befehle und Sensoren und lässt Schleifen die anderen dranlassen', () => {
    const {code, warnings, lines} = run(ws_([
      at(seq(B('pb_start'), B('pb_forever', null, {DO:S(wait(100))})), 0, 0),
      at(when(near(), Object.assign(B('pb_forever', null, {DO:S(B('controls_if', null, {IF0:{block:B('pb_force_pressed', {PORT:'E'})}, DO0:S(B('pb_light', {COLOR:'RED'}))}))}), {id:'schleife'})), 0, 200),
      at(when(left(), B('math_change', {VAR:{id:'v1'}}, {DELTA:num(1)})), 0, 400)],
      [{name:'Zähler', id:'v1'}]));
    expect(warnings).toEqual([]);
    // wartet schon ein Befehl in der Schleife, kommt nichts dazu
    expect(code).toContain('async def start():\n    while True:\n        await wait(100)\n\n');
    expect(code).toContain([
      'async def ereignis():',
      '    while True:',
      '        while not (await abstand_D.distance() < 100):',
      '            await wait(10)',
      '',
      '        while True:',
      '            if await kraft_E.pressed():',
      '                hub.light.on(Color.RED)',
      '',
      '            await wait(0)  # die anderen Aufgaben kommen dran',
      '',
      '        while await abstand_D.distance() < 100:',
      '            await wait(10)', ''].join('\n'));
    expect(lines.find(l => l.text.includes('await wait(0)'))?.id).toBe('schleife');
    // Variablen, die ein Programmteil ändert, sind als global angemeldet; Tasten brauchen kein await
    expect(code).toContain('async def ereignis2():\n    global Zaehler\n    while True:\n        while not (Button.LEFT in hub.buttons.pressed()):\n');
    for (const l of lines) expect(l.text.length).toBeLessThanOrEqual(80);
    compiles('wenn_mehrere', code);
  });

  it('macht eigene Blöcke nur dann async, wenn in ihnen gewartet wird', () => {
    const {code, warnings} = run(ws_([
      at(seq(B('pb_start'), B('procedures_callnoreturn', null, null, {name:'Zweimal'}), B('procedures_callnoreturn', null, null, {name:'Licht'}),
        B('pb_display_number', null, {NUM:{block:B('procedures_callreturn', null, null, {name:'Hell'})}})), 0, 0),
      at(when(left(), beep()), 0, 300),
      at(B('procedures_defnoreturn', {NAME:'Piep'}, {STACK:S(beep())}), 400, 0),
      at(B('procedures_defnoreturn', {NAME:'Zweimal'}, {STACK:S(B('procedures_callnoreturn', null, null, {name:'Piep'}), B('procedures_callnoreturn', null, null, {name:'Piep'}))}), 400, 150),
      at(B('procedures_defnoreturn', {NAME:'Licht'}, {STACK:S(B('pb_light', {COLOR:'GREEN'}))}), 400, 300),
      at(B('procedures_defreturn', {NAME:'Hell'}, {RETURN:{block:B('pb_reflection', {PORT:'C'})}}), 400, 450)]));
    expect(warnings).toEqual([]);
    expect(code).toContain('async def Piep():\n    await hub.speaker.beep(440, 200)\n');
    expect(code).toContain('async def Zweimal():\n    await Piep()\n    await Piep()\n');
    expect(code).toContain('\ndef Licht():\n    hub.light.on(Color.GREEN)\n');
    expect(code).toContain('async def Hell():\n    return await farbe_C.reflection()\n');
    expect(code).toContain('    await Zweimal()\n    Licht()\n    hub.display.number(await Hell())\n');
    compiles('eigene_async', code);
  });

  it('Nachrichten: senden, empfangen und Warnungen', () => {
    const state = ws_([
      at(seq(B('pb_start'), wait(1000), B('pb_send_message', {NAME:'los'})), 0, 0),
      at(seq(B('pb_when_message', {NAME:'los'}), beep()), 0, 200)]);
    const {code, warnings} = run(state);
    expect(warnings).toEqual([]);
    expect(code).toContain("nachrichten = {}\n\ndef sende(name):\n    nachrichten[name] = nachrichten.get(name, 0) + 1\n\nasync def warte_auf(name):\n");
    expect(code).toContain("async def start():\n    await wait(1000)\n    sende('los')\n");
    expect(code).toContain("async def nachricht_los():\n    while True:\n        await warte_auf('los')\n        await hub.speaker.beep(440, 200)\n");
    // wer wartet, startet zuerst
    expect(code).toContain('run_task(multitask(nachricht_los(), start()))\n');
    compiles('nachrichten', code);

    const lonely = run(ws_([at(seq(B('pb_start'), B('pb_send_message', {NAME:'hallo'})), 0, 0)]));
    expect(lonely.warnings).toEqual(['Auf die Nachricht »hallo« wartet kein Ereignis.']);
    expect(lonely.code).not.toMatch(/\b(async|await)\b/);
    compiles('nachricht_ohne_empfang', lonely.code);
    const deaf = run(ws_([at(seq(B('pb_when_message', {NAME:'hallo'}), beep()), 0, 0)]));
    expect(deaf.warnings).toEqual(['Die Nachricht »hallo« wird nirgends gesendet.']);
    expect(deaf.code).not.toMatch(/\b(async|await)\b/);
  });

  it('füllt leere Rümpfe mit pass und lässt »warte bis« nicht als Pause gelten', () => {
    // »Fahrbasis einrichten« erzeugt keine Zeile – allein unter einem Ereignis oder in einer Schleife bliebe der Rumpf leer
    const alone = run(ws_([at(seq(B('pb_start'), setup()), 0, 0), at(seq(B('pb_start'), beep()), 0, 300)]));
    expect(alone.code).toContain('async def start():\n    pass\n');
    compiles('leer_async', alone.code);
    const loop = run(ws_([at(seq(B('pb_start'), B('controls_if', null, {IF0:{block:left()}, DO0:S(setup())})), 0, 0)]));
    expect(loop.code).toContain('if Button.LEFT in hub.buttons.pressed():\n    pass\n');
    compiles('leer_if', loop.code);
    // ist die Bedingung von »warte bis« schon erfüllt, wartet es nicht: Die Schleife braucht trotzdem eine Pause
    const {code} = run(ws_([
      at(seq(B('pb_start'), B('pb_forever', null, {DO:S(B('pb_wait_until', null, {COND:{block:left()}}))})), 0, 0),
      at(seq(B('pb_start'), beep()), 0, 300)]));
    expect(code).toContain('        while not (Button.LEFT in hub.buttons.pressed()):\n            await wait(10)\n\n        await wait(0)  # die anderen');
  });

  it('kommt mit Namen zurecht, die es schon gibt, und mit schwierigen Nachrichten', () => {
    const {code, warnings} = run(ws_([
      at(seq(B('pb_start'), B('variables_set', {VAR:{id:'v1'}}, {VALUE:num(1)}), B('pb_send_message', {NAME:"geht's los? ä"})), 0, 0),
      at(seq(B('pb_when_message', {NAME:"geht's los? ä"}), B('procedures_callnoreturn', null, null, {name:'ereignis'})), 0, 200),
      at(when(left(), beep()), 0, 400),
      at(B('procedures_defnoreturn', {NAME:'ereignis'}, {STACK:S(wait(10))}), 400, 0)],
      [{name:'start', id:'v1'}]));
    expect(warnings).toEqual([]);
    expect(code).toContain('async def start2():\n    global start\n    start = 1\n');
    expect(code).toContain('async def ereignis():\n    global start\n    await wait(10)\n');
    expect(code).toContain('async def ereignis2():\n    while True:\n');
    expect(code).toContain('async def nachricht_geht_s_los__ae():\n    while True:\n        await warte_auf("geht\'s los? ä")\n        await ereignis()\n');
    compiles('namen', code);
  });

  it('bricht eine lange Startzeile um und warnt bei »wenn« ohne Bedingung', () => {
    const many = Array.from({length:6}, (_, i) => at(seq(B('pb_when', null, {COND:{block:left()}}), wait(i)), 0, i * 100));
    const res = run(ws_([...many, at(seq(B('pb_when'), wait(1)), 0, 900)]));
    expect(res.code).toContain('run_task(multitask(\n    ereignis(),\n    ereignis2(),\n');
    expect(res.warnings).toEqual(['Ein Block »wenn …« hat keine Bedingung und löst deshalb nie aus.']);
    for (const l of res.lines) expect(l.text.length).toBeLessThanOrEqual(80);
    compiles('viele', res.code);
  });
});
