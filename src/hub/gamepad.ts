// ---------------------------------------------------------------
// Gamepad am Gerät (Xbox-, PlayStation- oder anderer Controller, der mit dem Handy, Tablet oder
// Computer verbunden ist): Er bedient das Steuerfeld von Blockwerk – linker Stick und
// Steuerkreuz Joystick 1, der rechte Stick Joystick 2, die vier Tasten rechts die Tasten A bis D,
// Schultertasten, Trigger und die beiden kleinen Tasten in der Mitte E bis J.
// Das ist ein anderer Weg als die Xbox-Blöcke: Dort verbindet sich der Hub selbst mit dem
// Controller, und Blockwerk bekommt davon nichts mit.
// `readGamepad` kommt ohne Browser aus und ist getestet (tests/gamepad.test.ts).
// ---------------------------------------------------------------
import { PAD_BUTTONS, type PadButton } from './padProtocol';

export interface Stick { x: number; y: number }
/** Stand des Steuerfelds: sticks[0] ist Joystick 1. */
export interface PadInput { sticks: [Stick, Stick]; buttons: Record<PadButton, boolean> }
/** Was hier von einem Gamepad gebraucht wird – so lässt es sich im Test nachstellen. */
export interface GamepadLike { id: string; connected: boolean; axes: readonly number[]; buttons: readonly {pressed: boolean}[] }

/** Unterhalb davon gilt der Stick als losgelassen; Sticks stehen in Ruhe selten genau auf null. */
const DEADZONE = 0.18;
// Belegung nach dem »Standard Gamepad« des W3C, wie Browser sie für Xbox-Controller liefern.
// Die Tasten liegen wie in der Controller-Ansicht: A unten, B rechts, C links (X), D oben (Y).
// Danach der Reihe nach: E/F Schultertasten links/rechts, G/H Trigger links/rechts, I Ansicht, J Menü.
const FACE: Record<PadButton, number> = {A:0, B:1, C:2, D:3, E:4, F:5, G:6, H:7, I:8, J:9};
const DPAD = {up:12, down:13, left:14, right:15};

const pressed = (gp: GamepadLike, index: number) => !!gp.buttons[index]?.pressed;
/** Stickstellung ohne den toten Bereich, auf −100 … 100 gestreckt. */
function axis(value: number | undefined){
  const v = value ?? 0, size = Math.abs(v);
  if (!(size > DEADZONE)) return 0;
  return Math.sign(v) * Math.min(100, Math.round((size - DEADZONE) / (1 - DEADZONE) * 100));
}

/** Übersetzt den Stand eines Gamepads in den Stand des Steuerfelds. */
export function readGamepad(gp: GamepadLike): PadInput {
  // Browser zählen y nach unten, das Steuerfeld nach vorn
  let x = axis(gp.axes[0]), y = -axis(gp.axes[1]) + 0;
  const right = {x:axis(gp.axes[2]), y:-axis(gp.axes[3]) + 0};
  // das Steuerkreuz wirkt wie ein voll ausgelenkter Stick, wenn der Stick selbst ruht
  if (!x && !y){
    x = (pressed(gp, DPAD.right) ? 100 : 0) - (pressed(gp, DPAD.left) ? 100 : 0);
    y = (pressed(gp, DPAD.up) ? 100 : 0) - (pressed(gp, DPAD.down) ? 100 : 0);
  }
  const buttons = {} as Record<PadButton, boolean>;
  for (const b of PAD_BUTTONS) buttons[b] = pressed(gp, FACE[b]);
  return {sticks:[{x, y}, right], buttons};
}

/** Kurzer Name für die Anzeige: Browser hängen Hersteller- und Gerätenummern an. */
export function gamepadName(id: string): string {
  const name = id.replace(/\s*\((?:STANDARD GAMEPAD\s*)?Vendor:.*$/i, '').replace(/^[0-9a-f]{4}-[0-9a-f]{4}-/i, '').replace(/\s+/g, ' ').trim();
  return name || 'Controller';
}

export interface GamepadTarget {
  /** Joystick des Steuerfelds (gezählt ab 1), −100 … 100. */
  setStick(x: number, y: number, stick: number): void;
  setButton(button: PadButton, down: boolean): void;
  /** Ein Gamepad ist dazugekommen (Name) oder weg (null). */
  onGamepad(name: string | null): void;
}
export interface GamepadSource {
  getGamepads(): (GamepadLike | null)[];
  /** Ruft `tick` regelmäßig auf; liefert eine Funktion, die das beendet. */
  every(ms: number, tick: () => void): () => void;
}

/**
 * Fragt das erste verbundene Gamepad ab und gibt nur Änderungen weiter – so bleibt das
 * Steuerfeld daneben mit Finger, Maus und Tastatur bedienbar.
 * @returns eine Funktion für einen einzelnen Abfrageschritt (für Tests)
 */
export function watchGamepad(target: GamepadTarget, source: GamepadSource): () => void {
  let name: string | null = null;
  const rest = (): PadInput => ({sticks:[{x:0, y:0}, {x:0, y:0}], buttons:Object.fromEntries(PAD_BUTTONS.map(b => [b, false])) as Record<PadButton, boolean>});
  let last = rest();
  const apply = (next: PadInput) => {
    next.sticks.forEach((s, i) => { if (s.x !== last.sticks[i].x || s.y !== last.sticks[i].y) target.setStick(s.x, s.y, i + 1); });
    for (const b of PAD_BUTTONS) if (next.buttons[b] !== last.buttons[b]) target.setButton(b, next.buttons[b]);
    last = next;
  };
  const tick = () => {
    let pads: (GamepadLike | null)[];
    try { pads = source.getGamepads(); } catch { pads = []; }
    const gp = pads.find(p => p && p.connected) ?? null;
    if (!gp){
      if (name !== null){ apply(rest()); name = null; target.onGamepad(null); }
      return;
    }
    const now = gamepadName(gp.id);
    if (now !== name){ name = now; target.onGamepad(now); }
    apply(readGamepad(gp));
  };
  source.every(40, tick);
  return tick;
}

/** Gamepads des Browsers. Sie erscheinen erst, nachdem am Controller eine Taste gedrückt wurde. */
export function browserGamepads(): GamepadSource | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  return {
    getGamepads:() => [...navigator.getGamepads()],
    every:(ms, tick) => { const id = window.setInterval(tick, ms); return () => window.clearInterval(id); }
  };
}
