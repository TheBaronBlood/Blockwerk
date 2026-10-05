// ---------------------------------------------------------------
// Steuerfeld: Joystick und vier Tasten zur Live-Steuerung (Maus, Touch, Tastatur)
// Der Stand (Joystick, gedrückte Tasten) gehört dem Steuerfeld; angezeigt und bedient wird er
// an mehreren Stellen zugleich: im schmalen Streifen unter dem Code und in der Controller-Ansicht.
// ---------------------------------------------------------------
import { encodeAxis, encodeButton, PAD_HEARTBEAT, PAD_HEARTBEAT_MS, quantize, type PadAxis, type PadButton } from './padProtocol';

export interface Pad {
  /** Nach dem Start eines Programms aufrufen: Der Hub kennt den Stand des Steuerfelds noch nicht. */
  reset(): void;
  /**
   * Bindet einen Joystick an: `area` nimmt Finger oder Maus an, `ring` ist der Kreis, in dem sich
   * `knob` bewegt. Liefert `active` false, bleibt die Eingabe wirkungslos (beim Anordnen).
   */
  bindStick(area: HTMLElement, ring: HTMLElement, knob: HTMLElement, active?: () => boolean): void;
  bindButton(el: HTMLElement, button: PadButton, active?: () => boolean): void;
  /** Tastatur: Pfeiltasten oder W A S D für den Joystick, 1 bis 4 für die Tasten – solange `root` den Fokus hat. */
  bindKeys(root: HTMLElement, active?: () => boolean): void;
  /** Lässt Joystick und alle Tasten los. */
  release(): void;
  /** Joystick von außen stellen (−100 … 100), zum Beispiel von einem Gamepad am Gerät. */
  setStick(x: number, y: number): void;
  /** Taste von außen drücken oder loslassen. */
  setButton(button: PadButton, down: boolean): void;
  /** Nach einer Größenänderung aufrufen: setzt den Knopf jedes Joysticks wieder an die richtige Stelle. */
  redraw(): void;
}

const KEY_AXIS: Record<string, [PadAxis, number]> = {
  ArrowUp:['y', 100], ArrowDown:['y', -100], ArrowLeft:['x', -100], ArrowRight:['x', 100],
  w:['y', 100], s:['y', -100], a:['x', -100], d:['x', 100]
};
const KEY_BUTTON: Record<string, PadButton> = {'1':'A', '2':'B', '3':'C', '4':'D'};
const always = () => true;
/** Bindet den Finger an das Element, damit es auch außerhalb weiter Ereignisse bekommt. Scheitert das, geht es ohne. */
export function capture(el: HTMLElement, pointerId: number){
  try { el.setPointerCapture(pointerId); } catch { /* Zeiger gibt es nicht mehr */ }
}

/** @param send schickt ein Byte an das laufende Programm; darf scheitern, wenn kein Hub verbunden ist */
export function createPad(send: (byte: number) => Promise<void>): Pad {
  const want = {x:0, y:0}, sent = {x:0, y:0};
  const down = new Set<PadButton>();
  const sticks: {ring: HTMLElement; knob: HTMLElement}[] = [];
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
        const axis: PadAxis | null = want.x !== sent.x ? 'x' : want.y !== sent.y ? 'y' : null;
        if (!axis) break;
        const value = want[axis];
        await send(encodeAxis(axis, value));
        sent[axis] = value;
      }
    } catch { sent.x = want.x; sent.y = want.y; }  // kein Hub: nicht endlos wiederholen
    finally { pumping = false; }
  }
  function drawStick(){
    for (const {ring, knob} of sticks){
      // so weit, dass der Knopf den Rand des Rings gerade berührt
      const travel = (ring.clientWidth - knob.offsetWidth) / 2;
      knob.style.transform = `translate(${want.x / 100 * travel}px, ${-want.y / 100 * travel}px)`;
    }
  }
  function setStick(x: number, y: number){
    want.x = quantize(x); want.y = quantize(y);
    drawStick();
    pump();
  }
  function setButton(button: PadButton, pressed: boolean){
    if (down.has(button) === pressed) return;
    if (pressed) down.add(button); else down.delete(button);
    for (const b of buttons) if (b.button === button) b.el.classList.toggle('on', pressed);
    send(encodeButton(button, pressed)).catch(() => {});
  }
  const applyKeys = () => {
    let x = 0, y = 0;
    for (const k of keys){ const m = KEY_AXIS[k]; if (m){ if (m[0] === 'x') x += m[1]; else y += m[1]; } }
    setStick(x, y);
  };
  function release(){
    keys.clear(); setStick(0, 0);
    for (const b of [...down]) setButton(b, false);
  }

  // Lebenszeichen: Bleibt es aus, hält das Programm auf dem Hub den Roboter an
  setInterval(() => { send(PAD_HEARTBEAT).catch(() => {}); }, PAD_HEARTBEAT_MS);

  return {
    reset(){ sent.x = 0; sent.y = 0; pump(); },
    release,
    setStick,
    setButton,
    redraw: drawStick,
    bindStick(area, ring, knob, active = always){
      sticks.push({ring, knob});
      // nur der Finger, der den Joystick zuerst berührt hat, bewegt ihn
      let pointer: number | null = null;
      const fromPointer = (e: PointerEvent) => {
        const r = ring.getBoundingClientRect(), radius = r.width / 2;
        let x = (e.clientX - r.left - radius) / radius, y = -(e.clientY - r.top - radius) / radius;
        const len = Math.hypot(x, y);
        if (len > 1){ x /= len; y /= len; }
        setStick(x * 100, y * 100);
      };
      area.addEventListener('pointerdown', (e) => {
        if (!active() || pointer !== null) return;
        pointer = e.pointerId; capture(area, e.pointerId); fromPointer(e);
      });
      area.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) fromPointer(e); });
      const up = (e: PointerEvent) => { if (e.pointerId !== pointer) return; pointer = null; setStick(0, 0); };
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
        if (KEY_AXIS[k]){ keys.add(k); applyKeys(); } else setButton(KEY_BUTTON[k], true);
      });
      root.addEventListener('keyup', (e) => {
        const k = keyName(e);
        if (KEY_AXIS[k]){ keys.delete(k); applyKeys(); }
        else if (KEY_BUTTON[k]) setButton(KEY_BUTTON[k], false);
      });
      // erst loslassen, wenn der Fokus das Steuerfeld ganz verlässt – nicht beim Wechsel auf eine seiner Tasten
      root.addEventListener('focusout', (e) => { if (!root.contains(e.relatedTarget as Node | null)) release(); });
    }
  };
}
