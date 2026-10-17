// ---------------------------------------------------------------
// Steuerfeld: Übertragung der Eingaben vom Browser zum laufenden Programm
// Jede Eingabe ist genau ein Byte auf der Standardeingabe des Hubs:
//   150–170  Joystick 1 x  (−100 … 100 in Zehnerschritten)
//   180–200  Joystick 1 y
//   201–221  Joystick 2 x,  222–242  Joystick 2 y
//   107–127  Joystick 3 x,  128–148  Joystick 3 y
//   65–74    Taste A–J gedrückt ('A'–'J')
//   97–106   Taste A–J losgelassen ('a'–'j')
//   255      Lebenszeichen, solange Blockwerk verbunden ist
// Steuerzeichen (unter 32) kommen nicht vor: Strg+C (3) bricht auf dem Hub das Programm ab.
// Kommt länger als PAD_TIMEOUT_MS nichts an, stellt das Programm auf dem Hub alles auf Ruhe.
// Einzelne Bytes brauchen keinen Rahmen: Geht eines verloren, stimmt das nächste wieder.
// ---------------------------------------------------------------

/** Achsen der Joysticks: Joystick 1 heißt wie bisher x und y, die weiteren x2, y2, x3, y3. */
export type PadAxis = 'x' | 'y' | 'x2' | 'y2' | 'x3' | 'y3';
export type PadButton = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';
export const PAD_BUTTONS: PadButton[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
/** So viele Joysticks kann das Steuerfeld haben. */
export const PAD_STICKS = 3;
/** Die Mitte jedes Achsenbereichs: Stellung 0. Der Bereich reicht 10 Bytes darunter und darüber. */
const AXIS_CENTER: Record<PadAxis, number> = {x:160, y:190, x2:211, y2:232, x3:117, y3:138};
export const PAD_HEARTBEAT = 255;
/** So oft schickt der Browser ein Lebenszeichen. */
export const PAD_HEARTBEAT_MS = 250;
/** Nach dieser Funkstille lässt der Hub Joystick und Tasten los. */
export const PAD_TIMEOUT_MS = 1000;

/** Die beiden Achsen eines Joysticks (gezählt ab 1). */
export const stickAxes = (stick: number): [PadAxis, PadAxis] => stick === 1 ? ['x', 'y'] : [`x${stick}`, `y${stick}`] as [PadAxis, PadAxis];
/** Die Achse, die ein Block »Joystick … x/y« abfragt. Ältere Projekte kennen keine Nummer: Das ist Joystick 1. */
export const padAxisName = (stick: unknown, axis: unknown): PadAxis => stickAxes(Number(stick) || 1)[axis === 'y' ? 1 : 0];

/** Rundet eine Joystickstellung auf den nächsten Zehnerschritt zwischen −100 und 100. */
export const quantize = (value: number) => Math.max(-10, Math.min(10, Math.round(value / 10))) * 10 + 0;
export const encodeAxis = (axis: PadAxis, value: number) => AXIS_CENTER[axis] + quantize(value) / 10;
export const encodeButton = (button: PadButton, down: boolean) => button.charCodeAt(0) + (down ? 0 : 32);

/** Liest ein Byte so, wie es das Programm auf dem Hub tut: welche Eingabe, welcher Wert. */
export function decodeByte(byte: number): {name: PadAxis; value: number} | {name: PadButton; value: boolean} | null {
  for (const axis of Object.keys(AXIS_CENTER) as PadAxis[]){
    const c = AXIS_CENTER[axis];
    if (byte >= c - 10 && byte <= c + 10) return {name:axis, value:(byte - c) * 10 + 0};
  }
  const last = 64 + PAD_BUTTONS.length;
  if (byte >= 65 && byte <= last) return {name:String.fromCharCode(byte) as PadButton, value:true};
  if (byte >= 97 && byte <= last + 32) return {name:String.fromCharCode(byte - 32) as PadButton, value:false};
  return null;
}

/** Wie viele Joysticks und Tasten braucht ein Programm, das diese Eingaben abfragt? Mindestens 1 und 4. */
export function padSize(names: Iterable<string>): [sticks: number, buttons: number] {
  let sticks = 1, buttons = 4;
  for (const n of names){
    const m = /^[xy]([23])$/.exec(n);
    if (m) sticks = Math.max(sticks, Number(m[1]));
    buttons = Math.max(buttons, PAD_BUTTONS.indexOf(n as PadButton) + 1);
  }
  return [sticks, buttons];
}

/**
 * Gegenstück auf dem Hub; der Generator setzt diese Zeilen in den Kopf des Programms.
 * Es kennt nur so viele Joysticks und Tasten, wie das Programm braucht – mindestens Joystick 1 und
 * die Tasten A bis D, damit einfache Programme so kurz bleiben wie bisher.
 */
export function padHelper(sticks = 1, buttons = 4): string[] {
  sticks = Math.max(1, Math.min(PAD_STICKS, sticks));
  buttons = Math.max(4, Math.min(PAD_BUTTONS.length, buttons));
  const axes = Array.from({length:sticks}, (_, i) => stickAxes(i + 1)).flat();
  const keys = PAD_BUTTONS.slice(0, buttons);
  const last = 64 + buttons;
  const axisLines = axes.flatMap((a, i) => {
    const c = AXIS_CENTER[a];
    return [`        ${i ? 'elif' : 'if'} ${c - 10} <= byte <= ${c + 10}:`, `            steuerfeld['${a}'] = (byte - ${c}) * 10`];
  });
  return [
    '# Steuerfeld von Blockwerk: Eingaben kommen als einzelne Bytes vom Browser',
    `steuerfeld = {${[...axes.map(a => `'${a}': 0`), ...keys.map(k => `'${k}': False`)].join(', ')}}`,
    'steuerfeld_uhr = StopWatch()',
    '',
    'def steuerung(name):',
    '    while True:',
    '        byte = read_input_byte()',
    '        if byte is None:',
    '            break',
    '        steuerfeld_uhr.reset()',
    ...axisLines,
    `        elif 65 <= byte <= ${last}:`,
    '            steuerfeld[chr(byte)] = True',
    `        elif 97 <= byte <= ${last + 32}:`,
    '            steuerfeld[chr(byte - 32)] = False',
    '    # Funkstille: Verbindung weg, also alles loslassen',
    `    if steuerfeld_uhr.time() > ${PAD_TIMEOUT_MS}:`,
    `        steuerfeld.update(${[...axes.map(a => `${a}=0`), ...keys.map(k => `${k}=False`)].join(', ')})`,
    '    return steuerfeld[name]'
  ];
}
/** Das Gegenstück für Joystick 1 und die Tasten A bis D. */
export const PAD_HELPER = padHelper();
