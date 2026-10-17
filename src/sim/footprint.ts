// ---------------------------------------------------------------
// Simulator – Umrisse der Teile am Roboter: wo ein Teil liegt (als gedrehtes Rechteck) und ob es
// ein anderes auf derselben Ebene überdeckt. Auf verschiedenen Ebenen dürfen Teile übereinander
// liegen – ein Sensor unten unter dem Hub etwa. (Ohne DOM.)
// ---------------------------------------------------------------
import { levelOf, type Level, type Mount } from './build';
import { COLOR_SENSOR, FORCE_SENSOR, HUB, HUB_AT, MOTOR, onPart, ULTRA_SENSOR, WHEEL, wheelCenter, type MotorKind } from './parts';
import { FORCE, robotMotors, robotPorts, type SimRobot } from './robot';
import type { Point } from './world';

export type PartKind = 'color' | 'ultra' | 'force' | 'motor';
export const partKind = (robot: SimRobot, port: string): PartKind =>
  robotMotors(robot).includes(port) ? 'motor' : robot.colors.includes(port) ? 'color' : port === robot.ultra ? 'ultra' : 'force';

/** Wie groß ein Teil in der Vorlage ist (Breite × Länge, mm) und wie weit seine Mitte von der Mitte des Umrisses liegt (nach vorn). */
export function partSize(kind: PartKind, motor: MotorKind = 'large'): {w: number; l: number; ahead: number} {
  switch (kind){
    case 'color': return {w:COLOR_SENSOR.size, l:COLOR_SENSOR.size, ahead:0};
    case 'ultra': return {w:ULTRA_SENSOR.width, l:ULTRA_SENSOR.depth, ahead:0};
    case 'force': return {w:FORCE_SENSOR.width, l:FORCE_SENSOR.length + FORCE_SENSOR.plunger, ahead:FORCE_SENSOR.plunger / 2};
    case 'motor': return {w:MOTOR.width + MOTOR.output.width, l:MOTOR.length[motor], ahead:0};
  }
}

/** Der Kraftsensor sitzt mit der Spitze seines Tasters am Platz (dort tastet er): Sein Gehäuse liegt dahinter. */
export const FORCE_BODY_BACK = FORCE_SENSOR.length / 2 + FORCE_SENSOR.plunger - FORCE.tip;
/** Die Mitte eines Teils am Roboter (Millimeter, gedreht wie das Teil) – beim Kraftsensor die seines Gehäuses. */
export function partCenter(robot: SimRobot, port: string, at: Mount): Mount {
  return robot.force.includes(port) ? {...at, ...onPart(at, {x:-FORCE_BODY_BACK, y:0})} : at;
}
/**
 * Der Umriss eines Teils, wie in der Vorlage (X quer, Y nach hinten), um seine Mitte: Versatz der Mitte und halbe
 * Maße. Beim Motor ragt der Abtrieb zur Seite, beim Kraftsensor der Taster nach vorn.
 */
export function outlineOf(robot: SimRobot, port: string, at: Mount){
  const size = partSize(partKind(robot, port), at.kind ?? 'large');
  const cx = partKind(robot, port) === 'motor' ? (at.flip ? -1 : 1) * MOTOR.output.width / 2 : 0;
  return {cx, cy:-size.ahead, hw:size.w / 2, hl:size.l / 2};
}

/** Ein gedrehtes Rechteck am Roboter: seine vier Ecken (mm, x nach vorn, y nach rechts). */
type Quad = Point[];
/** Rechteck um `center` (gedreht wie es), in der Lage der Vorlage: `cx` quer, `cy` nach hinten versetzt, halbe Maße. */
function quad(center: Mount, cx: number, cy: number, hw: number, hl: number): Quad {
  // Vorlage → Roboter: X quer ist y, Y nach hinten ist −x
  return [[-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]].map(([X, Y]) => onPart(center, {x:-(Y + cy), y:X + cx}));
}
/** Was ein Teil am Roboter bedeckt: sein Umriss – beim Motor der Fahrbasis dazu das Rad. */
export function footprint(robot: SimRobot, port: string, at: Mount): Quad[] {
  const o = outlineOf(robot, port, at), quads = [quad(partCenter(robot, port, at), o.cx, o.cy, o.hw, o.hl)];
  const d = robot.drive;
  if (d && (port === d.left || port === d.right)) quads.push(quad({...wheelCenter(at), angle:at.angle}, 0, 0, WHEEL.width / 2, d.wheel / 2));
  return quads;
}
/** Der Hub auf der oberen Ebene – er liegt fest. */
const HUB_QUAD = quad({...HUB_AT}, 0, 0, HUB.width / 2, HUB.length / 2);

/** Ob sich zwei gedrehte Rechtecke überdecken (mit `margin` mm Spiel: aneinander stoßen darf man). */
function overlap(a: Quad, b: Quad, margin = 0.6): boolean {
  for (const poly of [a, b]) for (let i = 0; i < 4; i++){
    const p = poly[i], q = poly[(i + 1) % 4], axis = {x:q.y - p.y, y:p.x - q.x};
    const len = Math.hypot(axis.x, axis.y) || 1, project = (v: Point) => (v.x * axis.x + v.y * axis.y) / len;
    const pa = a.map(project), pb = b.map(project);
    if (Math.max(...pa) - margin <= Math.min(...pb) || Math.max(...pb) - margin <= Math.min(...pa)) return false;
  }
  return true;
}

/**
 * Ob eines der Teile an `ports` ein anderes Teil auf seiner Ebene überdeckt – oder oben den Hub. Plätze aus `mounts`,
 * sonst die üblichen aus `usual`.
 */
export function collides(robot: SimRobot, mounts: Record<string, Mount>, usual: Record<string, Mount>, ports: string[]): boolean {
  const at = (port: string) => mounts[port] ?? usual[port];
  const all = robotPorts(robot).filter(port => at(port));
  const level = (port: string): Level => levelOf(robot, port, at(port));
  for (const port of ports){
    if (!at(port)) continue;
    const mine = footprint(robot, port, at(port));
    if (level(port) === 'upper' && mine.some(q => overlap(q, HUB_QUAD))) return true;
    for (const other of all){
      if (other === port || level(other) !== level(port)) continue;
      // (zwei Teile, die gerade beide bewegt werden, prüft das erste – das zweite muss es nicht noch einmal)
      if (ports.indexOf(other) >= 0 && ports.indexOf(other) < ports.indexOf(port)) continue;
      const theirs = footprint(robot, other, at(other));
      if (mine.some(a => theirs.some(b => overlap(a, b)))) return true;
    }
  }
  return false;
}
