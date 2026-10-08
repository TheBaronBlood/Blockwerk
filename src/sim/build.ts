// ---------------------------------------------------------------
// Simulator – Umbauen: Sensoren an einen anderen Platz am Roboter setzen. Das Raster hat den
// Abstand der LEGO-Noppen (8 mm); mit Symmetrie wandert der Sensor auf der anderen Seite
// spiegelbildlich mit. (Ohne DOM.)
// ---------------------------------------------------------------
import type { SimRobot } from './robot';
import type { Point } from './world';

/** Abstand der Rasterlinien in Millimetern: eine LEGO-Noppe. */
export const GRID_MM = 8;
/** Der Bereich, in dem ein Sensor sitzen darf – Millimeter am Roboter, x nach vorn, y nach rechts. Die Grenzen liegen auf dem Raster. */
export const MOUNT_AREA = {back:-120, front:184, side:144};
/** Mit Symmetrie, aber ohne Raster rastet ein einzelner Sensor auf der Mittellinie ein, wenn er ihr so nah kommt. */
const AXIS_SNAP_MM = 10;

export interface BuildOptions {
  /** Sensoren rasten auf dem Raster ein. */
  grid: boolean;
  /** Der Sensor auf der anderen Seite wandert spiegelbildlich mit. */
  symmetry: boolean;
}

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
 * Setzt den Sensor am Anschluss `port` an den Platz `at` und liefert alle versetzten Sensoren.
 * `usual` ist sein üblicher Platz: Er entscheidet, auf welcher Seite der Sensor bleibt, wenn er
 * mit Symmetrie genau auf die Mittellinie gezogen wird (dort lägen sonst beide aufeinander).
 */
export function placeSensor(robot: SimRobot, mounts: Record<string, Point>, port: string, at: Point, usual: Point, options: BuildOptions): Record<string, Point> {
  const step = options.grid ? GRID_MM : 1;
  const snap = (value: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, value)) / step) * step + 0;
  const x = snap(at.x, MOUNT_AREA.back, MOUNT_AREA.front);
  let y = snap(at.y, -MOUNT_AREA.side, MOUNT_AREA.side);
  const next = {...mounts};
  if (options.symmetry){
    const partner = mirrorPartner(robot, port);
    if (partner){
      // beide bleiben auf ihrer Seite und mindestens einen Rasterschritt von der Mitte weg
      const side = Math.sign(y) || Math.sign(usual.y) || -1;
      if (Math.abs(y) < GRID_MM) y = side * GRID_MM;
      next[partner] = {x, y:-y};
    } else if (!options.grid && Math.abs(y) < AXIS_SNAP_MM) y = 0;   // (mit Raster liegt die Mittellinie ohnehin auf einer Rasterlinie)
  }
  next[port] = {x, y};
  return next;
}
