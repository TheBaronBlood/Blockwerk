// ---------------------------------------------------------------
// Werkzeugkasten
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';

/** Schattenblock mit einer Zahl bzw. einem Text als Vorgabewert. */
export const N = (n: number) => ({shadow:{type:'math_number', fields:{NUM:n}}});
export const T = (t: string) => ({shadow:{type:'text', fields:{TEXT:t}}});
const blk = (type: string, extra?: Record<string, unknown>) => Object.assign({kind:'block', type}, extra || {});
export const toolbox: Blockly.utils.toolbox.ToolboxDefinition = {kind:'categoryToolbox', contents:[
  {kind:'category', name:'Ereignisse', categorystyle:'event_cat', contents:[
    blk('pb_start'),
    // Mehrere Ereignisse laufen gleichzeitig. »wenn …« nimmt jede Bedingung; die häufigsten liegen fertig bereit
    blk('pb_when', {inputs:{COND:{block:{type:'pb_button'}}}}),
    blk('pb_when', {inputs:{COND:{block:{type:'pb_color_is', fields:{PORT:'C'}}}}}),
    blk('pb_when', {inputs:{COND:{block:{type:'logic_compare', fields:{OP:'LT'}, inputs:{A:{block:{type:'pb_distance', fields:{PORT:'D'}}}, B:N(100)}}}}}),
    blk('pb_when', {inputs:{COND:{block:{type:'pb_force_pressed', fields:{PORT:'E'}}}}}),
    blk('pb_when'),
    blk('pb_when_message'), blk('pb_send_message')]},
  {kind:'category', name:'Fahren', categorystyle:'drive_cat', contents:[
    blk('pb_drive_setup', {fields:{LEFT_PORT:'A', LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_PORT:'B', RIGHT_DIR:'CLOCKWISE'}}),
    blk('pb_drive_straight', {inputs:{DIST:N(200)}}),
    blk('pb_drive_turn', {inputs:{ANGLE:N(90)}}),
    blk('pb_drive_arc', {inputs:{RADIUS:N(150), ANGLE:N(90)}}),
    blk('pb_drive_drive', {inputs:{SPEED:N(200), RATE:N(0)}}),
    blk('pb_drive_stop'),
    blk('pb_drive_settings', {inputs:{SPEED:N(300), RATE:N(180)}}),
    blk('pb_drive_reset'), blk('pb_drive_distance'), blk('pb_drive_angle')]},
  {kind:'category', name:'Motoren', categorystyle:'motor_cat', contents:[
    blk('pb_motor_run_angle', {fields:{PORT:'C'}, inputs:{ANGLE:N(360), SPEED:N(500)}}),
    blk('pb_motor_run_time', {fields:{PORT:'C'}, inputs:{TIME:N(1000), SPEED:N(500)}}),
    blk('pb_motor_run_target', {fields:{PORT:'C'}, inputs:{TARGET:N(90), SPEED:N(500)}}),
    blk('pb_motor_run', {fields:{PORT:'C'}, inputs:{SPEED:N(500)}}),
    blk('pb_motor_stop', {fields:{PORT:'C'}}),
    blk('pb_motor_reset', {fields:{PORT:'C'}, inputs:{ANGLE:N(0)}}),
    blk('pb_motor_angle', {fields:{PORT:'C'}}), blk('pb_motor_speed', {fields:{PORT:'C'}})]},
  {kind:'category', name:'Sensoren', categorystyle:'sensor_cat', contents:[
    blk('pb_color_is', {fields:{PORT:'C'}}), blk('pb_reflection', {fields:{PORT:'C'}}),
    blk('pb_distance', {fields:{PORT:'D'}}),
    blk('pb_force_pressed', {fields:{PORT:'E'}}), blk('pb_force', {fields:{PORT:'E'}}),
    blk('pb_heading'), blk('pb_reset_heading', {inputs:{ANGLE:N(0)}}),
    blk('pb_button'), blk('pb_timer_reset'), blk('pb_timer')]},
  {kind:'category', name:'Licht und Ton', categorystyle:'hub_cat', contents:[
    blk('pb_display_text', {inputs:{TEXT:T('Hallo')}}), blk('pb_display_number', {inputs:{NUM:N(42)}}),
    blk('pb_display_icon'), blk('pb_display_pixels'), blk('pb_display_off'), blk('pb_light'),
    blk('pb_beep', {inputs:{FREQ:N(440), DUR:N(200)}}), blk('pb_print', {inputs:{TEXT:T('Hallo')}})]},
  {kind:'category', name:'Fernsteuerung', categorystyle:'remote_cat', contents:[
    {kind:'label', text:'Steuerfeld in Blockwerk'},
    blk('pb_pad_stick'), blk('pb_pad_button'),
    {kind:'label', text:'Xbox-Controller'},
    blk('pb_xbox_stick'), blk('pb_xbox_trigger'), blk('pb_xbox_button'),
    blk('pb_xbox_rumble', {inputs:{POWER:N(100), DUR:N(200)}}),
    {kind:'label', text:'LEGO-Fernbedienung'},
    blk('pb_remote_button'), blk('pb_remote_light')]},
  {kind:'category', name:'Steuerung', categorystyle:'control_cat', contents:[
    blk('pb_wait', {inputs:{MS:N(1000)}}),
    blk('controls_repeat_ext', {inputs:{TIMES:N(4)}}),
    blk('pb_forever'),
    blk('controls_if'), blk('controls_if', {extraState:{hasElse:true}}),
    blk('pb_wait_until'),
    blk('controls_whileUntil'),
    blk('controls_flow_statements')]},
  {kind:'category', name:'Operatoren', categorystyle:'op_cat', contents:[
    blk('math_number'), blk('math_arithmetic', {inputs:{A:N(1), B:N(1)}}),
    blk('pb_abs', {inputs:{NUM:N(-5)}}), blk('math_round', {inputs:{NUM:N(3.1)}}),
    blk('math_modulo', {inputs:{DIVIDEND:N(10), DIVISOR:N(3)}}),
    blk('math_constrain', {inputs:{VALUE:N(50), LOW:N(-100), HIGH:N(100)}}),
    blk('math_random_int', {inputs:{FROM:N(1), TO:N(6)}}),
    blk('logic_compare', {inputs:{A:N(0), B:N(50)}}), blk('logic_operation'), blk('logic_negate'), blk('logic_boolean'),
    blk('text'), blk('text_join')]},
  {kind:'category', name:'Listen', categorystyle:'list_cat', contents:[
    blk('lists_create_with', {extraState:{itemCount:0}}),
    blk('lists_create_with', {extraState:{itemCount:3}, inputs:{ADD0:N(100), ADD1:N(200), ADD2:N(300)}}),
    blk('lists_length'), blk('lists_isEmpty'),
    blk('lists_getIndex', {inputs:{AT:N(1)}}),
    blk('lists_setIndex', {inputs:{AT:N(1), TO:N(0)}}),
    blk('controls_forEach')]},
  {kind:'sep'},
  {kind:'category', name:'Variablen', categorystyle:'variable_cat', custom:'VARIABLE'},
  {kind:'category', name:'Meine Blöcke', categorystyle:'proc_cat', custom:'PROCEDURE'}
]};

/** Der Werkzeugkasten mit zusätzlichen Kategorien am Ende, zum Beispiel aus Erweiterungen. */
export function toolboxWith(categories: Blockly.utils.toolbox.ToolboxItemInfo[]): Blockly.utils.toolbox.ToolboxDefinition {
  if (!categories.length) return toolbox;
  const base = toolbox as Blockly.utils.toolbox.ToolboxInfo;
  return {...base, contents:[...base.contents, {kind:'sep'}, ...categories]};
}
