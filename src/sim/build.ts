// ---------------------------------------------------------------
// Simulator – Umbauen: Sensoren an einen anderen Platz am Roboter setzen und drehen. Das Raster
// hat den Abstand der LEGO-Noppen (8 mm), gedreht wird in Schritten von 15 Grad; mit Symmetrie
// wandert und dreht der Sensor auf der anderen Seite spiegelbildlich mit. (Ohne DOM.)
// ---------------------------------------------------------------
import type { SimRobot } from './robot';
import type { Point } from './world';

/** Abstand der Rasterlinien in Millimetern: eine LEGO-Noppe. */
export const GRID_MM = 8;
/** In solchen Schritten dreht sich ein Sensor – und in diesen gröberen, wenn es gerade Winkel sein sollen. */
export const ANGLE_STEP = 15, ANGLE_STEP_COARSE = 45;
/** Der Bereich, in dem ein Sensor sitzen darf – Millimeter am Roboter, x nach vorn, y nach rechts. Die Grenzen liegen auf dem Raster. */
export const MOUNT_AREA = {back:-120, front:184, side:144};
/** Mit Symmetrie, aber ohne Raster rastet ein einzelner Sensor auf der Mittellinie ein, wenn er ihr so nah kommt. */
const AXIS_SNAP_MM = 10;

/** Wo ein Sensor am Roboter sitzt und wie er gedreht ist: `angle` in Grad gegenüber »geradeaus«, positiv nach rechts. */
export interface Mount extends Point { angle?: number }

export interface BuildOptions {
  /** Sensoren rasten auf dem Raster ein. */
  grid: boolean;
  /** Der Sensor auf der anderen Seite wandert und dreht spiegelbildlich mit. */
  symmetry: boolean;
  /** Was beim Versetzen genau so bleibt, wie es ist: nur vor und zurück (`y` fest) oder nur seitlich (`x` fest). */
  fixed?: Partial<Point>;
}

/** Winkel zwischen −179 und 180 Grad, auf ganze Grad. */
const tidy = (angle: number) => { const a = ((Math.round(angle) % 360) + 540) % 360 - 180; return a === -180 ? 180 : a + 0; };
/** Ein Platz; der Winkel steht nur dabei, wenn der Sensor gedreht ist. */
const mount = (x: number, y: number, angle: number): Mount => angle ? {x, y, angle} : {x, y};

/**
 * Der Sensor, der auf der anderen Seite gegenüber sitzt: bei den Farbsensoren (und ebenso bei den
 * Kraftsensoren) der erste zum letzten, der zweite zum vorletzten. Ein einzelner Sensor und der
 * mittlere von dreien haben keinen.
 */
export function mirrorPartner(robot: SimRobot, port: string): string | null {
  for (const group of [robot.colors, robot.force]){
    const i = group.indexOf(port);
    if (i >= 0) return group.length - 1 - i === i ? null : group[group.length - 1 - i];
  }
  return null;
}

/**
 * Setzt den Sensor am Anschluss `port` an den Platz `at` und liefert alle versetzten Sensoren; seine
 * Drehung behält er. `usual` sind die üblichen Plätze: Sie entscheiden, auf welcher Seite der Sensor
 * bleibt, wenn er mit Symmetrie genau auf die Mittellinie gezogen wird (dort lägen sonst beide aufeinander).
 */
export function placeSensor(robot: SimRobot, mounts: Record<string, Mount>, port: string, at: Point, usual: Record<string, Point>, options: BuildOptions): Record<string, Mount> {
  const step = options.grid ? GRID_MM : 1;
  const snap = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)) / step) * step + 0;
  const x = options.fixed?.x ?? snap(at.x, MOUNT_AREA.back, MOUNT_AREA.front), angle = mounts[port]?.angle ?? 0;
  let y = options.fixed?.y ?? snap(at.y, -MOUNT_AREA.side, MOUNT_AREA.side);
  const next = {...mounts};
  if (options.symmetry){
    const partner = mirrorPartner(robot, port);
    if (partner){
      // beide bleiben auf ihrer Seite und mindestens einen Rasterschritt von der Mitte weg
      const side = Math.sign(y) || Math.sign(usual[port]?.y ?? 0) || -1;
      if (Math.abs(y) < GRID_MM) y = side * GRID_MM;
      next[partner] = mount(x, -y, tidy(-angle));
    } else if (!options.grid && Math.abs(y) < AXIS_SNAP_MM) y = 0;   // (mit Raster liegt die Mittellinie ohnehin auf einer Rasterlinie)
  }
  next[port] = mount(x, y, angle);
  return next;
}

/**
 * Dreht den Sensor am Anschluss `port` auf den Winkel `angle` (Grad gegenüber »geradeaus«, positiv nach
 * rechts) und liefert alle versetzten Sensoren. `step`: Der Winkel rastet in solchen Schritten ein, 0 lässt
 * ihn frei. Mit `symmetry` dreht der Sensor gegenüber spiegelbildlich mit.
 */
export function rotateSensor(robot: SimRobot, mounts: Record<string, Mount>, port: string, angle: number, usual: Record<string, Point>, options: {step: number; symmetry: boolean}): Record<string, Mount> {
  const turned = tidy(options.step ? Math.round(angle / options.step) * options.step : angle);
  const here = mounts[port] ?? usual[port], next = {...mounts};
  if (!here) return next;
  next[port] = mount(here.x, here.y, turned);
  const partner = options.symmetry ? mirrorPartner(robot, port) : null, there = partner ? mounts[partner] ?? usual[partner] : null;
  if (partner && there) next[partner] = mount(there.x, there.y, tidy(-turned));
  return next;
}

/** Gemerkte Plätze: je Gruppe von Sensoren (»color:C,D«) die Sensoren darin, die jemand versetzt oder gedreht hat. */
export type SavedMounts = Record<string, Record<string, Mount>>;

/**
 * Sensoren, deren Plätze zusammengehören: die Farbsensoren, der Abstandssensor, die Kraftsensoren.
 * Der Schlüssel nennt Art und Anschlüsse. Ändert das Programm die Sensoren einer Gruppe – aus zwei
 * Farbsensoren wird einer –, ist das eine andere Gruppe: Ihre Sensoren sitzen am üblichen Platz,
 * der einzelne also in der Mitte, auch wenn er als einer von zweien woanders saß.
 */
function sensorGroups(robot: SimRobot): [string, string[]][] {
  const groups: [string, string[]][] = [['color', robot.colors], ['ultra', robot.ultra ? [robot.ultra] : []], ['force', robot.force]];
  return groups.filter(([, ports]) => ports.length).map(([kind, ports]) => [`${kind}:${ports.join()}`, ports]);
}
const isMount = (v: unknown): v is Mount => typeof (v as Mount | null)?.x === 'number' && typeof (v as Mount).y === 'number';

/** Die versetzten Sensoren für diesen Roboter: nur was für genau seine Gruppen von Sensoren gemerkt ist. */
export function mountsFor(robot: SimRobot, saved: SavedMounts): Record<string, Mount> {
  const mounts: Record<string, Mount> = {};
  for (const [key, ports] of sensorGroups(robot)) for (const port of ports){
    const at = saved[key]?.[port];
    if (isMount(at)) mounts[port] = mount(at.x, at.y, typeof at.angle === 'number' ? tidy(at.angle) : 0);
  }
  return mounts;
}

/** Merkt die versetzten Sensoren dieses Roboters; was für andere Gruppen gemerkt ist, bleibt. */
export function saveMounts(robot: SimRobot, saved: SavedMounts, mounts: Record<string, Mount>): SavedMounts {
  const next = {...saved};
  for (const [key, ports] of sensorGroups(robot)){
    const own = Object.fromEntries(ports.filter(port => mounts[port]).map(port => [port, mounts[port]]));
    if (Object.keys(own).length) next[key] = own; else delete next[key];
  }
  return next;
}
