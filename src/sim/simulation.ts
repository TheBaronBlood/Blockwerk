// ---------------------------------------------------------------
// Simulator – der Stand der Dinge: wo der Roboter steht, wie schnell er fährt, was seine Sensoren
// melden. `step()` lässt Zeit vergehen; das Programm (runner.ts) stellt nur Geschwindigkeiten ein
// und fragt Sensoren ab. (Ohne DOM.)
// ---------------------------------------------------------------
import type { Mount } from './build';
import { DISPLAY_OFF, type Pixels } from './hubDisplay';
import { BUMPER, COLOR_SPOT, defaultMounts, FORCE, ULTRA, type SimRobot } from './robot';
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

export class Simulation {
  /** Simulierte Zeit in Millisekunden. */
  time = 0;
  pose: Pose = {x:0, y:0, heading:0};
  /** Größe des Roboters auf der Bahn: so viele Einheiten der Bahn ist ein Millimeter am Roboter. */
  scale = 1;
  track: Track | null = null;
  obstacles: Obstacle[] = [];
  /** Fahrt der Fahrbasis: mm/s nach vorn und Grad/s nach rechts. */
  speed = 0;
  rate = 0;
  /** Was die Fahrbasis gezählt hat (»gefahrene Strecke«, »gedrehter Winkel«). */
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
  private defaults: {robot: SimRobot; mounts: Record<string, Point>} | null = null;
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

  /** Lässt `ms` Millisekunden vergehen. */
  step(ms: number){
    const dt = ms / 1000;
    this.time += ms;
    for (const m of Object.values(this.motors)) m.angle += m.speed * dt;
    const d = this.robot.drive;
    if (d?.direct){
      // einzelne Motoren als Räder: aus den beiden Drehzahlen wird Fahrt und Drehung
      const mm = Math.PI * d.wheel / 360, left = -this.motor(d.left).speed * mm, right = this.motor(d.right).speed * mm;
      this.speed = (left + right) / 2; this.rate = (left - right) / d.axle * 180 / Math.PI;
    }
    if (!d || (!this.speed && !this.rate)){ this.blocked = false; return; }
    const ds = this.speed * dt, turn = this.rate * dt;
    this.distance += ds; this.angle += turn;
    // auf einem Kreisbogen: geradeaus in der mittleren Richtung dieses Schritts
    const dir = forward(this.pose.heading + turn / 2);
    const next: Pose = {x:this.pose.x + this.scale * ds * dir.x, y:this.pose.y + this.scale * ds * dir.y, heading:this.pose.heading + turn};
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
  private colorPoint(port: string): Point | null { return this.robot.colors.includes(port) ? this.sensorPoint(port) : null; }

  /** Reflexion am Farbsensor in Prozent. Ein Sensor, den der Simulator nicht kennt, sieht Weiß. */
  reflection(port: string): number {
    const at = this.colorPoint(port);
    return at ? reflectionAt(this.track, at, COLOR_SPOT * this.scale) : 100;
  }
  color(port: string): SimColor {
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
