// ---------------------------------------------------------------
// Simulator – die Bauteile zeichnen, vereinfacht nach der Vorlage »Hub+Sensoren+Motor«: Hub mit
// Lichtmatrix, Farbsensor (nach unten oder nach vorn), Abstandssensor, Kraftsensor (Taster frei oder
// gedrückt), Motor (auch gespiegelt) und Rad. Maße in parts.ts.
// Jede Funktion zeichnet ihr Teil um den Ursprung so, wie es in der Vorlage steht: X nach rechts,
// Y nach unten, die Vorderseite oben. `inPartFrame` legt das auf den Roboter (x nach vorn, y nach rechts).
// ---------------------------------------------------------------
import { COLOR_SENSOR, FORCE_SENSOR, HUB, MOTOR, ULTRA_SENSOR, WHEEL, type MotorKind } from './parts';

type Ctx = CanvasRenderingContext2D;
const C = {
  hubFrame:'#DE9E14', hubFace:'#FAFAFA', pixelOff:'#E3E3E3', pixelOn:'#FFCD38', buttonRing:'#CDCDCD', button:'#EBEBEB',
  black:'#111214', white:'#FFFFFF', halo:'rgba(255,255,255,.85)', motor:'#2EAFCF', motorLight:'#FAFAFA',
  // das Rad: dunkler als der Motor und ohne Verlauf, mit Schatten und Rillen, die beim Fahren mitlaufen
  wheel:'#1A6F8C', wheelEdge:'#0E4A5E', tread:'rgba(255,255,255,.16)', shadow:'rgba(0,0,0,.38)'
};

/** Von »wie in der Vorlage« (X rechts, Y unten, vorn oben) auf den Roboter (x nach vorn, y nach rechts). */
export const inPartFrame = (g: Ctx) => g.transform(0, 1, -1, 0, 0, 0);

const rounded = (g: Ctx, x: number, y: number, w: number, h: number, r: number | number[]) => { g.beginPath(); g.roundRect(x, y, w, h, r); };

/** Der Hub: gelber Rahmen, Lichtmatrix (Helligkeit 0–100 je Punkt), unten die mittlere Taste – leuchtend in `light`. */
export function drawHub(g: Ctx, pixels: readonly number[], light: string | null){
  const w = HUB.width, l = HUB.length, f = HUB.frame;
  rounded(g, -w / 2, -l / 2, w, l, HUB.radius); g.fillStyle = C.hubFrame; g.fill();
  rounded(g, -w / 2 + f, -l / 2 + f, w - 2 * f, l - 2 * f, HUB.radius - f); g.fillStyle = C.hubFace; g.fill();
  // die Matrix: 5 × 5 Felder, je 7,9 mm, 1,2 mm Abstand, oben im Hub
  const cell = 7.9, gap = 1.2, span = 5 * cell + 4 * gap, top = -l / 2 + 17;
  for (let i = 0; i < 25; i++){
    const x = -span / 2 + (i % 5) * (cell + gap), y = top + Math.floor(i / 5) * (cell + gap), on = (pixels[i] ?? 0) / 100;
    g.fillStyle = C.pixelOff; g.fillRect(x, y, cell, cell);
    if (on > 0){ g.globalAlpha *= on; g.fillStyle = C.pixelOn; g.fillRect(x, y, cell, cell); g.globalAlpha /= on; }
  }
  // die mittlere Taste
  g.beginPath(); g.arc(0, -l / 2 + 72, 5.3, 0, 2 * Math.PI);
  g.fillStyle = light ?? C.button; g.fill(); g.lineWidth = 1; g.strokeStyle = light ? 'rgba(0,0,0,.25)' : C.buttonRing; g.stroke();
}

/** Ein Sensor mit Gehäuse: außen schwarz, innen ein weißer Ring; `white` – so viel der Höhe ist vorn weiß (die Vorderseite). */
function housing(g: Ctx, w: number, l: number, r: number, white: number){
  const ring = 1.9, line = 1;
  // ein heller Rand außen herum: Auf der schwarzen Linie verschwände der Sensor sonst
  rounded(g, -w / 2 - 0.7, -l / 2 - 0.7, w + 1.4, l + 1.4, r + 0.7); g.fillStyle = C.halo; g.fill();
  rounded(g, -w / 2, -l / 2, w, l, r); g.fillStyle = C.black; g.fill();
  if (white > 0){
    // vorn weiß, bis zur Kante des schwarzen Teils
    g.save(); rounded(g, -w / 2 + line, -l / 2 + line, w - 2 * line, l - 2 * line, r - line); g.clip();
    g.fillStyle = C.white; g.fillRect(-w / 2, -l / 2, w, white); g.restore();
  }
  // der weiße Ring um das schwarze Feld
  const top = -l / 2 + Math.max(ring, white);
  rounded(g, -w / 2 + ring, top, w - 2 * ring, l / 2 - ring - top, Math.max(1, r - ring));
  g.lineWidth = line; g.strokeStyle = C.white; g.stroke();
}

/** Farbsensor: nach unten von oben gesehen ganz schwarz; nach vorn gekippt vorn weiß. */
export function drawColorSensor(g: Ctx, front: boolean){
  const s = COLOR_SENSOR.size;
  housing(g, s, s, COLOR_SENSOR.radius, front ? s * 0.62 : 0);
}
/** Abstandssensor, die Augen nach vorn. */
export function drawUltraSensor(g: Ctx){ housing(g, ULTRA_SENSOR.width, ULTRA_SENSOR.depth, ULTRA_SENSOR.radius, ULTRA_SENSOR.depth * 0.62); }

/** Kraftsensor: vorn der Taster (gedrückt steckt er fast ganz drin), dahinter das Gehäuse, vorn weiß. */
export function drawForceSensor(g: Ctx, pressed: boolean){
  const w = FORCE_SENSOR.width, l = FORCE_SENSOR.length, out = pressed ? FORCE_SENSOR.pressed : FORCE_SENSOR.plunger, pw = FORCE_SENSOR.plungerWidth;
  // Mitte des Teils ist die Mitte des Gehäuses; der Taster sitzt davor
  const top = -l / 2 - out, chamfer = Math.min(2.4, out);
  g.beginPath();
  g.moveTo(-pw / 2, -l / 2 + 1); g.lineTo(-pw / 2, top + chamfer); g.lineTo(-pw / 2 + chamfer, top); g.lineTo(pw / 2 - chamfer, top);
  g.lineTo(pw / 2, top + chamfer); g.lineTo(pw / 2, -l / 2 + 1); g.closePath();
  g.fillStyle = C.black; g.fill();
  if (!pressed){
    // die beiden Schlitze im Taster
    g.fillStyle = C.white;
    for (const x of [-2.6, 1.4]) g.fillRect(x, top + 3, 1.2, out - 2);
  }
  housing(g, w, l, FORCE_SENSOR.radius, l * 0.44);
}

/**
 * Motor: vorn blau, hinten hell mit blauem Rand; vorn rechts der Abtrieb (gespiegelt links), in dem die
 * Achse steckt. Groß 72 mm, klein 56 mm lang. shaft: Sitzt das Rad weiter draußen, führt die Achse dorthin (mm).
 */
export function drawMotor(g: Ctx, kind: MotorKind, flip: boolean, shaft: number | null = null){
  const w = MOTOR.width, l = MOTOR.length[kind], blue = l * 0.54, r = 4, edge = 1.6;
  const ow = MOTOR.output.width, ol = MOTOR.output.length;
  g.save();
  if (flip) g.scale(-1, 1);
  // die Achse zum Rad, wenn es weiter draußen sitzt: zwei dünne Linien in der Breite des Abtriebs
  if (shaft !== null && shaft > 0){
    g.fillStyle = C.motor;
    for (const y of [-l / 2, -l / 2 + ol - 1.2]) g.fillRect(w / 2 + ow - 1, y, shaft + 2, 1.2);
  }
  // der Abtrieb: ein blauer Bügel, innen offen zum Gehäuse hin
  rounded(g, w / 2 - r, -l / 2, ow + r, ol, [0, 4, 4, 0]); g.fillStyle = C.motor; g.fill();
  g.fillStyle = C.motorLight; g.fillRect(w / 2, -l / 2 + 2, ow - 2.3, ol - 4);
  // das Gehäuse
  rounded(g, -w / 2, -l / 2, w, l, r); g.fillStyle = C.motor; g.fill();
  rounded(g, -w / 2 + edge, -l / 2 + blue, w - 2 * edge, l - blue - edge, [0, 0, r - edge, r - edge]); g.fillStyle = C.motorLight; g.fill();
  g.restore();
}

/** Rad von oben: dunkles Blau mit Schatten; die Rillen wandern mit `turned` (Grad, die das Rad sich gedreht hat). */
export function drawWheel(g: Ctx, diameter: number, turned: number){
  const w = WHEEL.width, l = diameter;
  g.save();
  g.shadowColor = C.shadow; g.shadowBlur = 3; g.shadowOffsetX = 1.2; g.shadowOffsetY = 1.6;
  rounded(g, -w / 2, -l / 2, w, l, w / 2); g.fillStyle = C.wheel; g.fill();
  g.restore();
  rounded(g, -w / 2, -l / 2, w, l, w / 2); g.lineWidth = 0.8; g.strokeStyle = C.wheelEdge; g.stroke();
  // Rillen quer über die Lauffläche: Sie laufen mit, wenn das Rad rollt (Weg auf dem Umfang)
  g.save(); rounded(g, -w / 2, -l / 2, w, l, w / 2); g.clip();
  const spacing = 7, shift = ((-turned / 360 * Math.PI * diameter) % spacing + spacing) % spacing;
  g.strokeStyle = C.tread; g.lineWidth = 1.6;
  g.beginPath();
  for (let y = -l / 2 - spacing + shift; y < l / 2 + spacing; y += spacing){ g.moveTo(-w / 2 + 2, y); g.lineTo(w / 2 - 2, y); }
  g.stroke(); g.restore();
}
