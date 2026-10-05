// ---------------------------------------------------------------
// Steuerfeld: Übertragung der Eingaben vom Browser zum laufenden Programm
// Jede Eingabe ist genau ein Byte auf der Standardeingabe des Hubs:
//   150–170  Joystick x  (−100 … 100 in Zehnerschritten)
//   180–200  Joystick y
//   65–68    Taste A–D gedrückt ('A'–'D')
//   97–100   Taste A–D losgelassen ('a'–'d')
//   255      Lebenszeichen, solange Blockwerk verbunden ist
// Kommt länger als PAD_TIMEOUT_MS nichts an, stellt das Programm auf dem Hub alles auf Ruhe.
// Einzelne Bytes brauchen keinen Rahmen: Geht eines verloren, stimmt das nächste wieder.
// ---------------------------------------------------------------
export type PadAxis = 'x' | 'y';
export type PadButton = 'A' | 'B' | 'C' | 'D';
export const PAD_BUTTONS: PadButton[] = ['A', 'B', 'C', 'D'];
export const PAD_HEARTBEAT = 255;
/** So oft schickt der Browser ein Lebenszeichen. */
export const PAD_HEARTBEAT_MS = 250;
/** Nach dieser Funkstille lässt der Hub Joystick und Tasten los. */
export const PAD_TIMEOUT_MS = 1000;

/** Rundet eine Joystickstellung auf den nächsten Zehnerschritt zwischen −100 und 100. */
export const quantize = (value: number) => Math.max(-10, Math.min(10, Math.round(value / 10))) * 10 + 0;
export const encodeAxis = (axis: PadAxis, value: number) => (axis === 'x' ? 160 : 190) + quantize(value) / 10;
export const encodeButton = (button: PadButton, down: boolean) => button.charCodeAt(0) + (down ? 0 : 32);

/** Gegenstück auf dem Hub; der Generator setzt diese Zeilen in den Kopf des Programms. */
export const PAD_HELPER = [
  '# Steuerfeld von Blockwerk: Eingaben kommen als einzelne Bytes vom Browser',
  "steuerfeld = {'x': 0, 'y': 0, 'A': False, 'B': False, 'C': False, 'D': False}",
  'steuerfeld_uhr = StopWatch()',
  '',
  'def steuerung(name):',
  '    while True:',
  '        byte = read_input_byte()',
  '        if byte is None:',
  '            break',
  '        steuerfeld_uhr.reset()',
  '        if 150 <= byte <= 170:',
  "            steuerfeld['x'] = (byte - 160) * 10",
  '        elif 180 <= byte <= 200:',
  "            steuerfeld['y'] = (byte - 190) * 10",
  '        elif 65 <= byte <= 68:',
  '            steuerfeld[chr(byte)] = True',
  '        elif 97 <= byte <= 100:',
  '            steuerfeld[chr(byte - 32)] = False',
  '    # Funkstille: Verbindung weg, also alles loslassen',
  `    if steuerfeld_uhr.time() > ${PAD_TIMEOUT_MS}:`,
  '        steuerfeld.update(x=0, y=0, A=False, B=False, C=False, D=False)',
  '    return steuerfeld[name]'
];
