// ---------------------------------------------------------------
// Simulator – der Roboter: Was er hat, liest Blockwerk aus dem Programm. Wer Fahrblöcke benutzt,
// bekommt Räder; jeder Farbsensor, den das Programm abfragt, sitzt vorn (höchstens vier
// nebeneinander), der Abstandssensor schaut nach vorn. (Ohne DOM.)
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { PORT_BLOCKS, type PortKind } from '../ports';
import { motorUnderHub, type MotorMount } from './parts';
import type { Point } from './world';

export interface SimDrive {
  left: string; right: string; wheel: number; axle: number;
  /**
   * Zählrichtung der beiden Motoren laut Programm: 1 »normal« (CLOCKWISE), −1 »umgekehrt«. Ob das zum Einbau
   * passt, merkt erst die Fahrt: Ein falsch herum gezählter Motor dreht sein Rad rückwärts.
   */
  leftDir: 1 | -1; rightDir: 1 | -1;
  /** Die Fahrbasis hält ihre Richtung mit dem Kreisel des Hubs (»Kreisel benutzen«). */
  gyro: boolean;
  /** Ohne Block »Fahrbasis einrichten«: Die Anschlüsse A und B stehen nirgends im Programm, umstecken geht nicht. */
  implicit?: true;
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
const DEFAULT_DRIVE: SimDrive = {left:'A', right:'B', wheel:56, axle:112, leftDir:-1, rightDir:1, gyro:true, direct:false, implicit:true};
const dirOf = (value: unknown): 1 | -1 => value === 'COUNTERCLOCKWISE' ? -1 : 1;
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
      drive = {left:b.getFieldValue('LEFT_PORT'), right:b.getFieldValue('RIGHT_PORT'), wheel:Number(b.getFieldValue('WHEEL')) || 56, axle:Number(b.getFieldValue('AXLE')) || 112,
        leftDir:dirOf(b.getFieldValue('LEFT_DIR')), rightDir:dirOf(b.getFieldValue('RIGHT_DIR')), gyro:b.getFieldValue('GYRO') !== 'FALSE', direct:false};
    } else if (b.type.startsWith('pb_drive_')) drive ??= DEFAULT_DRIVE;
    else if (PORT_BLOCKS[b.type]) found[PORT_BLOCKS[b.type]].add(b.getFieldValue('PORT'));
  }
  const sorted = (ports: Set<string>) => [...ports].sort();
  const colors = sorted(found.color), ultras = sorted(found.ultra), motors = sorted(found.motor), notes: string[] = [];
  // ohne Fahrbasis sind die ersten beiden Motoren die Räder (wie bei den Vorgaben der Blockliste, ports.ts)
  // (einzelne Motoren zählen beide »normal« – der linke ist gespiegelt eingebaut, sein Rad läuft also andersherum)
  if (!drive && motors.length >= 2){ drive = {...DEFAULT_DRIVE, left:motors[0], right:motors[1], leftDir:1, gyro:false, direct:true}; delete drive.implicit; }
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

/** Ein Teil des Roboters für die Übersicht über der Bahn: ein kurzes Schildchen, ausführlich im Tooltip. */
export interface RobotPart { kind: 'wheels' | 'none' | 'color' | 'ultra' | 'force' | 'motor' | 'note'; text: string; title: string }
/** Was der Roboter laut Programm hat, Teil für Teil. */
export function robotParts(robot: SimRobot): RobotPart[] {
  const d = robot.drive, parts: RobotPart[] = [];
  if (!d) parts.push({kind:'none', text:'keine Räder', title:'Das Programm benutzt weder Fahrblöcke noch zwei Motoren: Der Roboter bleibt stehen.'});
  else parts.push({kind:'wheels', text:`Räder ${d.left}·${d.right}`,
    title:d.direct ? `Räder an den Motoren ${d.left} (links, gespiegelt eingebaut) und ${d.right} (rechts)` : `Fahrbasis: Räder an ${d.left} und ${d.right}`});
  if (robot.colors.length) parts.push({kind:'color', text:`Farbe ${robot.colors.join(', ')}`, title:`Farbsensor an ${robot.colors.join(', ')}`});
  if (robot.ultra) parts.push({kind:'ultra', text:`Abstand ${robot.ultra}`, title:`Abstandssensor an ${robot.ultra}`});
  if (robot.force.length) parts.push({kind:'force', text:`Kraft ${robot.force.join(', ')}`, title:`Kraftsensor an ${robot.force.join(', ')}`});
  if (robot.motors.length) parts.push({kind:'motor', text:`Motor ${robot.motors.join(', ')}`, title:`Einzelner Motor an ${robot.motors.join(', ')}`});
  for (const note of robot.notes) parts.push({kind:'note', text:'Hinweis', title:note});
  return parts;
}

// Maße am Roboter in Millimetern: x nach vorn, y nach rechts, der Ursprung liegt mitten zwischen den Rädern
/** Abstand der Farbsensoren voneinander und von der Achse. */
const COLOR_SPACING = 40, COLOR_FRONT = 24;
/** Halber Durchmesser des Flecks, den ein Farbsensor sieht. */
export const COLOR_SPOT = 5;
/** Der Abstandssensor: wo er sitzt, halber Öffnungswinkel in Grad, Reichweite und der Wert ohne Hindernis. */
export const ULTRA = {at:{x:24, y:0} as Point, halfAngle:17.5, range:2000, nothing:2000};
/** Der Kreis, mit dem der Roboter an Hindernisse stößt. */
export const BUMPER = {at:{x:-18, y:0} as Point, radius:70};

/**
 * Der Kraftsensor: wo er sitzt (vorn, mehrere nebeneinander), wie weit sein Taster vor ihm liegt, wie weit
 * der tastet, was er gedrückt meldet (Newton) und wie weit er neben einem Abstandssensor sitzt.
 */
export const FORCE = {front:62, spacing:30, tip:8, reach:12, pressed:10, besideUltra:40};
/** Einzelne Motoren (ein Greifarm etwa) sitzen hinter dem Hub nebeneinander. */
const MOTOR_BACK = -112, MOTOR_SPACING = 30;
/**
 * Wo jedes Teil sitzt, solange es niemand versetzt hat: Farbsensoren nebeneinander vorn, der
 * Abstandssensor vorn in der Mitte, Kraftsensoren an der Stoßkante. Die Motoren der Fahrbasis liegen
 * unter dem Hub, der linke gespiegelt, die Abtriebe außen, die Räder direkt daran (kleine Motoren, wie in
 * der Fahrbasis eines SPIKE-Roboters üblich). Wie weit die Räder dann auseinander laufen, ist die echte
 * Spurbreite – steht im Programm eine andere, dreht der Roboter ohne Kreisel falsch, wie in echt.
 * Anschluss → Platz am Roboter.
 */
export function defaultMounts(robot: SimRobot): Record<string, Point & Partial<MotorMount>> {
  const mounts: Record<string, Point & Partial<MotorMount>> = {};
  const d = robot.drive;
  if (d){ mounts[d.left] = motorUnderHub(-1, 'small'); mounts[d.right] = motorUnderHub(1, 'small'); }
  robot.motors.forEach((port, i) => { mounts[port] = {x:MOTOR_BACK, y:(i - (robot.motors.length - 1) / 2) * MOTOR_SPACING}; });
  // mit Abstandssensor rücken die Kraftsensoren neben ihn (er sitzt vorn in der Mitte) – sonst lägen sie übereinander
  const aside = robot.ultra ? FORCE.besideUltra : 0;
  robot.force.forEach((port, i) => {
    const y = (i - (robot.force.length - 1) / 2) * FORCE.spacing;
    mounts[port] = {x:FORCE.front, y:aside && robot.force.length === 1 ? aside : y + Math.sign(y) * aside};
  });
  if (robot.ultra) mounts[robot.ultra] = {...ULTRA.at};
  colorSensorPoints(robot.colors.length).forEach((p, i) => { mounts[robot.colors[i]] = p; });
  return mounts;
}

/** Wo die Farbsensoren sitzen: nebeneinander vor dem Roboter, um die Mitte verteilt. */
export const colorSensorPoints = (count: number): Point[] =>
  Array.from({length:count}, (_, i) => ({x:COLOR_FRONT, y:(i - (count - 1) / 2) * COLOR_SPACING}));

/** Alle Teile mit Anschluss, die der Roboter laut Programm hat. */
export const robotPorts = (robot: SimRobot): string[] => [
  ...(robot.drive ? [robot.drive.left, robot.drive.right] : []), ...robot.motors,
  ...robot.colors, ...(robot.ultra ? [robot.ultra] : []), ...robot.force];
/** Die Motoren des Roboters: die der Fahrbasis und die einzelnen. */
export const robotMotors = (robot: SimRobot): string[] => [...(robot.drive ? [robot.drive.left, robot.drive.right] : []), ...robot.motors];

/** Felder, in denen Blöcke einen Anschluss nennen: »PORT« und die beiden der Fahrbasis. */
const PORT_FIELDS = ['PORT', 'LEFT_PORT', 'RIGHT_PORT'];
/**
 * Steckt im Programm ein Gerät um: Jeder Block, der Anschluss `from` nennt, nennt danach `to`. Steckt an `to`
 * schon etwas, tauschen die beiden – wie zwei Kabel, die man am Hub vertauscht. Gilt für alle Blöcke auf der
 * Arbeitsfläche, auch die, die gerade nicht am Programm hängen; zusammen ein Schritt für »Rückgängig«.
 * Liefert, ob sich etwas geändert hat.
 */
export function swapPorts(ws: Blockly.Workspace, from: string, to: string, events?: {setGroup(on: boolean): void}): boolean {
  if (from === to) return false;
  let changed = false;
  events?.setGroup(true);
  try {
    for (const b of ws.getAllBlocks(false)) for (const name of PORT_FIELDS){
      const value = b.getField(name) ? b.getFieldValue(name) : null;
      if (value === from || value === to){ b.setFieldValue(value === from ? to : from, name); changed = true; }
    }
  } finally { events?.setGroup(false); }
  return changed;
}