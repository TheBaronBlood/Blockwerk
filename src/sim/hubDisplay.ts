// ---------------------------------------------------------------
// Simulator – die Lichtmatrix des Hubs: was »zeige Bild«, »zeige Zahl« und »zeige Text« auf den
// 5 × 5 Punkten anzeigen. Ein Bild ist eine Liste aus 25 Helligkeiten in Prozent, zeilenweise von
// links oben. (Ohne DOM.)
// ---------------------------------------------------------------
import { ICON_PATTERNS } from '../matrix';

export type Pixels = number[];
export const DISPLAY_OFF: Pixels = new Array(25).fill(0);
/** So lange zeigt »zeige Text« jeden Buchstaben, und so lange ist es dazwischen dunkel (wie bei Pybricks). */
export const TEXT_ON_MS = 500, TEXT_OFF_MS = 50;

const fromBits = (rows: string): Pixels => [...rows.replace(/ /g, '')].map(c => c === '1' ? 100 : 0);

/** Zeichen auf 5 × 5 Punkten; Kleinbuchstaben erscheinen groß, unbekannte Zeichen als Fragezeichen. */
const FONT: Record<string, string> = {
  A:'01110 10001 11111 10001 10001', B:'11110 10001 11110 10001 11110', C:'01111 10000 10000 10000 01111', D:'11110 10001 10001 10001 11110',
  E:'11111 10000 11110 10000 11111', F:'11111 10000 11110 10000 10000', G:'01111 10000 10011 10001 01111', H:'10001 10001 11111 10001 10001',
  I:'01110 00100 00100 00100 01110', J:'00111 00001 00001 10001 01110', K:'10010 10100 11000 10100 10010', L:'10000 10000 10000 10000 11111',
  M:'10001 11011 10101 10001 10001', N:'10001 11001 10101 10011 10001', O:'01110 10001 10001 10001 01110', P:'11110 10001 11110 10000 10000',
  Q:'01110 10001 10101 10010 01101', R:'11110 10001 11110 10010 10001', S:'01111 10000 01110 00001 11110', T:'11111 00100 00100 00100 00100',
  U:'10001 10001 10001 10001 01110', V:'10001 10001 10001 01010 00100', W:'10001 10001 10101 11011 10001', X:'10001 01010 00100 01010 10001',
  Y:'10001 01010 00100 00100 00100', Z:'11111 00010 00100 01000 11111',
  0:'01110 10011 10101 11001 01110', 1:'00100 01100 00100 00100 01110', 2:'11110 00001 01110 10000 11111', 3:'11110 00001 01110 00001 11110',
  4:'10010 10010 11111 00010 00010', 5:'11111 10000 11110 00001 11110', 6:'01110 10000 11110 10001 01110', 7:'11111 00010 00100 01000 01000',
  8:'01110 10001 01110 10001 01110', 9:'01110 10001 01111 00001 01110',
  ' ':'00000 00000 00000 00000 00000', '!':'00100 00100 00100 00000 00100', '?':'01110 10001 00110 00000 00100', '.':'00000 00000 00000 00000 00100',
  ',':'00000 00000 00000 00100 01000', ':':'00000 00100 00000 00100 00000', '-':'00000 00000 01110 00000 00000', '+':'00100 00100 11111 00100 00100',
  '=':'00000 11111 00000 11111 00000', '<':'00010 00100 01000 00100 00010', '>':'01000 00100 00010 00100 01000', '/':'00001 00010 00100 01000 10000'
};
const PLAIN: Record<string, string> = {'Ä':'A', 'Ö':'O', 'Ü':'U', 'ß':'S'};
/** Ein Zeichen von »zeige Text«. */
export function charPixels(char: string): Pixels {
  const upper = char.toUpperCase();
  return fromBits(FONT[PLAIN[upper] ?? upper] ?? FONT['?']);
}

/** Ziffern für zweistellige Zahlen: zwei Punkte breit, fünf hoch. */
const SMALL = ['11 11 11 11 11', '01 01 01 01 01', '11 01 11 10 11', '11 01 11 01 11', '10 10 11 01 01',
  '11 10 11 01 11', '10 10 11 11 11', '11 01 01 01 01', '11 11 00 11 11', '11 11 11 01 01'].map(d => d.split(' '));
/** »zeige Zahl«: −99 bis 99; eine Ziffer allein groß, zwei nebeneinander, ein Minus als Strich links oder als matter Punkt in der Mitte. */
export function numberPixels(value: number): Pixels {
  const n = Math.round(value);
  if (n > 99) return charPixels('>');
  if (n < -99) return charPixels('<');
  if (n >= 0 && n < 10) return charPixels(String(n));
  const pixels = [...DISPLAY_OFF], abs = Math.abs(n);
  const put = (digit: number, column: number) => SMALL[digit].forEach((row, y) => { for (let x = 0; x < 2; x++) if (row[x] === '1') pixels[y * 5 + column + x] = 100; });
  put(abs % 10, 3);
  if (abs >= 10){ put(Math.floor(abs / 10), 0); if (n < 0) pixels[12] = 50; }
  else pixels[10] = pixels[11] = 100;
  return pixels;
}

/** »zeige Bild«: eines der Bilder, die Pybricks unter einem Namen kennt. */
export const iconPixels = (name: string): Pixels => ICON_PATTERNS[name] ? fromBits(ICON_PATTERNS[name][1].join('')) : [...DISPLAY_OFF];
