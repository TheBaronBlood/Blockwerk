// ---------------------------------------------------------------
// Simulator – der Stand der Dinge: wo der Roboter steht, wie schnell er fährt, was seine Sensoren
// melden. `step()` lässt Zeit vergehen; das Programm (runner.ts) stellt nur Geschwindigkeiten ein
// und fragt Sensoren ab. (Ohne DOM.)
// ---------------------------------------------------------------
import type { Mount } from './build';
import { DISPLAY_OFF, type Pixels } from './hubDisplay';
import { MOTOR, wheelCenter, wheelRoll } from './parts';
import { BUMPER, COLOR_SPOT, defaultMounts, FORCE, ULTRA, type SimDrive, type SimRobot } from './robot';
import { colorAt, coneDistance, forward, reflectionAt, toWorld, touches, type Obstacle, type Point, type Pose, type SimColor, type Track } from './world';

export interface SimMotor { angle: number; speed: number }
/**
 * Der Rand der Bahn. `high`: eine hohe Wand – Kraftsensor und Abstandssensor bemerken sie. `low`: eine niedrige
 * Wand – nur der Kraftsensor, der Abstandssensor schaut darüber hinweg. `hidden`: Der Roboter steht an, aber
 * kein Sensor bemerkt etwas. `off`: kein Rand, der Roboter fährt von der Bahn herunter.
 */
export type Fence = 'high' | 'low' | 'hidden' | 'off';
/** In dieser Reihenfolge schaltet ein Klick auf den Rand weiter. */
export const FENCES: Fence[] = ['hidden', 'low', 'high', 'off'];
/** So dick ist die Wand hinter dem Rand – nur damit Sensoren etwas zum Treffen haben. */
const WALL = 60;
/** Ein nach vorn gekippter Farbsensor: Vorderkante vor seiner Mitte, Blickwinkel, Reichweite (mm) und die Reflexion direkt vor einem Hindernis. */
const COLOR_FRONT = {edge:11.5, halfAngle:12, range:40, bright:70};

export class Simulation {
  /** Simulierte Zeit in Millisekunden. */
  time = 0;
  pose: Pose = {x:0, y:0, heading:0};
  /** Größe des Roboters auf der Bahn: so viele Einheiten der Bahn ist ein Millimeter am Roboter. */
  scale = 1;
  track: Track | null = null;
  obstacles: Obstacle[] = [];
  /** Was das Programm der Fahrbasis aufträgt: mm/s nach vorn und Grad/s nach rechts. (Wie der Roboter dann wirklich fährt, hängt am Einbau der Motoren.) */
  speed = 0;
  rate = 0;
  /** Was die Fahrbasis gezählt hat (»gefahrene Strecke«, »gedrehter Winkel«) – aus den Motoren, wie Pybricks; mit Kreisel der Winkel vom Hub. */
  distance = 0;
  angle = 0;
  /** Der Roboter steht an einem Hindernis oder am Rand der Bahn an: Die Räder drehen durch. */
  blocked = false;
  /** Der Rand der Bahn: Außer bei `off` fährt der Roboter nicht über ihre Kante hinaus, er steht dort an. */
  fence: Fence = 'hidden';
  /** Der Hub: Lichtmatrix, Farbe des Statuslichts (null: aus) und die Tasten, die gerade gedrückt sind (LEFT, RIGHT). */
  display: Pixels = [...DISPLAY_OFF];
  light: string | null = null;
  readonly buttons = new Set<string>();
  /** Kraftsensoren (Anschlüsse), die gerade von Hand gedrückt werden. */
  readonly forceHeld = new Set<string>();
  /** Sensoren, die jemand versetzt oder gedreht hat: Anschluss → Platz am Roboter (Millimeter, x nach vorn, y nach rechts) und Drehung. */
  mounts: Record<string, Mount> = {};
  private defaults: {robot: SimRobot; mounts: Record<string, Mount>} | null = null;
  private headingZero = 0;
  private readonly motors: Record<string, SimMotor> = {};

  constructor(public robot: SimRobot){}

  motor(port: string): SimMotor { return this.motors[port] ??= {angle:0, speed:0}; }

  /** Alles auf Anfang für einen neuen Lauf – Stellung, Bahn und Hindernisse bleiben. */
  reset(){
    this.time = this.speed = this.rate = this.distance = this.angle = 0;
    this.blocked = false; this.headingZero = this.pose.heading;
    // solange ein Programm läuft, leuchtet die mittlere Taste grün – bis das Programm das Statuslicht umstellt
    this.display = [...DISPLAY_OFF]; this.light = 'GREEN';
    for (const port of Object.keys(this.motors)) delete this.motors[port];
  }
  /** Hält alles an, was sich dreht (Ende des Programms). */
  halt(){ this.speed = this.rate = 0; for (const m of Object.values(this.motors)) m.speed = 0; }

  /** So schnell kann der Motor an diesem Anschluss höchstens drehen (Grad/s) – groß oder klein, wie er eingebaut ist. */
  maxSpeed(port: string): number { return MOTOR.maxSpeed[this.mount(port)?.kind ?? 'large']; }
  /** Ein Tempo für den Motor an diesem Anschluss, gekappt auf das, was er schafft. */
  limit(port: string, speed: number): number { const max = this.maxSpeed(port); return Math.max(-max, Math.min(max, speed)); }
  /**
   * Was die Fahrbasis jedem Motor aufträgt (Grad/s, so wie der Motor laut Programm zählt), damit der Roboter
   * mit `speed` (mm/s) fährt und sich mit `rate` (Grad/s) dreht – gerechnet mit Rad und Spurbreite aus dem
   * Programm, wie Pybricks es tut.
   */
  private wheelTargets(d: SimDrive, speed: number, rate: number): [number, number] {
    const perMm = 360 / (Math.PI * d.wheel), spin = rate * Math.PI / 180 * d.axle / 2;
    return [(speed + spin) * perMm, (speed - spin) * perMm];
  }
  /**
   * Um wie viel ein Auftrag an die Fahrbasis langsamer ausfällt, weil ein Motor das Tempo nicht schafft:
   * 1 – es geht so schnell; 0,5 – nur halb so schnell (dann dauert die Fahrt doppelt so lange).
   */
  driveLimit(speed: number, rate: number): number {
    const d = this.robot.drive;
    if (!d || d.direct) return 1;
    const [l, r] = this.wheelTargets(d, speed, rate);
    return Math.min(1, this.maxSpeed(d.left) / Math.abs(l || 1e-9), this.maxSpeed(d.right) / Math.abs(r || 1e-9));
  }

  /** Lässt `ms` Millisekunden vergehen. */
  step(ms: number){
    const dt = ms / 1000;
    this.time += ms;
    const d = this.robot.drive;
    // die Fahrbasis stellt ihre beiden Motoren ein – nie schneller, als sie können (beide im selben Verhältnis langsamer)
    if (d && !d.direct){
      const [l, r] = this.wheelTargets(d, this.speed, this.rate), f = this.driveLimit(this.speed, this.rate);
      this.motor(d.left).speed = l * f; this.motor(d.right).speed = r * f;
    }
    for (const [port, m] of Object.entries(this.motors)){ m.speed = this.limit(port, m.speed); m.angle += m.speed * dt; }
    if (!d){ this.blocked = false; return; }
    const left = this.motor(d.left).speed, right = this.motor(d.right).speed, perDeg = Math.PI * d.wheel / 360;
    // was die Fahrbasis zählt: aus den Motoren, so wie sie laut Programm zählen
    if (!d.direct) this.distance += (left + right) / 2 * perDeg * dt;
    // Wie der Roboter wirklich fährt: Jeder Motor dreht sich so, wie er zählt (»umgekehrt« dreht andersherum), und
    // sein Rad rollt dorthin, wohin sein Einbau es schiebt (gespiegelt rückwärts). Die Räder laufen, wo die Motoren sitzen.
    const lm = this.mount(d.left)!, rm = this.mount(d.right)!;
    const lw = wheelCenter(lm), rw = wheelCenter(rm), lu = wheelRoll(lm), ru = wheelRoll(rm);
    const sl = left * (d.direct ? 1 : d.leftDir) * perDeg * lu.x, sr = right * (d.direct ? 1 : d.rightDir) * perDeg * ru.x;
    const apart = rw.y - lw.y;
    // ω: positiv nach rechts (Grad/s am Bildschirm im Uhrzeigersinn); stehen die Räder hintereinander, dreht sich nichts
    let omega = Math.abs(apart) < 1 ? 0 : (sl - sr) / apart;
    // Mit Kreisel hält die Fahrbasis die Drehung, die das Programm will – solange beide Räder überhaupt vorwärts schieben.
    if (d.gyro && !d.direct && d.leftDir * lu.x > 0.5 && d.rightDir * ru.x > 0.5) omega = this.rate * Math.PI / 180 * this.driveLimit(this.speed, this.rate);
    const turn = omega * 180 / Math.PI * dt;
    if (!d.direct) this.angle += d.gyro ? turn : (left - right) * perDeg / d.axle * 180 / Math.PI * dt;
    // Tempo am Ursprung (mitten zwischen den üblichen Rädern): vor und zurück aus beiden Rädern, seitlich nur, wenn
    // die Räder nicht auf seiner Höhe laufen (dann schwenkt der Ursprung beim Drehen aus)
    const vx = (sl + sr) / 2 + omega * (lw.y + rw.y) / 2, vy = -omega * (lw.x + rw.x) / 2;
    if (!vx && !vy && !turn){ this.blocked = false; return; }
    // auf einem Kreisbogen: in der mittleren Richtung dieses Schritts
    const f = forward(this.pose.heading + turn / 2);
    const dx = (vx * f.x - vy * f.y) * dt, dy = (vx * f.y + vy * f.x) * dt;
    const next: Pose = {x:this.pose.x + this.scale * dx, y:this.pose.y + this.scale * dy, heading:this.pose.heading + turn};
    // An ein Hindernis fährt der Roboter heran, hinein nicht. (Steht er schon darin – es wurde auf ihn
    // geschoben –, darf er wieder herausfahren.)
    // Am Rand der Bahn ist Schluss: Weiter hinaus geht es nicht, zurück immer.
    this.blocked = (this.bumps(next) && !this.bumps(this.pose)) || this.beyond(next) > this.beyond(this.pose) + 1e-9;
    if (!this.blocked) this.pose = next;
  }
  /** Wie weit der Roboter über den Rand der Bahn hinausragt (0: gar nicht – oder es gibt keinen Rand). */
  private beyond(pose: Pose): number {
    if (this.fence === 'off' || !this.track) return 0;
    const at = toWorld(pose, this.scale, BUMPER.at), r = BUMPER.radius * this.scale;
    return Math.max(0, r - at.x, r - at.y, at.x + r - this.track.width, at.y + r - this.track.height);
  }
  private bumps(pose: Pose){ return touches(this.obstacles, toWorld(pose, this.scale, BUMPER.at), BUMPER.radius * this.scale); }

  /** Die Wände um die Bahn als Hindernisse – für die Sensoren, die sie bemerken (`seenBy`: die niedrige Wand zählt mit). */
  private walls(low: boolean): Obstacle[] {
    if (!this.track || !(this.fence === 'high' || (low && this.fence === 'low'))) return [];
    const {width:w, height:h} = this.track, wall = (x: number, y: number, bw: number, bh: number, id: number): Obstacle => ({id, x:x + bw / 2, y:y + bh / 2, w:bw, h:bh});
    return [wall(-WALL, -WALL, WALL, h + 2 * WALL, -1), wall(w, -WALL, WALL, h + 2 * WALL, -2), wall(0, -WALL, w, WALL, -3), wall(0, h, w, WALL, -4)];
  }
  /** Wo der Sensor an diesem Anschluss am Roboter sitzt – null, wenn der Simulator dort keinen kennt. */
  mount(port: string): Mount | null {
    if (this.defaults?.robot !== this.robot) this.defaults = {robot:this.robot, mounts:defaultMounts(this.robot)};
    const usual = this.defaults.mounts[port];
    return usual ? this.mounts[port] ?? usual : null;
  }
  /** Wohin der Sensor an diesem Anschluss schaut: die Richtung des Roboters, dazu die Drehung des Sensors. */
  sensorHeading(port: string): number { return this.pose.heading + (this.mount(port)?.angle ?? 0); }
  /** Wo der Sensor an diesem Anschluss gerade über der Bahn steht. */
  sensorPoint(port: string): Point | null { const at = this.mount(port); return at && toWorld(this.pose, this.scale, at); }
  /** Wo die Farbsensoren gerade über der Bahn stehen, in der Reihenfolge von `robot.colors`. */
  colorPoints(): Point[] { return this.robot.colors.map(port => this.sensorPoint(port)!); }
  /** Wo ein Farbsensor auf die Bahn schaut – null, wenn er keiner ist oder nach vorn schaut. */
  private colorPoint(port: string): Point | null { return this.robot.colors.includes(port) && !this.facesFront(port) ? this.sensorPoint(port) : null; }
  /** Der Farbsensor ist nach vorn gekippt eingebaut: Er sieht nicht den Boden, sondern was vor ihm steht. */
  facesFront(port: string): boolean { return this.robot.colors.includes(port) && this.mount(port)?.face === 'front'; }
  /** Nach vorn gekippt: wie weit das nächste Hindernis vor dem Sensor steht (mm) – null, wenn in Reichweite nichts ist. */
  private frontDistance(port: string): number | null {
    const at = this.mount(port)!, out = forward(at.angle ?? 0);
    const from = toWorld(this.pose, this.scale, {x:at.x + out.x * COLOR_FRONT.edge, y:at.y + out.y * COLOR_FRONT.edge});
    const hit = coneDistance(from, this.sensorHeading(port), COLOR_FRONT.halfAngle, COLOR_FRONT.range * this.scale, [...this.obstacles, ...this.walls(true)]);
    return hit === null ? null : hit / this.scale;
  }

  /** Reflexion am Farbsensor in Prozent. Ein Sensor, den der Simulator nicht kennt, sieht Weiß. */
  reflection(port: string): number {
    // nach vorn gekippt: je näher ein Hindernis, desto heller (das Licht des Sensors kommt zurück); sonst dunkel
    if (this.facesFront(port)){ const d = this.frontDistance(port); return d === null ? 0 : Math.round(COLOR_FRONT.bright * (1 - d / COLOR_FRONT.range)); }
    const at = this.colorPoint(port);
    return at ? reflectionAt(this.track, at, COLOR_SPOT * this.scale) : 100;
  }
  color(port: string): SimColor {
    // (Hindernisse haben im Simulator noch keine Farbe)
    if (this.facesFront(port)) return 'NONE';
    const at = this.colorPoint(port);
    return at ? colorAt(this.track, at, COLOR_SPOT * this.scale) : 'WHITE';
  }
  /** Wo der Abstandssensor sitzt und wohin er schaut. */
  ultraPoint(): Point { return (this.robot.ultra && this.sensorPoint(this.robot.ultra)) || toWorld(this.pose, this.scale, ULTRA.at); }
  ultraHeading(): number { return this.robot.ultra ? this.sensorHeading(this.robot.ultra) : this.pose.heading; }
  /** Ob der Kraftsensor gedrückt ist: von Hand oder weil sein Taster an ein Hindernis stößt. */
  forcePressed(port: string): boolean {
    const at = this.robot.force.includes(port) ? this.mount(port) : null;
    if (!at) return false;
    if (this.forceHeld.has(port)) return true;
    // der Taster sitzt vorn am Sensor – wohin das ist, hängt an seiner Drehung
    const out = forward(at.angle ?? 0), tip = toWorld(this.pose, this.scale, {x:at.x + FORCE.tip * out.x, y:at.y + FORCE.tip * out.y});
    // (auch an der Wand um die Bahn, wenn sie eine ist – hoch oder niedrig)
    return touches([...this.obstacles, ...this.walls(true)], tip, FORCE.reach * this.scale);
  }
  /** Abstand am Abstandssensor in Millimetern; ohne Hindernis im Kegel 2000 wie am echten Sensor. */
  ultrasonic(port: string): number {
    if (port !== this.robot.ultra) return ULTRA.nothing;
    // (die hohe Wand um die Bahn sieht er, über die niedrige schaut er hinweg)
    const hit = coneDistance(this.ultraPoint(), this.ultraHeading(), ULTRA.halfAngle, ULTRA.range * this.scale, [...this.obstacles, ...this.walls(false)]);
    return hit === null ? ULTRA.nothing : Math.round(hit / this.scale);
  }
  /** Ausrichtung des Hubs in Grad, positiv nach rechts. */
  heading(): number { return this.pose.heading - this.headingZero; }
  setHeading(angle: number){ this.headingZero = this.pose.heading - angle; }
}
