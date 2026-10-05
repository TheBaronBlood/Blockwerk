// ---------------------------------------------------------------
// Beispiele
// ---------------------------------------------------------------
import { N, T } from './toolbox';

type Dict = Record<string, unknown>;
export interface BlockState { type: string; fields?: Dict; inputs?: Dict; extraState?: Dict; next?: {block: BlockState}; x?: number; y?: number }
/** Blockly-JSON-Serialisierung einer Arbeitsfläche. */
export type WorkspaceState = Dict;

export const B = (type: string, fields?: Dict | null, inputs?: Dict | null, extraState?: Dict) => { const o: BlockState = {type}; if (fields) o.fields = fields; if (inputs) o.inputs = inputs; if (extraState) o.extraState = extraState; return o; };
export const seq = (...list: BlockState[]) => { for (let i = 0; i < list.length - 1; i++) list[i].next = {block:list[i+1]}; return list[0]; };
export const S = (...list: BlockState[]) => ({block: seq(...list)});
export const at = (block: BlockState, x: number, y: number) => Object.assign(block, {x, y});
export const NB = (n: number, block: BlockState) => ({shadow:{type:'math_number', fields:{NUM:n}}, block});
export const setup = () => B('pb_drive_setup', {LEFT_PORT:'A', LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_PORT:'B', RIGHT_DIR:'CLOCKWISE', WHEEL:56, AXLE:112, GYRO:true});
export const refl = () => B('pb_reflection', {PORT:'C'});
export const cmp = (op: string, a: BlockState, bn: number) => B('logic_compare', {OP:op}, {A:{block:a}, B:N(bn)});
export const ws_ = (blocks: BlockState[], variables?: {name: string; id: string}[]): WorkspaceState => ({blocks:{languageVersion:0, blocks}, ...(variables ? {variables} : {})});

export const EXAMPLES: Record<string, () => WorkspaceState> = {
  quadrat: () => ws_([at(seq(B('pb_start'), setup(),
      B('controls_repeat_ext', null, {TIMES:N(4), DO:S(B('pb_drive_straight', null, {DIST:N(200)}), B('pb_drive_turn', null, {ANGLE:N(90)}))}),
      B('pb_beep', null, {FREQ:N(880), DUR:N(200)})), 40, 40)]),
  wand: () => ws_([at(seq(B('pb_start'), setup(), B('pb_display_icon', {ICON:'ARROW_UP'}),
      B('pb_wait_until', null, {COND:{block:B('pb_force_pressed', {PORT:'E'})}}),
      B('pb_drive_drive', null, {SPEED:N(150), RATE:N(0)}),
      B('pb_wait_until', null, {COND:{block:cmp('LT', B('pb_distance', {PORT:'D'}), 100)}}),
      B('pb_drive_stop', {MODE:'brake'}), B('pb_display_icon', {ICON:'HAPPY'})), 40, 40)]),
  linie: () => ws_([at(seq(B('pb_start'), setup(),
      B('pb_forever', null, {DO:S(B('pb_drive_drive', null, {SPEED:N(120),
        RATE:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:{block:B('math_arithmetic', {OP:'MINUS'}, {A:{block:refl()}, B:N(50)})}, B:N(1.2)}))}))})), 40, 40)]),
  zaehlen: () => ws_([at(seq(B('pb_start'), setup(),
      B('variables_set', {VAR:{id:'var_linien'}}, {VALUE:N(0)}),
      B('pb_drive_drive', null, {SPEED:N(120), RATE:N(0)}),
      B('pb_forever', null, {DO:S(
        B('pb_wait_until', null, {COND:{block:cmp('LT', refl(), 30)}}),
        B('math_change', {VAR:{id:'var_linien'}}, {DELTA:N(1)}),
        B('pb_display_number', null, {NUM:NB(0, B('variables_get', {VAR:{id:'var_linien'}}))}),
        B('pb_wait_until', null, {COND:{block:cmp('GT', refl(), 60)}}))})), 40, 40)],
      [{name:'Linien', id:'var_linien'}]),
  funktion: () => ws_([
      at(B('procedures_defnoreturn', {NAME:'Ecke'}, {STACK:S(B('pb_drive_straight', null, {DIST:N(200)}), B('pb_drive_turn', null, {ANGLE:N(90)}))}), 40, 40),
      at(seq(B('pb_start'), setup(), B('controls_repeat_ext', null, {TIMES:N(4), DO:S(B('procedures_callnoreturn', null, null, {name:'Ecke'}))})), 40, 260)]),
  steuerfeld: () => ws_([at(seq(B('pb_start'), setup(),
      B('pb_forever', null, {DO:S(
        B('pb_drive_drive', null, {
          SPEED:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:{block:B('pb_pad_stick', {AXIS:'y'})}, B:N(3)})),
          RATE:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:{block:B('pb_pad_stick', {AXIS:'x'})}, B:N(2)}))}),
        B('controls_if', null, {IF0:{block:B('pb_pad_button', {BUTTON:'A'})}, DO0:S(B('pb_beep', null, {FREQ:N(880), DUR:N(100)}))}),
        B('pb_wait', null, {MS:N(20)}))})), 40, 40)]),
  motor: () => ws_([at(seq(B('pb_start'),
      B('pb_motor_reset', {PORT:'C'}, {ANGLE:N(0)}),
      B('pb_motor_run_angle', {PORT:'C'}, {ANGLE:N(90), SPEED:N(300)}),
      B('pb_wait', null, {MS:N(500)}),
      B('pb_motor_run_target', {PORT:'C'}, {TARGET:N(0), SPEED:N(300)}),
      B('pb_display_text', null, {TEXT:T('fertig')})), 40, 40)]),
  // drei Ereignisse laufen gleichzeitig: fahren, auf die Taste achten, auf die Nachricht reagieren
  gleichzeitig: () => ws_([
    at(seq(B('pb_start'), setup(),
      B('pb_forever', null, {DO:S(B('pb_drive_straight', null, {DIST:N(200)}), B('pb_drive_turn', null, {ANGLE:N(90)}))})), 40, 40),
    at(seq(B('pb_when', null, {COND:{block:B('pb_button', {BUTTON:'LEFT'})}}),
      B('pb_beep', null, {FREQ:N(880), DUR:N(200)}), B('pb_send_message', {NAME:'lachen'})), 480, 40),
    at(seq(B('pb_when_message', {NAME:'lachen'}),
      B('pb_display_icon', {ICON:'HAPPY'}), B('pb_wait', null, {MS:N(1000)}), B('pb_display_off')), 480, 260)])
};
