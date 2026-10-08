// ---------------------------------------------------------------
// Simulator – der Roboter: Was er hat, liest Blockwerk aus dem Programm. Wer Fahrblöcke benutzt,
// bekommt Räder; jeder Farbsensor, den das Programm abfragt, sitzt vorn (höchstens vier
// nebeneinander), der Abstandssensor schaut nach vorn. (Ohne DOM.)
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { PORT_BLOCKS, type PortKind } from '../ports';
import type { Point } from './world';

export interface SimDrive {
  left: string; right: string; wheel: number; axle: number;
  /**
   * Das Programm hat keine Fahrbasis, sondern dreht die beiden Motoren einzeln. Dann gilt der übliche
   * Aufbau: Der linke Motor sitzt gespiegelt – dreht er vorwärts, fährt sein Rad rückwärts.
   */
  direct: boolean;
}
export interface SimRobot {
  /** Die Fahrbasis – null, wenn das Programm nicht fährt. */
  drive: SimDrive | null;
  /** Anschlüsse der Farbsensoren, von links nach rechts (höchstens `MAX_COLOR_SENSORS`). */
  colors: string[];
  /** Anschluss des Abstandssensors. */
  ultra: string | null;
  force: string[];
  /** Einzelne Motoren, die nicht zur Fahrbasis gehören. */
  motors: string[];
  /** Was der Simulator vom Programm nicht nachbilden kann. */
  notes: string[];
}

export const MAX_COLOR_SENSORS = 4;
/** Wie beim Generator: ohne Block »Fahrbasis einrichten« gelten diese Werte. */
const DEFAULT_DRIVE: SimDrive = {left:'A', right:'B', wheel:56, axle:112, direct:false};
const HATS = ['pb_start', 'pb_when', 'pb_when_message', 'procedures_defnoreturn', 'procedures_defreturn'];

/** Die Blöcke, die zum Programm gehören: alles unter einem Ereignis und in eigenen Blöcken. */
export function programBlocks(ws: Blockly.Workspace): Blockly.Block[] {
  return ws.getTopBlocks(true).filter(b => HATS.includes(b.type) && b.isEnabled())
    .flatMap(b => b.getDescendants(true)).filter(b => b.isEnabled());
}

/** Liest aus dem Programm, wie der Roboter aussieht. */
export function robotFromWorkspace(ws: Blockly.Workspace): SimRobot {
  const found: Record<PortKind, Set<string>> = {motor:new Set(), color:new Set(), ultra:new Set(), force:new Set()};
  let drive: SimDrive | null = null;
  for (const b of programBlocks(ws)){
    if (b.type === 'pb_drive_setup'){
      drive = {left:b.getFieldValue('LEFT_PORT'), right:b.getFieldValue('RIGHT_PORT'), wheel:Number(b.getFieldValue('WHEEL')), axle:Number(b.getFieldValue('AXLE')), direct:false};
    } else if (b.type.startsWith('pb_drive_')) drive ??= DEFAULT_DRIVE;
    else if (PORT_BLOCKS[b.type]) found[PORT_BLOCKS[b.type]].add(b.getFieldValue('PORT'));
  }
  const sorted = (ports: Set<string>) => [...ports].sort();
  const colors = sorted(found.color), ultras = sorted(found.ultra), motors = sorted(found.motor), notes: string[] = [];
  // ohne Fahrbasis sind die ersten beiden Motoren die Räder (wie bei den Vorgaben der Blockliste, ports.ts)
  if (!drive && motors.length >= 2) drive = {...DEFAULT_DRIVE, left:motors[0], right:motors[1], direct:true};
  if (colors.length > MAX_COLOR_SENSORS) notes.push(`Der Simulator kennt höchstens ${MAX_COLOR_SENSORS} Farbsensoren – die an ${colors.slice(MAX_COLOR_SENSORS).join(', ')} sehen immer Weiß.`);
  if (ultras.length > 1) notes.push(`Der Simulator kennt einen Abstandssensor – der an ${ultras.slice(1).join(', ')} sieht nie etwas.`);
  return {
    drive, colors:colors.slice(0, MAX_COLOR_SENSORS), ultra:ultras[0] ?? null, force:sorted(found.force),
    motors:motors.filter(p => p !== drive?.left && p !== drive?.right), notes
  };
}

/** Ein Satz dazu, was der Simulator am Roboter erkannt hat. */
export function describeRobot(robot: SimRobot): string {
  const d = robot.drive;
  const parts = [!d ? 'keine Räder' : d.direct ? `Räder an den Motoren ${d.left} (links, gespiegelt eingebaut) und ${d.right} (rechts)` : `Räder an ${d.left} und ${d.right}`];
  if (robot.colors.length) parts.push(`${robot.colors.length === 1 ? 'Farbsensor' : robot.colors.length + ' Farbsensoren'} an ${robot.colors.join(', ')}`);
  if (robot.ultra) parts.push(`Abstandssensor an ${robot.ultra}`);
  if (robot.force.length) parts.push(`Kraftsensor an ${robot.force.join(', ')}`);
  if (robot.motors.length) parts.push(`Motor an ${robot.motors.join(', ')}`);
  return parts.join(' · ');
}

// Maße am Roboter in Millimetern: x nach vorn, y nach rechts, der Ursprung liegt mitten zwischen den Rädern
/** Der Körper (der Hub mit dem Rahmen darum). */
export const BODY = {back:-45, front:85, minWidth:60};
/** Abstand der Farbsensoren voneinander und von der Achse. */
const COLOR_SPACING = 40, COLOR_FRONT = 100;
/** Halber Durchmesser des Flecks, den ein Farbsensor sieht. */
export const COLOR_SPOT = 5;
/** Der Abstandssensor: wo er sitzt, halber Öffnungswinkel in Grad, Reichweite und der Wert ohne Hindernis. */
export const ULTRA = {at:{x:85, y:0} as Point, halfAngle:17.5, range:2000, nothing:2000};
/** Der Kreis, mit dem der Roboter an Hindernisse stößt. */
export const BUMPER = {at:{x:20, y:0} as Point, radius:75};

/** Der Kraftsensor: wo er sitzt (vorn, mehrere nebeneinander), wie weit er tastet und was er gedrückt meldet (Newton). */
export const FORCE = {front:92, spacing:30, reach:12, pressed:10};
/** So weit von der Mitte zwischen den Rädern darf ein Sensor beim Umbauen sitzen. */
export const MOUNT_LIMIT = 220;

/**
 * Wo jeder Sensor sitzt, solange ihn niemand versetzt hat: Farbsensoren nebeneinander vorn, der
 * Abstandssensor vorn in der Mitte, Kraftsensoren an der Stoßkante. Anschluss → Platz am Roboter.
 */
export function defaultMounts(robot: SimRobot): Record<string, Point> {
  const mounts: Record<string, Point> = {};
  robot.force.forEach((port, i) => { mounts[port] = {x:FORCE.front, y:(i - (robot.force.length - 1) / 2) * FORCE.spacing}; });
  if (robot.ultra) mounts[robot.ultra] = {...ULTRA.at};
  colorSensorPoints(robot.colors.length).forEach((p, i) => { mounts[robot.colors[i]] = p; });
  return mounts;
}

/** Wo die Farbsensoren sitzen: nebeneinander vor dem Roboter, um die Mitte verteilt. */
export const colorSensorPoints = (count: number): Point[] =>
  Array.from({length:count}, (_, i) => ({x:COLOR_FRONT, y:(i - (count - 1) / 2) * COLOR_SPACING}));
