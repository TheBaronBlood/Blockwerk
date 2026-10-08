// ---------------------------------------------------------------
// Simulator – der Stand der Dinge: wo der Roboter steht, wie schnell er fährt, was seine Sensoren
// melden. `step()` lässt Zeit vergehen; das Programm (runner.ts) stellt nur Geschwindigkeiten ein
// und fragt Sensoren ab. (Ohne DOM.)
// ---------------------------------------------------------------
import { DISPLAY_OFF, type Pixels } from './hubDisplay';
import { BUMPER, COLOR_SPOT, defaultMounts, FORCE, ULTRA, type SimRobot } from './robot';
import { colorAt, coneDistance, forward, reflectionAt, toWorld, touches, type Obstacle, type Point, type Pose, type SimColor, type Track } from './world';

export interface SimMotor { angle: number; speed: number }

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
  /** Der Roboter steht an einem Hindernis an: Die Räder drehen durch. */
  blocked = false;
  /** Der Hub: Lichtmatrix, Farbe des Statuslichts (null: aus) und die Tasten, die gerade gedrückt sind (LEFT, RIGHT). */
  display: Pixels = [...DISPLAY_OFF];
  light: string | null = null;
  readonly buttons = new Set<string>();
  /** Kraftsensoren (Anschlüsse), die gerade von Hand gedrückt werden. */
  readonly forceHeld = new Set<string>();
  /** Sensoren, die jemand versetzt hat: Anschluss → Platz am Roboter (Millimeter, x nach vorn, y nach rechts). */
  mounts: Record<string, Point> = {};
  private defaults: {robot: SimRobot; mounts: Record<string, Point>} | null = null;
  private headingZero = 0;
  private readonly motors: Record<string, SimMotor> = {};

  constructor(public robot: SimRobot){}

  motor(port: string): SimMotor { return this.motors[port] ??= {angle:0, speed:0}; }

  /** Alles auf Anfang für einen neuen Lauf – Stellung, Bahn und Hindernisse bleiben. */
  reset(){
    this.time = this.speed = this.rate = this.distance = this.angle = 0;
    this.blocked = false; this.headingZero = this.pose.heading;
    this.display = [...DISPLAY_OFF]; this.light = null;
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
    this.blocked = this.bumps(next) && !this.bumps(this.pose);
    if (!this.blocked) this.pose = next;
  }
  private bumps(pose: Pose){ return touches(this.obstacles, toWorld(pose, this.scale, BUMPER.at), BUMPER.radius * this.scale); }

  /** Wo der Sensor an diesem Anschluss am Roboter sitzt – null, wenn der Simulator dort keinen kennt. */
  mount(port: string): Point | null {
    if (this.defaults?.robot !== this.robot) this.defaults = {robot:this.robot, mounts:defaultMounts(this.robot)};
    const usual = this.defaults.mounts[port];
    return usual ? this.mounts[port] ?? usual : null;
  }
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
  /** Wo der Abstandssensor sitzt. */
  ultraPoint(): Point { return (this.robot.ultra && this.sensorPoint(this.robot.ultra)) || toWorld(this.pose, this.scale, ULTRA.at); }
  /** Ob der Kraftsensor gedrückt ist: von Hand oder weil er an ein Hindernis stößt. */
  forcePressed(port: string): boolean {
    if (!this.robot.force.includes(port)) return false;
    return this.forceHeld.has(port) || touches(this.obstacles, this.sensorPoint(port)!, FORCE.reach * this.scale);
  }
  /** Abstand am Abstandssensor in Millimetern; ohne Hindernis im Kegel 2000 wie am echten Sensor. */
  ultrasonic(port: string): number {
    if (port !== this.robot.ultra) return ULTRA.nothing;
    const hit = coneDistance(this.ultraPoint(), this.pose.heading, ULTRA.halfAngle, ULTRA.range * this.scale, this.obstacles);
    return hit === null ? ULTRA.nothing : Math.round(hit / this.scale);
  }
  /** Ausrichtung des Hubs in Grad, positiv nach rechts. */
  heading(): number { return this.pose.heading - this.headingZero; }
  setHeading(angle: number){ this.headingZero = this.pose.heading - angle; }
}
