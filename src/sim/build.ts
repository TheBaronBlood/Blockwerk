// ---------------------------------------------------------------
// Simulator – Umbauen: Teile an einen anderen Platz am Roboter setzen, drehen und spiegeln. Das Raster
// hat den Abstand der LEGO-Noppen (8 mm), gedreht wird in Schritten von 15 Grad; mit Symmetrie
// wandert und dreht das Teil auf der anderen Seite spiegelbildlich mit. Teile sind die Sensoren und
// die Motoren (die liegen eine Ebene tiefer, unter dem Hub). (Ohne DOM.)
// ---------------------------------------------------------------
import { SHAFT, type MotorKind } from './parts';
import { robotMotors, type SimRobot } from './robot';
import type { Point } from './world';

/** Abstand der Rasterlinien in Millimetern: eine LEGO-Noppe. */
export const GRID_MM = 8;
/** In solchen Schritten dreht sich ein Teil – und in diesen gröberen, wenn es gerade Winkel sein sollen. */
export const ANGLE_STEP = 15, ANGLE_STEP_COARSE = 45;
/** Der Bereich, in dem ein Teil sitzen darf – Millimeter am Roboter, x nach vorn, y nach rechts. Die Grenzen liegen auf dem Raster. */
export const MOUNT_AREA = {back:-160, front:152, side:144};
/** Mit Symmetrie, aber ohne Raster rastet ein einzelnes Teil auf der Mittellinie ein, wenn es ihr so nah kommt. */
const AXIS_SNAP_MM = 10;

/**
 * Wo ein Teil am Roboter sitzt und wie: `angle` in Grad gegenüber »geradeaus«, positiv nach rechts.
 * Motoren: `flip` – gespiegelt eingebaut, der Abtrieb links; `kind` – großer oder kleiner Motor; `shaft` – wie weit sein Rad auf der Achse sitzt.
 * Farbsensoren: `face` – »front« schaut nach vorn statt auf den Boden.
 */
export interface Mount extends Point { angle?: number; flip?: boolean; kind?: MotorKind; shaft?: number; face?: 'front' }

/** Die beiden Ebenen des Roboters: unten die Motoren (unter dem Hub), oben Hub und Sensoren. */
export type Level = 'upper' | 'lower';
export const levelOf = (robot: SimRobot, port: string): Level => robotMotors(robot).includes(port) ? 'lower' : 'upper';

export interface BuildOptions {
  /** Teile rasten auf dem Raster ein. */
  grid: boolean;
  /** Das Teil auf der anderen Seite wandert und dreht spiegelbildlich mit. */
  symmetry: boolean;
  /** Was beim Versetzen genau so bleibt, wie es ist: nur vor und zurück (`y` fest) oder nur seitlich (`x` fest). */
  fixed?: Partial<Point>;
}

/** Winkel zwischen −179 und 180 Grad, auf ganze Grad. */
const tidy = (angle: number) => { const a = ((Math.round(angle) % 360) + 540) % 360 - 180; return a === -180 ? 180 : a + 0; };
/** Ein Platz; was ein Teil nicht besonders hat (keine Drehung, nicht gespiegelt …), steht nicht dabei. */
function mount(x: number, y: number, angle: number, extra: Omit<Mount, 'x' | 'y' | 'angle'> = {}): Mount {
  const m: Mount = {x, y};
  if (angle) m.angle = angle;
  if (extra.flip) m.flip = true;
  if (extra.kind) m.kind = extra.kind;
  if (typeof extra.shaft === 'number') m.shaft = extra.shaft;
  if (extra.face) m.face = extra.face;
  return m;
}
/** Dasselbe Teil spiegelbildlich auf der anderen Seite: seitlich gespiegelt, andersherum gedreht – ein Motor andersherum eingebaut. */
const mirrored = (m: Mount, at: Point, motor: boolean): Mount => mount(at.x, -at.y, tidy(-(m.angle ?? 0)), {...m, flip:motor ? !m.flip : undefined});

/**
 * Das Teil, das auf der anderen Seite gegenüber sitzt: bei den Farbsensoren (ebenso bei den Kraftsensoren und
 * den einzelnen Motoren) das erste zum letzten, das zweite zum vorletzten; der linke Motor der Fahrbasis zum
 * rechten. Ein einzelnes Teil und das mittlere von dreien haben keines.
 */
export function mirrorPartner(robot: SimRobot, port: string): string | null {
  const d = robot.drive;
  if (d && (port === d.left || port === d.right)) return port === d.left ? d.right : d.left;
  for (const group of [robot.colors, robot.force, robot.motors]){
    const i = group.indexOf(port);
    if (i >= 0) return group.length - 1 - i === i ? null : group[group.length - 1 - i];
  }
  return null;
}
const isMotor = (robot: SimRobot, port: string) => robotMotors(robot).includes(port);

/**
 * Setzt das Teil am Anschluss `port` an den Platz `at` und liefert alle versetzten Teile; Drehung und
 * Einbau behält es. `usual` sind die üblichen Plätze: Sie entscheiden, auf welcher Seite das Teil
 * bleibt, wenn es mit Symmetrie genau auf die Mittellinie gezogen wird (dort lägen sonst beide aufeinander).
 */
export function placeSensor(robot: SimRobot, mounts: Record<string, Mount>, port: string, at: Point, usual: Record<string, Mount>, options: BuildOptions): Record<string, Mount> {
  const step = options.grid ? GRID_MM : 1;
  const snap = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)) / step) * step + 0;
  const here = mounts[port] ?? usual[port] ?? {x:0, y:0};
  const x = options.fixed?.x ?? snap(at.x, MOUNT_AREA.back, MOUNT_AREA.front);
  let y = options.fixed?.y ?? snap(at.y, -MOUNT_AREA.side, MOUNT_AREA.side);
  const next = {...mounts};
  if (options.symmetry){
    const partner = mirrorPartner(robot, port);
    if (partner){
      // beide bleiben auf ihrer Seite und mindestens einen Rasterschritt von der Mitte weg
      const side = Math.sign(y) || Math.sign(usual[port]?.y ?? 0) || -1;
      if (Math.abs(y) < GRID_MM) y = side * GRID_MM;
      next[partner] = mirrored(here, {x, y}, isMotor(robot, port));
    } else if (!options.grid && Math.abs(y) < AXIS_SNAP_MM) y = 0;   // (mit Raster liegt die Mittellinie ohnehin auf einer Rasterlinie)
  }
  next[port] = mount(x, y, here.angle ?? 0, here);
  return next;
}

/**
 * Dreht das Teil am Anschluss `port` auf den Winkel `angle` (Grad gegenüber »geradeaus«, positiv nach
 * rechts) und liefert alle versetzten Teile. `step`: Der Winkel rastet in solchen Schritten ein, 0 lässt
 * ihn frei. Mit `symmetry` dreht das Teil gegenüber spiegelbildlich mit.
 */
export function rotateSensor(robot: SimRobot, mounts: Record<string, Mount>, port: string, angle: number, usual: Record<string, Mount>, options: {step: number; symmetry: boolean}): Record<string, Mount> {
  const turned = tidy(options.step ? Math.round(angle / options.step) * options.step : angle);
  const here = mounts[port] ?? usual[port], next = {...mounts};
  if (!here) return next;
  next[port] = mount(here.x, here.y, turned, here);
  const partner = options.symmetry ? mirrorPartner(robot, port) : null, there = partner ? mounts[partner] ?? usual[partner] : null;
  if (partner && there) next[partner] = mount(there.x, there.y, tidy(-turned), there);
  return next;
}

/**
 * Ändert, wie ein Teil eingebaut ist: einen Motor spiegeln (`flip`) oder groß/klein tauschen (`kind`),
 * einen Farbsensor nach vorn oder nach unten schauen lassen (`face`). Mit Symmetrie macht das Teil
 * gegenüber mit – ein gespiegelter Motor heißt dort: andersherum gespiegelt.
 */
export function changePart(robot: SimRobot, mounts: Record<string, Mount>, port: string, change: 'flip' | 'kind' | 'face', usual: Record<string, Mount>, symmetry: boolean): Record<string, Mount> {
  const apply = (m: Mount): Mount => change === 'flip' ? mount(m.x, m.y, m.angle ?? 0, {...m, flip:!m.flip})
    : change === 'kind' ? mount(m.x, m.y, m.angle ?? 0, {...m, kind:(m.kind ?? 'large') === 'large' ? 'small' : undefined})
    : mount(m.x, m.y, m.angle ?? 0, {...m, face:m.face ? undefined : 'front'});
  const here = mounts[port] ?? usual[port], next = {...mounts};
  if (!here || ((change === 'flip' || change === 'kind') !== isMotor(robot, port)) || (change === 'face' && !robot.colors.includes(port))) return next;
  next[port] = apply(here);
  const partner = symmetry ? mirrorPartner(robot, port) : null, there = partner ? mounts[partner] ?? usual[partner] : null;
  if (partner && there) next[partner] = apply(there);
  return next;
}

/** Gemerkte Plätze: je Gruppe von Teilen (»color:C,D«) die Teile darin, die jemand versetzt oder gedreht hat. */
export type SavedMounts = Record<string, Record<string, Mount>>;
/**
 * Bauweise der Motoren, mit der gemerkte Plätze gespeichert werden. Ändert sich, wo Motor und Rad zueinander sitzen
 * (parts.ts), passen ältere Plätze nicht mehr – jeder Browser und jedes Gerät hätte sonst seinen eigenen, veralteten
 * Roboter. 2: Motoren unter dem Hub, Rad auf einer Achse im Abstand der Spurbreite; 3: Rad direkt am Abtrieb
 * (beides Oktober 2026).
 */
export const PARTS_VERSION = 3;
/** Gemerkte Plätze aus dem Speicher: Motoren aus einer anderen Bauweise gelten nicht mehr, Sensoren bleiben. */
export function currentMounts(saved: SavedMounts, version: unknown): SavedMounts {
  if (version === PARTS_VERSION) return saved;
  return Object.fromEntries(Object.entries(saved).filter(([key]) => !key.startsWith('drive') && !key.startsWith('motor:')));
}

/**
 * Teile, deren Plätze zusammengehören: die Farbsensoren, der Abstandssensor, die Kraftsensoren, die
 * Motoren der Fahrbasis, die einzelnen Motoren. Der Schlüssel nennt Art und Anschlüsse. Ändert das
 * Programm die Teile einer Gruppe – aus zwei Farbsensoren wird einer –, ist das eine andere Gruppe:
 * Ihre Teile sitzen am üblichen Platz, der einzelne also in der Mitte, auch wenn er als einer von zweien
 * woanders saß.
 */
function partGroups(robot: SimRobot): [string, string[]][] {
  const d = robot.drive;
  const groups: [string, string[]][] = [['color', robot.colors], ['ultra', robot.ultra ? [robot.ultra] : []], ['force', robot.force],
    ['drive', d ? [d.left, d.right] : []], ['motor', robot.motors]];
  return groups.filter(([, ports]) => ports.length).map(([kind, ports]) => [`${kind}:${ports.join()}`, ports]);
}
const isMount = (v: unknown): v is Mount => typeof (v as Mount | null)?.x === 'number' && typeof (v as Mount).y === 'number';

/** Die versetzten Teile für diesen Roboter: nur was für genau seine Gruppen gemerkt ist. */
export function mountsFor(robot: SimRobot, saved: SavedMounts): Record<string, Mount> {
  const mounts: Record<string, Mount> = {};
  for (const [key, ports] of partGroups(robot)) for (const port of ports){
    const at = saved[key]?.[port];
    if (isMount(at)) mounts[port] = mount(at.x, at.y, typeof at.angle === 'number' ? tidy(at.angle) : 0,
      {flip:at.flip === true || undefined, kind:at.kind === 'small' || at.kind === 'large' ? at.kind : undefined,
        shaft:typeof at.shaft === 'number' && Number.isFinite(at.shaft) ? Math.max(SHAFT.min, Math.min(SHAFT.max, at.shaft)) : undefined, face:at.face === 'front' ? 'front' : undefined});
  }
  return mounts;
}

/** Merkt die versetzten Teile dieses Roboters; was für andere Gruppen gemerkt ist, bleibt. */
export function saveMounts(robot: SimRobot, saved: SavedMounts, mounts: Record<string, Mount>): SavedMounts {
  const next = {...saved};
  for (const [key, ports] of partGroups(robot)){
    const own = Object.fromEntries(ports.filter(port => mounts[port]).map(port => [port, mounts[port]]));
    if (Object.keys(own).length) next[key] = own; else delete next[key];
  }
  return next;
}

/** Nach dem Umstecken: Die Teile an `from` und `to` tauschen ihre Plätze mit – jedes bleibt, wo es war. */
export function swapMounts(mounts: Record<string, Mount>, from: string, to: string): Record<string, Mount> {
  const next = {...mounts};
  delete next[from]; delete next[to];
  if (mounts[from]) next[to] = mounts[from];
  if (mounts[to]) next[from] = mounts[to];
  return next;
}
