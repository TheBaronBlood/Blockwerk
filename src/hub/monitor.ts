// ---------------------------------------------------------------
// Hub-Ansicht: was an den Anschlüssen hängt, was die Geräte gerade messen, wie voll der Akku ist.
//
// Pybricks meldet das nicht von selbst. Blockwerk lädt deshalb ein kleines Programm auf den Hub
// (MONITOR_PROGRAM), das nur die offene Pybricks-API benutzt: Es sieht reihum nach, was steckt,
// liest die Werte und schreibt sie als Zeilen auf die Standardausgabe. Dieses Modul enthält das
// Programm UND wertet seine Zeilen aus – beide Seiten nur gemeinsam ändern;
// tests/monitor.test.ts lässt das Programm mit echtem Python gegen ein nachgestelltes Pybricks
// laufen und liest die Ausgabe mit dem Code hier.
// (Ohne DOM. Die Telemetrie der Firmware 4.1 benutzt Blockwerk bewusst nicht: Sie ist nicht frei
// lizenziert und noch nicht endgültig.)
//
// Zeilen des Programms – jede beginnt mit dem Zeichen U+001E, damit sie sich von gewöhnlicher
// Ausgabe unterscheidet:
//   V 1                                   Fassung dieses Formats
//   P <A–F> -                             Anschluss frei
//   P <A–F> m <Nr> <Winkel> <Tempo>       Motor: Grad, Grad/s
//   P <A–F> c <Nr> <h> <s> <v> <Reflexion> <FARBE>   Farbsensor
//   P <A–F> u <Nr> <Abstand>              Abstandssensor: mm (2000 = nichts erkannt)
//   P <A–F> f <Nr> <Kraft·10> <0|1>       Kraftsensor: Zehntel-Newton, gedrückt
//   P <A–F> x <Nr>                        ein Gerät, das die Ansicht nicht auslesen kann
//   H <mV> <mA> <Ladekabel> <Ladestand> <Neigung vor/zurück> <Neigung links/rechts> <Richtung>
//                                         (-1 bzw. »-«, wenn der Hub das nicht hat)
// Gemeldet wird nur, was sich geändert hat; alle zwei Sekunden einmal alles. Eine Runde dauert
// rund 40 ms: Motoren kommen in jeder Runde dran (ihr Zeiger soll flüssig laufen), Sensoren in
// jeder dritten, der Hub selbst zweimal in der Sekunde. Am echten Hub gemessen kostet das Lesen
// aller Geräte unter einer Millisekunde – die Runde besteht fast nur aus dem Warten.
// Die andere Richtung: Blockwerk schickt regelmäßig ein Byte als Lebenszeichen. Bleibt es aus,
// beendet sich das Programm – auch, wenn jemand es ohne Blockwerk am Hub startet.
// ---------------------------------------------------------------

/** Kennzeichen am Anfang jeder Zeile des Anzeige-Programms. */
export const MONITOR_MARK = '\x1e';
export const MONITOR_VERSION = 1;
export const MONITOR_HEARTBEAT = 255;
/** So oft schickt Blockwerk ein Lebenszeichen. */
export const MONITOR_HEARTBEAT_MS = 1500;
/** Nach dieser Stille beendet sich das Programm auf dem Hub. */
export const MONITOR_TIMEOUT_MS = 6000;
/** Kommt so lange keine Zeile, gilt die Anzeige als eingefroren. */
export const MONITOR_STALE_MS = 5000;

/** Nummern der Motoren mit Drehgeber (LEGO-Gerätekennungen). */
const MOTOR_IDS = [38, 46, 47, 48, 49, 65, 75, 76];

/** Das Programm für den Hub. */
export const MONITOR_PROGRAM = [
  '# Hub-Ansicht von Blockwerk: meldet, was an den Anschlüssen hängt und was es misst',
  'from pybricks.hubs import ThisHub',
  'from pybricks.iodevices import PUPDevice',
  'from pybricks.parameters import Port',
  'from pybricks.pupdevices import ColorSensor, ForceSensor, Motor, UltrasonicSensor',
  'from pybricks.tools import StopWatch, read_input_byte, wait',
  '',
  'hub = ThisHub()',
  "PORTS = [(n, getattr(Port, n)) for n in 'ABCDEF' if hasattr(Port, n)]",
  `MOTORS = (${MOTOR_IDS.join(', ')})`,
  "imu = getattr(hub, 'imu', None)",
  "charger = getattr(hub, 'charger', None)",
  '',
  'def attach(port):',
  '    try:',
  "        nr = PUPDevice(port).info()['id']",
  '    except OSError:',
  '        return None',
  '    try:',
  '        if nr in MOTORS:',
  "            return 'm', nr, Motor(port)",
  '        if nr == 61:',
  "            return 'c', nr, ColorSensor(port)",
  '        if nr == 62:',
  "            return 'u', nr, UltrasonicSensor(port)",
  '        if nr == 63:',
  "            return 'f', nr, ForceSensor(port)",
  '    except OSError:',
  '        return None',
  "    return 'x', nr, None",
  '',
  'def read(kind, dev):',
  "    if kind == 'm':",
  "        return ' %d %d' % (dev.angle(), dev.speed())",
  "    if kind == 'c':",
  '        c = dev.hsv()',
  "        return ' %d %d %d %d %s' % (c.h, c.s, c.v, dev.reflection(), str(dev.color()).split('.')[-1])",
  "    if kind == 'u':",
  "        return ' %d' % dev.distance()",
  "    if kind == 'f':",
  "        return ' %d %d' % (int(dev.force() * 10), int(dev.pressed()))",
  "    return ''",
  '',
  'devices = {}',
  'last = {}',
  '',
  'def tell(key, text):',
  '    if last.get(key) != text:',
  '        last[key] = text',
  `        print('\\x1e' + text)`,
  '',
  'alive = StopWatch()',
  'fresh = StopWatch()',
  `print('\\x1eV ${MONITOR_VERSION}')`,
  'n = 0',
  `while alive.time() < ${MONITOR_TIMEOUT_MS}:`,
  '    while read_input_byte() is not None:',
  '        alive.reset()',
  '    if fresh.time() > 2000:',
  '        fresh.reset()',
  '        last.clear()',
  '    for i, (name, port) in enumerate(PORTS):',
  '        d = devices.get(name)',
  '        # je Runde höchstens einen freien Anschluss neu ansehen – das Nachsehen dauert',
  '        if d is None and n % len(PORTS) == i:',
  '            d = devices[name] = attach(port)',
  '        if d is None:',
  '            # »frei« erst melden, wenn der Anschluss wirklich schon angesehen wurde',
  '            if name in devices:',
  "                tell(name, 'P %s -' % name)",
  '            continue',
  '        # Motoren in jeder Runde, alles andere in jeder dritten',
  "        if d[0] != 'm' and n % 3:",
  '            continue',
  '        try:',
  '            # ein Gerät, das sich nicht auslesen lässt, meldet auch nicht, dass es abgezogen wurde: nachsehen',
  "            if d[0] == 'x' and PUPDevice(port).info()['id'] != d[1]:",
  '                raise OSError()',
  "            tell(name, 'P %s %s %d%s' % (name, d[0], d[1], read(d[0], d[2])))",
  '        except OSError:',
  '            devices[name] = None',
  '    if n % 12 == 0:',
  '        # auf 0,05 V und 20 mA gerundet, sonst ändert sich die Zeile in jeder Runde',
  "        t = '%d %d %d' % (imu.tilt() + (int(imu.heading()),)) if imu else '- - -'",
  "        tell('H', 'H %d %d %d %d %s' % (hub.battery.voltage() // 50 * 50, hub.battery.current() // 20 * 20,",
  '             int(charger.connected()) if charger else -1, charger.status() if charger else -1, t))',
  '    n += 1',
  '    wait(40)'
].join('\n') + '\n';

export type DeviceKind = 'none' | 'motor' | 'color' | 'ultra' | 'force' | 'other';
export interface PortReading {
  kind: DeviceKind;
  /** LEGO-Gerätekennung, 0 wenn der Anschluss frei ist. */
  id: number;
  /** Motor: Grad und Grad pro Sekunde. */
  angle?: number; speed?: number;
  /** Farbsensor: Farbton 0–359, Sättigung und Helligkeit 0–100, Reflexion 0–100, Farbe wie in Pybricks (»RED«, »NONE« …). */
  h?: number; s?: number; v?: number; reflection?: number; color?: string;
  /** Abstandssensor: Millimeter; 2000 heißt »nichts erkannt«. */
  distance?: number;
  /** Kraftsensor: Newton und ob er als gedrückt gilt. */
  force?: number; pressed?: boolean;
}
export interface HubReading {
  millivolts: number; milliamps: number;
  /** Ladekabel steckt; null, wenn der Hub das nicht meldet. */
  plugged: boolean | null;
  /** 0 lädt nicht, 1 lädt, 2 voll, 3 Störung; -1 unbekannt. */
  charge: number;
  /** Neigung nach vorn/hinten und zur Seite in Grad, Richtung in Grad; null ohne Lagesensor. */
  pitch: number | null; roll: number | null; heading: number | null;
}
export interface MonitorState {
  /** Fassung des Formats, die das Programm meldet; null, bis die erste Zeile da ist. */
  version: number | null;
  ports: Record<string, PortReading>;
  hub: HubReading | null;
}
export const PORT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const emptyState = (): MonitorState => ({version:null, ports:{}, hub:null});

const DEVICE_NAMES: Record<number, string> = {
  1:'Motor (WeDo)', 2:'Zugmotor', 8:'Lichter', 34:'Neigungssensor (WeDo)', 35:'Bewegungssensor (WeDo)',
  37:'Farb- und Abstandssensor (BOOST)', 38:'BOOST-Motor', 46:'Technic-Motor L', 47:'Technic-Motor XL',
  48:'Mittlerer Motor', 49:'Großer Motor', 61:'Farbsensor', 62:'Abstandssensor', 63:'Kraftsensor',
  64:'Lichtmatrix 3×3', 65:'Kleiner Motor', 75:'Technic-Motor M', 76:'Technic-Motor L'
};
/** Name eines Geräts für die Anzeige. */
export const deviceName = (id: number) => DEVICE_NAMES[id] ?? `Gerät Nr. ${id}`;

const COLOR_NAMES: Record<string, string> = {
  RED:'Rot', ORANGE:'Orange', YELLOW:'Gelb', GREEN:'Grün', CYAN:'Türkis', BLUE:'Blau', VIOLET:'Violett', MAGENTA:'Magenta',
  WHITE:'Weiß', GRAY:'Grau', BLACK:'Schwarz', NONE:'keine Farbe'
};
/** Deutscher Name der Farbe, die Pybricks erkannt hat. */
export const colorName = (color: string) => COLOR_NAMES[color] ?? color;

/** Farbton, Sättigung, Helligkeit (wie Pybricks sie liefert) als CSS-Farbe. */
export function hsvToCss(h: number, s: number, v: number): string {
  const sv = s / 100, vv = v / 100, l = vv * (1 - sv / 2);
  const sl = l === 0 || l === 1 ? 0 : (vv - l) / Math.min(l, 1 - l);
  return `hsl(${Math.round(h)} ${Math.round(sl * 100)}% ${Math.round(l * 100)}%)`;
}

/** Ganz grobe Einschätzung des Akkus aus der Spannung (SPIKE Prime: zwei Zellen, rund 6,0 bis 8,3 V): 0 bis 1. */
export const batteryLevel = (millivolts: number) => Math.max(0, Math.min(1, (millivolts - 6000) / (8300 - 6000)));

const KINDS: Record<string, DeviceKind> = {m:'motor', c:'color', u:'ultra', f:'force', x:'other'};
const int = (text: string | undefined) => { const n = Number(text); return text !== undefined && text !== '' && Number.isFinite(n) ? n : null; };

/** Wertet eine Zeile (ohne das Kennzeichen) aus und trägt sie in den Stand ein. Liefert false bei einer unverständlichen Zeile. */
export function applyLine(state: MonitorState, line: string): boolean {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'V'){ const v = int(p[1]); if (v === null) return false; state.version = v; return true; }
  if (p[0] === 'P'){
    const port = p[1];
    if (!PORT_NAMES.includes(port)) return false;
    if (p[2] === '-'){ state.ports[port] = {kind:'none', id:0}; return true; }
    const kind = KINDS[p[2]], id = int(p[3]);
    if (!kind || id === null) return false;
    // Werte hinter der Gerätenummer; fehlt einer oder ist er keine Zahl, gilt die ganze Zeile nicht
    const n = [4, 5, 6, 7].map(i => int(p[i]));
    const reading: PortReading = {kind, id};
    if (kind === 'motor'){ if (n[0] === null || n[1] === null) return false; reading.angle = n[0]; reading.speed = n[1]; }
    else if (kind === 'color'){
      if (n[0] === null || n[1] === null || n[2] === null || n[3] === null || !p[8]) return false;
      Object.assign(reading, {h:n[0], s:n[1], v:n[2], reflection:n[3], color:p[8]});
    }
    else if (kind === 'ultra'){ if (n[0] === null) return false; reading.distance = n[0]; }
    else if (kind === 'force'){ if (n[0] === null || n[1] === null) return false; reading.force = n[0] / 10; reading.pressed = n[1] !== 0; }
    state.ports[port] = reading;
    return true;
  }
  if (p[0] === 'H'){
    const mv = int(p[1]), ma = int(p[2]), plugged = int(p[3]), charge = int(p[4]);
    if (mv === null || ma === null || plugged === null || charge === null) return false;
    const tilt = p.slice(5, 8).map(t => t === '-' ? null : int(t));
    state.hub = {millivolts:mv, milliamps:ma, plugged:plugged < 0 ? null : plugged !== 0, charge,
      pitch:tilt[0] ?? null, roll:tilt[1] ?? null, heading:tilt[2] ?? null};
    return true;
  }
  return false;
}

/**
 * Hält Zeilen des Anzeige-Programms vom Terminal fern, wenn gerade keine Hub-Ansicht offen ist –
 * etwa wenn es noch auf dem Hub liegt und jemand es dort mit der Taste startet. Alles andere geht
 * sofort durch, auch angefangene Zeilen: Ein gewöhnliches Programm soll nicht auf sein
 * Zeilenende warten müssen.
 */
export class StrayFilter {
  /** mitten in einer Zeile des Anzeige-Programms, die über mehrere Stücke kommt */
  private dropping = false;

  push(text: string): string {
    let out = '';
    for (let at = 0; at < text.length;){
      if (this.dropping){
        const end = text.indexOf('\n', at);
        if (end < 0) return out;
        this.dropping = false; at = end + 1;
        continue;
      }
      const mark = text.indexOf(MONITOR_MARK, at);
      if (mark < 0){ out += text.slice(at); break; }
      out += text.slice(at, mark);
      this.dropping = true; at = mark + 1;
    }
    return out;
  }
}

/** Das meldet die Firmware, wenn ein Programm gestoppt wird – beim Anzeige-Programm gehört es nicht ins Terminal. */
const STOP_NOTICE = /^The program was stopped \(SystemExit\)\.$/;

/**
 * Nimmt die Ausgabe des Hubs stückweise entgegen, wie sie ankommt. Zeilen des Anzeige-Programms
 * landen im Stand; alles andere (eine Fehlermeldung zum Beispiel) kommt zeilenweise als Text
 * zurück und gehört ins Terminal.
 */
export class MonitorFeed {
  readonly state = emptyState();
  private pending = '';
  /** Wann zuletzt eine Zeile des Programms ankam (Zeitstempel in ms), 0 = noch nie. */
  lastLine = 0;

  constructor(private onChange: (state: MonitorState) => void = () => {}, private now: () => number = () => Date.now()){}

  push(text: string): string {
    this.pending += text;
    let rest = '', changed = false;
    for (let at = this.pending.indexOf('\n'); at >= 0; at = this.pending.indexOf('\n')){
      const line = this.pending.slice(0, at).replace(/\r$/, '');
      this.pending = this.pending.slice(at + 1);
      const mark = line.indexOf(MONITOR_MARK);
      if (mark < 0){ if (!STOP_NOTICE.test(line)) rest += line + '\n'; continue; }
      // steht vor dem Kennzeichen noch etwas, ist das gewöhnliche Ausgabe
      if (mark > 0) rest += line.slice(0, mark) + '\n';
      if (applyLine(this.state, line.slice(mark + 1))){ changed = true; this.lastLine = this.now(); }
    }
    // (Ein angefangenes Stück wartet, bis seine Zeile vollständig ist – erst dann steht fest, was sie ist.)
    if (changed) this.onChange(this.state);
    return rest;
  }
  /** Das Fenster ist zu oder das Programm zu Ende: weiter mitlesen (letzte Zeilen schlucken), aber nichts mehr melden. */
  mute(){ this.onChange = () => {}; }
  /** Ob länger keine Zeile kam, obwohl schon einmal eine da war. */
  get stale(){ return this.lastLine > 0 && this.now() - this.lastLine > MONITOR_STALE_MS; }
}
