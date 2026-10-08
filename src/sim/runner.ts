// ---------------------------------------------------------------
// Simulator – das Programm ausführen. Der Simulator läuft die Blöcke selbst ab, Block für Block,
// und tut dabei dasselbe wie der erzeugte Python-Code auf dem Hub (generator.ts): Wer dort etwas
// ändert, muss es hier nachziehen. (Erzeugten Code auszuführen verbietet die Seite sich selbst –
// siehe Content-Security-Policy in electron/main.cjs.)
// Die Zeit ist simuliert: Jeder Programmteil läuft, bis er wartet, und `advance()` lässt die Uhr
// bis zum nächsten Aufwachen weiterlaufen. So laufen mehrere Ereignisse nebeneinander, und ein Test
// kann Minuten in Millisekunden durchspielen. (Ohne DOM.)
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { toRows } from '../matrix';
import { charPixels, DISPLAY_OFF, iconPixels, numberPixels, TEXT_OFF_MS, TEXT_ON_MS } from './hubDisplay';
import { FORCE } from './robot';
import type { Simulation } from './simulation';

export interface RunnerIo {
  /** Ausgabe von »gib … im Terminal aus«. */
  print(text: string): void;
  /** Das Programm ist gescheitert; `blockId` ist der Block, an dem es geschah. */
  error?(message: string, blockId: string | null): void;
  /** Der Block, der gerade läuft. */
  onBlock?(id: string): void;
  /** »Piepton«: Frequenz in Hertz, Dauer in Millisekunden. */
  beep?(frequency: number, ms: number): void;
  /** Steuerfeld: Joystick (x, y: −100 … 100) und Tasten (A–D). */
  pad?(name: string): number | boolean;
}

/** Das Programm wurde angehalten: Jeder wartende Programmteil endet damit. */
class Stopped {}
/** »abbrechen« und »weiter« in einer Schleife. */
class Flow { constructor(readonly kind: 'BREAK' | 'CONTINUE'){} }
/** »gib zurück« in einem eigenen Block. */
class Return { constructor(readonly value: unknown){} }
/** Fehler im Programm, wie ihn auch der Hub melden würde. */
class ProgramError extends Error { blockId: string | null = null; }

/**
 * Ein Aufruf eines eigenen Blocks: Seine Parameter gelten nur in ihm (alle anderen Variablen gehören dem
 * ganzen Programm); `depth` zählt, wie tief die Aufrufe ineinander stecken. Außerhalb eigener Blöcke: null.
 */
type Frame = {vars: Map<string, unknown>; depth: number} | null;
interface Sleeper { at: number; wake(): void; fail(reason: unknown): void }

/** So lange dauert ein Durchlauf einer Schleife mindestens – auf dem Hub kostet er ebenfalls Zeit, und ohne das bliebe die Uhr in »wiederhole fortlaufend« stehen. */
const LOOP_MS = 1;
/** In so kleinen Schritten bewegt sich der Roboter. */
const STEP_MS = 5;
/** Wie auf dem Hub: Tempo von »fahre geradeaus« und »drehe«, solange das Programm nichts anderes einstellt. */
const STRAIGHT_SPEED = 200, TURN_RATE = 150;
/** So tief dürfen eigene Blöcke einander aufrufen – danach bricht auch der Hub ab. */
const MAX_CALL_DEPTH = 100;
const HATS = ['pb_start', 'pb_when', 'pb_when_message'];

const truthy = (v: unknown) => Array.isArray(v) ? v.length > 0 : !!v;
/** Wie Python einen Wert ausgibt. */
function pyStr(v: unknown, nested = false): string {
  if (v === undefined || v === null) return 'None';
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v === 'string') return nested ? `'${v}'` : v;
  if (Array.isArray(v)) return `[${v.map(x => pyStr(x, true)).join(', ')}]`;
  return String(v);
}

export class Runner {
  private readonly vars = new Map<string, unknown>();
  private readonly messages = new Map<string, number>();
  private sleepers: Sleeper[] = [];
  /** Meldet der Uhr, dass der laufende Programmteil wartet oder zu Ende ist. */
  private handBack: (() => void) | null = null;
  private alive = 0;
  private stopped = false;
  private started = false;
  private straightSpeed = STRAIGHT_SPEED;
  private turnRate = TURN_RATE;
  private timerZero = 0;
  /** So viele Programmteile (Ereignisse mit Blöcken darunter) hat das Programm gestartet. */
  tasks = 0;
  /** Was der Simulator nicht nachbildet – jede Blockart wird nur einmal genannt. */
  readonly ignored = new Set<string>();

  constructor(private readonly ws: Blockly.Workspace, private readonly sim: Simulation, private readonly io: RunnerIo){}

  /** Läuft noch ein Programmteil? */
  get running(){ return this.started && !this.stopped && this.alive > 0; }

  /** Startet alle Ereignisse des Programms; danach lässt `advance()` die Zeit laufen. */
  async start(){
    this.started = true;
    this.sim.reset();
    for (const model of this.ws.getVariableMap().getAllVariables()) this.vars.set(model.getId(), 0);
    const hats = this.ws.getTopBlocks(true).filter(b => HATS.includes(b.type) && b.isEnabled() && b.getNextBlock());
    const multi = hats.length > 1;
    // wer auf eine Nachricht wartet, startet zuerst – sonst könnte er eine gleich zu Beginn gesendete verpassen
    const first = hats.filter(b => b.type === 'pb_when_message'), rest = hats.filter(b => b.type !== 'pb_when_message');
    // (ohne ein zweites Ereignis sendet niemand: Dann läuft »wenn ich … empfange« nie)
    for (const hat of [...(multi ? first : []), ...rest]){ this.tasks++; await this.spawn(() => this.hat(hat)); }
  }

  /** Lässt `ms` Millisekunden simulierter Zeit vergehen und alle Programmteile laufen, die in dieser Zeit aufwachen. */
  async advance(ms: number){
    const target = this.sim.time + ms;
    while (this.running){
      let next: Sleeper | null = null;
      for (const s of this.sleepers) if (!next || s.at < next.at) next = s;
      if (!next || next.at > target) break;
      this.stepTo(next.at);
      this.sleepers.splice(this.sleepers.indexOf(next), 1);
      const woken = next;
      await new Promise<void>(back => { this.handBack = back; woken.wake(); });
    }
    if (this.running) this.stepTo(target);
    else this.sim.halt();
  }
  private stepTo(time: number){
    while (this.sim.time < time) this.sim.step(Math.min(STEP_MS, time - this.sim.time));
  }

  /** Hält das Programm an. */
  stop(){
    if (this.stopped) return;
    this.stopped = true;
    this.sim.halt();
    const waiting = this.sleepers; this.sleepers = [];
    for (const s of waiting) s.fail(new Stopped());
  }

  /** Startet einen Programmteil und kehrt zurück, sobald er zum ersten Mal wartet (oder schon fertig ist). */
  private spawn(task: () => Promise<void>){
    this.alive++;
    return new Promise<void>(back => {
      this.handBack = back;
      task().catch(err => {
        if (err instanceof Stopped) return;
        const known = err instanceof ProgramError;
        if (!known) console.error(err);
        this.stop();
        this.io.error?.(known ? err.message : 'Der Simulator ist an diesem Block gescheitert: ' + (err instanceof Error ? err.message : String(err)), known ? err.blockId : null);
      }).finally(() => { this.alive--; this.park(); });
    });
  }
  private park(){ const back = this.handBack; this.handBack = null; back?.(); }
  private sleep(ms: number){
    return new Promise<void>((wake, fail) => {
      if (this.stopped){ fail(new Stopped()); return; }
      this.sleepers.push({at:this.sim.time + Math.max(0, ms || 0), wake, fail});
      this.park();
    });
  }

  // ---- Ereignisse ----
  private async hat(b: Blockly.Block){
    const stack = b.getNextBlock();
    if (b.type === 'pb_start') return this.run(stack, null);
    if (b.type === 'pb_when'){
      // löst aus, sobald die Bedingung wahr wird – und erst wieder, nachdem sie zwischendurch falsch war
      for (;;){
        while (!truthy(await this.val(b, 'COND', null))) await this.sleep(10);
        await this.run(stack, null);
        while (truthy(await this.val(b, 'COND', null))) await this.sleep(10);
        // (kostet einen Moment wie jede Schleife – sonst bliebe die Uhr stehen, wenn die Bedingung ohne Warten hin- und herspringt)
        await this.sleep(LOOP_MS);
      }
    }
    const name = b.getFieldValue('NAME') as string;
    for (;;){
      const seen = this.messages.get(name) ?? 0;
      while ((this.messages.get(name) ?? 0) === seen) await this.sleep(10);
      await this.run(stack, null);
    }
  }

  // ---- Anweisungen ----
  /** Läuft einen Stapel ab: diesen Block und alle, die unter ihm hängen. */
  private async run(first: Blockly.Block | null, f: Frame){
    for (let b = first; b; b = b.getNextBlock()){
      if (!b.isEnabled()) continue;
      this.io.onBlock?.(b.id);
      try { await this.exec(b, f); }
      catch (err){ if (err instanceof ProgramError) err.blockId ??= b.id; throw err; }
    }
  }
  /** Ein Durchlauf einer Schleife; liefert true, wenn »abbrechen« sie beendet. */
  private async loopBody(b: Blockly.Block, f: Frame): Promise<boolean> {
    try { await this.run(b.getInputTargetBlock('DO'), f); }
    catch (err){
      if (!(err instanceof Flow)) throw err;
      if (err.kind === 'BREAK') return true;
    }
    await this.sleep(LOOP_MS);
    return false;
  }
  /** Fährt für eine bestimmte Zeit und hält dann an. */
  private async move(speed: number, rate: number, ms: number){
    if (!Number.isFinite(ms)) return;
    this.sim.speed = speed; this.sim.rate = rate;
    await this.sleep(ms);
    this.sim.speed = this.sim.rate = 0;
  }
  /** Dreht einen Motor um einen Winkel (Vorzeichen: Richtung) und hält ihn dann an. */
  private async turnMotor(port: string, speed: number, angle: number){
    const m = this.sim.motor(port), end = m.angle + angle;
    if (!speed || !angle) return;
    m.speed = Math.abs(speed) * Math.sign(angle);
    await this.sleep(Math.abs(angle / speed) * 1000);
    m.speed = 0; m.angle = end;
  }

  private async exec(b: Blockly.Block, f: Frame): Promise<void> {
    const sim = this.sim, num = (name: string, fallback = 0) => this.num(b, name, f, fallback);
    const port = () => b.getFieldValue('PORT') as string;
    switch (b.type){
      case 'pb_drive_setup': return;
      case 'pb_drive_straight': { const d = await num('DIST'); return this.move(Math.sign(d) * this.straightSpeed, 0, Math.abs(d) / this.straightSpeed * 1000); }
      case 'pb_drive_turn': { const a = await num('ANGLE'); return this.move(0, Math.sign(a) * this.turnRate, Math.abs(a) / this.turnRate * 1000); }
      case 'pb_drive_arc': {
        // positiver Radius: Kurve nach rechts; negativer Winkel: rückwärts
        const radius = await num('RADIUS', 100), a = await num('ANGLE'), speed = Math.sign(a) * this.straightSpeed;
        const rate = radius ? speed / radius * 180 / Math.PI : Math.sign(a) * this.turnRate;
        return this.move(radius ? speed : 0, rate, Math.abs(a / rate) * 1000);
      }
      case 'pb_drive_drive': { const speed = await num('SPEED'); sim.rate = await num('RATE'); sim.speed = speed; return; }
      case 'pb_drive_stop': sim.speed = sim.rate = 0; return;
      case 'pb_drive_settings': this.straightSpeed = Math.abs(await num('SPEED', 200)) || STRAIGHT_SPEED; this.turnRate = Math.abs(await num('RATE', 150)) || TURN_RATE; return;
      case 'pb_drive_reset': sim.distance = sim.angle = 0; return;

      case 'pb_motor_run_angle': return this.turnMotor(port(), await num('SPEED', 500), await num('ANGLE'));
      case 'pb_motor_run_target': { const speed = await num('SPEED', 500); return this.turnMotor(port(), speed, await num('TARGET') - sim.motor(port()).angle); }
      case 'pb_motor_run_time': { const m = sim.motor(port()); m.speed = await num('SPEED', 500); await this.sleep(await num('TIME')); m.speed = 0; return; }
      case 'pb_motor_run': sim.motor(port()).speed = await num('SPEED'); return;
      case 'pb_motor_stop': sim.motor(port()).speed = 0; return;
      case 'pb_motor_reset': sim.motor(port()).angle = await num('ANGLE'); return;

      case 'pb_reset_heading': sim.setHeading(await num('ANGLE')); return;
      case 'pb_timer_reset': this.timerZero = sim.time; return;
      case 'pb_beep': { const frequency = await num('FREQ', 500), ms = await num('DUR', 100); this.io.beep?.(frequency, ms); return this.sleep(ms); }
      case 'pb_print': this.io.print(pyStr(await this.val(b, 'TEXT', f) ?? '') + '\n'); return;
      case 'pb_display_icon': sim.display = iconPixels(b.getFieldValue('ICON')); return;
      case 'pb_display_pixels': sim.display = toRows(b.getFieldValue('PIXELS')).flat(); return;
      case 'pb_display_number': sim.display = numberPixels(await num('NUM')); return;
      case 'pb_display_off': sim.display = [...DISPLAY_OFF]; return;
      case 'pb_display_text':
        // Buchstabe für Buchstabe; das Programm wartet, bis der Text durch ist
        for (const char of pyStr(await this.val(b, 'TEXT', f) ?? '')){
          sim.display = charPixels(char); await this.sleep(TEXT_ON_MS);
          sim.display = [...DISPLAY_OFF]; await this.sleep(TEXT_OFF_MS);
        }
        return;
      case 'pb_light': { const color = b.getFieldValue('COLOR') as string; sim.light = color === 'OFF' ? null : color; return; }
      // die Fernsteuergeräte am Hub gibt es im Simulator nicht
      case 'pb_xbox_rumble': case 'pb_remote_light': case 'pb_unsupported': this.ignored.add(b.type); return;

      case 'pb_wait': return this.sleep(await num('MS'));
      case 'pb_wait_until': while (!truthy(await this.val(b, 'COND', f))) await this.sleep(10); return;
      case 'pb_send_message': { const name = b.getFieldValue('NAME') as string; this.messages.set(name, (this.messages.get(name) ?? 0) + 1); return; }
      case 'pb_forever': for (;;) if (await this.loopBody(b, f)) return;
      case 'controls_repeat_ext': { const times = await num('TIMES'); for (let i = 0; i < times; i++) if (await this.loopBody(b, f)) return; return; }
      case 'controls_whileUntil': {
        const until = b.getFieldValue('MODE') === 'UNTIL';
        while (truthy(await this.val(b, 'BOOL', f)) !== until) if (await this.loopBody(b, f)) return;
        return;
      }
      case 'controls_forEach': {
        const list = await this.val(b, 'LIST', f);
        for (const item of Array.isArray(list) ? [...list] : []){ this.setVar(b.getFieldValue('VAR'), item, f); if (await this.loopBody(b, f)) return; }
        return;
      }
      case 'controls_if': {
        for (let i = 0; b.getInput('IF' + i); i++) if (truthy(await this.val(b, 'IF' + i, f))) return this.run(b.getInputTargetBlock('DO' + i), f);
        return b.getInput('ELSE') ? this.run(b.getInputTargetBlock('ELSE'), f) : undefined;
      }
      case 'controls_flow_statements': throw new Flow(b.getFieldValue('FLOW') as Flow['kind']);

      case 'variables_set': this.setVar(b.getFieldValue('VAR'), await this.val(b, 'VALUE', f) ?? 0, f); return;
      case 'math_change': { const id = b.getFieldValue('VAR'); this.setVar(id, Number(this.getVar(id, f)) + await num('DELTA'), f); return; }
      case 'lists_setIndex': {
        const list = this.list(await this.val(b, 'LIST', f)), to = await this.val(b, 'TO', f);
        const at = await this.index(b, list, f, b.getFieldValue('MODE') === 'INSERT');
        if (b.getFieldValue('MODE') === 'INSERT') list.splice(at, 0, to); else list[at] = to;
        return;
      }
      case 'lists_getIndex': await this.getIndex(b, f); return;
      case 'procedures_callnoreturn': await this.call(b, f); return;
      case 'procedures_ifreturn':
        if (truthy(await this.val(b, 'CONDITION', f))) throw new Return(b.getInput('VALUE') ? await this.val(b, 'VALUE', f) : undefined);
        return;
      // Blöcke aus Erweiterungen bringen eigenes Python mit – das kann der Simulator nicht ausführen
      default: this.ignored.add(b.type);
    }
  }

  // ---- Werte ----
  /** Der Wert, der an einem Eingang steckt – ohne Block dort `undefined`. */
  private async val(b: Blockly.Block, name: string, f: Frame): Promise<unknown> {
    const inner = b.getInputTargetBlock(name);
    if (!inner) return undefined;
    try { return await this.value(inner, f); }
    catch (err){ if (err instanceof ProgramError) err.blockId ??= inner.id; throw err; }
  }
  private async num(b: Blockly.Block, name: string, f: Frame, fallback = 0): Promise<number> {
    const v = await this.val(b, name, f);
    return v === undefined || Number.isNaN(Number(v)) ? fallback : Number(v);
  }
  private getVar(id: string, f: Frame){ return f?.vars.has(id) ? f.vars.get(id) : this.vars.get(id) ?? 0; }
  private setVar(id: string, value: unknown, f: Frame){ if (f?.vars.has(id)) f.vars.set(id, value); else this.vars.set(id, value); }
  private list(v: unknown): unknown[] {
    if (!Array.isArray(v)) throw new ProgramError('Hier wird eine Liste erwartet.');
    return v;
  }
  /** Die Stelle in einer Liste, die ein Listenblock meint (gezählt wird ab 1). `grow`: auch die Stelle hinter dem Ende. */
  private async index(b: Blockly.Block, list: unknown[], f: Frame, grow = false): Promise<number> {
    const where = b.getFieldValue('WHERE'), last = list.length - (grow ? 0 : 1);
    const at = where === 'FIRST' ? 0 : where === 'LAST' ? last : where === 'RANDOM' ? Math.floor(Math.random() * (last + 1))
      : where === 'FROM_END' ? list.length - await this.num(b, 'AT', f, 1) : await this.num(b, 'AT', f, 1) - 1;
    if (!Number.isInteger(at) || at < 0 || at > last) throw new ProgramError('Diese Stelle gibt es in der Liste nicht (IndexError).');
    return at;
  }
  private async getIndex(b: Blockly.Block, f: Frame){
    const list = this.list(await this.val(b, 'VALUE', f)), at = await this.index(b, list, f);
    return b.getFieldValue('MODE') === 'GET' ? list[at] : list.splice(at, 1)[0];
  }
  /** Ruft einen eigenen Block auf. */
  private async call(b: Blockly.Block, f: Frame): Promise<unknown> {
    const name = b.getFieldValue('NAME') as string, def = Blockly.Procedures.getDefinition(name, this.ws);
    if (!def) throw new ProgramError(`Den eigenen Block »${name}« gibt es nicht.`);
    const frame = {vars:new Map<string, unknown>(), depth:(f?.depth ?? 0) + 1};
    if (frame.depth > MAX_CALL_DEPTH) throw new ProgramError(`Der eigene Block »${name}« ruft sich immer wieder selbst auf (RuntimeError: maximum recursion depth exceeded).`);
    const params = def.getVarModels();
    for (let i = 0; i < params.length; i++) frame.vars.set(params[i].getId(), await this.val(b, 'ARG' + i, f) ?? 0);
    try { await this.run(def.getInputTargetBlock('STACK'), frame); }
    catch (err){ if (err instanceof Return) return err.value; throw err; }
    return def.getInput('RETURN') ? this.val(def, 'RETURN', frame) : undefined;
  }

  private async value(b: Blockly.Block, f: Frame): Promise<unknown> {
    const sim = this.sim, num = (name: string, fallback = 0) => this.num(b, name, f, fallback);
    const port = () => b.getFieldValue('PORT') as string;
    switch (b.type){
      case 'math_number': return Number(b.getFieldValue('NUM'));
      case 'text': return b.getFieldValue('TEXT');
      case 'logic_boolean': return b.getFieldValue('BOOL') === 'TRUE';
      case 'variables_get': return this.getVar(b.getFieldValue('VAR'), f);
      case 'math_arithmetic': {
        const a = await num('A'), c = await num('B');
        switch (b.getFieldValue('OP')){
          case 'ADD': return a + c;
          case 'MINUS': return a - c;
          case 'MULTIPLY': return a * c;
          case 'DIVIDE': if (!c) throw new ProgramError('Durch null lässt sich nicht teilen (ZeroDivisionError).'); return a / c;
          default: return a ** c;
        }
      }
      case 'pb_abs': return Math.abs(await num('NUM'));
      case 'math_round': { const n = await num('NUM'), op = b.getFieldValue('OP'); return op === 'ROUNDUP' ? Math.ceil(n) : op === 'ROUNDDOWN' ? Math.floor(n) : Math.round(n); }
      case 'math_modulo': {
        const a = await num('DIVIDEND'), c = await num('DIVISOR');
        if (!c) throw new ProgramError('Durch null lässt sich nicht teilen (ZeroDivisionError).');
        return ((a % c) + c) % c;   // wie in Python: das Vorzeichen des Teilers
      }
      case 'math_constrain': return Math.min(Math.max(await num('VALUE'), await num('LOW')), await num('HIGH', Infinity));
      case 'math_random_int': { const a = await num('FROM'), c = await num('TO'), lo = Math.min(a, c); return lo + Math.floor(Math.random() * (Math.max(a, c) - lo + 1)); }
      case 'logic_compare': {
        const a = (await this.val(b, 'A', f) ?? 0) as number, c = (await this.val(b, 'B', f) ?? 0) as number;
        switch (b.getFieldValue('OP')){
          case 'EQ': return a === c;
          case 'NEQ': return a !== c;
          case 'LT': return a < c;
          case 'LTE': return a <= c;
          case 'GT': return a > c;
          default: return a >= c;
        }
      }
      case 'logic_operation': {
        const a = truthy(await this.val(b, 'A', f));
        return b.getFieldValue('OP') === 'AND' ? a && truthy(await this.val(b, 'B', f)) : a || truthy(await this.val(b, 'B', f));
      }
      case 'logic_negate': return !truthy(await this.val(b, 'BOOL', f));
      case 'text_join': { let text = ''; for (let i = 0; b.getInput('ADD' + i); i++) text += pyStr(await this.val(b, 'ADD' + i, f) ?? ''); return text; }
      case 'lists_create_with': { const list: unknown[] = []; for (let i = 0; b.getInput('ADD' + i); i++) list.push(await this.val(b, 'ADD' + i, f) ?? null); return list; }
      case 'lists_length': return this.list(await this.val(b, 'VALUE', f) ?? []).length;
      case 'lists_isEmpty': return !this.list(await this.val(b, 'VALUE', f) ?? []).length;
      case 'lists_getIndex': return this.getIndex(b, f);
      case 'procedures_callreturn': return this.call(b, f);

      case 'pb_drive_distance': return Math.round(sim.distance);
      case 'pb_drive_angle': return Math.round(sim.angle);
      case 'pb_motor_angle': return Math.round(sim.motor(port()).angle);
      case 'pb_motor_speed': return Math.round(sim.motor(port()).speed);
      case 'pb_color_is': return sim.color(port()) === b.getFieldValue('COLOR');
      case 'pb_reflection': return sim.reflection(port());
      case 'pb_distance': return sim.ultrasonic(port());
      case 'pb_heading': return Math.round(sim.heading());
      case 'pb_timer': return Math.round(sim.time - this.timerZero);
      case 'pb_pad_stick': return Number(this.io.pad?.(b.getFieldValue('AXIS')) ?? 0);
      case 'pb_pad_button': return !!this.io.pad?.(b.getFieldValue('BUTTON'));
      case 'pb_button': return sim.buttons.has(b.getFieldValue('BUTTON'));
      case 'pb_force_pressed': return sim.forcePressed(port());
      case 'pb_force': return sim.forcePressed(port()) ? FORCE.pressed : 0;
      case 'pb_xbox_button': case 'pb_remote_button': this.ignored.add(b.type); return false;
      default: this.ignored.add(b.type); return 0;
    }
  }
}
