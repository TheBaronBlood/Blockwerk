import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { compileProgram } from '../src/hub/compile';
import {
  applyLine, batteryLevel, colorName, deviceName, emptyState, hsvToCss, MONITOR_HEARTBEAT, MONITOR_MARK, MONITOR_PROGRAM,
  MONITOR_TIMEOUT_MS, MONITOR_VERSION, MonitorFeed, StrayFilter
} from '../src/hub/monitor';

// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);

describe('Hub-Ansicht: Zeilen auswerten', () => {
  it('liest Motor, Farbsensor, Abstandssensor, Kraftsensor und freie Anschlüsse', () => {
    const s = emptyState();
    for (const line of ['V 1', 'P A m 48 -123 40', 'P C c 61 350 90 80 57 RED', 'P D u 62 2000', 'P E f 63 34 1', 'P B x 37', 'P F -'])
      expect(applyLine(s, line), line).toBe(true);
    expect(s.version).toBe(1);
    expect(s.ports.A).toEqual({kind:'motor', id:48, angle:-123, speed:40});
    expect(s.ports.C).toEqual({kind:'color', id:61, h:350, s:90, v:80, reflection:57, color:'RED'});
    expect(s.ports.D).toEqual({kind:'ultra', id:62, distance:2000});
    expect(s.ports.E).toEqual({kind:'force', id:63, force:3.4, pressed:true});
    expect(s.ports.B).toEqual({kind:'other', id:37});
    expect(s.ports.F).toEqual({kind:'none', id:0});
  });

  it('liest den Hub – auch einen ohne Ladeanzeige und ohne Lagesensor', () => {
    const s = emptyState();
    expect(applyLine(s, 'H 7850 120 1 2 3 -4 181')).toBe(true);
    expect(s.hub).toEqual({millivolts:7850, milliamps:120, plugged:true, charge:2, pitch:3, roll:-4, heading:181});
    expect(applyLine(s, 'H 6400 60 -1 -1 - - -')).toBe(true);
    expect(s.hub).toEqual({millivolts:6400, milliamps:60, plugged:null, charge:-1, pitch:null, roll:null, heading:null});
  });

  it('weist Unverständliches zurück und lässt den Stand dabei stehen', () => {
    const s = emptyState();
    applyLine(s, 'P A m 48 10 0');
    for (const line of ['', 'X 1', 'P', 'P G m 48 1 2', 'P A m 48 abc 0', 'P A m 48', 'P A c 61 1 2 3', 'P A q 5', 'H 7000', 'V x'])
      expect(applyLine(s, line), line).toBe(false);
    expect(s.ports.A).toEqual({kind:'motor', id:48, angle:10, speed:0});
  });

  it('benennt Geräte und Farben, rechnet Farbe und Akku um', () => {
    expect(deviceName(49)).toBe('Großer Motor');
    expect(deviceName(61)).toBe('Farbsensor');
    expect(deviceName(999)).toBe('Gerät Nr. 999');
    expect(colorName('RED')).toBe('Rot');
    expect(colorName('NONE')).toBe('keine Farbe');
    expect(colorName('TEAL')).toBe('TEAL');
    expect(hsvToCss(0, 100, 100)).toBe('hsl(0 100% 50%)');
    expect(hsvToCss(120, 0, 100)).toBe('hsl(120 0% 100%)');
    expect(hsvToCss(240, 100, 0)).toBe('hsl(240 0% 0%)');
    expect([5000, 6000, 7150, 8300, 9000].map(batteryLevel)).toEqual([0, 0, 0.5, 1, 1]);
  });
});

describe('Hub-Ansicht: Ausgabe des Hubs stückweise', () => {
  const M = MONITOR_MARK;

  it('setzt zerschnittene Zeilen zusammen und meldet Änderungen', () => {
    let changes = 0;
    const feed = new MonitorFeed(() => { changes++; });
    const text = `${M}V 1\r\n${M}P A m 48 12 0\r\n${M}P C -\r\n`;
    let rest = '';
    for (let i = 0; i < text.length; i += 5) rest += feed.push(text.slice(i, i + 5));
    expect(rest).toBe('');
    expect(feed.state.ports).toEqual({A:{kind:'motor', id:48, angle:12, speed:0}, C:{kind:'none', id:0}});
    expect(changes).toBeGreaterThanOrEqual(3);
  });

  it('gibt gewöhnliche Ausgabe zeilenweise weiter – eine Fehlermeldung gehört ins Terminal', () => {
    const feed = new MonitorFeed();
    expect(feed.push('Traceback (most recent call last):\r\n  File "__main__')).toBe('Traceback (most recent call last):\n');
    expect(feed.push(`.py", line 3\r\n${M}P A -\r\nOSError\r\n`)).toBe('  File "__main__.py", line 3\nOSError\n');
    expect(feed.state.ports.A).toEqual({kind:'none', id:0});
  });

  it('schluckt die Meldung der Firmware zum Stoppen – auch zerschnitten und nach dem Stummschalten', () => {
    let changes = 0;
    const feed = new MonitorFeed(() => { changes++; });
    expect(feed.push(`${M}P A -\r\nThe program was sto`)).toBe('');
    feed.mute();
    expect(feed.push(`pped (SystemExit).\r\n${M}P B -\r\nnoch etwas\r\n`)).toBe('noch etwas\n');
    expect(changes).toBe(1);                                  // stumm: liest weiter mit, meldet aber nichts mehr
    expect(feed.state.ports.B).toEqual({kind:'none', id:0});
  });

  it('hält ein angefangenes Stück einer eigenen Zeile zurück, bis sie vollständig ist', () => {
    const feed = new MonitorFeed();
    expect(feed.push(`${M}P A m 48 1`)).toBe('');
    expect(feed.state.ports.A).toBeUndefined();
    expect(feed.push('5 0\r\n')).toBe('');
    expect(feed.state.ports.A?.angle).toBe(15);
  });

  it('merkt, wenn länger nichts mehr kommt', () => {
    let now = 1000;
    const feed = new MonitorFeed(() => {}, () => now);
    expect(feed.stale).toBe(false);          // noch nie etwas gekommen: nicht »eingefroren«, sondern am Laden
    feed.push(`${M}V 1\n`);
    now += 4000; expect(feed.stale).toBe(false);
    now += 2000; expect(feed.stale).toBe(true);
    feed.push(`${M}P A -\n`);
    expect(feed.stale).toBe(false);
  });
});

describe('Hub-Ansicht: Zeilen des Anzeige-Programms ohne offenes Fenster', () => {
  const M = MONITOR_MARK;

  it('lässt gewöhnliche Ausgabe sofort und unverändert durch – auch angefangene Zeilen', () => {
    const f = new StrayFilter();
    expect(f.push('Hallo')).toBe('Hallo');
    expect(f.push(' Welt\r\nzweite')).toBe(' Welt\r\nzweite');
    expect(f.push('')).toBe('');
  });

  it('verschluckt Zeilen mit dem Kennzeichen, auch wenn sie in Stücken kommen', () => {
    const f = new StrayFilter();
    expect(f.push(`vorher\r\n${M}P A m 49 1`)).toBe('vorher\r\n');
    expect(f.push('23 0')).toBe('');
    expect(f.push(`\r\n${M}H 7200 80 1 1 0 0 0\r\nnachher\r\n`)).toBe('nachher\r\n');
    expect(f.push(`${M}V 1\r\n${M}P B -\r\n`)).toBe('');
  });

  it('die ganze Ausgabe des Programms, in kleinen Stücken: nichts bleibt übrig', () => {
    const f = new StrayFilter();
    const text = [`${M}V 1`, `${M}P A m 49 -96 0`, `${M}P C c 61 21 36 52 31 WHITE`, `${M}H 7200 100 1 1 -5 0 0`].join('\r\n') + '\r\n';
    let rest = '';
    for (let i = 0; i < text.length; i += 3) rest += f.push(text.slice(i, i + 3));
    expect(rest).toBe('');
    expect(f.push('— danach wieder alles —')).toBe('— danach wieder alles —');
  });
});

describe('Hub-Ansicht: das Programm für den Hub', () => {
  // Das Paket lädt die WASM-Datei per fetch(); unter Node ist das ein Dateipfad, den fetch nicht kennt
  beforeAll(() => {
    vi.stubGlobal('fetch', async (path: string) => new Response(readFileSync(path), {headers:{'Content-Type':'application/wasm'}}));
  });
  afterAll(() => vi.unstubAllGlobals());

  it('lässt sich für den Hub übersetzen und bleibt klein', async () => {
    const res = await compileProgram(MONITOR_PROGRAM);
    expect(res.ok ? [] : res.errors).toEqual([]);
    if (res.ok){ expect(res.mpy[1]).toBe(6); expect(res.mpy.length).toBeLessThan(4000); }
  });

  // Ein nachgestelltes Pybricks: Die Uhr läuft nur in wait(). Was steckt, ändert sich unterwegs:
  // D wird nach 2 s abgezogen, B (ein Gerät, das sich nicht auslesen lässt) nach 2,5 s, an F kommt
  // nach 3 s ein Motor dazu. Das Lebenszeichen von Blockwerk
  // bleibt nach gut 3 s aus – das Programm muss sich danach von selbst beenden.
  const FAKE_PYBRICKS = String.raw`
import sys, types
clock = [0]
def plugged(port):
    t = clock[0]
    if port == 'A': return 48
    if port == 'B': return 37 if t < 2500 else None
    if port == 'C': return 61
    if port == 'D': return 62 if t < 2000 else None
    if port == 'E': return 63
    if port == 'F': return 49 if t >= 3000 else None
def need(port, *ids):
    if plugged(port) not in ids:
        raise OSError(19)
class Device:
    ids = ()
    def __init__(self, port):
        self.port = port
        need(port, *self.ids)
class PUPDevice(Device):
    ids = (37, 48, 49, 61, 62, 63)
    def info(self):
        need(self.port, *self.ids)
        return {'id': plugged(self.port)}
class Motor(Device):
    ids = (48, 49)
    def angle(self):
        need(self.port, *self.ids); return -90 + clock[0] // 100
    def speed(self):
        need(self.port, *self.ids); return 10
class Hsv:
    h, s, v = 350, 90, 80
class ColorSensor(Device):
    ids = (61,)
    def hsv(self): need(self.port, 61); return Hsv()
    def reflection(self): return 57
    def color(self): return 'Color.RED'
class UltrasonicSensor(Device):
    ids = (62,)
    def distance(self): need(self.port, 62); return 123
class ForceSensor(Device):
    ids = (63,)
    def force(self): need(self.port, 63); return 3.46
    def pressed(self): return True
class Battery:
    def voltage(self): return 7834
    def current(self): return 137
class Charger:
    def connected(self): return True
    def status(self): return 1
class Imu:
    def tilt(self): return (2, -3)
    def heading(self): return 90.6
class ThisHub:
    battery, charger, imu = Battery(), Charger(), Imu()
class Port:
    A, B, C, D, E, F = 'A', 'B', 'C', 'D', 'E', 'F'
class StopWatch:
    def __init__(self): self.start = clock[0]
    def time(self): return clock[0] - self.start
    def reset(self): self.start = clock[0]
beat = [0]
def read_input_byte():
    # alle 1500 ms ein Lebenszeichen, nach 3 s keines mehr
    if clock[0] <= 3300 and clock[0] - beat[0] >= 1500:
        beat[0] = clock[0]
        return HEARTBEAT
    return None
def wait(ms):
    clock[0] += ms
def module(name, **members):
    m = types.ModuleType(name); m.__dict__.update(members); sys.modules[name] = m
module('pybricks')
module('pybricks.hubs', ThisHub=ThisHub)
module('pybricks.iodevices', PUPDevice=PUPDevice)
module('pybricks.parameters', Port=Port)
module('pybricks.pupdevices', ColorSensor=ColorSensor, ForceSensor=ForceSensor, Motor=Motor, UltrasonicSensor=UltrasonicSensor)
module('pybricks.tools', StopWatch=StopWatch, read_input_byte=read_input_byte, wait=wait)
`.replace('HEARTBEAT', String(MONITOR_HEARTBEAT));

  it.skipIf(!python)('läuft gegen ein nachgestelltes Pybricks; Blockwerk liest genau diese Ausgabe', () => {
    const script = FAKE_PYBRICKS + MONITOR_PROGRAM + "\nimport sys\nsys.stderr.write('ende %d %d' % (clock[0], beat[0]))\n";
    const r = spawnSync(python!, ['-c', script], {encoding:'utf8', env:{...process.env, PYTHONIOENCODING:'utf-8'}});
    // endet von selbst: die Frist nach dem letzten Lebenszeichen, auf eine Runde genau
    expect(r.stderr).toMatch(/^ende \d+ \d+$/);
    const [end, lastBeat] = r.stderr.split(' ').slice(1).map(Number);
    expect(lastBeat).toBeGreaterThan(0);
    expect(end - lastBeat).toBeGreaterThanOrEqual(MONITOR_TIMEOUT_MS);
    expect(end - lastBeat).toBeLessThan(MONITOR_TIMEOUT_MS + 250);

    // jede Zeile trägt das Kennzeichen, und Blockwerk versteht jede einzelne
    // (unter Windows schreibt Python »\r\n«)
    const lines = r.stdout.split(/\r?\n/).filter(l => l.length > 0);
    expect(lines.length).toBeGreaterThan(20);
    for (const line of lines){
      expect(line.startsWith(MONITOR_MARK), line).toBe(true);
      expect(applyLine(emptyState(), line.slice(1)), line).toBe(true);
    }
    expect(lines[0]).toBe(`${MONITOR_MARK}V ${MONITOR_VERSION}`);
    // ein besetzter Anschluss wird nie als frei gemeldet, bevor er angesehen wurde
    for (const port of ['A', 'C', 'E']) expect(lines, port).not.toContain(`${MONITOR_MARK}P ${port} -`);
    expect(lines.indexOf(`${MONITOR_MARK}P B x 37`)).toBeLessThan(lines.indexOf(`${MONITOR_MARK}P B -`));

    // Stand am Ende, die Ausgabe in kleinen Stücken hineingereicht wie über Bluetooth
    const feed = new MonitorFeed();
    let rest = '';
    for (let i = 0; i < r.stdout.length; i += 7) rest += feed.push(r.stdout.slice(i, i + 7));
    expect(rest).toBe('');
    const {ports, hub, version} = feed.state;
    expect(version).toBe(MONITOR_VERSION);
    expect(ports.A).toMatchObject({kind:'motor', id:48, speed:10});
    expect(ports.A.angle).toBeGreaterThan(-10);                       // der Winkel ist mitgelaufen
    expect(lines).toContain(`${MONITOR_MARK}P B x 37`);                // erkannt, aber nicht auslesbar …
    expect(ports.B).toEqual({kind:'none', id:0});                     // … und trotzdem als abgezogen bemerkt
    expect(ports.C).toEqual({kind:'color', id:61, h:350, s:90, v:80, reflection:57, color:'RED'});
    expect(ports.D).toEqual({kind:'none', id:0});                     // unterwegs abgezogen
    expect(ports.E).toEqual({kind:'force', id:63, force:3.4, pressed:true});
    expect(ports.F).toMatchObject({kind:'motor', id:49});             // unterwegs eingesteckt
    expect(hub).toEqual({millivolts:7800, milliamps:120, plugged:true, charge:1, pitch:2, roll:-3, heading:90});
    // D war zuerst da, F zuerst frei
    expect(lines).toContain(`${MONITOR_MARK}P D u 62 123`);
    expect(lines).toContain(`${MONITOR_MARK}P F -`);
  });
});
