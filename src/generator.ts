// ---------------------------------------------------------------
// Python-Generator
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { pythonGenerator as py, Order } from 'blockly/python';
import { PAD_HELPER } from './hub/padProtocol';
import { toRows } from './matrix';

py.INDENT = '    ';
const MARK = '#\u27E6%1\u27E7\n';
py.STATEMENT_PREFIX = MARK;
const DEVICE_NAMES = ['motor','farbe','abstand','kraft'].flatMap(p => 'ABCDEF'.split('').map(c => p + '_' + c));
py.addReservedWords(['hub','roboter','stoppuhr','wait','StopWatch','PrimeHub','Motor','ColorSensor','UltrasonicSensor','ForceSensor',
  'DriveBase','Port','Direction','Stop','Color','Button','Icon','ceil','floor',
  'XboxController','Remote','controller','fernbedienung','steuerfeld','steuerfeld_uhr','steuerung','read_input_byte','random','math',
  'multitask','run_task','sende','warte_auf','nachrichten'].concat(DEVICE_NAMES).join(','));

// Umlaute in Namen lesbar halten (Zähler -> Zaehler)
// safeName ist in den Typen privat, deshalb der Zugriff über einen eigenen Typ
const names = Blockly.Names.prototype as unknown as {safeName?: (name: string) => string};
if (names.safeName){
  const orig = names.safeName;
  const map: Record<string, string> = {'ä':'ae','ö':'oe','ü':'ue','Ä':'Ae','Ö':'Oe','Ü':'Ue','ß':'ss'};
  names.safeName = function(name: string){ return orig.call(this, String(name || '').replace(/[äöüÄÖÜß]/g, c => map[c])); };
}

export type Kind = 'motor' | 'color' | 'ultra' | 'force';
type Slot = Partial<Record<Kind, boolean>> & {dir?: string};
interface Drive { id: string | null; lp: string; ld: string; rp: string; rd: string; wheel: number; axle: number; gyro: boolean }
interface Ctx {
  ports: Record<string, Slot>; params: Set<string>; tools: Set<string>; umath: Set<string>; black: Set<string>; drive: Drive | null;
  driveBlocks: number; usesDrive: boolean; timer: boolean; xbox: boolean; remote: boolean; pad: boolean; warnings: string[];
  parts: Map<string, HeaderPart>;
  /** Mehrere Ereignisse laufen gleichzeitig: Das Programm besteht aus Aufgaben mit `async` und `await`. */
  multi: boolean;
  /** Eigene Blöcke, die in diesem Fall selbst `async` sein müssen. */
  asyncProcs: Set<string>;
  sent: Set<string>; received: Set<string>; extBlocks: number;
}
/** Zusätzliches Python-Modul, das neben dem Programm auf den Hub geladen wird. */
export interface ProgramModule { name: string; source: string }
/** Was eine Erweiterung zum Kopf des Programms beiträgt, sobald einer ihrer Blöcke benutzt wird. */
export interface HeaderPart {
  id: string; title: string; lines: string[];
  fromImports: [string, string[]][]; plainImports: string[]; modules: ProgramModule[];
}
/** Eine Zeile des erzeugten Programms; `id` ist der Block, aus dem sie stammt. */
export interface CodeLine { text: string; id: string | null }
/**
 * Was das Programm im Terminal meldet, während der Hub ein Fernsteuergerät sucht. Blockwerk
 * erkennt diese Zeilen wieder und zeigt den Stand neben dem Namen des Hubs an.
 */
export const REMOTE_STATUS = {
  xbox:{search:'Suche den Xbox-Controller …', found:'Xbox-Controller verbunden.'},
  remote:{search:'Suche die LEGO-Fernbedienung …', found:'LEGO-Fernbedienung verbunden.'}
} as const;

export interface GenerateResult {
  lines: CodeLine[]; warnings: string[];
  /** Das Programm lässt den Hub selbst nach einem Xbox-Controller suchen (Xbox-Blöcke). */
  usesXbox: boolean;
  /** Das Programm fragt das Steuerfeld von Blockwerk ab. */
  usesPad: boolean;
  /** Module aus Erweiterungen, die mit auf den Hub müssen. */
  modules: ProgramModule[];
}

const KIND: Record<Kind, {cls: string; pre: string; label: string}> = {
  motor:{cls:'Motor', pre:'motor', label:'Motor'},
  color:{cls:'ColorSensor', pre:'farbe', label:'Farbsensor'},
  ultra:{cls:'UltrasonicSensor', pre:'abstand', label:'Abstandssensor'},
  force:{cls:'ForceSensor', pre:'kraft', label:'Kraftsensor'}
};
const KINDS = Object.keys(KIND) as Kind[];
const kindsOf = (slot: Slot) => (Object.keys(slot) as Kind[]).filter(k => KIND[k]);
function newCtx(): Ctx { return {ports:{}, params:new Set(), tools:new Set(), umath:new Set(), black:new Set(), drive:null, driveBlocks:0, usesDrive:false, timer:false, xbox:false, remote:false, pad:false, warnings:[], parts:new Map(),
  multi:false, asyncProcs:new Set(), sent:new Set(), received:new Set(), extBlocks:0}; }
let G = newCtx();
function warn(t: string){ if (!G.warnings.includes(t)) G.warnings.push(t); }
function dev(kind: Kind, port: string){
  const slot = G.ports[port] || (G.ports[port] = {});
  slot[kind] = true;
  G.params.add('Port');
  return KIND[kind].pre + '_' + port;
}
const v = (block: Blockly.Block, name: string, fallback='0', order: number=Order.NONE) => py.valueToCode(block, name, order) || fallback;
const drive = () => { G.usesDrive = true; return 'roboter'; };
// Laufen mehrere Ereignisse gleichzeitig, muss vor jedem Befehl, der wartet oder ein Gerät
// abfragt, »await« stehen (laut Paket `pybricks` 4.0.0 alles mit Rückgabetyp MaybeAwaitable)
const aw = (code: string) => G.multi ? 'await ' + code : code;
/** Wert, der bei mehreren Ereignissen mit »await« abgefragt wird. */
const awv = (code: string): [string, number] => G.multi ? ['await ' + code, Order.EXPONENTIATION] : [code, Order.FUNCTION_CALL];

// Anbindung für Erweiterungen (src/ext): Deren Blöcke melden hier, was sie im Kopf brauchen
export const useHeaderPart = (part: HeaderPart) => { G.parts.set(part.id, part); G.extBlocks++; };
export const useDevice = (kind: Kind, port: string) => dev(kind, port);
export const useDrive = () => drive();

const F = py.forBlock;
F['pb_start'] = () => '';
// Die Ereignisblöcke selbst erzeugen nichts; generate() baut um ihren Stapel die Schleife bzw. die Aufgabe
F['pb_when'] = () => '';
F['pb_when_message'] = () => '';
F['pb_send_message'] = (b) => { const name = b.getFieldValue('NAME'); G.sent.add(name); return `sende(${py.quote_(name)})\n`; };
F['pb_drive_setup'] = (b) => {
  G.driveBlocks++;
  G.drive = {id:b.id, lp:b.getFieldValue('LEFT_PORT'), ld:b.getFieldValue('LEFT_DIR'), rp:b.getFieldValue('RIGHT_PORT'),
             rd:b.getFieldValue('RIGHT_DIR'), wheel:b.getFieldValue('WHEEL'), axle:b.getFieldValue('AXLE'), gyro:b.getFieldValue('GYRO') === 'TRUE'};
  return '';
};
F['pb_drive_straight'] = (b) => aw(`${drive()}.straight(${v(b,'DIST')})\n`);
F['pb_drive_turn'] = (b) => aw(`${drive()}.turn(${v(b,'ANGLE')})\n`);
F['pb_drive_arc'] = (b) => aw(`${drive()}.arc(${v(b,'RADIUS','100')}, ${v(b,'ANGLE')})\n`);
F['pb_drive_drive'] = (b) => `${drive()}.drive(${v(b,'SPEED')}, ${v(b,'RATE')})\n`;
F['pb_drive_stop'] = (b) => `${drive()}.${b.getFieldValue('MODE')}()\n`;
F['pb_drive_settings'] = (b) => `${drive()}.settings(straight_speed=${v(b,'SPEED','200')}, turn_rate=${v(b,'RATE','150')})\n`;
F['pb_drive_reset'] = () => `${drive()}.reset()\n`;
F['pb_drive_distance'] = () => [`${drive()}.distance()`, Order.FUNCTION_CALL];
F['pb_drive_angle'] = () => [`${drive()}.angle()`, Order.FUNCTION_CALL];

const m = (b: Blockly.Block) => dev('motor', b.getFieldValue('PORT'));
F['pb_motor_run_angle'] = (b) => aw(`${m(b)}.run_angle(${v(b,'SPEED','500')}, ${v(b,'ANGLE')})\n`);
F['pb_motor_run_time'] = (b) => aw(`${m(b)}.run_time(${v(b,'SPEED','500')}, ${v(b,'TIME')})\n`);
F['pb_motor_run_target'] = (b) => aw(`${m(b)}.run_target(${v(b,'SPEED','500')}, ${v(b,'TARGET')})\n`);
F['pb_motor_run'] = (b) => `${m(b)}.run(${v(b,'SPEED')})\n`;
F['pb_motor_stop'] = (b) => `${m(b)}.${b.getFieldValue('MODE')}()\n`;
F['pb_motor_reset'] = (b) => `${m(b)}.reset_angle(${v(b,'ANGLE')})\n`;
F['pb_motor_angle'] = (b) => [`${m(b)}.angle()`, Order.FUNCTION_CALL];
F['pb_motor_speed'] = (b) => [`${m(b)}.speed()`, Order.FUNCTION_CALL];

F['pb_color_is'] = (b) => {
  G.params.add('Color');
  if (b.getFieldValue('COLOR') === 'BLACK') G.black.add(b.getFieldValue('PORT'));
  return [aw(`${dev('color', b.getFieldValue('PORT'))}.color() == Color.${b.getFieldValue('COLOR')}`), Order.RELATIONAL]; };
F['pb_reflection'] = (b) => awv(`${dev('color', b.getFieldValue('PORT'))}.reflection()`);
F['pb_distance'] = (b) => awv(`${dev('ultra', b.getFieldValue('PORT'))}.distance()`);
F['pb_force_pressed'] = (b) => awv(`${dev('force', b.getFieldValue('PORT'))}.pressed()`);
F['pb_force'] = (b) => awv(`${dev('force', b.getFieldValue('PORT'))}.force()`);
F['pb_heading'] = () => ['hub.imu.heading()', Order.FUNCTION_CALL];
F['pb_reset_heading'] = (b) => `hub.imu.reset_heading(${v(b,'ANGLE')})\n`;
F['pb_button'] = (b) => { G.params.add('Button'); return [`Button.${b.getFieldValue('BUTTON')} in hub.buttons.pressed()`, Order.RELATIONAL]; };
F['pb_timer_reset'] = () => { G.timer = true; return 'stoppuhr.reset()\n'; };
F['pb_timer'] = () => { G.timer = true; return ['stoppuhr.time()', Order.FUNCTION_CALL]; };

// Platzhalter aus dem SPIKE-Import
const untranslated = (b: Blockly.Block) => {
  const what = b.getFieldValue('WHAT');
  warn(`Ein SPIKE-Block wurde nicht übersetzt: ${what}`);
  return what;
};
// »pass«, damit eine Schleife oder Bedingung, die nur diesen Block enthält, gültiges Python bleibt
F['pb_unsupported'] = (b) => `pass  # nicht übersetzt: ${untranslated(b)}\n`;
F['pb_unsupported_value'] = (b) => { untranslated(b); return ['0', Order.ATOMIC]; };

// Fernsteuerung
const xbox = () => { G.xbox = true; return 'controller'; };
const remote = () => { G.remote = true; return 'fernbedienung'; };
const pad = (name: string) => { G.pad = true; G.tools.add('read_input_byte'); G.tools.add('StopWatch'); return `steuerung('${name}')`; };
F['pb_xbox_stick'] = (b) => [`${xbox()}.joystick_${b.getFieldValue('SIDE')}()[${b.getFieldValue('AXIS')}]`, Order.MEMBER];
F['pb_xbox_trigger'] = (b) => [`${xbox()}.triggers()[${b.getFieldValue('SIDE')}]`, Order.MEMBER];
F['pb_xbox_button'] = (b) => { G.params.add('Button'); return [`Button.${b.getFieldValue('BUTTON')} in ${xbox()}.buttons.pressed()`, Order.RELATIONAL]; };
F['pb_xbox_rumble'] = (b) => aw(`${xbox()}.rumble(${v(b,'POWER','100')}, ${v(b,'DUR','200')})\n`);
F['pb_remote_button'] = (b) => { G.params.add('Button'); return [`Button.${b.getFieldValue('BUTTON')} in ${remote()}.buttons.pressed()`, Order.RELATIONAL]; };
F['pb_remote_light'] = (b) => {
  const c = b.getFieldValue('COLOR');
  if (c === 'OFF') return aw(`${remote()}.light.off()\n`);
  G.params.add('Color'); return aw(`${remote()}.light.on(Color.${c})\n`);
};
F['pb_pad_stick'] = (b) => [pad(b.getFieldValue('AXIS')), Order.FUNCTION_CALL];
F['pb_pad_button'] = (b) => [pad(b.getFieldValue('BUTTON')), Order.FUNCTION_CALL];

F['pb_display_text'] = (b) => {
  const t = v(b, 'TEXT', "''");
  return `hub.display.text(${/^(['"]).*\1$/.test(t) ? t : 'str(' + t + ')'})\n`;
};
F['pb_display_number'] = (b) => `hub.display.number(${v(b,'NUM')})\n`;
F['pb_display_icon'] = (b) => { G.params.add('Icon'); return `hub.display.icon(Icon.${b.getFieldValue('ICON')})\n`; };
// Eigenes Muster: Pybricks nimmt eine Liste aus fünf Zeilen mit je fünf Helligkeiten in Prozent
F['pb_display_pixels'] = (b) => {
  const rows = toRows(b.getFieldValue('PIXELS')).map(row => `${py.INDENT}[${row.join(', ')}],\n`);
  return `hub.display.icon([\n${rows.join('')}])\n`;
};
F['pb_display_off'] = () => 'hub.display.off()\n';
F['pb_light'] = (b) => {
  const c = b.getFieldValue('COLOR');
  if (c === 'OFF') return 'hub.light.off()\n';
  G.params.add('Color'); return `hub.light.on(Color.${c})\n`;
};
F['pb_beep'] = (b) => aw(`hub.speaker.beep(${v(b,'FREQ','500')}, ${v(b,'DUR','100')})\n`);
F['pb_print'] = (b) => `print(${v(b,'TEXT',"''")})\n`;

F['pb_wait'] = (b) => { G.tools.add('wait'); return aw(`wait(${v(b,'MS')})\n`); };
F['pb_forever'] = (b) => `while True:\n${py.statementToCode(b,'DO') || py.PASS}`;
// Bei mehreren Ereignissen muss jede Schleife den anderen Aufgaben Zeit lassen. Wartet in ihr
// ohnehin ein Befehl, reicht das; sonst kommt ans Ende »await wait(0)«. »warte bis« zählt nicht:
// Ist die Bedingung schon erfüllt, wartet es gar nicht.
const PAUSES = new Set(['pb_wait','pb_drive_straight','pb_drive_turn','pb_drive_arc','pb_motor_run_angle','pb_motor_run_time','pb_motor_run_target','pb_beep']);
const LOOPS = ['pb_forever','controls_repeat_ext','controls_whileUntil','controls_for','controls_forEach'];
function pauses(loop: Blockly.Block){
  for (let b = loop.getInputTargetBlock('DO'); b; b = b.getNextBlock()) if (b.isEnabled() && PAUSES.has(b.type)) return true;
  return false;
}
for (const type of LOOPS){
  const orig = F[type];
  if (!orig) continue;
  F[type] = (b, g) => {
    let code = orig(b, g) as string;
    if (!G.multi || pauses(b)) return code;
    G.tools.add('wait');
    if (code.endsWith(py.PASS)) code = code.slice(0, -py.PASS.length);
    return code + py.INDENT + py.injectId(MARK, b) + py.INDENT + 'await wait(0)  # die anderen Aufgaben kommen dran\n';
  };
}
// Eigene Blöcke, in denen gewartet wird, sind bei mehreren Ereignissen selbst »async« und werden mit »await« aufgerufen
const callProc = F['procedures_callreturn'];
const isAsync = (b: Blockly.Block) => G.multi && G.asyncProcs.has(b.getFieldValue('NAME'));
F['procedures_callreturn'] = (b, g) => { const code = (callProc(b, g) as [string, number])[0]; return isAsync(b) ? ['await ' + code, Order.EXPONENTIATION] : [code, Order.FUNCTION_CALL]; };
F['procedures_callnoreturn'] = (b, g) => (isAsync(b) ? 'await ' : '') + (callProc(b, g) as [string, number])[0] + '\n';
/** Blöcke, die bei mehreren Ereignissen ein »await« erzeugen. */
const AWAITS = new Set([...PAUSES, ...LOOPS, 'pb_wait_until','pb_xbox_rumble','pb_remote_light','pb_color_is','pb_reflection','pb_distance','pb_force_pressed','pb_force']);
// Vergleiche bekommen Klammern: »while not (x < 30)« liest sich eindeutiger als »while not x < 30«
F['pb_wait_until'] = (b) => { G.tools.add('wait'); return `while not ${v(b,'COND','False',Order.FUNCTION_CALL)}:\n${py.INDENT}${aw('wait(10)')}\n`; };
F['pb_abs'] = (b) => [`abs(${v(b,'NUM')})`, Order.FUNCTION_CALL];
// Blocklys Standard hängt hinter die eigene Markierung noch die der Schleife; die Zeile
// würde dadurch der Schleife statt diesem Block zugeordnet
F['controls_flow_statements'] = (b) => py.injectId(MARK, b) + (b.getFieldValue('FLOW') === 'BREAK' ? 'break\n' : 'continue\n');
// Blocklys Standard fügt immer »import math« ein; Pybricks dokumentiert stattdessen »umath«
F['math_round'] = (b) => {
  const op = b.getFieldValue('OP');
  if (op === 'ROUND') return [`round(${v(b,'NUM')})`, Order.FUNCTION_CALL];
  const fn = op === 'ROUNDUP' ? 'ceil' : 'floor';
  G.umath.add(fn);
  return [`${fn}(${v(b,'NUM')})`, Order.FUNCTION_CALL];
};
// MicroPython kennt kein Modul »numbers« – »ändere um« deshalb schlicht addieren
F['math_change'] = (b) => {
  const name = py.getVariableName(b.getFieldValue('VAR'));
  return `${name} = ${name} + ${v(b,'DELTA','0',Order.ADDITIVE)}\n`;
};

// ---------------------------------------------------------------
// Code zusammensetzen
// ---------------------------------------------------------------
export function generate(ws: Blockly.Workspace): GenerateResult {
  G = newCtx();
  py.init(ws);
  let main = '', starts = 0, orphans = 0;
  const HATS = ['pb_start', 'pb_when', 'pb_when_message'];
  const tops = ws.getTopBlocks(true);
  // Ein Ereignis zählt erst, wenn etwas darunter hängt
  const hats = tops.filter(b => HATS.includes(b.type) && b.isEnabled() && b.getNextBlock());
  G.multi = hats.length > 1;
  const defs = ws.getBlocksByType('procedures_defnoreturn').concat(ws.getBlocksByType('procedures_defreturn'));
  if (G.multi){
    // Ein eigener Block wird »async«, wenn in ihm gewartet wird – direkt oder über einen anderen eigenen Block
    const calls = (def: Blockly.Block) => def.getDescendants(false).filter(d => d.type.startsWith('procedures_call')).map(d => d.getFieldValue('NAME') as string);
    for (const def of defs) if (def.getDescendants(false).some(d => AWAITS.has(d.type))) G.asyncProcs.add(def.getFieldValue('NAME'));
    for (let grown = true; grown;){
      grown = false;
      for (const def of defs){
        const name = def.getFieldValue('NAME');
        if (!G.asyncProcs.has(name) && calls(def).some(c => G.asyncProcs.has(c))){ G.asyncProcs.add(name); grown = true; }
      }
    }
  }
  for (const b of hats) if (b.type === 'pb_when_message') G.received.add(b.getFieldValue('NAME'));
  if (G.multi && G.received.size) G.tools.add('wait');

  const indent = (code: string) => py.prefixLines(code, py.INDENT);
  const tasks: {name: string; first: boolean}[] = [];
  for (const b of tops){
    if (b.type === 'procedures_defnoreturn' || b.type === 'procedures_defreturn'){ py.blockToCode(b); continue; }
    if (!HATS.includes(b.type)){ orphans++; continue; }
    if (b.type === 'pb_start') starts++;
    if (!hats.includes(b)) continue;
    // blockToCode liefert die Markerzeile des Ereignisblocks und danach den Stapel darunter
    const mark = py.injectId(MARK, b);
    const stack = (py.blockToCode(b) as string).slice(mark.length);
    let code = stack, name = 'start';
    if (b.type === 'pb_when'){
      // Wie in der SPIKE-App: Das Ereignis löst aus, sobald die Bedingung wahr wird – und erst
      // wieder, nachdem sie zwischendurch falsch war
      if (!b.getInputTargetBlock('COND')) warn('Ein Block »wenn …« hat keine Bedingung und löst deshalb nie aus.');
      G.tools.add('wait');
      const pause = indent(aw('wait(10)\n'));
      code = 'while True:\n' + indent(`while not ${v(b,'COND','False',Order.FUNCTION_CALL)}:\n${pause}${stack}${mark}while ${v(b,'COND','False')}:\n${pause}`);
      name = 'ereignis';
    } else if (b.type === 'pb_when_message'){
      const message = b.getFieldValue('NAME') as string;
      if (!G.multi){ main += `${mark}# Die Nachricht ${py.quote_(message)} sendet kein anderer Programmteil.\n`; continue; }
      code = 'while True:\n' + indent(`await warte_auf(${py.quote_(message)})\n${stack}`);
      name = 'nachricht_' + message;
    }
    if (!G.multi){ main += mark + code; continue; }
    // Variablen, die der Stapel ändert, gehören dem ganzen Programm
    const changed = new Set<string>();
    for (const d of b.getDescendants(true)) if (d.type !== 'variables_get') for (const model of d.getVarModels()) changed.add(py.getVariableName(model.getId()));
    const globals = changed.size ? `global ${[...changed].join(', ')}\n` : '';
    name = py.nameDB_!.getDistinctName(name, Blockly.Names.NameType.PROCEDURE);
    tasks.push({name, first: b.type === 'pb_when_message'});
    main += `${mark}async def ${name}():\n${indent(globals + code)}\n`;
  }
  if (G.multi){
    G.tools.add('multitask'); G.tools.add('run_task');
    // Wer auf eine Nachricht wartet, startet zuerst – sonst könnte er eine gleich zu Beginn gesendete verpassen
    const list = [...tasks.filter(t => t.first), ...tasks.filter(t => !t.first)].map(t => t.name + '()');
    const short = `run_task(multitask(${list.join(', ')}))`;
    main += MARK.replace('%1', "''") + '# Alle Programmteile gleichzeitig starten\n'
      + (short.length <= 80 ? short : `run_task(multitask(\n${list.map(t => py.INDENT + t + ',\n').join('')}))`) + '\n';
  }
  // Blockly-Standardblöcke (Zufall, Listen) importieren »random« und »math«; bei Pybricks
  // heißen die Module »urandom« und »umath«. Die Importe wandern in den Kopf.
  // Parameter eigener Blöcke sind für Blockly gewöhnliche Variablen und bekämen vorab ein
  // »Name = None«. Wird der Name nur im eigenen Block benutzt, ist diese Zeile irreführend.
  const paramOnly = new Set<string>();
  for (const def of defs){
    for (const model of def.getVarModels()){
      const uses = Blockly.Variables.getVariableUsesById(ws, model.getId());
      if (uses.every(u => u.type.startsWith('procedures_call') || u.getRootBlock() === def)) paramOnly.add(py.getVariableName(model.getId()));
    }
  }
  const aliases: string[] = [];
  let body = py.finish(main).replace(/^import (random|math)\n/gm, (_, mod) => { aliases.push(`import u${mod} as ${mod}`); return ''; });
  for (const name of G.asyncProcs) body = body.replace(new RegExp(`^def ${py.getProcedureName(name)}\\(`, 'm'), m => 'async ' + m);

  if (G.driveBlocks > 1) warn('Es gibt mehrere Blöcke »Fahrbasis einrichten«. Verwendet wird der zuletzt übersetzte.');
  for (const name of G.received) if (!G.sent.has(name)) warn(`Die Nachricht »${name}« wird nirgends gesendet.`);
  for (const name of G.sent) if (!G.received.has(name)) warn(`Auf die Nachricht »${name}« wartet kein Ereignis.`);
  if (G.multi && G.extBlocks) warn('Blöcke aus Erweiterungen sind für mehrere gleichzeitige Ereignisse nicht eingerichtet: Wartet ein solcher Block, hält er die anderen Programmteile nicht an und wartet selbst womöglich nicht.');
  if (orphans) warn(orphans === 1 ? 'Ein Block hängt an keinem Startblock und wird nicht übersetzt.' : `${orphans} Blöcke hängen an keinem Startblock und werden nicht übersetzt.`);

  // Fahrbasis
  let d: Drive | null = null, defaulted = false;
  if (G.usesDrive || G.drive){
    d = G.drive;
    if (!d){ d = {id:null, lp:'A', ld:'COUNTERCLOCKWISE', rp:'B', rd:'CLOCKWISE', wheel:56, axle:112, gyro:true}; defaulted = true; }
    if (d.lp === d.rp) warn('Linker und rechter Motor der Fahrbasis hängen am selben Anschluss.');
    [[d.lp,d.ld],[d.rp,d.rd]].forEach(([p,dir]) => {
      const slot = G.ports[p] || (G.ports[p] = {});
      slot.motor = true; slot.dir = dir;
    });
  }
  for (const [p, slot] of Object.entries(G.ports)){
    const kinds = kindsOf(slot);
    if (kinds.length > 1) warn(`Anschluss ${p} wird gleichzeitig als ${kinds.map(k => KIND[k].label).join(' und ')} benutzt.`);
  }

  // Kopf mit Importen und Geräten
  const H: CodeLine[] = []; const push = (text: string, id: string | null = null) => H.push({text, id});
  const devClasses = new Set<string>();
  for (const slot of Object.values(G.ports)) for (const k of kindsOf(slot)) devClasses.add(KIND[k].cls);
  if (Object.values(G.ports).some(s => s.dir === 'COUNTERCLOCKWISE')) G.params.add('Direction');
  if (Object.keys(G.ports).length) G.params.add('Port');
  if (G.timer) G.tools.add('StopWatch');
  if (G.remote) devClasses.add('Remote');

  // Importe je Modul sammeln; Erweiterungen ergänzen dieselbe Liste, damit nichts doppelt erscheint
  const imports = new Map<string, Set<string>>();
  const imp = (mod: string, names: Iterable<string>) => { const set = imports.get(mod) || new Set<string>(); for (const n of names) set.add(n); if (set.size) imports.set(mod, set); };
  imp('pybricks.hubs', ['PrimeHub']);
  if (G.xbox) imp('pybricks.iodevices', ['XboxController']);
  imp('pybricks.parameters', G.params);
  imp('pybricks.pupdevices', devClasses);
  if (d) imp('pybricks.robotics', ['DriveBase']);
  imp('pybricks.tools', G.tools);
  imp('umath', G.umath);
  const parts = [...G.parts.values()].sort((a, b) => a.title.localeCompare(b.title));
  for (const part of parts){
    for (const [mod, names] of part.fromImports) imp(mod, names);
    for (const line of part.plainImports) if (!aliases.includes(line)) aliases.push(line);
  }
  const ORDER = ['pybricks.hubs', 'pybricks.iodevices', 'pybricks.parameters', 'pybricks.pupdevices', 'pybricks.robotics', 'pybricks.tools', 'umath'];
  const rank = (mod: string) => { const i = ORDER.indexOf(mod); return i < 0 ? ORDER.length : i; };
  for (const mod of [...imports.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))){
    const names = [...imports.get(mod)!].sort((a, b) => mod !== 'pybricks.tools' ? a.localeCompare(b) : a === 'wait' ? -1 : b === 'wait' ? 1 : a.localeCompare(b));
    push(`from ${mod} import ${names.join(', ')}`);
  }
  aliases.sort().forEach(a => push(a));
  push(''); push('hub = PrimeHub()');

  const ports = Object.keys(G.ports).sort();
  if (ports.length){
    push(''); push('# Geräte an den Anschlüssen');
    for (const p of ports){
      const s = G.ports[p];
      for (const k of KINDS) if (s[k]){
        const dir = (k === 'motor' && s.dir === 'COUNTERCLOCKWISE') ? ', Direction.COUNTERCLOCKWISE' : '';
        push(`${KIND[k].pre}_${p} = ${KIND[k].cls}(Port.${p}${dir})`, k === 'motor' && d && (p === d.lp || p === d.rp) ? d.id : null);
        // Schwarz gehört nicht zu den Farben, die der Sensor von sich aus meldet
        if (k === 'color' && G.black.has(p)){
          push(`farbe_${p}.detectable_colors([  # mit Schwarz`);
          push(`${py.INDENT}Color.RED, Color.YELLOW, Color.GREEN, Color.BLUE,`);
          push(`${py.INDENT}Color.WHITE, Color.BLACK, Color.NONE,`);
          push('])');
        }
      }
    }
  }
  if (d){
    push(''); push(defaulted ? '# Fahrbasis (Standardwerte, kein Block »Fahrbasis einrichten« gefunden)' : '# Fahrbasis', d.id);
    push(`roboter = DriveBase(motor_${d.lp}, motor_${d.rp}, wheel_diameter=${d.wheel}, axle_track=${d.axle})`, d.id);
    if (d.gyro) push('roboter.use_gyro(True)', d.id);
  }
  if (G.timer){ push(''); push('stoppuhr = StopWatch()'); }
  if (G.xbox || G.remote){
    push(''); push('# Fernsteuerung: Der Hub sucht beim Start bis zu 10 Sekunden nach dem Gerät');
    // die Meldungen davor und danach zeigen im Terminal, ob die Verbindung steht
    if (G.xbox){ push(`print(${py.quote_(REMOTE_STATUS.xbox.search)})`); push('controller = XboxController()'); push(`print(${py.quote_(REMOTE_STATUS.xbox.found)})`); }
    if (G.remote){ push(`print(${py.quote_(REMOTE_STATUS.remote.search)})`); push('fernbedienung = Remote()'); push(`print(${py.quote_(REMOTE_STATUS.remote.found)})`); }
  }
  if (G.pad){ push(''); PAD_HELPER.forEach(l => push(l)); }
  if (G.sent.size || (G.multi && G.received.size)){
    push(''); push('# Nachrichten zwischen den Programmteilen: wie oft welche gesendet wurde');
    push('nachrichten = {}'); push('');
    push('def sende(name):'); push(`${py.INDENT}nachrichten[name] = nachrichten.get(name, 0) + 1`);
    if (G.multi && G.received.size){
      push(''); push('async def warte_auf(name):');
      push(`${py.INDENT}stand = nachrichten.get(name, 0)`);
      push(`${py.INDENT}while nachrichten.get(name, 0) == stand:`);
      push(`${py.INDENT}${py.INDENT}await wait(10)`);
    }
  }
  for (const part of parts) if (part.lines.length){
    push(''); push(`# Erweiterung: ${part.title}`);
    part.lines.forEach(l => push(l));
  }

  // Rumpf: Markierungen auswerten, Zeilen den Blöcken zuordnen
  const lines: CodeLine[] = [...H, {text:'', id:null}];
  const stack: {ind: number; id: string}[] = [];
  const markRe = /^(\s*)#\u27E6'(.*)'\u27E7$/;
  const bodyLines = body.replace(/^\n+/, '').split('\n');
  // der Kopf endet mit einer Leerzeile – eine weitere direkt danach wäre doppelt
  let emptyRun = 1, sawBlock = false, sawVars = false;
  // Blockly hängt an neue eigene Blöcke einen Platzhalter-Kommentar; im Programm stört er nur
  const stockComment = '# ' + Blockly.Msg['PROCEDURES_DEFNORETURN_COMMENT'];
  for (const raw of bodyLines){
    const mk = raw.match(markRe);
    // Blockly legt alle Variablen vorab mit None an – mit Überschrift, damit das nicht wie ein Versehen aussieht
    if (raw.trim() === stockComment) continue;
    const preset = !sawBlock ? raw.match(/^(\w+) = None$/) : null;
    if (preset && paramOnly.has(preset[1])) continue;
    if (preset && !sawVars){ sawVars = true; lines.push({text:'# Variablen anlegen', id:null}); }
    // Blockly schreibt »None«; wie in der SPIKE-App beginnt eine Variable aber bei 0 – sonst scheitert
    // schon »ändere um 1« oder ein Vergleich, wenn vorher niemand »setze« benutzt hat
    if (preset){ emptyRun = 0; lines.push({text:`${preset[1]} = 0`, id:null}); continue; }
    if (mk && !mk[2]){ stack.length = 0; continue; }
    if (mk){ sawBlock = true; const ind = mk[1].length; while (stack.length && stack[stack.length-1].ind >= ind) stack.pop(); stack.push({ind, id:mk[2]}); continue; }
    const ind = raw.length - raw.trimStart().length;
    if (raw.trim()) while (stack.length && stack[stack.length-1].ind > ind) stack.pop();
    if (!raw.trim()){ emptyRun++; if (emptyRun > 1) continue; } else emptyRun = 0;
    lines.push({text: raw, id: raw.trim() && stack.length ? stack[stack.length-1].id : null});
  }
  while (lines.length && !lines[lines.length-1].text.trim()) lines.pop();
  // Blöcke ohne eigene Zeile (»Fahrbasis einrichten«) können einen Rumpf leer zurücklassen;
  // Python verlangt dort mindestens »pass«
  const indentOf = (t: string) => t.length - t.trimStart().length;
  for (let i = H.length; i < lines.length; i++){
    const t = lines[i].text;
    if (!/:\s*(#.*)?$/.test(t) || t.trimStart().startsWith('#')) continue;
    let j = i + 1;
    while (j < lines.length && (!lines[j].text.trim() || lines[j].text.trimStart().startsWith('#'))) j++;
    if (j >= lines.length || indentOf(lines[j].text) <= indentOf(t)) lines.splice(i + 1, 0, {text:' '.repeat(indentOf(t)) + py.PASS.trimEnd(), id:lines[i].id});
  }
  if (!starts && !hats.length){
    lines.push({text:'', id:null});
    lines.push({text:'# Zieh den Block »wenn Programm startet« aus »Ereignisse« auf die Fläche.', id:null});
  }
  return {lines, warnings: G.warnings, usesPad: G.pad, usesXbox: G.xbox, modules: parts.flatMap(p => p.modules)};
}
