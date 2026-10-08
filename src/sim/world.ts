// ---------------------------------------------------------------
// Simulator – die Welt: die Bahn (ein Bild von oben), Hindernisse und was die Sensoren davon
// sehen. Gerechnet wird in Einheiten der Bahn (ein Bildpunkt des Bildes); wie groß der Roboter
// darin ist, legt sein Maßstab fest (simulation.ts). (Ohne DOM.)
// ---------------------------------------------------------------

export interface Point { x: number; y: number }
/**
 * Stellung des Roboters: der Punkt mitten zwischen den Rädern. `heading` in Grad – 0 zeigt nach
 * rechts, positiv dreht nach rechts (im Uhrzeigersinn, wie bei Pybricks); y wächst nach unten.
 */
export interface Pose extends Point { heading: number }

/** Die Bahn: ein Bild, Bildpunkte als RGBA hintereinander (wie `ImageData.data`). */
export interface Track { width: number; height: number; data: ArrayLike<number> }
/** Ein Hindernis: ein Rechteck, `x`/`y` ist die Mitte. */
export interface Obstacle { id: number; x: number; y: number; w: number; h: number }

export type SimColor = 'RED' | 'GREEN' | 'BLUE' | 'YELLOW' | 'WHITE' | 'BLACK' | 'NONE';
type Rgb = [number, number, number];

const rad = (deg: number) => deg * Math.PI / 180;
/** Die Richtung, in die `heading` zeigt. */
export const forward = (heading: number): Point => ({x:Math.cos(rad(heading)), y:Math.sin(rad(heading))});
/**
 * Ein Punkt am Roboter in der Welt. `local`: x nach vorn, y nach rechts, in Millimetern am Roboter.
 */
export function toWorld(pose: Pose, scale: number, local: Point): Point {
  const f = forward(pose.heading);
  return {x:pose.x + scale * (local.x * f.x - local.y * f.y), y:pose.y + scale * (local.x * f.y + local.y * f.x)};
}

/** Farbe eines Bildpunkts; neben der Bahn liegt weißer Tisch. */
function rgbAt(track: Track | null, x: number, y: number): Rgb {
  const px = Math.floor(x), py = Math.floor(y);
  if (!track || px < 0 || py < 0 || px >= track.width || py >= track.height) return [255, 255, 255];
  const i = (py * track.width + px) * 4;
  return [track.data[i], track.data[i + 1], track.data[i + 2]];
}
/** Der Sensor sieht keinen Punkt, sondern einen Fleck: Mitte und vier Punkte auf dem Rand, gemittelt. */
function spot(track: Track | null, at: Point, radius: number): Rgb {
  const sum: Rgb = [0, 0, 0];
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]){
    const c = rgbAt(track, at.x + dx * radius, at.y + dy * radius);
    for (let i = 0; i < 3; i++) sum[i] += c[i] / 5;
  }
  return sum;
}
const brightness = ([r, g, b]: Rgb) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/** Reflexion wie am Farbsensor: 0 = sehr dunkel, 100 = sehr hell. */
export const reflectionAt = (track: Track | null, at: Point, radius: number) => Math.round(brightness(spot(track, at, radius)) * 100);

/** Die Farbe, die der Farbsensor an dieser Stelle meldet. */
export function colorAt(track: Track | null, at: Point, radius: number): SimColor {
  const c = spot(track, at, radius), [r, g, b] = c;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), light = brightness(c);
  if (max < 70) return 'BLACK';
  if ((max - min) / max < 0.25) return light < 0.3 ? 'BLACK' : light > 0.7 ? 'WHITE' : 'NONE';
  const d = max - min;
  const hue = (60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) + 360) % 360;
  return hue < 25 || hue >= 330 ? 'RED' : hue >= 35 && hue < 75 ? 'YELLOW' : hue >= 75 && hue < 170 ? 'GREEN' : hue >= 190 && hue < 270 ? 'BLUE' : 'NONE';
}

/** Wo ein Strahl ein Hindernis trifft: die Strecke bis dorthin – oder null, wenn er vorbeigeht. */
function rayHit(from: Point, dir: Point, o: Obstacle): number | null {
  let near = 0, far = Infinity;
  for (const [p, d, lo, hi] of [[from.x, dir.x, o.x - o.w / 2, o.x + o.w / 2], [from.y, dir.y, o.y - o.h / 2, o.y + o.h / 2]]){
    if (Math.abs(d) < 1e-9){ if (p < lo || p > hi) return null; continue; }
    const a = (lo - p) / d, b = (hi - p) / d;
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

/** So viele Strahlen tasten den Kegel des Abstandssensors ab. */
const CONE_RAYS = 15;
/**
 * Abstand zum nächsten Hindernis im Kegel des Abstandssensors – oder null, wenn darin nichts liegt.
 * `halfAngle`: halber Öffnungswinkel in Grad, `range`: Reichweite.
 */
export function coneDistance(from: Point, heading: number, halfAngle: number, range: number, obstacles: Obstacle[]): number | null {
  let best = Infinity;
  for (const o of obstacles){
    for (let i = 0; i < CONE_RAYS; i++){
      const hit = rayHit(from, forward(heading - halfAngle + 2 * halfAngle * i / (CONE_RAYS - 1)), o);
      if (hit !== null) best = Math.min(best, hit);
    }
    // eine Ecke kann zwischen zwei Strahlen in den Kegel ragen
    for (const sx of [-1, 1]) for (const sy of [-1, 1]){
      const dx = o.x + sx * o.w / 2 - from.x, dy = o.y + sy * o.h / 2 - from.y;
      const off = Math.abs(((Math.atan2(dy, dx) * 180 / Math.PI - heading + 540) % 360) - 180);
      if (off <= halfAngle) best = Math.min(best, Math.hypot(dx, dy));
    }
  }
  return best <= range ? best : null;
}

/** Ob ein Kreis (der Körper des Roboters) ein Hindernis berührt. */
export function touches(obstacles: Obstacle[], at: Point, radius: number): boolean {
  return obstacles.some(o => {
    const dx = Math.max(Math.abs(at.x - o.x) - o.w / 2, 0), dy = Math.max(Math.abs(at.y - o.y) - o.h / 2, 0);
    return dx * dx + dy * dy < radius * radius;
  });
}
