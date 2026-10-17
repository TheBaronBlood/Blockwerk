// ---------------------------------------------------------------
// Steuerfeld: Joysticks und Tasten zur Live-Steuerung (Maus, Touch, Tastatur)
// Der Stand (Joysticks, gedrückte Tasten) gehört dem Steuerfeld; angezeigt und bedient wird er
// an mehreren Stellen zugleich: im schmalen Streifen unter dem Code und in der Controller-Ansicht.
// ---------------------------------------------------------------
import {
  encodeAxis, encodeButton, PAD_HEARTBEAT, PAD_HEARTBEAT_MS, PAD_STICKS, quantize, stickAxes, type PadAxis, type PadButton
} from './padProtocol';

export interface StickOptions {
  /** Welcher Joystick, gezählt ab 1. */
  stick?: number;
  /** Liefert es false, bleibt die Eingabe wirkungslos (beim Anordnen). */
  active?: () => boolean;
  /**
   * Die Ansicht ist um eine Vierteldrehung im Uhrzeigersinn gedreht (Controller-Ansicht auf dem
   * hochkant gehaltenen Handy) – dann zeigen die Richtungen des Fingers entsprechend gedreht.
   */
  turned?: () => boolean;
}
export interface Pad {
  /** Nach dem Start eines Programms aufrufen: Der Hub kennt den Stand des Steuerfelds noch nicht. */
  reset(): void;
  /** Bindet einen Joystick an: `area` nimmt Finger oder Maus an, `ring` ist der Kreis, in dem sich `knob` bewegt. */
  bindStick(area: HTMLElement, ring: HTMLElement, knob: HTMLElement, options?: StickOptions): void;
  bindButton(el: HTMLElement, button: PadButton, active?: () => boolean): void;
  /**
   * Tastatur, solange `root` den Fokus hat: Pfeiltasten oder W A S D für Joystick 1, I J K L für
   * Joystick 2, die Zifferntasten 1 bis 9 und 0 für die Tasten A bis J.
   */
  bindKeys(root: HTMLElement, active?: () => boolean): void;
  /** Lässt alle Joysticks und Tasten los. */
  release(): void;
  /** Joystick von außen stellen (−100 … 100), zum Beispiel von einem Gamepad am Gerät. */
  setStick(x: number, y: number, stick?: number): void;
  /** Taste von außen drücken oder loslassen. */
  setButton(button: PadButton, down: boolean): void;
  /** Nach einer Größenänderung aufrufen: setzt den Knopf jedes Joysticks wieder an die richtige Stelle. */
  redraw(): void;
}

/** Tastatur → [Joystick, Achse, Wert] */
const KEY_AXIS: Record<string, [number, 'x' | 'y', number]> = {
  ArrowUp:[1, 'y', 100], ArrowDown:[1, 'y', -100], ArrowLeft:[1, 'x', -100], ArrowRight:[1, 'x', 100],
  w:[1, 'y', 100], s:[1, 'y', -100], a:[1, 'x', -100], d:[1, 'x', 100],
  i:[2, 'y', 100], k:[2, 'y', -100], j:[2, 'x', -100], l:[2, 'x', 100]
};
const KEY_BUTTON: Record<string, PadButton> = {'1':'A', '2':'B', '3':'C', '4':'D', '5':'E', '6':'F', '7':'G', '8':'H', '9':'I', '0':'J'};
const STICKS = Array.from({length:PAD_STICKS}, (_, i) => i + 1);
const AXES = STICKS.flatMap(stickAxes);
const always = () => true, never = () => false;
/** Bindet den Finger an das Element, damit es auch außerhalb weiter Ereignisse bekommt. Scheitert das, geht es ohne. */
export function capture(el: HTMLElement, pointerId: number){
  try { el.setPointerCapture(pointerId); } catch { /* Zeiger gibt es nicht mehr */ }
}

/** @param send schickt ein Byte an das laufende Programm; darf scheitern, wenn kein Hub verbunden ist */
export function createPad(send: (byte: number) => Promise<void>): Pad {
  const zero = () => Object.fromEntries(AXES.map(a => [a, 0])) as Record<PadAxis, number>;
  const want = zero(), sent = zero();
  const down = new Set<PadButton>();
  const sticks: {ring: HTMLElement; knob: HTMLElement; stick: number}[] = [];
  const buttons: {el: HTMLElement; button: PadButton}[] = [];
  const keys = new Set<string>();
  let pumping = false;

  // Beim Ziehen entstehen viel mehr Stellungen, als Bluetooth übertragen kann: Es wird immer
  // nur der neueste Stand geschickt, Zwischenwerte fallen weg.
  async function pump(){
    if (pumping) return;
    pumping = true;
    try {
      for (;;){
        const axis = AXES.find(a => want[a] !== sent[a]);
        if (!axis) break;
        const value = want[axis];
        await send(encodeAxis(axis, value));
        sent[axis] = value;
      }
    } catch { Object.assign(sent, want); }  // kein Hub: nicht endlos wiederholen
    finally { pumping = false; }
  }
  function drawStick(){
    for (const {ring, knob, stick} of sticks){
      const [ax, ay] = stickAxes(stick);
      // so weit, dass der Knopf den Rand des Rings gerade berührt
      const travel = (ring.clientWidth - knob.offsetWidth) / 2;
      knob.style.transform = `translate(${want[ax] / 100 * travel}px, ${-want[ay] / 100 * travel}px)`;
    }
  }
  function setStick(x: number, y: number, stick = 1){
    const [ax, ay] = stickAxes(stick);
    want[ax] = quantize(x); want[ay] = quantize(y);
    drawStick();
    pump();
  }
  function setButton(button: PadButton, pressed: boolean){
    if (down.has(button) === pressed) return;
    if (pressed) down.add(button); else down.delete(button);
    for (const b of buttons) if (b.button === button) b.el.classList.toggle('on', pressed);
    send(encodeButton(button, pressed)).catch(() => {});
  }
  /** Stellt den Joystick, zu dem die Taste gehört, nach allen Tasten, die gerade gedrückt sind. */
  const applyKeys = (stick: number) => {
    const sum = {x:0, y:0};
    for (const k of keys){ const m = KEY_AXIS[k]; if (m && m[0] === stick) sum[m[1]] += m[2]; }
    setStick(sum.x, sum.y, stick);
  };
  function release(){
    keys.clear();
    for (const s of STICKS) setStick(0, 0, s);
    for (const b of [...down]) setButton(b, false);
  }

  // Lebenszeichen: Bleibt es aus, hält das Programm auf dem Hub den Roboter an
  setInterval(() => { send(PAD_HEARTBEAT).catch(() => {}); }, PAD_HEARTBEAT_MS);

  return {
    reset(){ Object.assign(sent, zero()); pump(); },
    release,
    setStick,
    setButton,
    redraw: drawStick,
    bindStick(area, ring, knob, {stick = 1, active = always, turned = never} = {}){
      sticks.push({ring, knob, stick});
      // nur der Finger, der den Joystick zuerst berührt hat, bewegt ihn
      let pointer: number | null = null;
      const fromPointer = (e: PointerEvent) => {
        const r = ring.getBoundingClientRect(), radius = r.width / 2;
        let x = (e.clientX - r.left - radius) / radius, y = -(e.clientY - r.top - radius) / radius;
        // Ansicht um eine Vierteldrehung gedreht: »oben« liegt am rechten Rand des Bildschirms
        if (turned()) [x, y] = [-y, x];
        const len = Math.hypot(x, y);
        if (len > 1){ x /= len; y /= len; }
        setStick(x * 100, y * 100, stick);
      };
      area.addEventListener('pointerdown', (e) => {
        if (!active() || pointer !== null) return;
        pointer = e.pointerId; capture(area, e.pointerId); fromPointer(e);
      });
      area.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) fromPointer(e); });
      const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = null; setStick(0, 0, stick); };
      area.addEventListener('pointerup', up);
      area.addEventListener('pointercancel', up);
      area.addEventListener('lostpointercapture', up);
      drawStick();
    },
    bindButton(el, button, active = always){
      buttons.push({el, button});
      el.addEventListener('pointerdown', (e) => { if (!active()) return; capture(el, e.pointerId); setButton(button, true); });
      const up = () => setButton(button, false);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('lostpointercapture', up);
    },
    // nur solange das Steuerfeld den Fokus hat, damit Blockly nicht gestört wird
    bindKeys(root, active = always){
      const keyName = (e: KeyboardEvent) => e.key.length === 1 ? e.key.toLowerCase() : e.key;
      root.addEventListener('keydown', (e) => {
        const k = keyName(e);
        if (!active() || (!KEY_AXIS[k] && !KEY_BUTTON[k]) || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault(); e.stopPropagation();
        if (KEY_AXIS[k]){ keys.add(k); applyKeys(KEY_AXIS[k][0]); } else setButton(KEY_BUTTON[k], true);
      });
      root.addEventListener('keyup', (e) => {
        const k = keyName(e);
        if (KEY_AXIS[k]){ keys.delete(k); applyKeys(KEY_AXIS[k][0]); }
        else if (KEY_BUTTON[k]) setButton(KEY_BUTTON[k], false);
      });
      // erst loslassen, wenn der Fokus das Steuerfeld ganz verlässt – nicht beim Wechsel auf eine seiner Tasten
      root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget as Node | null)) release(); });
    }
  };
}
