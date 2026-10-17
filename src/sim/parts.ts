// ---------------------------------------------------------------
// Simulator – die Bauteile von oben: Maße (Millimeter) und wo an ihnen Rad, Taster und Messfleck sitzen.
// Vorlage ist die Zeichnung »Hub+Sensoren+Motor« (vereinfachte Draufsicht der SPIKE-Teile). Jedes Teil ist
// darin mit der Vorderseite nach oben (»Norden«) gezeichnet; am Roboter heißt das: nach vorn (+x).
// Gezeichnet wird in drawParts.ts, gerechnet in simulation.ts. (Ohne DOM.)
// ---------------------------------------------------------------
import type { Point } from './world';

/** Der Hub: 54 × 85 mm, die Lichtmatrix 5 × 5, darunter die mittlere Taste. */
export const HUB = {width:54, length:85, radius:7, frame:2.6};
/** Wo die Mitte des Hubs am Roboter sitzt (x nach vorn). Er ist der feste Rahmen; alles andere sitzt an ihm. */
export const HUB_AT: Point = {x:30, y:0};

/** Farbsensor: 23 × 23 mm, Ecken mit 5 mm Radius. */
export const COLOR_SENSOR = {size:23, radius:5};
/** Abstandssensor: 46 × 23 mm, vorn die beiden »Augen«. */
export const ULTRA_SENSOR = {width:46, depth:23, radius:5};
/** Kraftsensor: Gehäuse 23 × 39 mm; der Taster ragt 11 mm nach vorn, gedrückt nur noch 2 mm. */
export const FORCE_SENSOR = {width:23, length:39, radius:5, plunger:11, pressed:2, plungerWidth:11};

/**
 * Motor von oben, Vorderseite nach vorn: 23 mm breit, der große 72 mm lang, der kleine 56 mm. Vorn rechts
 * sitzt der Abtrieb (7,5 × 22 mm) – dort steckt die Achse mit dem Rad, das rechts daneben läuft.
 * Gespiegelt (`flip`) sitzt der Abtrieb links.
 * Höchstes Tempo ohne Last: großer Motor 156 U/min, kleiner 138 U/min (Herstellerangaben, ×6 = Grad/s).
 */
export type MotorKind = 'large' | 'small';
export const MOTOR = {
  width:23, output:{width:7.5, length:22},
  length:{large:72, small:56} as Record<MotorKind, number>,
  maxSpeed:{large:156 * 6, small:138 * 6} as Record<MotorKind, number>,
  name:{large:'großer Motor', small:'kleiner Motor'} as Record<MotorKind, string>
};
/** Zwischen Abtrieb und Rad: die Nabe auf der Achse. */
const HUB_GAP = 4;
/** Rad von oben: 15 mm breit; seine Länge ist der Durchmesser (aus »Fahrbasis einrichten«, sonst 56 mm). */
export const WHEEL = {width:15, diameter:56};

/** Ein eingebauter Motor: Mitte des Gehäuses, Drehung (Grad, positiv nach rechts), gespiegelt, groß oder klein. */
export interface MotorMount extends Point { angle?: number; flip?: boolean; kind?: MotorKind }

const rad = (deg: number) => deg * Math.PI / 180;
/** Ein Punkt am Teil (x nach vorn, y nach rechts, um seine Mitte) am Roboter – gedreht wie das Teil. */
export function onPart(at: Point & {angle?: number}, local: Point): Point {
  const c = Math.cos(rad(at.angle ?? 0)), s = Math.sin(rad(at.angle ?? 0));
  return {x:at.x + local.x * c - local.y * s, y:at.y + local.x * s + local.y * c};
}
/** Wo am Motor die Achse aus dem Abtrieb kommt: vorn, auf der Seite des Abtriebs. */
export function motorAxle(m: MotorMount): Point {
  const len = MOTOR.length[m.kind ?? 'large'];
  return onPart(m, {x:len / 2 - MOTOR.output.length / 2, y:(m.flip ? -1 : 1) * (MOTOR.width / 2 + MOTOR.output.width / 2)});
}
/** Mitte des Rads, das am Motor steckt. */
export function wheelCenter(m: MotorMount): Point {
  const len = MOTOR.length[m.kind ?? 'large'];
  return onPart(m, {x:len / 2 - MOTOR.output.length / 2, y:(m.flip ? -1 : 1) * (MOTOR.width / 2 + MOTOR.output.width + HUB_GAP + WHEEL.width / 2)});
}
/**
 * In welche Richtung das Rad rollt, wenn sich der Motor positiv dreht (»im Uhrzeigersinn«): Der Motor, wie er
 * gezeichnet ist, schiebt sein Rad nach vorn; gespiegelt nach hinten. Als Richtung am Roboter (Einheitsvektor).
 */
export function wheelRoll(m: MotorMount): Point {
  const a = rad(m.angle ?? 0), sign = m.flip ? -1 : 1;
  return {x:sign * Math.cos(a), y:sign * Math.sin(a)};
}
/**
 * Wo ein Motor sitzen muss, damit sein Rad bei `wheelY` (seitlich) auf der Achse x = 0 läuft – so baut man
 * eine Fahrbasis üblicherweise: der linke gespiegelt, der Abtrieb jeweils außen.
 */
export function motorForWheel(wheelY: number, kind: MotorKind): MotorMount {
  const flip = wheelY < 0, probe = wheelCenter({x:0, y:0, flip, kind});
  return {x:-probe.x, y:wheelY - probe.y, ...(flip ? {flip} : {}), ...(kind !== 'large' ? {kind} : {})};
}
