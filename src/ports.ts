// ---------------------------------------------------------------
// Anschlüsse erkennen: Steckt der Kraftsensor an C, soll der Block in der Blockliste schon »C«
// zeigen – wie in der SPIKE-App. Blöcke, die bereits auf der Arbeitsfläche liegen, bleiben, wie
// sie sind.
// Woher Blockwerk weiß, was steckt: Pybricks meldet es nicht von selbst. Nach dem Verbinden läuft
// deshalb kurz das Anzeige-Programm der Hub-Ansicht (hub/monitor.ts); dieses Modul wertet dessen
// Stand aus und trägt die Anschlüsse in den Werkzeugkasten ein. (Ohne DOM.)
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { PORT_NAMES, type MonitorState } from './hub/monitor';

/** Die Geräte, für die es Blöcke mit Anschluss gibt. */
export type PortKind = 'motor' | 'color' | 'ultra' | 'force';
/** Je Gerät die Anschlüsse, an denen eines steckt, in der Reihenfolge A–F. */
export type FoundPorts = Record<PortKind, string[]>;

/** Welches Gerät ein Block an seinem Feld »PORT« erwartet. */
export const PORT_BLOCKS: Record<string, PortKind> = {
  pb_motor_run_angle:'motor', pb_motor_run_time:'motor', pb_motor_run_target:'motor', pb_motor_run:'motor',
  pb_motor_stop:'motor', pb_motor_reset:'motor', pb_motor_angle:'motor', pb_motor_speed:'motor',
  pb_color_is:'color', pb_reflection:'color',
  pb_distance:'ultra',
  pb_force_pressed:'force', pb_force:'force'
};
const KIND_NAMES: Record<PortKind, string> = {motor:'Motor', color:'Farbsensor', ultra:'Abstandssensor', force:'Kraftsensor'};
const KIND_PLURAL: Record<PortKind, string> = {motor:'Motoren', color:'Farbsensoren', ultra:'Abstandssensoren', force:'Kraftsensoren'};
/** So beginnen im erzeugten Programm die Namen der Geräte (generator.ts): »kraft_E = ForceSensor(Port.E)«. */
const DEVICE_PREFIX: Record<string, PortKind> = {motor:'motor', farbe:'color', abstand:'ultra', kraft:'force'};

/** Ob von jedem Anschluss schon bekannt ist, was dort steckt (oder dass er frei ist). */
export const allPortsSeen = (state: MonitorState) => PORT_NAMES.every(p => state.ports[p]);

/** Liest aus dem Stand des Anzeige-Programms, wo welches Gerät steckt. */
export function foundPorts(state: MonitorState): FoundPorts {
  const found: FoundPorts = {motor:[], color:[], ultra:[], force:[]};
  for (const port of PORT_NAMES){
    const kind = state.ports[port]?.kind;
    if (kind === 'motor' || kind === 'color' || kind === 'ultra' || kind === 'force') found[kind].push(port);
  }
  return found;
}

/**
 * Die Motoren der Fahrbasis und der einzelne Motor.
 * Ab zwei Motoren fahren die ersten beiden; ein dritter ist der Motor für alles andere (ein Greifer
 * etwa). Gibt es nur zwei, zeigen die Motor-Blöcke auf den ersten davon; mit einem einzigen bleibt
 * die Fahrbasis, wie sie ist.
 */
export function motorRoles(motors: string[]): {drive: [string, string] | null; single: string | null} {
  return {drive:motors.length >= 2 ? [motors[0], motors[1]] : null, single:motors[2] ?? motors[0] ?? null};
}

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Setzt die erkannten Anschlüsse in einen Block des Werkzeugkastens und in alle, die in ihm stecken. */
function adjustBlock(block: Json, found: FoundPorts){
  const type = block.type as string, fields = isObject(block.fields) ? block.fields : null;
  const {drive, single} = motorRoles(found.motor);
  if (type === 'pb_drive_setup'){
    if (drive) block.fields = {...fields, LEFT_PORT:drive[0], RIGHT_PORT:drive[1]};
  } else if (PORT_BLOCKS[type]){
    const kind = PORT_BLOCKS[type], port = kind === 'motor' ? single : found[kind][0];
    if (port) block.fields = {...fields, PORT:port};
  }
  if (isObject(block.inputs)) for (const input of Object.values(block.inputs)){
    if (!isObject(input)) continue;
    for (const inner of [input.block, input.shadow]) if (isObject(inner)) adjustBlock(inner, found);
  }
}
function adjustItems(items: unknown, found: FoundPorts){
  if (!Array.isArray(items)) return;
  for (const item of items){
    if (!isObject(item)) continue;
    if (item.kind === 'block') adjustBlock(item, found);
    else adjustItems(item.contents, found);
  }
}

/**
 * Der Werkzeugkasten mit den erkannten Anschlüssen als Vorgabe. Das Original bleibt unverändert;
 * wo nichts erkannt wurde, bleibt die bisherige Vorgabe stehen.
 */
export function withFoundPorts<T extends Blockly.utils.toolbox.ToolboxDefinition>(toolbox: T, found: FoundPorts | null): T {
  if (!found) return toolbox;
  const copy = structuredClone(toolbox);
  adjustItems((copy as unknown as Json).contents, found);
  return copy;
}

/** Ein Satz fürs Terminal: was am Hub steckt. */
export function describePorts(found: FoundPorts): string {
  const list = (ports: string[]) => ports.length > 1 ? `${ports.slice(0, -1).join(', ')} und ${ports[ports.length - 1]}` : ports[0];
  const parts = (Object.keys(KIND_NAMES) as PortKind[]).filter(k => found[k].length)
    .map(k => `${KIND_NAMES[k]} an ${list(found[k])}`);
  return parts.length ? `Am Hub erkannt: ${parts.join(', ')}. Die Blockliste ist darauf eingestellt.`
    : 'An den Anschlüssen des Hubs steckt nichts, das Blockwerk kennt.';
}

/** Ein Gerät an einem Anschluss, wie das Programm es erwartet. */
export interface DeviceAt { kind: PortKind; port: string }

/**
 * Liest aus einer Zeile des erzeugten Programms, welches Gerät sie anlegt. Meldet der Hub »ENODEV«,
 * steht der Fehler in so einer Zeile: Dort erwartet das Programm ein Gerät, das nicht steckt.
 */
export function deviceLine(text: string): DeviceAt | null {
  const m = text.match(/^(\w+?)_([A-F]) = \w+\(Port\.([A-F])\b/);
  return m && DEVICE_PREFIX[m[1]] && m[2] === m[3] ? {kind:DEVICE_PREFIX[m[1]], port:m[2]} : null;
}

/** Nach einem Fehler »Gerät fehlt«: was das Programm erwartet hat, was dort wirklich steckt und wo das Gerät ist. */
export function missingDeviceHint(expected: DeviceAt, state: MonitorState): string {
  const name = KIND_NAMES[expected.kind], there = state.ports[expected.port]?.kind;
  const elsewhere = foundPorts(state)[expected.kind].filter(p => p !== expected.port);
  const list = (ports: string[]) => ports.length > 1 ? `${ports.slice(0, -1).join(', ')} und ${ports[ports.length - 1]}` : ports[0];
  if (there === expected.kind){
    return `Das Programm erwartet einen ${name} an ${expected.port} – dort steckt jetzt einer. Sitzt das Kabel fest? Dann einfach noch einmal starten.`;
  }
  const found = there === undefined ? '' : there === 'none' ? ' dort steckt nichts.'
    : there === 'other' ? ' dort steckt ein Gerät, das Blockwerk nicht kennt.' : ` dort steckt ein ${KIND_NAMES[there]}.`;
  const where = !elsewhere.length ? `Am Hub steckt gar kein ${name}.`
    : elsewhere.length === 1 ? `Ein ${name} steckt an ${elsewhere[0]} – stell die Blöcke darauf um oder steck ihn um.`
    : `${KIND_PLURAL[expected.kind]} stecken an ${list(elsewhere)} – stell die Blöcke darauf um oder steck einen um.`;
  return `Das Programm erwartet einen ${name} an ${expected.port}${found ? ';' + found : '.'} ${where}`;
}

/** Ob sich an den Vorgaben etwas ändert – der Werkzeugkasten soll nicht bei jeder Meldung neu entstehen. */
export const samePorts = (a: FoundPorts | null, b: FoundPorts | null) => JSON.stringify(a) === JSON.stringify(b);
