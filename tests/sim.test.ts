import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { at, B, cmp, EXAMPLES, S, seq, setup, ws_, type WorkspaceState } from '../src/examples';
import { N, T } from '../src/toolbox';
import { describeRobot, robotFromWorkspace } from '../src/sim/robot';
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
  it('ohne Fahrblöcke gibt es keine Räder', () => {
    const robot = robotOf(EXAMPLES.motor());
    expect(robot.drive).toBeNull();
    expect(robot.motors).toEqual(['C']);
    expect(describeRobot(robot)).toBe('keine Räder · Motor an C');
  });
  it('Fahrblöcke ohne »Fahrbasis einrichten« nehmen die Vorgabe', () => {
    expect(robotOf(program(B('pb_drive_straight', null, {DIST:N(100)}))).drive).toEqual({left:'A', right:'B', wheel:56, axle:112});
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
    // Sensor 85 mm vor der Achse, Hindernis beginnt bei x = 750
    expect(sim.pose.x).toBeCloseTo(750 - 85 - seen, 0);
  });
  it('fährt nicht in ein Hindernis hinein', async () => {
    const {sim} = await simulate(program(setup(), B('pb_drive_straight', null, {DIST:N(1000)})), 3000, s => { s.obstacles = [box(400, 0)]; });
    expect(sim.blocked).toBe(true);
    expect(sim.pose.x).toBeLessThan(260); expect(sim.pose.x).toBeGreaterThan(240);
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
