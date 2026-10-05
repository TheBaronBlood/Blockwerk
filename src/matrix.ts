// ---------------------------------------------------------------
// Muster für die Lichtmatrix des Hubs (5 × 5 Punkte). Ohne DOM, ohne Blockly.
// Ein Muster ist ein Text aus 25 Ziffern, zeilenweise von links oben: 0 = aus, 9 = volle
// Helligkeit – dieselbe Schreibweise wie in den Projekten der SPIKE-App.
// ---------------------------------------------------------------

/** Bilder, die Pybricks unter einem Namen kennt: Name → [Beschriftung, Zeilen aus 0 und 1]. */
export const ICON_PATTERNS: Record<string, [string, string[]]> = {
  HAPPY:['Smiley', ['00000','01010','00000','10001','01110']],
  SAD:['traurig', ['00000','01010','00000','01110','10001']],
  HEART:['Herz', ['01010','11111','11111','01110','00100']],
  ARROW_UP:['Pfeil hoch', ['00100','01110','10101','00100','00100']],
  ARROW_DOWN:['Pfeil runter', ['00100','00100','10101','01110','00100']],
  ARROW_LEFT:['Pfeil links', ['00100','01000','11111','01000','00100']],
  ARROW_RIGHT:['Pfeil rechts', ['00100','00010','11111','00010','00100']]
};
/** Weitere Vorlagen für den Muster-Editor – einfache Formen, die auf 5 × 5 Punkten gut erkennbar sind. */
const EXTRA: [string, string[]][] = [
  ['Haken', ['00000','00001','00010','10100','01000']],
  ['Kreuz', ['10001','01010','00100','01010','10001']],
  ['Quadrat', ['11111','10001','10001','10001','11111']],
  ['Kreis', ['01110','10001','10001','10001','01110']],
  ['Raute', ['00100','01010','10001','01010','00100']],
  ['Punkt', ['00000','00000','00100','00000','00000']]
];

export const EMPTY = '0'.repeat(25);
export const isPattern = (value: unknown): value is string => typeof value === 'string' && /^[0-9]{25}$/.test(value);
/** Aus Zeilen mit 0 und 1 wird ein Muster in voller Helligkeit. */
export const fromRows = (rows: string[]) => rows.join('').replace(/1/g, '9');
/** Vorlagen des Editors: [Beschriftung, Muster]. */
export const PRESETS: [string, string][] = [...Object.values(ICON_PATTERNS), ...EXTRA].map(([label, rows]) => [label, fromRows(rows)]);
export const DEFAULT_PATTERN = fromRows(ICON_PATTERNS.HAPPY[1]);

/** Ziffer 0–9 → Helligkeit in Prozent, wie Pybricks sie erwartet. */
export const brightness = (digit: number) => Math.round(digit * 100 / 9);
/** Das Muster als fünf Zeilen mit je fünf Helligkeiten in Prozent. */
export function toRows(pattern: string): number[][] {
  return [0, 1, 2, 3, 4].map(y => [0, 1, 2, 3, 4].map(x => brightness(Number(pattern[y * 5 + x]))));
}
/** Setzt einen Punkt (0–24) auf eine Helligkeit 0–9. */
export function setPixel(pattern: string, index: number, digit: number): string {
  return pattern.slice(0, index) + String(Math.max(0, Math.min(9, digit))) + pattern.slice(index + 1);
}
