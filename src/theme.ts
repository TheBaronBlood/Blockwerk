// ---------------------------------------------------------------
// Farben und Theme. Die Farbtöne stammen aus der SPIKE App, sind aber etwas abgedunkelt,
// damit die weiße Schrift auf den Blöcken gut lesbar ist – vor allem auf Gelb und Hellblau.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

/**
 * Blocklys Mauszeiger und Symbole liegen neben der Seite (public/blockly-media, Kopie aus dem
 * Paket). Ohne diese Angabe – auch mit einem leeren Text – holt Blockly sie bei jedem Start
 * von static.blockly.com; Blockwerk soll aber von sich aus nichts aus dem Netz laden.
 */
export const BLOCKLY_MEDIA = './blockly-media/';

type Shades = readonly [string, string, string];
const COL: Record<string, Shades> = {
  event:['#D4A300','#E3BD45','#A88100'], drive:['#E644B9','#EE7FD0','#B30081'],
  motor:['#0082DD','#4DA8E8','#006BB8'], sensor:['#2CADCD','#6CC7DE','#0090AD'],
  hub:['#8C5FDD','#AD8CE8','#5E1CD8'], remote:['#0EAA7E','#56C4A5','#0A805E'], list:['#BA59BA','#D084D0','#953995'], control:['#DB9C12','#E8B955','#AD7700'],
  op:['#00A645','#4DC27D','#005F26'], variable:['#E67E17','#EE9E58','#C56300'],
  proc:['#E65C73','#EE8A9B','#CF455D']
};
const bs = (c: Shades, hat?: string) => Object.assign({colourPrimary:c[0], colourSecondary:c[1], colourTertiary:c[2]}, hat ? {hat} : {});
const blockStyles = {
  event_blocks: bs(COL.event, 'cap'), drive_blocks: bs(COL.drive), motor_blocks: bs(COL.motor),
  sensor_blocks: bs(COL.sensor), hub_blocks: bs(COL.hub), remote_blocks: bs(COL.remote), unsupported_blocks: bs(['#8A94A3','#AAB2BE','#667080']), loop_blocks: bs(COL.control),
  logic_blocks: bs(COL.op), math_blocks: bs(COL.op), text_blocks: bs(COL.op),
  variable_blocks: bs(COL.variable), variable_dynamic_blocks: bs(COL.variable),
  procedure_blocks: bs(COL.proc), list_blocks: bs(COL.list), colour_blocks: bs(COL.op), hat_blocks: bs(COL.event, 'cap')
};
const categoryStyles = {
  event_cat:{colour:COL.event[0]}, drive_cat:{colour:COL.drive[0]}, motor_cat:{colour:COL.motor[0]},
  sensor_cat:{colour:COL.sensor[0]}, hub_cat:{colour:COL.hub[0]}, remote_cat:{colour:COL.remote[0]}, list_cat:{colour:COL.list[0]}, control_cat:{colour:COL.control[0]},
  op_cat:{colour:COL.op[0]}, variable_cat:{colour:COL.variable[0]}, proc_cat:{colour:COL.proc[0]}
};
const fontStyle = {family:'"Helvetica Neue", Helvetica, Arial, sans-serif', weight:'500', size:12};
export const THEME_LIGHT = Blockly.Theme.defineTheme('bw_light', {
  name:'bw_light', base: Blockly.Themes.Classic, blockStyles, categoryStyles, fontStyle, startHats:false,
  componentStyles:{workspaceBackgroundColour:'#F7F9FB', toolboxBackgroundColour:'#FFFFFF', toolboxForegroundColour:'#18212C',
    flyoutBackgroundColour:'#EDF1F5', flyoutForegroundColour:'#18212C', flyoutOpacity:1, scrollbarColour:'#C5CED8', scrollbarOpacity:.8,
    insertionMarkerColour:'#000', insertionMarkerOpacity:.2, cursorColour:'#0090F5'}
});
export const THEME_DARK = Blockly.Theme.defineTheme('bw_dark', {
  name:'bw_dark', base: Blockly.Themes.Classic, blockStyles, categoryStyles, fontStyle, startHats:false,
  componentStyles:{workspaceBackgroundColour:'#191B20', toolboxBackgroundColour:'#16171D', toolboxForegroundColour:'#ECEDE8',
    flyoutBackgroundColour:'#1D1F23', flyoutForegroundColour:'#ECEDE8', flyoutOpacity:1, scrollbarColour:'#3E4451', scrollbarOpacity:.8,
    insertionMarkerColour:'#fff', insertionMarkerOpacity:.25, cursorColour:'#528BFF'}
});
