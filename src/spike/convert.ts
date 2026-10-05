// ---------------------------------------------------------------
// SPIKE-App-Projekt (Wortblöcke, Scratch-3-JSON) → Blockwerk-Blöcke
// Dieses Modul kennt keine Dateien und kein DOM: Es bekommt den Inhalt von
// project.json und liefert eine Blockly-Arbeitsfläche plus Bericht.
// ---------------------------------------------------------------
import { ICON_PATTERNS, fromRows, isPattern } from '../matrix';
import type { BlockState, WorkspaceState } from '../examples';

/** Annahmen über den Roboter – dieselben Werte wie im Block »Fahrbasis einrichten«. */
const WHEEL = 56, AXLE = 112;
const WHEEL_TURN = Math.PI * WHEEL;       // mm Strecke je Radumdrehung
/** Tempo 100 % in der SPIKE-App entspricht ungefähr so vielen Grad pro Sekunde am Rad. */
const FULL_SPEED_DEG = 1000;
const DEFAULT_SPEED_PCT = 50;

export interface ImportReport {
  /** Anzahl übersetzter Blöcke. */
  converted: number;
  /** Was beim Übersetzen angepasst wurde (Einheiten, Annahmen). */
  notes: string[];
  /** SPIKE-Blöcke ohne Entsprechung; sie stehen als Platzhalter im Programm. */
  unsupported: string[];
}
export interface ImportResult { state: WorkspaceState; report: ImportReport }

interface ScratchBlock {
  opcode: string; next: string | null; parent: string | null; topLevel?: boolean; shadow?: boolean;
  inputs: Record<string, unknown[]>; fields: Record<string, [string, string | null]>;
  mutation?: Record<string, string>; x?: number; y?: number;
}
type Blocks = Record<string, ScratchBlock | unknown[]>;
interface ScratchTarget { isStage: boolean; variables: Record<string, [string, unknown]>; blocks: Blocks }
export interface ScratchProject { targets: ScratchTarget[] }
type Input = {shadow?: object; block?: BlockState};

/** Rundet auf Vielfache von `step`; negative Werte spiegelbildlich, damit −30 und 30 dasselbe Ergebnis mit anderem Vorzeichen geben. */
const round = (x: number, step = 1) => { const r = Math.sign(x) * Math.round(Math.abs(x) / step) * step; return Number(r.toFixed(4)) + 0; };
const numShadow = (n: number) => ({shadow:{type:'math_number', fields:{NUM:n}}});
const textShadow = (t: string) => ({shadow:{type:'text', fields:{TEXT:t}}});
const B = (type: string, fields?: Record<string, unknown> | null, inputs?: Record<string, unknown> | null, extraState?: Record<string, unknown>): BlockState => {
  const o: BlockState = {type}; if (fields) o.fields = fields; if (extraState) o.extraState = extraState;
  // leere Eingänge (z. B. eine fehlende Bedingung) weglassen
  if (inputs) o.inputs = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== undefined));
  return o;
};
const arith = (op: string, a: Input, b: Input) => B('math_arithmetic', {OP:op}, {A:a, B:b});
const compare = (op: string, a: Input, b: Input) => B('logic_compare', {OP:op}, {A:a, B:b});
const COMPARATOR: Record<string, string> = {'<':'LT', '>':'GT', '=':'EQ'};
// Farbnummern der SPIKE-App
const COLORS: Record<string, string> = {'-1':'NONE', '0':'BLACK', '3':'BLUE', '5':'GREEN', '6':'GREEN', '7':'YELLOW', '9':'RED', '10':'WHITE'};
/** Tempo in Prozent → mm/s der Fahrbasis. */
const speedMm = (pct: number) => pct / 100 * FULL_SPEED_DEG / 360 * WHEEL_TURN;
/** Radgeschwindigkeit in mm/s → Drehrate des Roboters in Grad/s, wenn die Räder gegenläufig drehen. */
const spinRate = (mm: number) => mm / (AXLE / 2) * 180 / Math.PI;

export function convertSpike(project: ScratchProject): ImportResult {
  const target = project.targets.find(t => !t.isStage && Object.keys(t.blocks).length) ?? project.targets.find(t => !t.isStage);
  const report: ImportReport = {converted:0, notes:[], unsupported:[]};
  if (!target) return {state:{blocks:{languageVersion:0, blocks:[]}}, report};
  const blocks = target.blocks;
  const get = (id: unknown) => (typeof id === 'string' && blocks[id] && !Array.isArray(blocks[id]) ? blocks[id] as ScratchBlock : null);
  const note = (t: string) => { if (!report.notes.includes(t)) report.notes.push(t); };
  const variables = new Map<string, string>();   // Blockly-ID → Name
  for (const [id, [name]] of Object.entries(target.variables ?? {})) variables.set(id, name);

  // Das Tempo steht bei SPIKE in einem eigenen Block und gilt danach für alle Fahrbefehle;
  // Pybricks will es bei »fahre los« jedes Mal wissen. Gemerkt wird der zuletzt gesetzte Wert.
  let speedPct = DEFAULT_SPEED_PCT;
  const firstSpeed = Object.values(blocks).map(b => (Array.isArray(b) ? null : b as ScratchBlock))
    .find(b => b?.opcode === 'flippermove_movementSpeed');
  if (firstSpeed){ const lit = literal(firstSpeed.inputs.SPEED); if (lit !== null) speedPct = lit; }

  /** Zahl aus einem Eingang, wenn dort nur ein fester Wert steht; sonst null. */
  function literal(input: unknown[] | undefined): number | null {
    const v = input?.[1];
    if (Array.isArray(v) && v[0] !== 12 && v[0] !== 13){ const n = Number(v[1]); return v[1] !== '' && isFinite(n) ? n : null; }
    // Manche Zahlen stecken in einem eigenen Eingabeelement (z. B. das Lenkrad), bei Scratch ein Schattenblock
    const shadow = get(v);
    if (shadow?.shadow){ const raw = Object.values(shadow.fields)[0]?.[0]; const n = Number(raw); return raw !== '' && raw !== undefined && isFinite(n) ? n : null; }
    return null;
  }
  /** Wert eines Auswahlfelds, das bei Scratch als Schattenblock im Eingang steckt. */
  function menu(input: unknown[] | undefined): string {
    const b = get(input?.[1]) ?? get(input?.[2]);
    return b ? String(Object.values(b.fields)[0]?.[0] ?? '') : '';
  }
  /** Eingang als Blockwerk-Wert: fester Wert als Schatten, sonst der übersetzte Block. */
  function value(input: unknown[] | undefined, fallback = 0): Input {
    const v = input?.[1];
    if (Array.isArray(v)){
      if (v[0] === 12) return {...numShadow(fallback), block:variable(String(v[2]), String(v[1]))};
      const n = Number(v[1]);
      return v[1] !== '' && isFinite(n) ? numShadow(n) : textShadow(String(v[1]));
    }
    const b = get(v);
    return b ? {...numShadow(fallback), block:expr(b)} : numShadow(fallback);
  }
  /** Eingang für ein Textfeld: fester Wert als Text, sonst der übersetzte Block. */
  function textValue(input: unknown[] | undefined): Input {
    const v = input?.[1];
    if (Array.isArray(v) && v[0] !== 12) return textShadow(String(v[1]));
    return {...textShadow(''), block:value(input).block};
  }
  /** Eingang mal Faktor – für Einheiten (cm → mm, s → ms). */
  function scaled(input: unknown[] | undefined, factor: number, step = 1): Input {
    const lit = literal(input);
    if (lit !== null) return numShadow(round(lit * factor, step));
    return {...numShadow(0), block:arith('MULTIPLY', value(input), numShadow(round(factor, 0.01)))};
  }
  function condition(input: unknown[] | undefined): Input | undefined {
    const b = get(input?.[1]);
    return b ? {block:expr(b)} : undefined;
  }
  function variable(id: string, name: string){
    if (!variables.has(id)) variables.set(id, name);
    return B('variables_get', {VAR:{id}});
  }
  function unsupported(b: ScratchBlock, isValue: boolean): BlockState {
    const what = b.opcode.replace(/^flipper/, '').replace(/_/g, ': ');
    if (!report.unsupported.includes(what)) report.unsupported.push(what);
    return B(isValue ? 'pb_unsupported_value' : 'pb_unsupported', {WHAT:what});
  }

  // ---- Werte und Bedingungen ----
  function expr(b: ScratchBlock): BlockState {
    report.converted++;
    const f = (name: string) => b.fields[name]?.[0] ?? '';
    const port = () => menu(b.inputs.PORT) || 'A';
    switch (b.opcode){
      case 'flippersensors_isColor': {
        const color = COLORS[menu(b.inputs.VALUE)];
        if (!color){ report.converted--; return unsupported(b, true); }
        return B('pb_color_is', {PORT:port(), COLOR:color});
      }
      case 'flippersensors_reflectivity': return B('pb_reflection', {PORT:port()});
      case 'flippersensors_isReflectivity':
        return compare(COMPARATOR[f('COMPARATOR')] ?? 'LT', {block:B('pb_reflection', {PORT:port()})}, value(b.inputs.VALUE, 50));
      case 'flippersensors_distance': {
        // SPIKE misst in cm, Pybricks in mm: durch 10 teilen, damit die Zahlen im Programm weiter stimmen
        const unit = f('UNIT'), div = unit === 'in' ? 25.4 : unit === '%' ? 20 : 10;
        note(`Abstand: Pybricks misst in mm. »Abstand ÷ ${div}« liefert den Wert wie in der SPIKE-App (${unit || 'cm'}).`);
        return arith('DIVIDE', {block:B('pb_distance', {PORT:port()})}, numShadow(div));
      }
      case 'flippersensors_isDistance': {
        const unit = f('UNIT'), mm = unit === 'in' ? 25.4 : unit === '%' ? 20 : 10;
        note('Abstände sind von cm in mm umgerechnet.');
        return compare(COMPARATOR[f('COMPARATOR')] ?? 'LT', {block:B('pb_distance', {PORT:port()})}, scaled(b.inputs.VALUE, mm));
      }
      case 'flippersensors_isPressed': {
        const pressed = B('pb_force_pressed', {PORT:port()});
        return f('OPTION') === 'released' ? B('logic_negate', null, {BOOL:{block:pressed}}) : pressed;
      }
      case 'flippersensors_force': return B('pb_force', {PORT:port()});
      case 'flippersensors_orientationAxis':
        if (f('AXIS') !== 'yaw'){ report.converted--; return unsupported(b, true); }
        note('Gierwinkel: Die SPIKE-App zählt von −180 bis 180, Pybricks zählt über 180 hinaus weiter.');
        return B('pb_heading');
      case 'flippersensors_timer':
        note('Stoppuhr: Pybricks misst in ms. »Stoppuhr ÷ 1000« liefert Sekunden wie in der SPIKE-App.');
        return arith('DIVIDE', {block:B('pb_timer')}, numShadow(1000));
      case 'flippersensors_buttonIsPressed': {
        const btn = B('pb_button', {BUTTON:f('BUTTON') === 'right' ? 'RIGHT' : 'LEFT'});
        return f('EVENT') === 'released' ? B('logic_negate', null, {BOOL:{block:btn}}) : btn;
      }
      case 'operator_add': return arith('ADD', value(b.inputs.NUM1), value(b.inputs.NUM2));
      case 'operator_subtract': return arith('MINUS', value(b.inputs.NUM1), value(b.inputs.NUM2));
      case 'operator_multiply': return arith('MULTIPLY', value(b.inputs.NUM1), value(b.inputs.NUM2));
      case 'operator_divide': return arith('DIVIDE', value(b.inputs.NUM1), value(b.inputs.NUM2, 1));
      case 'operator_mod': return B('math_modulo', null, {DIVIDEND:value(b.inputs.NUM1), DIVISOR:value(b.inputs.NUM2, 1)});
      case 'operator_random': return B('math_random_int', null, {FROM:value(b.inputs.FROM, 1), TO:value(b.inputs.TO, 10)});
      case 'operator_round': return B('math_round', {OP:'ROUND'}, {NUM:value(b.inputs.NUM)});
      case 'operator_gt': return compare('GT', value(b.inputs.OPERAND1), value(b.inputs.OPERAND2));
      case 'operator_lt': return compare('LT', value(b.inputs.OPERAND1), value(b.inputs.OPERAND2));
      case 'operator_equals': return compare('EQ', value(b.inputs.OPERAND1), value(b.inputs.OPERAND2));
      case 'operator_and': return B('logic_operation', {OP:'AND'}, {A:condition(b.inputs.OPERAND1), B:condition(b.inputs.OPERAND2)});
      case 'operator_or': return B('logic_operation', {OP:'OR'}, {A:condition(b.inputs.OPERAND1), B:condition(b.inputs.OPERAND2)});
      case 'operator_not': return B('logic_negate', null, {BOOL:condition(b.inputs.OPERAND)});
      case 'operator_join': return B('text_join', null, {ADD0:textValue(b.inputs.STRING1), ADD1:textValue(b.inputs.STRING2)}, {itemCount:2});
      case 'operator_mathop': {
        const op = f('OPERATOR'), num = {NUM:value(b.inputs.NUM)};
        if (op === 'abs') return B('pb_abs', null, num);
        if (op === 'floor') return B('math_round', {OP:'ROUNDDOWN'}, num);
        if (op === 'ceiling') return B('math_round', {OP:'ROUNDUP'}, num);
        report.converted--; return unsupported(b, true);
      }
      case 'argument_reporter_string_number':
      case 'argument_reporter_boolean':
        return B('variables_get', {VAR:{id:paramId(f('VALUE'))}});
      default: report.converted--; return unsupported(b, true);
    }
  }

  // ---- Anweisungen: ein SPIKE-Block kann mehrere Blockwerk-Blöcke ergeben ----
  const paramId = (name: string) => 'param_' + name;
  function drive(speed: Input, rate: Input){ return B('pb_drive_drive', null, {SPEED:speed, RATE:rate}); }
  function stmt(b: ScratchBlock): BlockState[] {
    report.converted++;
    const f = (name: string) => b.fields[name]?.[0] ?? '';
    const sub = (name: string) => { const first = chain(get(b.inputs[name]?.[1])); return first ? {block:first} : undefined; };
    const v = speedMm(speedPct);
    switch (b.opcode){
      case 'flippermove_setMovementPair': {
        const pair = menu(b.inputs.PAIR) || 'AB';
        note(`Fahrbasis: Blockwerk nimmt Räder mit ${WHEEL} mm Durchmesser und ${AXLE} mm Spurbreite an. Bitte am Roboter nachmessen und im Block »Fahrbasis einrichten« eintragen.`);
        return [B('pb_drive_setup', {LEFT_PORT:pair[0], LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_PORT:pair[1] ?? 'B', RIGHT_DIR:'CLOCKWISE', WHEEL, AXLE, GYRO:true})];
      }
      case 'flippermove_movementSpeed': {
        const lit = literal(b.inputs.SPEED);
        if (lit === null){ report.converted--; return [unsupported(b, false)]; }
        speedPct = lit;
        note('Tempo: Prozent der SPIKE-App sind in mm/s und Grad/s umgerechnet. Das ist eine Näherung – bei Bedarf im Block »setze Fahrtempo« anpassen.');
        return [B('pb_drive_settings', null, {SPEED:numShadow(round(speedMm(lit), 5)), RATE:numShadow(round(spinRate(speedMm(lit)), 5))})];
      }
      case 'flippermove_move': {
        const dir = menu(b.inputs.DIRECTION), unit = f('UNIT');
        const turning = dir === 'clockwise' || dir === 'counterclockwise';
        const sign = dir === 'back' || dir === 'counterclockwise' ? -1 : 1;
        if (unit === 'seconds'){
          note('»Bewege für … Sekunden« ist zu »fahre los«, »warte« und »anhalten« geworden.');
          return [turning ? drive(numShadow(0), numShadow(sign * round(spinRate(v), 5))) : drive(numShadow(sign * round(v, 5)), numShadow(0)),
            B('pb_wait', null, {MS:scaled(b.inputs.VALUE, 1000)}), B('pb_drive_stop', {MODE:'brake'})];
        }
        // Strecke, die die Räder zurücklegen, in mm je Einheit
        const mmPer = unit === 'cm' ? 10 : unit === 'in' ? 25.4 : unit === 'rotations' ? WHEEL_TURN : WHEEL_TURN / 360;
        if (!turning){
          if (unit === 'cm' || unit === 'in') note('Strecken sind von cm in mm umgerechnet.');
          else note(`Radumdrehungen und Grad am Rad sind in mm Strecke umgerechnet (Rad ${WHEEL} mm).`);
          return [B('pb_drive_straight', null, {DIST:scaled(b.inputs.VALUE, sign * mmPer)})];
        }
        // Beim Drehen meint die SPIKE-App den Weg der Räder; Pybricks dreht den ganzen Roboter um einen Winkel
        note(`Drehungen: In der SPIKE-App zählt, wie weit sich die Räder drehen. Blockwerk rechnet das in den Winkel des Roboters um (Rad ${WHEEL} mm, Spurbreite ${AXLE} mm): 180 Grad am Rad sind 90 Grad Drehung.`);
        return [B('pb_drive_turn', null, {ANGLE:scaled(b.inputs.VALUE, sign * mmPer / (AXLE / 2) * 180 / Math.PI)})];
      }
      case 'flippermove_startMove': {
        const dir = menu(b.inputs.DIRECTION);
        note('»Starte Bewegung«: Pybricks braucht das Tempo direkt im Block. Eingesetzt ist das zuletzt eingestellte Tempo.');
        if (dir === 'clockwise' || dir === 'counterclockwise') return [drive(numShadow(0), numShadow((dir === 'clockwise' ? 1 : -1) * round(spinRate(v), 5)))];
        return [drive(numShadow((dir === 'back' ? -1 : 1) * round(v, 5)), numShadow(0))];
      }
      case 'flippermove_startSteer': {
        // Lenkung s (−100…100): Das innere Rad läuft mit v·(1 − |s|/50). Daraus folgen
        // Vorwärtstempo v·(1 − |s|/100) und Drehrate v·s/50 geteilt durch die Spurbreite.
        const perSteer = v / 50 / AXLE * 180 / Math.PI;
        const s = literal(b.inputs.STEERING);
        note('Lenkung: Der Lenkwert der SPIKE-App ist in eine Drehrate in Grad/s umgerechnet.');
        if (s !== null) return [drive(numShadow(round(v * (1 - Math.abs(s) / 100), 5)), numShadow(round(s * perSteer, 1)))];
        return [drive(numShadow(round(v, 5)), {...numShadow(0), block:arith('MULTIPLY', value(b.inputs.STEERING), numShadow(round(perSteer, 0.01)))})];
      }
      case 'flippermove_stopMove': return [B('pb_drive_stop', {MODE:'brake'})];

      case 'flipperlight_lightDisplayImageOn':
      case 'flipperlight_lightDisplayImageOnForTime': {
        // Entspricht das Bild einem eingebauten in voller Helligkeit, wird es »zeige Bild«; sonst ein eigenes Muster
        const raw = menu(b.inputs.MATRIX);
        const icon = Object.entries(ICON_PATTERNS).find(([, [, rows]]) => fromRows(rows) === raw);
        if (!icon && !isPattern(raw)){ report.converted--; return [unsupported(b, false)]; }
        const show = icon ? B('pb_display_icon', {ICON:icon[0]}) : B('pb_display_pixels', {PIXELS:raw});
        return b.opcode.endsWith('ForTime') ? [show, B('pb_wait', null, {MS:scaled(b.inputs.VALUE, 1000)}), B('pb_display_off')] : [show];
      }
      case 'flipperlight_lightDisplayOff': return [B('pb_display_off')];
      case 'flipperlight_lightDisplayText': return [B('pb_display_text', null, {TEXT:textValue(b.inputs.TEXT)})];
      case 'flippersound_beepForTime': {
        const midi = Number(menu(b.inputs.NOTE)) || 60;
        note('Töne: Die Notennummer ist in eine Frequenz in Hz umgerechnet, Sekunden in ms.');
        return [B('pb_beep', null, {FREQ:numShadow(Math.round(440 * 2 ** ((midi - 69) / 12))), DUR:scaled(b.inputs.DURATION, 1000)})];
      }
      case 'flippersensors_resetYaw': return [B('pb_reset_heading', null, {ANGLE:numShadow(0)})];
      case 'flippersensors_resetTimer': return [B('pb_timer_reset')];

      case 'control_wait': note('Wartezeiten sind von Sekunden in ms umgerechnet.'); return [B('pb_wait', null, {MS:scaled(b.inputs.DURATION, 1000)})];
      case 'control_wait_until': return [B('pb_wait_until', null, {COND:condition(b.inputs.CONDITION)})];
      case 'control_forever': return [B('pb_forever', null, {DO:sub('SUBSTACK')})];
      case 'control_repeat': return [B('controls_repeat_ext', null, {TIMES:value(b.inputs.TIMES, 10), DO:sub('SUBSTACK')})];
      case 'control_repeat_until': return [B('controls_whileUntil', {MODE:'UNTIL'}, {BOOL:condition(b.inputs.CONDITION), DO:sub('SUBSTACK')})];
      case 'control_if': return [B('controls_if', null, {IF0:condition(b.inputs.CONDITION), DO0:sub('SUBSTACK')})];
      case 'control_if_else': return [B('controls_if', null, {IF0:condition(b.inputs.CONDITION), DO0:sub('SUBSTACK'), ELSE:sub('SUBSTACK2')}, {hasElse:true})];

      case 'data_setvariableto': {
        const [name, id] = b.fields.VARIABLE; variables.set(id!, name);
        return [B('variables_set', {VAR:{id}}, {VALUE:value(b.inputs.VALUE)})];
      }
      case 'data_changevariableby': {
        const [name, id] = b.fields.VARIABLE; variables.set(id!, name);
        return [B('math_change', {VAR:{id}}, {DELTA:value(b.inputs.VALUE, 1)})];
      }
      case 'procedures_call': {
        const proc = procedure(b.mutation);
        const inputs: Record<string, unknown> = {};
        proc.argIds.forEach((argId, i) => { inputs['ARG' + i] = value(b.inputs[argId]); });
        return [B('procedures_callnoreturn', null, inputs, {name:proc.name, params:proc.params})];
      }
      default: report.converted--; return [unsupported(b, false)];
    }
  }
  /** Kette von Anweisungen ab `first`; liefert den ersten Blockwerk-Block. */
  function chain(first: ScratchBlock | null, head?: BlockState): BlockState | null {
    const out: BlockState[] = head ? [head] : [];
    for (let b = first; b; b = get(b.next)) out.push(...stmt(b));
    for (let i = 0; i < out.length - 1; i++){
      // »wiederhole fortlaufend« hat keinen Anschluss nach unten – was danach käme, liefe nie
      if (out[i].type === 'pb_forever'){ note('Blöcke hinter »wiederhole fortlaufend« wurden weggelassen: Sie wären nie erreicht worden.'); out.length = i + 1; break; }
      out[i].next = {block:out[i + 1]};
    }
    return out[0] ?? null;
  }
  /** Name und Parameter eines eigenen Blocks aus der Scratch-Beschreibung (»drehe %s«). */
  function procedure(m: Record<string, string> | undefined){
    const code = m?.proccode ?? 'Block';
    const argIds: string[] = JSON.parse(m?.argumentids ?? '[]');
    const name = code.replace(/%[sbn]/g, '').replace(/\s+/g, ' ').trim();
    const known = procedures.get(name);
    return {name, argIds, params:known ?? argIds.map((_, i) => 'Wert' + (i + 1))};
  }
  const procedures = new Map<string, string[]>();   // Name → Parameternamen
  const tops = Object.values(blocks).filter((b): b is ScratchBlock => !Array.isArray(b) && !!(b as ScratchBlock).topLevel && !(b as ScratchBlock).shadow)
    .sort((a, b) => (a.x ?? 0) - (b.x ?? 0) || (a.y ?? 0) - (b.y ?? 0));
  for (const top of tops) if (top.opcode === 'procedures_definition'){
    const proto = get(top.inputs.custom_block?.[1]);
    const names: string[] = JSON.parse(proto?.mutation?.argumentnames ?? '[]');
    procedures.set(procedure(proto?.mutation).name, names);
  }

  const result: BlockState[] = [];
  const place = (block: BlockState) => { result.push(Object.assign(block, {x:40 + result.length * 420, y:40})); };
  // Eigene Blöcke zuerst: Die Aufrufe im Hauptprogramm brauchen ihre Definition
  for (const top of tops) if (top.opcode === 'procedures_definition'){
    const proc = procedure(get(top.inputs.custom_block?.[1])?.mutation);
    report.converted++;
    const body = chain(get(top.next));
    place(B('procedures_defnoreturn', {NAME:proc.name}, body ? {STACK:{block:body}} : null,
      proc.params.length ? {params:proc.params.map(n => ({name:n, id:paramId(n)}))} : undefined));
  }
  for (const top of tops){
    if (top.opcode === 'procedures_definition') continue;
    if (top.opcode === 'flipperevents_whenProgramStarts'){ report.converted++; place(chain(get(top.next), B('pb_start'))!); }
    else if (top.opcode.startsWith('flipperevents_') || top.opcode.startsWith('event_')){
      // Andere Ereignisse (Taste, Farbe, Nachricht …) kennt Blockwerk nicht: Der Stapel bleibt lose liegen
      const what = top.opcode.replace(/^flipper/, '').replace(/_/g, ': ');
      if (!report.unsupported.includes(what)) report.unsupported.push(what);
      note('Stapel unter einem nicht unterstützten Ereignis liegen lose auf der Fläche und werden nicht ausgeführt.');
      place(chain(get(top.next), B('pb_unsupported', {WHAT:what}))!);
    } else { const loose = chain(top); if (loose) place(loose); }
  }

  const state: WorkspaceState = {blocks:{languageVersion:0, blocks:result}};
  if (variables.size) state.variables = [...variables].map(([id, name]) => ({name, id}));
  return {state, report};
}
