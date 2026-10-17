import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { at, B, cmp, EXAMPLES, S, seq, setup, ws_, type WorkspaceState } from '../src/examples';
import { N, T } from '../src/toolbox';
import { changePart, mirrorPartner, MOUNT_AREA, mountsFor, placeSensor, rotateSensor, saveMounts, swapMounts } from '../src/sim/build';
import { wheelCenter } from '../src/sim/parts';
import { charPixels, iconPixels, numberPixels } from '../src/sim/hubDisplay';
import { colorSensorPoints, defaultMounts, describeRobot, robotFromWorkspace, robotParts, swapPorts, type SimRobot } from '../src/sim/robot';
import { Runner } from '../src/sim/runner';
import { Simulation } from '../src/sim/simulation';
import { colorAt, coneDistance, reflectionAt, type Obstacle, type Track } from '../src/sim/world';

/** Eine Bahn aus einer Regel: Welche Farbe hat der Bildpunkt (x, y)? */
function track(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Track {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set([...color(x, y), 255], (y * width + x) * 4);
  return {width, height, data};
}
const WHITE: [number, number, number] = [255, 255, 255], BLACK: [number, number, number] = [0, 0, 0];
const box = (x: number, y: number, w = 100, h = 100): Obstacle => ({id:1, x, y, w, h});

/** Lässt ein Programm `ms` Millisekunden im Simulator laufen. */
async function simulate(state: WorkspaceState, ms: number, prepare?: (sim: Simulation) => void){
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, ws);
    const sim = new Simulation(robotFromWorkspace(ws)), out: string[] = [], errors: string[] = [];
    prepare?.(sim);
    const runner = new Runner(ws, sim, {print:t => out.push(t), error:m => errors.push(m)});
    await runner.start();
    await runner.advance(ms);
    const running = runner.running;
    runner.stop();
    return {sim, out:out.join(''), errors, running, ignored:[...runner.ignored]};
  } finally { ws.dispose(); }
}
const program = (...blocks: ReturnType<typeof B>[]) => ws_([at(seq(B('pb_start'), ...blocks), 0, 0)]);
const robotOf = (state: WorkspaceState) => {
  const ws = new Blockly.Workspace();
  try { Blockly.serialization.workspaces.load(state, ws); return robotFromWorkspace(ws); } finally { ws.dispose(); }
};

describe('Roboter aus dem Programm', () => {
  it('erkennt Räder und Sensoren', () => {
    expect(robotOf(EXAMPLES.linie())).toMatchObject({drive:{left:'A', right:'B', wheel:56, axle:112}, colors:['C'], ultra:null});
    expect(robotOf(EXAMPLES.wand())).toMatchObject({ultra:'D', force:['E'], colors:[]});
    expect(describeRobot(robotOf(EXAMPLES.wand()))).toBe('Räder an A und B · Abstandssensor an D · Kraftsensor an E');
  });
  it('die Übersicht über der Bahn: je Teil ein kurzes Schildchen, ausführlich im Tooltip', () => {
    expect(robotParts(robotOf(EXAMPLES.wand()))).toEqual([
      {kind:'wheels', text:'Räder A·B', title:'Fahrbasis: Räder an A und B'},
      {kind:'ultra', text:'Abstand D', title:'Abstandssensor an D'},
      {kind:'force', text:'Kraft E', title:'Kraftsensor an E'}]);
    expect(robotParts(robotOf(EXAMPLES.motor())).map(p => p.text)).toEqual(['keine Räder', 'Motor C']);
    // zwei einzelne Motoren als Räder: Im Tooltip steht, dass der linke gespiegelt sitzt
    const direct = robotParts(robotOf(program(B('pb_motor_run', {PORT:'A'}, {SPEED:N(1)}), B('pb_motor_run', {PORT:'B'}, {SPEED:N(1)}), B('pb_print', null, {TEXT:{block:B('pb_reflection', {PORT:'C'})}}))));
    expect(direct.map(p => p.text)).toEqual(['Räder A·B', 'Farbe C']);
    expect(direct[0].title).toContain('gespiegelt');
  });
  it('ohne Fahrblöcke gibt es keine Räder', () => {
    const robot = robotOf(EXAMPLES.motor());
    expect(robot.drive).toBeNull();
    expect(robot.motors).toEqual(['C']);
    expect(describeRobot(robot)).toBe('keine Räder · Motor an C');
  });
  it('Fahrblöcke ohne »Fahrbasis einrichten« nehmen die Vorgabe', () => {
    expect(robotOf(program(B('pb_drive_straight', null, {DIST:N(100)}))).drive).toEqual({left:'A', right:'B', wheel:56, axle:112, leftDir:-1, rightDir:1, gyro:true, direct:false, implicit:true});
  });
  it('ohne Fahrbasis sind zwei einzelne Motoren die Räder', () => {
    const robot = robotOf(program(B('pb_motor_run', {PORT:'B'}, {SPEED:N(500)}), B('pb_motor_run', {PORT:'A'}, {SPEED:N(500)}), B('pb_motor_run', {PORT:'C'}, {SPEED:N(500)})));
    expect(robot.drive).toMatchObject({left:'A', right:'B', direct:true});
    expect(robot.motors).toEqual(['C']);
    expect(describeRobot(robot)).toContain('Räder an den Motoren A (links, gespiegelt eingebaut) und B (rechts)');
  });
  it('Farbsensoren sitzen nebeneinander um die Mitte, 40 mm auseinander', () => {
    expect(colorSensorPoints(1).map(p => p.y)).toEqual([0]);
    expect(colorSensorPoints(2).map(p => p.y)).toEqual([-20, 20]);
    expect(colorSensorPoints(4).map(p => p.y)).toEqual([-60, -20, 20, 60]);
  });
  it('nimmt höchstens vier Farbsensoren', () => {
    const robot = robotOf(program(...'ABCDE'.split('').map(p => B('pb_print', null, {TEXT:{block:B('pb_reflection', {PORT:p})}}))));
    expect(robot.colors).toEqual(['A', 'B', 'C', 'D']);
    expect(robot.notes[0]).toContain('E');
  });
  it('zählt nur, was am Programm hängt', () => {
    expect(robotOf(ws_([at(B('pb_drive_straight', null, {DIST:N(100)}), 0, 0)])).drive).toBeNull();
  });
});

describe('Umbauen', () => {
  const robot = (colors: string[], more: Partial<SimRobot> = {}): SimRobot => ({drive:null, colors, ultra:null, force:[], motors:[], notes:[], ...more});
  const two = robot(['C', 'D'], {ultra:'E'}), usual = defaultMounts(two);
  const free = {grid:false, symmetry:false}, grid = {grid:true, symmetry:false}, mirror = {grid:true, symmetry:true};
  it('wer gegenüber sitzt', () => {
    expect(mirrorPartner(two, 'C')).toBe('D'); expect(mirrorPartner(two, 'D')).toBe('C');
    expect(mirrorPartner(two, 'E')).toBeNull();
    const three = robot(['A', 'B', 'C'], {force:['E', 'F']});
    expect(mirrorPartner(three, 'A')).toBe('C'); expect(mirrorPartner(three, 'B')).toBeNull();
    expect(mirrorPartner(three, 'F')).toBe('E');
  });
  it('ohne Raster auf den Millimeter, mit Raster auf die Noppe (8 mm)', () => {
    expect(placeSensor(two, {}, 'C', {x:101.4, y:-37.2}, usual, free)).toEqual({C:{x:101, y:-37}});
    expect(placeSensor(two, {}, 'C', {x:101.4, y:-37.2}, usual, grid)).toEqual({C:{x:104, y:-40}});
    // der andere Sensor bleibt, wo er ist
    expect(placeSensor(two, {D:{x:90, y:30}}, 'C', {x:80, y:-16}, usual, grid)).toEqual({C:{x:80, y:-16}, D:{x:90, y:30}});
  });
  it('bleibt im erlaubten Bereich', () => {
    expect(placeSensor(two, {}, 'C', {x:900, y:-900}, usual, grid)).toEqual({C:{x:MOUNT_AREA.front, y:-MOUNT_AREA.side}});
    expect(placeSensor(two, {}, 'C', {x:-900, y:900}, usual, free)).toEqual({C:{x:MOUNT_AREA.back, y:MOUNT_AREA.side}});
  });
  it('Symmetrie: Der Sensor gegenüber wandert spiegelbildlich mit', () => {
    expect(placeSensor(two, {}, 'C', {x:110, y:-30}, usual, mirror)).toEqual({C:{x:112, y:-32}, D:{x:112, y:32}});
    expect(placeSensor(two, {}, 'D', {x:96, y:50}, usual, {grid:false, symmetry:true})).toEqual({D:{x:96, y:50}, C:{x:96, y:-50}});
    // auf der Mittellinie lägen beide aufeinander: Sie bleiben einen Rasterschritt daneben, jeder auf seiner Seite
    expect(placeSensor(two, {}, 'C', {x:96, y:1}, usual, mirror)).toEqual({C:{x:96, y:-8}, D:{x:96, y:8}});
    expect(placeSensor(two, {}, 'D', {x:96, y:0}, usual, mirror)).toEqual({D:{x:96, y:8}, C:{x:96, y:-8}});
  });
  it('Umschalt: nur vor und zurück oder nur seitlich – was fest ist, rastet auch nicht ein', () => {
    expect(placeSensor(two, {}, 'C', {x:110, y:-33}, usual, {...grid, fixed:{y:-20}})).toEqual({C:{x:112, y:-20}});
    expect(placeSensor(two, {}, 'C', {x:110, y:-33}, usual, {...mirror, fixed:{x:100}})).toEqual({C:{x:100, y:-32}, D:{x:100, y:32}});
  });
  it('drehen: in Schritten von 15 Grad, auf Wunsch frei', () => {
    const turn = (angle: number, step: number) => rotateSensor(two, {}, 'E', angle, usual, {step, symmetry:false}).E;
    expect(turn(22, 15)).toEqual({...usual.E, angle:15});
    expect(turn(23, 15)).toEqual({...usual.E, angle:30});
    expect(turn(50, 45)).toEqual({...usual.E, angle:45});
    expect(turn(22.4, 0)).toEqual({...usual.E, angle:22});
    // geradeaus steht kein Winkel dabei; der Winkel bleibt zwischen −179 und 180 Grad
    expect(turn(4, 15)).toEqual(usual.E);
    expect(turn(190, 15).angle).toBe(-165); expect(turn(-180, 15).angle).toBe(180); expect(turn(370, 0).angle).toBe(10);
  });
  it('drehen mit Symmetrie: Der Sensor gegenüber dreht spiegelbildlich mit', () => {
    const turned = rotateSensor(two, {C:{x:96, y:-32}, D:{x:96, y:32}}, 'C', -30, usual, {step:15, symmetry:true});
    expect(turned).toEqual({C:{x:96, y:-32, angle:-30}, D:{x:96, y:32, angle:30}});
    // ohne Symmetrie bleibt der andere, wie er ist
    expect(rotateSensor(two, turned, 'C', 0, usual, {step:15, symmetry:false})).toEqual({C:{x:96, y:-32}, D:{x:96, y:32, angle:30}});
    // beim Versetzen behält der Sensor seine Drehung, der gegenüber bekommt die gespiegelte
    expect(placeSensor(two, {C:{x:96, y:-32, angle:45}}, 'C', {x:104, y:-40}, usual, mirror)).toEqual({C:{x:104, y:-40, angle:45}, D:{x:104, y:40, angle:-45}});
    // und gemerkt wird sie auch
    expect(mountsFor(two, saveMounts(two, {}, turned))).toEqual(turned);
  });
  it('Plätze gelten nur für die Sensoren, für die sie eingestellt wurden', () => {
    // zwei Farbsensoren und der Abstandssensor sind versetzt
    const saved = saveMounts(two, {}, {C:{x:128, y:-48}, D:{x:128, y:48}, E:{x:60, y:0}});
    expect(mountsFor(two, saved)).toEqual({C:{x:128, y:-48}, D:{x:128, y:48}, E:{x:60, y:0}});
    // das Programm benutzt nur noch einen Farbsensor: Der sitzt wieder am üblichen Platz, in der Mitte …
    const one = robot(['C'], {ultra:'E'});
    expect(mountsFor(one, saved)).toEqual({E:{x:60, y:0}});   // … der Abstandssensor bleibt, wo er war
    expect(defaultMounts(one).C.y).toBe(0);
    // den einzelnen versetzen ändert nichts an dem, was für die zwei gemerkt ist
    const both = saveMounts(one, saved, {C:{x:96, y:16}, E:{x:60, y:0}});
    expect(mountsFor(one, both)).toEqual({C:{x:96, y:16}, E:{x:60, y:0}});
    expect(mountsFor(two, both)).toEqual({C:{x:128, y:-48}, D:{x:128, y:48}, E:{x:60, y:0}});
    // alle zurückgesetzt: Für diese Sensoren ist nichts mehr gemerkt
    expect(mountsFor(two, saveMounts(two, both, {}))).toEqual({});
    // Unsinn im Speicher schadet nicht
    expect(mountsFor(two, {'color:C,D':{C:{x:'links'} as never}, 'ultra:E':null as never})).toEqual({});
  });
  it('Symmetrie: Ein einzelner Sensor rastet auf der Mittellinie ein', () => {
    expect(placeSensor(two, {}, 'E', {x:80, y:6}, usual, {grid:false, symmetry:true})).toEqual({E:{x:80, y:0}});
    expect(placeSensor(two, {}, 'E', {x:80, y:6}, usual, free)).toEqual({E:{x:80, y:6}});
    // mit Raster bleibt die Noppe neben der Mitte erreichbar
    expect(placeSensor(two, {}, 'E', {x:80, y:7}, usual, mirror)).toEqual({E:{x:80, y:8}});
    expect(placeSensor(two, {}, 'E', {x:80, y:3}, usual, mirror)).toEqual({E:{x:80, y:0}});
  });
});

describe('Sensoren', () => {
  const line = track(200, 100, (_, y) => y >= 40 && y < 60 ? BLACK : WHITE);
  it('Reflexion: hell, dunkel und dazwischen auf der Kante', () => {
    expect(reflectionAt(line, {x:100, y:10}, 5)).toBe(100);
    expect(reflectionAt(line, {x:100, y:50}, 5)).toBe(0);
    const edge = reflectionAt(line, {x:100, y:40}, 5);
    expect(edge).toBeGreaterThan(10); expect(edge).toBeLessThan(90);
    expect(reflectionAt(line, {x:-50, y:50}, 5)).toBe(100);   // neben der Bahn: weißer Tisch
  });
  it('Farben', () => {
    const colors = track(60, 10, (x) => x < 10 ? [220, 30, 30] : x < 20 ? [30, 170, 60] : x < 30 ? [30, 60, 220] : x < 40 ? [240, 220, 30] : x < 50 ? BLACK : WHITE);
    expect([5, 15, 25, 35, 45, 55].map(x => colorAt(colors, {x, y:5}, 2))).toEqual(['RED', 'GREEN', 'BLUE', 'YELLOW', 'BLACK', 'WHITE']);
  });
  it('Abstandssensor: sieht, was im Kegel liegt', () => {
    const from = {x:0, y:0};
    expect(coneDistance(from, 0, 17.5, 2000, [box(350, 0)])).toBeCloseTo(300);
    // seitlich versetzt, aber noch im Kegel
    expect(coneDistance(from, 0, 17.5, 2000, [box(350, 120)])).not.toBeNull();
    // weit daneben, dahinter, zu weit weg
    expect(coneDistance(from, 0, 17.5, 2000, [box(350, 300)])).toBeNull();
    expect(coneDistance(from, 0, 17.5, 2000, [box(-350, 0)])).toBeNull();
    expect(coneDistance(from, 0, 17.5, 200, [box(350, 0)])).toBeNull();
    // ein schmales Hindernis zwischen zwei Strahlen
    expect(coneDistance(from, 0, 17.5, 2000, [box(1000, 31, 2, 2)])).not.toBeNull();
  });
});

describe('Fahren', () => {
  it('Quadrat: kommt wieder am Anfang an', async () => {
    const {sim, running} = await simulate(EXAMPLES.quadrat(), 20000);
    expect(running).toBe(false);
    expect(sim.pose.x).toBeCloseTo(0, 3); expect(sim.pose.y).toBeCloseTo(0, 3);
    expect(sim.pose.heading).toBeCloseTo(360, 3);
    expect(sim.distance).toBeCloseTo(800, 3);
  });
  it('geradeaus und drehen: Richtung und Dauer', async () => {
    const drive = program(setup(), B('pb_drive_turn', null, {ANGLE:N(90)}), B('pb_drive_straight', null, {DIST:N(100)}));
    // 90 Grad mit 150 Grad/s und 100 mm mit 200 mm/s: nach 1,1 s fertig – positiv dreht nach rechts (y wächst nach unten)
    const end = await simulate(drive, 1200);
    expect(end.running).toBe(false);
    expect(end.sim.pose).toMatchObject({x:expect.closeTo(0, 3), y:expect.closeTo(100, 3)});
    expect((await simulate(drive, 900)).running).toBe(true);
  });
  it('der Maßstab des Roboters streckt die Strecke auf der Bahn', async () => {
    const {sim} = await simulate(program(setup(), B('pb_drive_straight', null, {DIST:N(100)})), 2000, s => { s.scale = 2.5; });
    expect(sim.pose.x).toBeCloseTo(250, 3);
    expect(sim.distance).toBeCloseTo(100, 3);
  });
  it('Kurve: ein Viertelkreis nach rechts', async () => {
    const {sim} = await simulate(program(setup(), B('pb_drive_arc', null, {RADIUS:N(100), ANGLE:N(90)})), 5000);
    expect(sim.pose.x).toBeCloseTo(100, 0); expect(sim.pose.y).toBeCloseTo(100, 0);
    expect(sim.pose.heading).toBeCloseTo(90, 3);
  });
  it('ohne Räder bewegt sich nichts', async () => {
    const {sim, running} = await simulate(EXAMPLES.motor(), 5000);
    expect(running).toBe(false);
    expect(sim.pose).toEqual({x:0, y:0, heading:0});
    expect(sim.motor('C').angle).toBeCloseTo(0);
  });
  it('einzelne Motoren als Räder: der linke läuft gespiegelt', async () => {
    const run = (a: number, b: number) => program(B('pb_motor_run', {PORT:'A'}, {SPEED:N(a)}), B('pb_motor_run', {PORT:'B'}, {SPEED:N(b)}), B('pb_wait', null, {MS:N(1000)}));
    // 360 Grad/s am 56-mm-Rad sind eine Radumdrehung je Sekunde: 176 mm
    const ahead = (await simulate(run(-360, 360), 1000)).sim;
    expect(ahead.pose.x).toBeCloseTo(Math.PI * 56, 0); expect(ahead.pose.heading).toBeCloseTo(0, 3);
    // beide »vorwärts«: Der Roboter dreht sich auf der Stelle nach links
    const spin = (await simulate(run(360, 360), 1000)).sim;
    expect(spin.pose.x).toBeCloseTo(0, 3); expect(spin.pose.heading).toBeCloseTo(-180, 0);
    // nach dem Programm steht er
    const after = (await simulate(run(-360, 360), 3000)).sim;
    expect(after.pose.x).toBeLessThan(180);
  });
  it('Linienfolger bleibt an der Kante der Linie', async () => {
    // schwarzer Streifen von y = 190 bis 210; der Sensor (100 mm vor der Achse) beginnt knapp darüber im Weißen
    const line = track(1600, 400, (_, y) => y >= 190 && y < 210 ? BLACK : WHITE);
    const {sim, running} = await simulate(EXAMPLES.linie(), 10000, s => { s.track = line; s.pose = {x:100, y:175, heading:0}; });
    expect(running).toBe(true);
    const sensor = sim.colorPoints()[0];
    expect(sensor.x).toBeGreaterThan(1000);
    expect(Math.abs(sensor.y - 190)).toBeLessThan(10);
  });
  it('hält vor dem Hindernis an, sobald der Abstandssensor es sieht', async () => {
    const state = program(setup(), B('pb_drive_drive', null, {SPEED:N(150), RATE:N(0)}),
      B('pb_wait_until', null, {COND:{block:cmp('LT', B('pb_distance', {PORT:'D'}), 100)}}), B('pb_drive_stop', {MODE:'brake'}),
      B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}}));
    const {sim, out, running} = await simulate(state, 20000, s => { s.obstacles = [box(800, 0)]; });
    expect(running).toBe(false);
    const seen = Number(out);
    expect(seen).toBeLessThan(100); expect(seen).toBeGreaterThan(95);
    // Sensor 24 mm vor der Achse, Hindernis beginnt bei x = 750
    expect(sim.pose.x).toBeCloseTo(750 - 24 - seen, 0);
  });
  it('der Rand der Bahn hält den Roboter auf – Sensoren bemerken ihn nicht', async () => {
    const field = track(1000, 600, () => WHITE);
    const state = program(setup(), B('pb_drive_straight', null, {DIST:N(2000)}),
      B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}}), B('pb_print', null, {TEXT:{block:B('pb_force_pressed', {PORT:'E'})}}));
    const place = (fence: Simulation['fence']) => (s: Simulation) => { s.track = field; s.pose = {x:300, y:300, heading:0}; s.fence = fence; };
    // der Stoßkreis (70 mm, 18 mm hinter der Achse) bleibt auf der Bahn: Die Achse kommt bis 948
    const held = await simulate(state, 4000, place('hidden'));
    expect(held.sim.blocked).toBe(true);
    expect(held.sim.pose.x).toBeLessThanOrEqual(948); expect(held.sim.pose.x).toBeGreaterThan(946);
    // … und weder Abstands- noch Kraftsensor merken etwas davon
    const after = await simulate(state, 12000, place('hidden'));
    expect(after.out).toBe('2000\nFalse\n');
    // ohne Rand fährt er von der Bahn herunter
    const free = await simulate(state, 6000, place('off'));
    expect(free.sim.pose.x).toBeGreaterThan(1300); expect(free.sim.blocked).toBe(false);
  });
  it('hohe und niedrige Wand: Die hohe sehen Taster und Abstandssensor, die niedrige nur der Taster', async () => {
    const field = track(1000, 600, () => WHITE);
    const state = program(setup(), B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}}), B('pb_drive_straight', null, {DIST:N(2000)}),
      B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}}), B('pb_print', null, {TEXT:{block:B('pb_force_pressed', {PORT:'E'})}}));
    const run = async (fence: Simulation['fence']) => (await simulate(state, 12000, s => { s.track = field; s.pose = {x:300, y:300, heading:0}; s.fence = fence; }));
    // vom Start aus: Der Abstandssensor sitzt 24 mm vor der Achse, die Wand steht bei 1000
    const high = await run('high');
    expect(high.out).toBe('676\n28\nTrue\n');
    expect(high.sim.pose.x).toBeLessThanOrEqual(948); expect(high.sim.pose.x).toBeGreaterThan(946);
    // über die niedrige Wand schaut der Abstandssensor hinweg – der Taster stößt trotzdem an
    expect((await run('low')).out).toBe('2000\n2000\nTrue\n');
    expect((await run('hidden')).out).toBe('2000\n2000\nFalse\n');
    expect((await run('off')).out).toBe('2000\n2000\nFalse\n');
  });
  it('die hohe Wand steht ringsum: auch seitlich und hinter dem Roboter', async () => {
    const field = track(1000, 600, () => WHITE);
    const look = async (heading: number) => Number((await simulate(program(B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}})), 100,
      s => { s.track = field; s.pose = {x:500, y:300, heading}; s.fence = 'high'; })).out);
    expect(await look(0)).toBe(476);     // nach rechts: 1000 − 524
    expect(await look(90)).toBe(276);    // nach unten: 600 − 324
    expect(await look(180)).toBe(476);   // nach links: 476 − 0
    expect(await look(-90)).toBe(276);
  });
  it('am Rand geht es nicht weiter hinaus, zurück aber immer', async () => {
    const field = track(1000, 600, () => WHITE);
    // der Roboter steht schon halb über der Kante (von Hand dorthin gestellt)
    const over = (dist: number) => simulate(program(setup(), B('pb_drive_straight', null, {DIST:N(dist)})), 2000, s => { s.track = field; s.pose = {x:980, y:300, heading:0}; });
    expect((await over(100)).sim.pose.x).toBe(980);
    expect((await over(-100)).sim.pose.x).toBeCloseTo(880, 3);
    // drehen auf der Stelle geht nah am Rand auch – solange er dabei nicht über die Kante ragt (die Achse liegt vorn im
    // Hub, das Heck schwenkt aus: Quer zur Kante reicht der Stoßkreis von hier aus genau bis an sie heran)
    const turned = await simulate(program(setup(), B('pb_drive_turn', null, {ANGLE:N(90)})), 2000, s => { s.track = field; s.pose = {x:930, y:300, heading:0}; });
    expect(turned.sim.pose.heading).toBeCloseTo(90, 3);
  });
  it('fährt nicht in ein Hindernis hinein', async () => {
    const {sim} = await simulate(program(setup(), B('pb_drive_straight', null, {DIST:N(1000)})), 3000, s => { s.obstacles = [box(400, 0)]; });
    expect(sim.blocked).toBe(true);
    // das Hindernis beginnt bei 350, der Stoßkreis reicht 52 mm vor die Achse
    expect(sim.pose.x).toBeLessThanOrEqual(298); expect(sim.pose.x).toBeGreaterThan(290);
  });
});

describe('Programm', () => {
  it('Variablen, Schleifen und Ausgabe', async () => {
    const v = {VAR:{id:'z'}};
    const state = ws_([at(seq(B('pb_start'),
      B('controls_repeat_ext', null, {TIMES:N(3), DO:S(B('math_change', v, {DELTA:N(2)}))}),
      B('controls_if', null, {IF0:{block:cmp('EQ', B('variables_get', v), 6)}, DO0:S(B('pb_print', null, {TEXT:T('sechs')}))}),
      B('pb_print', null, {TEXT:{block:B('text_join', null, {ADD0:T('z = '), ADD1:{block:B('variables_get', v)}}, {itemCount:2})}})), 0, 0)],
      [{name:'z', id:'z'}]);
    expect((await simulate(state, 1000)).out).toBe('sechs\nz = 6\n');
  });
  it('»abbrechen« beendet eine Schleife', async () => {
    const v = {VAR:{id:'z'}};
    const state = ws_([at(seq(B('pb_start'),
      B('controls_whileUntil', {MODE:'WHILE'}, {BOOL:{block:B('logic_boolean', {BOOL:'TRUE'})}, DO:S(B('math_change', v, {DELTA:N(1)}),
        B('controls_if', null, {IF0:{block:cmp('GTE', B('variables_get', v), 5)}, DO0:S(B('controls_flow_statements', {FLOW:'BREAK'}))}))}),
      B('pb_print', null, {TEXT:{block:B('variables_get', v)}})), 0, 0)], [{name:'z', id:'z'}]);
    const {out, running} = await simulate(state, 1000);
    expect(out).toBe('5\n'); expect(running).toBe(false);
  });
  it('eigener Block: Beispiel fährt das Quadrat', async () => {
    const {sim, running} = await simulate(EXAMPLES.funktion(), 20000);
    expect(running).toBe(false);
    expect(sim.distance).toBeCloseTo(800, 3); expect(sim.pose.heading).toBeCloseTo(360, 3);
  });
  it('mehrere Ereignisse laufen nebeneinander und schicken sich Nachrichten', async () => {
    const state = ws_([
      at(seq(B('pb_start'), B('pb_wait', null, {MS:N(100)}), B('pb_send_message', {NAME:'los'}), B('pb_wait', null, {MS:N(100)}), B('pb_print', null, {TEXT:T('Start fertig')})), 0, 0),
      at(seq(B('pb_when_message', {NAME:'los'}), B('pb_print', null, {TEXT:T('empfangen')})), 300, 0),
      at(seq(B('pb_when', null, {COND:{block:cmp('GT', B('pb_timer'), 50)}}), B('pb_print', null, {TEXT:T('Uhr')})), 600, 0)]);
    const {out, sim} = await simulate(state, 1000);
    expect(out).toBe('Uhr\nempfangen\nStart fertig\n');
    expect(sim.time).toBe(1000);   // die Zeit läuft nur einmal, nicht je Ereignis
  });
  it('Lichtmatrix: Bild, Zahl, Text und aus', async () => {
    expect((await simulate(program(B('pb_display_icon', {ICON:'HEART'})), 100)).sim.display).toEqual(iconPixels('HEART'));
    expect(iconPixels('HEART').filter(p => p).length).toBe(16);
    expect((await simulate(program(B('pb_display_number', null, {NUM:N(42)})), 100)).sim.display).toEqual(numberPixels(42));
    expect((await simulate(program(B('pb_display_icon', {ICON:'HEART'}), B('pb_display_off')), 100)).sim.display.some(p => p)).toBe(false);
    // jeder Buchstabe steht 500 ms, dann 50 ms Pause – das Programm wartet so lange
    const text = program(B('pb_display_text', null, {TEXT:T('Hi')}), B('pb_print', null, {TEXT:T('fertig')}));
    expect((await simulate(text, 300)).sim.display).toEqual(charPixels('H'));
    expect((await simulate(text, 800)).sim.display).toEqual(charPixels('I'));
    expect((await simulate(text, 1000)).out).toBe('');
    expect((await simulate(text, 1200)).out).toBe('fertig\n');
  });
  it('Zahlen auf der Lichtmatrix: ein- und zweistellig, negativ, zu groß', () => {
    expect(numberPixels(7)).toEqual(charPixels('7'));
    expect(numberPixels(-7).slice(10, 12)).toEqual([100, 100]);
    expect(numberPixels(-42)[12]).toBe(50);
    expect(numberPixels(100)).toEqual(charPixels('>'));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => numberPixels(10 + d).join())).size).toBe(10);
  });
  it('Statuslicht und Tasten des Hubs', async () => {
    const state = program(B('pb_light', {COLOR:'RED'}), B('pb_wait_until', null, {COND:{block:B('pb_button', {BUTTON:'LEFT'})}}), B('pb_light', {COLOR:'GREEN'}));
    expect((await simulate(state, 500)).sim.light).toBe('RED');
    // ohne Block »Statuslicht« leuchtet die mittlere Taste grün, solange das Programm läuft; »aus« schaltet sie ab
    expect((await simulate(program(B('pb_wait', null, {MS:N(100)})), 50)).sim.light).toBe('GREEN');
    expect((await simulate(program(B('pb_light', {COLOR:'OFF'})), 50)).sim.light).toBeNull();
    const pressed = await simulate(state, 500, s => { s.buttons.add('LEFT'); });
    expect(pressed.sim.light).toBe('GREEN'); expect(pressed.running).toBe(false);
    expect((await simulate(state, 500, s => { s.buttons.add('RIGHT'); })).sim.light).toBe('RED');
  });
  it('Kraftsensor: von Hand gedrückt oder am Hindernis', async () => {
    // »Halt vor der Wand«: wartet auf den Kraftsensor, fährt dann bis 100 mm vor das Hindernis
    const waiting = await simulate(EXAMPLES.wand(), 3000, s => { s.obstacles = [box(800, 0)]; });
    expect(waiting.sim.pose.x).toBe(0); expect(waiting.running).toBe(true);
    const driven = await simulate(EXAMPLES.wand(), 20000, s => { s.obstacles = [box(800, 0)]; s.forceHeld.add('E'); });
    expect(driven.running).toBe(false); expect(driven.sim.ultrasonic('D')).toBeLessThan(100);
    // fährt gegen das Hindernis: Der Sensor vorn wird gedrückt
    const bump = program(setup(), B('pb_drive_drive', null, {SPEED:N(200), RATE:N(0)}),
      B('pb_wait_until', null, {COND:{block:B('pb_force_pressed', {PORT:'E'})}}), B('pb_drive_stop', {MODE:'brake'}),
      B('pb_print', null, {TEXT:{block:B('pb_force', {PORT:'E'})}}));
    const hit = await simulate(bump, 10000, s => { s.obstacles = [box(400, 0)]; });
    expect(hit.out).toBe('10\n'); expect(hit.running).toBe(false);
    expect(hit.sim.pose.x).toBeGreaterThan(230);
  });
  it('versetzte Sensoren sehen an ihrem neuen Platz', async () => {
    const line = track(400, 200, (_, y) => y >= 130 && y < 150 ? BLACK : WHITE);
    const state = program(B('pb_print', null, {TEXT:{block:B('pb_reflection', {PORT:'C'})}}));
    expect((await simulate(state, 100, s => { s.track = line; s.pose = {x:50, y:100, heading:0}; })).out).toBe('100\n');
    // 40 mm nach rechts versetzt: Bei Blick nach rechts ist das unten – über der Linie
    const moved = await simulate(state, 100, s => { s.track = line; s.pose = {x:50, y:100, heading:0}; s.mounts = {C:{x:100, y:40}}; });
    expect(moved.out).toBe('0\n');
    expect(moved.sim.colorPoints()[0]).toMatchObject({x:expect.closeTo(150, 3), y:expect.closeTo(140, 3)});
    // der Abstandssensor misst ab seinem Platz
    const far = program(B('pb_print', null, {TEXT:{block:B('pb_distance', {PORT:'D'})}}));
    expect((await simulate(far, 100, s => { s.obstacles = [box(550, 0)]; })).out).toBe('476\n');
    expect((await simulate(far, 100, s => { s.obstacles = [box(550, 0)]; s.mounts = {D:{x:0, y:0}}; })).out).toBe('500\n');
    // … und in seine Richtung: nach rechts gedreht sieht er das Hindernis rechts neben dem Roboter, nicht mehr das vorn
    const beside = (mounts: Simulation['mounts']) => simulate(far, 100, s => { s.obstacles = [box(85, 300)]; s.mounts = mounts; });
    expect((await beside({})).out).toBe('2000\n');
    expect((await beside({D:{x:85, y:0, angle:90}})).out).toBe('250\n');
    expect((await simulate(far, 100, s => { s.obstacles = [box(550, 0)]; s.mounts = {D:{x:85, y:0, angle:90}}; })).out).toBe('2000\n');
    // ein Platz für einen Anschluss, an dem das Programm nichts kennt, zählt nicht
    expect((await simulate(state, 100, s => { s.mounts = {F:{x:0, y:0}}; })).sim.mount('F')).toBeNull();
  });
  it('Piepton: meldet Ton und Dauer und wartet so lange', async () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(program(B('pb_beep', null, {FREQ:N(880), DUR:N(200)}), B('pb_print', null, {TEXT:T('danach')})), ws);
    const beeps: number[][] = [], out: string[] = [];
    const runner = new Runner(ws, new Simulation(robotFromWorkspace(ws)), {print:t => out.push(t), beep:(f, ms) => beeps.push([f, ms])});
    await runner.start(); await runner.advance(150);
    expect(beeps).toEqual([[880, 200]]); expect(out).toEqual([]);
    await runner.advance(100); ws.dispose();
    expect(out).toEqual(['danach\n']);
  });
  it('Steuerfeld steuert den Roboter', async () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(EXAMPLES.steuerfeld(), ws);
    const sim = new Simulation(robotFromWorkspace(ws));
    const runner = new Runner(ws, sim, {print:() => {}, pad:(name) => name === 'y' ? 100 : name === 'x' ? 0 : false});
    await runner.start(); await runner.advance(1000); runner.stop(); ws.dispose();
    // Joystick ganz vorn: 300 mm/s
    expect(sim.pose.x).toBeGreaterThan(280); expect(sim.pose.x).toBeLessThan(300.001);
  });
  it('ein eigener Block, der sich endlos selbst aufruft, bricht mit einem Fehler ab', async () => {
    const state = ws_([
      at(B('procedures_defnoreturn', {NAME:'Endlos'}, {STACK:S(B('procedures_callnoreturn', null, null, {name:'Endlos'}))}), 0, 0),
      at(seq(B('pb_start'), B('procedures_callnoreturn', null, null, {name:'Endlos'})), 0, 200)]);
    const {errors, running} = await simulate(state, 100);
    expect(running).toBe(false);
    expect(errors).toEqual([expect.stringContaining('maximum recursion depth exceeded')]);
  });
  it('ein Ereignis ohne Blöcke darunter startet nichts', async () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(ws_([at(B('pb_start'), 0, 0)]), ws);
    const runner = new Runner(ws, new Simulation(robotFromWorkspace(ws)), {print:() => {}});
    await runner.start(); ws.dispose();
    expect(runner.tasks).toBe(0); expect(runner.running).toBe(false);
  });
  it('eine endlose Schleife ohne Warten hält die Uhr nicht an', async () => {
    const {sim, running} = await simulate(program(B('pb_forever')), 500);
    expect(running).toBe(true); expect(sim.time).toBe(500);
  });
  it('meldet einen Fehler im Programm samt Block', async () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(program(B('pb_print', null, {TEXT:{block:Object.assign(B('math_arithmetic', {OP:'DIVIDE'}, {A:N(1), B:N(0)}), {id:'teilen'})}})), ws);
    const errors: [string, string | null][] = [];
    const runner = new Runner(ws, new Simulation(robotFromWorkspace(ws)), {print:() => {}, error:(m, id) => errors.push([m, id])});
    await runner.start(); await runner.advance(100);
    ws.dispose();
    expect(runner.running).toBe(false);
    expect(errors).toEqual([[expect.stringContaining('ZeroDivisionError'), 'teilen']]);
  });
  it('alle Beispiele laufen, ohne dass der Simulator scheitert', async () => {
    for (const [name, make] of Object.entries(EXAMPLES)){
      const {errors, ignored} = await simulate(make(), 3000);
      expect(errors, name).toEqual([]); expect(ignored, name).toEqual([]);
    }
  });
});

describe('Einbau der Motoren', () => {
  const drive = (fields: Record<string, unknown> = {}, ...blocks: ReturnType<typeof B>[]) =>
    program(B('pb_drive_setup', {LEFT_PORT:'A', LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_PORT:'B', RIGHT_DIR:'CLOCKWISE', WHEEL:56, AXLE:112, GYRO:false, ...fields}), ...blocks);
  const straight = (mm = 100) => B('pb_drive_straight', null, {DIST:N(mm)});
  it('üblich: die Räder laufen im Abstand der Spurbreite, der linke Motor gespiegelt, der Abtrieb außen', () => {
    const m = defaultMounts(robotOf(drive()));
    expect(wheelCenter(m.A)).toEqual({x:expect.closeTo(0, 6), y:expect.closeTo(-56, 6)});
    expect(wheelCenter(m.B)).toEqual({x:expect.closeTo(0, 6), y:expect.closeTo(56, 6)});
    expect(m.A.flip).toBe(true); expect(m.B.flip).toBeUndefined();
  });
  it('passt »normal/umgekehrt« nicht zum Einbau, dreht er sich auf der Stelle – und glaubt, gefahren zu sein', async () => {
    const {sim} = await simulate(drive({LEFT_DIR:'CLOCKWISE'}, straight()), 2000);
    expect(Math.hypot(sim.pose.x, sim.pose.y)).toBeLessThan(1);
    expect(Math.abs(sim.pose.heading)).toBeGreaterThan(30);
    expect(sim.distance).toBeCloseTo(100, 3);
  });
  it('beide Motoren andersherum eingebaut: Er fährt rückwärts', async () => {
    const {sim} = await simulate(drive({}, straight()), 2000, s => {
      const m = defaultMounts(s.robot);
      s.mounts = {A:{...m.A, flip:false}, B:{...m.B, flip:true}};
    });
    expect(sim.pose.x).toBeCloseTo(-100, 3); expect(sim.pose.heading).toBeCloseTo(0, 3);
  });
  it('Räder weiter auseinander: ohne Kreisel dreht er zu wenig, mit Kreisel genau', async () => {
    const turn = B('pb_drive_turn', null, {ANGLE:N(90)});
    // statt 112 mm laufen die Räder 168 mm auseinander: Dieselbe Drehung der Räder dreht den Roboter nur um 2/3
    const wider = (s: Simulation) => { const m = defaultMounts(s.robot); s.mounts = {A:{...m.A, y:m.A.y - 28}, B:{...m.B, y:m.B.y + 28}}; };
    const plain = (await simulate(drive({}, turn), 2000, wider)).sim;
    expect(plain.pose.heading).toBeCloseTo(60, 3);
    expect(plain.angle).toBeCloseTo(90, 3);   // die Fahrbasis zählt aus den Motoren
    const gyro = (await simulate(drive({GYRO:true}, turn), 2000, wider)).sim;
    expect(gyro.pose.heading).toBeCloseTo(90, 3);
    expect(gyro.angle).toBeCloseTo(90, 3);
  });
  it('schneller, als die Motoren können: Er fährt langsamer, aber so weit, wie er soll', async () => {
    // kleine Motoren: 138 U/min = 828 Grad/s – am 56-mm-Rad gut 405 mm/s statt 1000
    const prog = drive({}, B('pb_drive_settings', null, {SPEED:N(1000), RATE:N(150)}), straight(500));
    expect((await simulate(prog, 1150)).running).toBe(true);
    const end = await simulate(prog, 1400);
    expect(end.running).toBe(false);
    expect(end.sim.pose.x).toBeCloseTo(500, 0);
  });
  it('ein einzelner Motor dreht nie schneller, als er kann', async () => {
    const {sim} = await simulate(program(B('pb_motor_run', {PORT:'C'}, {SPEED:N(5000)}), B('pb_wait', null, {MS:N(1000)})), 1000);
    expect(sim.motor('C').angle).toBeCloseTo(936, 0);   // großer Motor: 156 U/min
  });
});

describe('Umstecken', () => {
  it('tauscht die Anschlüsse im Programm – mit dem, was dort schon steckt', () => {
    const ws = new Blockly.Workspace();
    try {
      Blockly.serialization.workspaces.load(EXAMPLES.linie(), ws);
      expect(robotFromWorkspace(ws)).toMatchObject({drive:{left:'A', right:'B'}, colors:['C']});
      expect(swapPorts(ws, 'C', 'E')).toBe(true);
      expect(robotFromWorkspace(ws).colors).toEqual(['E']);
      // an A steckt der linke Motor: Die beiden tauschen
      swapPorts(ws, 'E', 'A');
      expect(robotFromWorkspace(ws)).toMatchObject({drive:{left:'E', right:'B'}, colors:['A']});
      expect(swapPorts(ws, 'B', 'B')).toBe(false);
    } finally { ws.dispose(); }
  });
  it('die Teile bleiben dabei, wo sie waren', () => {
    expect(swapMounts({C:{x:96, y:0}}, 'C', 'E')).toEqual({E:{x:96, y:0}});
    expect(swapMounts({C:{x:96, y:0}, E:{x:-40, y:8}}, 'C', 'E')).toEqual({E:{x:96, y:0}, C:{x:-40, y:8}});
  });
});

describe('Teile einstellen', () => {
  const robot: SimRobot = {drive:{left:'A', right:'B', wheel:56, axle:112, leftDir:-1, rightDir:1, gyro:true, direct:false}, colors:['C', 'D'], ultra:null, force:[], motors:[], notes:[]};
  const usual = defaultMounts(robot);
  it('Motor spiegeln: mit Symmetrie der gegenüber auch – beide bleiben spiegelbildlich', () => {
    const one = changePart(robot, {}, 'A', 'flip', usual, false);
    expect(one.A.flip).toBeUndefined(); expect(one.B).toBeUndefined();
    const both = changePart(robot, {}, 'A', 'flip', usual, true);
    expect(both.A.flip).toBeUndefined(); expect(both.B.flip).toBe(true);
    expect(mirrorPartner(robot, 'A')).toBe('B');
  });
  it('groß oder klein, nach unten oder nach vorn – nur, wo es das gibt', () => {
    expect(usual.A.kind).toBe('small');
    expect(changePart(robot, {}, 'A', 'kind', usual, false).A.kind).toBeUndefined();   // groß
    expect(changePart(robot, {}, 'C', 'face', usual, false).C.face).toBe('front');
    expect(changePart(robot, {}, 'A', 'face', usual, false)).toEqual({});
    expect(changePart(robot, {}, 'C', 'flip', usual, false)).toEqual({});
  });
  it('gemerkt wird, wie Motoren und Sensoren eingebaut sind', () => {
    const mounts = changePart(robot, changePart(robot, {}, 'A', 'flip', usual, true), 'C', 'face', usual, false);
    expect(mountsFor(robot, saveMounts(robot, {}, mounts))).toEqual(mounts);
  });
  it('ein nach vorn gekippter Farbsensor sieht keine Linie, sondern wie nah ein Hindernis steht', () => {
    const sim = new Simulation({...robot, colors:['C']});
    sim.mounts = {C:{x:100, y:0, face:'front'}};
    expect(sim.reflection('C')).toBe(0); expect(sim.color('C')).toBe('NONE');
    // die Vorderkante des Sensors liegt bei 111,5 mm; das Hindernis beginnt 20 mm davor
    sim.obstacles = [box(181.5, 0)];
    expect(sim.reflection('C')).toBe(35);
    expect(sim.colorPoints()).toHaveLength(1);
  });
});
