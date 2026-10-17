// ---------------------------------------------------------------
// Simulator – Bahn aus Platten, wie bei RoboCup Junior Rescue Line: quadratische Platten von 30 cm
// mit schwarzer Linie, auf ein Raster gelegt und gedreht. An Abzweigen, Kreuzungen und am Kreisel
// sagen grüne Punkte neben der Linie, wohin es geht (links, rechts, mit zweien: umkehren). Gerechnet wird
// in Millimetern; gezeichnet wird daraus in trackEditor.ts. (Ohne DOM.)
// ---------------------------------------------------------------
import type { Point, Pose } from './world';

/** Kantenlänge einer Platte, Breite der Linie und Kantenlänge eines grünen Punkts, in Millimetern. */
export const TILE_MM = 300, LINE_MM = 15, GREEN_MM = 25;
/** So klein und so groß darf eine Bahn sein (in Platten). */
export const MAP_LIMITS = {minCols:2, maxCols:8, minRows:2, maxRows:6};

/**
 * Alle Platten, in der Reihenfolge der Auswahl. Vorlage für die meisten ist der Satz »RCJA Rescue Line Small Tiles V2«
 * (rcja.app, Rescue Line → Tiles): Die Formen sind nach dessen Maßen nachgezeichnet, nicht übernommen.
 */
export const TILE_KINDS = [
  'straight', 'gap', 'dashed', 'curve', 'gentle', 'corner', 'diagonal', 'squarecorner', 'hexcorner', 'hook',
  'tee', 'cross', 'gapcross', 'doublecurve', 'doublechamfer',
  'zigzag', 'trianglebig', 'trianglesmall', 'wave', 'sbend', 'semicircle', 'hairpin', 'hexwave', 'squarewave',
  'circle', 'round2', 'roundpart', 'deadend', 'end', 'start', 'goal', 'night', 'inverted', 'filler', 'blank'
] as const;
export type TileKind = typeof TILE_KINDS[number];
export const TILE_NAMES: Record<TileKind, string> = {
  straight:'Gerade', gap:'Lücke', dashed:'Gestrichelte Linie', curve:'Kurve', gentle:'Sanfte Welle', corner:'Ecke',
  diagonal:'Ecke mit Diagonale', squarecorner:'Stufenecke', hexcorner:'Schräge Ecke', hook:'Haken',
  tee:'Abzweig', cross:'Kreuzung', gapcross:'Kreuzung mit Lücke', doublecurve:'Zwei Kurven', doublechamfer:'Zwei schräge Ecken',
  zigzag:'Zickzack', trianglebig:'Dreieckswelle groß', trianglesmall:'Dreieckswelle klein', wave:'Schlangenlinie',
  sbend:'S-Kurve', semicircle:'Halbkreis', hairpin:'Haarnadel', hexwave:'Trapezwelle', squarewave:'Rechteckwelle',
  circle:'Kreisel', round2:'Kreisel mit zwei Zufahrten', roundpart:'Dreiviertelkreisel', deadend:'Sackgasse',
  end:'Linienende', start:'Start', goal:'Ziellinie (rot)', night:'Nachtfahrt (weiß auf schwarz)',
  inverted:'Rechteckwelle weiß auf schwarz', filler:'Grüne Fläche', blank:'Leere Platte'
};

/**
 * Eine Platte: `turn` dreht sie in Vierteldrehungen im Uhrzeigersinn. `green` sind ihre grünen Punkte als
 * Bitmaske: an Abzweig und Kreuzung die vier Ecken im Uhrzeigersinn ab oben links (1, 2, 4, 8), am Kreisel
 * je Einfahrt zwei, links und rechts der Linie (ab der oberen Einfahrt im Uhrzeigersinn, acht Stellen) –
 * gezählt an der ungedrehten Platte: Sie drehen sich mit.
 */
export interface Tile { kind: TileKind; turn: number; green?: number }
/** Eine Bahn: `tiles` zeilenweise von links oben; null ist ein leeres Feld. */
export interface TileMap { cols: number; rows: number; tiles: (Tile | null)[] }
/** Womit ein Feld angetippt wird: eine Platte, der grüne Punkt oder der Radierer. */
export type Tool = TileKind | 'green' | 'erase';

export interface TileRect { x: number; y: number; w: number; h: number; color: 'green' | 'red' }
/**
 * Was auf einer Platte zu zeichnen ist, in Millimetern ab ihrer linken oberen Ecke: Linienzüge und Flächen – und der
 * Untergrund, wenn er nicht weiß ist (schwarz: Die Linie ist dann weiß; grün: eine ganz grüne Platte).
 */
export interface TileShapes { lines: Point[][]; rects: TileRect[]; ground?: 'black' | 'green' }

const C = TILE_MM / 2, T = TILE_MM;
const round = (v: number) => Math.round(v * 100) / 100;
const pt = (x: number, y: number): Point => ({x:round(x), y:round(y)});
/** Ein Kreisbogen als Linienzug (Winkel in Grad, 0 zeigt nach rechts, im Uhrzeigersinn). */
const arc = (cx: number, cy: number, r: number, from: number, to: number, steps = 24): Point[] =>
  Array.from({length:steps + 1}, (_, i) => { const a = (from + (to - from) * i / steps) * Math.PI / 180; return pt(cx + r * Math.cos(a), cy + r * Math.sin(a)); });
/** Eine geschwungene Kurve (kubische Bézierkurve) als Linienzug – ohne ihren Anfangspunkt, zum Aneinanderhängen. */
const bend = (p0: Point, p1: Point, p2: Point, p3: Point, steps = 14): Point[] =>
  Array.from({length:steps}, (_, i) => { const t = (i + 1) / steps, u = 1 - t;
    return pt(u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x, u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y); });

/** Ein Linienzug, der einer Formel folgt: `y(x)` von `from` bis `to`, in `steps` Stücken. */
const graph = (from: number, to: number, y: (x: number) => number, steps = 24): Point[] =>
  Array.from({length:steps + 1}, (_, i) => { const x = from + (to - from) * i / steps; return pt(x, y(x)); });
/** Ein Rechteck mit runden Ecken als Linienzug, gegen den Uhrzeigersinn ab der Unterkante bei `start` bis `end` (dazwischen offen). */
function roundedBox(left: number, top: number, right: number, bottom: number, r: number, start: number, end: number): Point[] {
  return [pt(start, bottom), ...arc(left + r, bottom - r, r, 90, 180, 8), ...arc(left + r, top + r, r, 180, 270, 8),
    ...arc(right - r, top + r, r, 270, 360, 8), ...arc(right - r, bottom - r, r, 0, 90, 8), pt(end, bottom)];
}
/**
 * Die Linien jeder Platte, ungedreht: Die Gerade läuft von oben nach unten, die Kurve von unten nach rechts, der Abzweig
 * geht nach unten ab. Die Platten aus dem RCJA-Satz liegen wie dort: Die Linie kommt links herein und geht rechts hinaus.
 */
const LINES: Record<TileKind, Point[][]> = {
  straight:[[pt(C, 0), pt(C, T)]],
  // wie im RCJA-Satz: ein Viertelkreis mit 125 mm Halbmesser, an beiden Enden 25 mm gerade
  curve:[[pt(C, T), pt(C, 275), ...arc(275, 275, 125, 180, 270), pt(T, C)]],
  corner:[[pt(C, T), pt(C, C), pt(T, C)]],
  tee:[[pt(0, C), pt(T, C)], [pt(C, C), pt(C, T)]],
  cross:[[pt(C, 0), pt(C, T)], [pt(0, C), pt(T, C)]],
  gap:[[pt(C, 0), pt(C, 100)], [pt(C, 200), pt(C, T)]],
  zigzag:[[pt(C, 0), pt(C, 55), pt(95, 105), pt(205, 195), pt(C, 245), pt(C, T)]],
  wave:[[pt(C, 0), ...bend(pt(C, 0), pt(C, 50), pt(95, 50), pt(95, 100)), ...bend(pt(95, 100), pt(95, 150), pt(205, 150), pt(205, 200)), ...bend(pt(205, 200), pt(205, 250), pt(C, 250), pt(C, T))]],
  circle:[arc(C, C, 75, 0, 360, 48), [pt(C, 0), pt(C, 75)], [pt(T, C), pt(225, C)], [pt(C, T), pt(C, 225)], [pt(0, C), pt(75, C)]],
  end:[[pt(C, T), pt(C, C)], [pt(110, C), pt(190, C)]],
  goal:[[pt(C, 0), pt(C, T)]],
  // ---- nach dem RCJA-Satz »Small Tiles V2« ----
  dashed:[[pt(0, C), pt(60, C)], [pt(120, C), pt(180, C)], [pt(240, C), pt(T, C)]],
  gentle:[[pt(0, C), ...bend(pt(0, C), pt(36, C), pt(54, 121), pt(90, 121)), ...bend(pt(90, 121), pt(138, 121), pt(162, 179), pt(210, 179)),
    ...bend(pt(210, 179), pt(246, 179), pt(264, C), pt(T, C))]],
  diagonal:[[pt(C, T), pt(C, C), pt(T, C)], [pt(C, 0), pt(0, C)]],
  squarecorner:[[pt(0, C), pt(50, C), pt(50, 116), pt(184, 116), pt(184, 250), pt(C, 250), pt(C, T)]],
  hexcorner:[[pt(0, C), pt(171, 187), pt(214, 135), pt(C, 0)]],
  hook:[[pt(C, T), pt(C, 212), pt(66, 212), pt(66, 89), pt(236, 89), pt(236, C), pt(T, C)]],
  gapcross:[[pt(0, C), pt(60, C)], [pt(240, C), pt(T, C)], [pt(C, 0), pt(C, 60)], [pt(C, 240), pt(C, T)]],
  doublecurve:[[pt(C, 0), pt(C, 25), ...arc(25, 25, 125, 0, 90), pt(0, C)], [pt(C, T), pt(C, 275), ...arc(275, 275, 125, 180, 270), pt(T, C)]],
  doublechamfer:[[pt(0, C), pt(70, C), pt(C, 70), pt(C, 0)], [pt(C, T), pt(C, 230), pt(230, C), pt(T, C)]],
  trianglebig:[[pt(0, C), pt(34, C), pt(103, 95), pt(188, 206), pt(265, C), pt(T, C)]],
  trianglesmall:[[pt(0, C), pt(75, 200), pt(226, 100), pt(T, C)]],
  sbend:[[pt(0, C), ...graph(59, 233, x => C - 44 * Math.sin(2 * Math.PI * (x - 59) / 174)), pt(T, C)]],
  semicircle:[[pt(0, C), pt(75, C), ...arc(C, C, 75, 180, 0), pt(225, C), pt(T, C)]],
  hairpin:[[pt(0, C), pt(51, C), pt(51, 212), ...arc(100.5, 212, 49.5, 180, 0), pt(C, 88), ...arc(199.5, 88, 49.5, 180, 360), pt(249, C), pt(T, C)]],
  hexwave:[[pt(0, C), pt(27, C), pt(50, 90), pt(116, 90), pt(173, 210), pt(240, 210), pt(271, C), pt(T, C)]],
  squarewave:[[pt(0, C), pt(41, C), pt(41, 93), pt(C, 93), pt(C, 205), pt(260, 205), pt(260, C), pt(T, C)]],
  // Kreisel nach RCJA: Kreis mit 86 mm Halbmesser, Zufahrten oben und rechts; der Dreiviertelkreisel ohne das Stück dazwischen
  round2:[arc(C, C, 86, 0, 360, 48), [pt(C, 0), pt(C, 64)], [pt(T, C), pt(236, C)]],
  roundpart:[arc(C, C, 86, 0, 270, 36), [pt(C, 0), pt(C, 64)], [pt(T, C), pt(236, C)]],
  // die Sackgasse: links und rechts herein, dazwischen eine eckige Schleife, die unten offen ist – zwei grüne Punkte heißen »umdrehen«
  deadend:[[pt(0, C), pt(62, C)], [pt(238, C), pt(T, C)], roundedBox(62, 62, 238, 238, 17.5, 120, 180)],
  start:[[pt(0, C), pt(C, C)], [pt(C, 50), pt(C, 250)]],
  night:[[pt(0, C), pt(T, C)]],
  inverted:[[pt(0, C), pt(41, C), pt(41, 93), pt(C, 93), pt(C, 205), pt(260, 205), pt(260, C), pt(T, C)]],
  filler:[],
  blank:[]
};
/** Platten mit anderem Untergrund als Weiß. */
const GROUND: Partial<Record<TileKind, 'black' | 'green'>> = {night:'black', inverted:'black', filler:'green'};
const turns = (turn: number) => ((Math.round(turn) % 4) + 4) % 4;
/** Dreht einen Punkt der Platte um ihre Mitte, in Vierteldrehungen im Uhrzeigersinn. */
function spin(p: Point, turn: number): Point {
  let {x, y} = p;
  for (let i = 0; i < turns(turn); i++) [x, y] = [T - y, x];
  return pt(x, y);
}

/** So weit neben der Mitte einer Linie liegt die Mitte eines grünen Punkts: direkt an ihrem Rand. */
const GREEN_AT = (LINE_MM + GREEN_MM) / 2;
/** Am Kreisel: so weit unter der Oberkante der Platte liegt ein grüner Punkt neben der Einfahrt – knapp vor dem Kreis. */
const GREEN_AT_CIRCLE = 52;
/**
 * Wo auf einer Platte grüne Punkte liegen können, ungedreht. An Abzweig und Kreuzung sind es die vier Ecken
 * (ab oben links im Uhrzeigersinn), direkt an beiden Linien; am Kreisel je Einfahrt zwei, links und rechts der Linie.
 */
function greenSpots(kind: TileKind): Point[] {
  if (kind === 'tee' || kind === 'cross') return [0, 1, 2, 3].map(corner => pt(C + (corner === 1 || corner === 2 ? GREEN_AT : -GREEN_AT), C + (corner >= 2 ? GREEN_AT : -GREEN_AT)));
  if (kind === 'circle') return [0, 1, 2, 3].flatMap(entry => [pt(C - GREEN_AT, GREEN_AT_CIRCLE), pt(C + GREEN_AT, GREEN_AT_CIRCLE)].map(p => spin(p, entry)));
  // Kreisel mit zwei Zufahrten (oben und rechts): je Zufahrt links und rechts der Linie, kurz vor dem Kreis
  if (kind === 'round2' || kind === 'roundpart'){
    const before = 64 - GREEN_MM / 2 - 2;
    return [pt(C - GREEN_AT, before), pt(C + GREEN_AT, before), pt(T - before, C - GREEN_AT), pt(T - before, C + GREEN_AT)];
  }
  // Sackgasse: an beiden Einfahrten über und unter der Linie
  if (kind === 'deadend') return [pt(31, C - GREEN_AT), pt(269, C - GREEN_AT), pt(269, C + GREEN_AT), pt(31, C + GREEN_AT)];
  return [];
}
/** Ob eine Platte grüne Punkte bekommen kann: dort, wo sich Linien treffen. */
export const takesGreen = (kind: TileKind) => greenSpots(kind).length > 0;

/** Was auf dieser Platte zu zeichnen ist – gedreht, wie sie liegt. */
export function tileShapes(tile: Tile): TileShapes {
  const turn = turns(tile.turn), rects: TileRect[] = [];
  const square = (centre: Point, w: number, h: number, color: TileRect['color']) => {
    const c = spin(centre, turn), [rw, rh] = turn % 2 ? [h, w] : [w, h];
    rects.push({x:round(c.x - rw / 2), y:round(c.y - rh / 2), w:rw, h:rh, color});
  };
  // die Ziellinie: ein roter Streifen quer über die Platte
  if (tile.kind === 'goal') square(pt(C, C), T, GREEN_MM, 'red');
  greenSpots(tile.kind).forEach((spot, i) => { if ((tile.green ?? 0) & (1 << i)) square(spot, GREEN_MM, GREEN_MM, 'green'); });
  const ground = GROUND[tile.kind];
  return {lines:LINES[tile.kind].map(line => line.map(p => spin(p, turn))), rects, ...(ground ? {ground} : {})};
}

const SIDES = ['N', 'E', 'S', 'W'] as const;
type Side = typeof SIDES[number];
/** An welchen Seiten der Platte eine Linie ankommt, zum Beispiel »ES« für eine Kurve von rechts nach unten. */
export function tileExits(tile: Tile): string {
  const found = new Set<Side>();
  for (const line of tileShapes(tile).lines) for (const p of [line[0], line[line.length - 1]]){
    if (p.y === 0) found.add('N'); else if (p.x === T) found.add('E'); else if (p.y === T) found.add('S'); else if (p.x === 0) found.add('W');
  }
  return SIDES.filter(s => found.has(s)).join('');
}

export const tileAt = (map: TileMap, col: number, row: number): Tile | null =>
  col >= 0 && row >= 0 && col < map.cols && row < map.rows ? map.tiles[row * map.cols + col] ?? null : null;
/** Das Feld unter einem Punkt der Bahn (Millimeter) – oder null, wenn er daneben liegt. */
export function cellAt(map: TileMap, at: Point): {col: number; row: number} | null {
  const col = Math.floor(at.x / T), row = Math.floor(at.y / T);
  return col >= 0 && row >= 0 && col < map.cols && row < map.rows ? {col, row} : null;
}
function withTile(map: TileMap, col: number, row: number, tile: Tile | null): TileMap {
  const tiles = [...map.tiles];
  tiles[row * map.cols + col] = tile;
  return {...map, tiles};
}

/**
 * Ein Tipp auf die Bahn mit einem Werkzeug. Eine Platte setzt sich auf das Feld; liegt dort schon dieselbe,
 * dreht sie sich um eine Vierteldrehung. Der grüne Punkt schaltet an Abzweig, Kreuzung und Kreisel den Punkt
 * um, der dem Tipp am nächsten liegt. Liefert die Bahn unverändert zurück, wenn der Tipp nichts bewirkt.
 */
export function tapTile(map: TileMap, tool: Tool, at: Point): TileMap {
  const cell = cellAt(map, at);
  if (!cell) return map;
  const tile = tileAt(map, cell.col, cell.row);
  if (tool === 'erase') return tile ? withTile(map, cell.col, cell.row, null) : map;
  if (tool === 'green'){
    const spots = tile ? greenSpots(tile.kind) : [];
    if (!tile || !spots.length) return map;
    // die Stelle, die dem Tipp am nächsten liegt – so, wie die Platte gedreht ist
    const x = at.x - cell.col * T, y = at.y - cell.row * T;
    const far = spots.map(spot => { const p = spin(spot, tile.turn); return Math.hypot(p.x - x, p.y - y); });
    const green = (tile.green ?? 0) ^ (1 << far.indexOf(Math.min(...far)));
    return withTile(map, cell.col, cell.row, green ? {...tile, green} : {kind:tile.kind, turn:tile.turn});
  }
  if (tile?.kind === tool) return withTile(map, cell.col, cell.row, {...tile, turn:turns(tile.turn + 1)});
  // eine andere Platte übernimmt, wie die alte lag – so wird aus einer Geraden an Ort und Stelle eine Lücke
  return withTile(map, cell.col, cell.row, {kind:tool, turn:turns(tile?.turn ?? 0)});
}
/** Dreht die Platte auf einem Feld um eine Vierteldrehung. */
export function turnTile(map: TileMap, col: number, row: number): TileMap {
  const tile = tileAt(map, col, row);
  return tile ? withTile(map, col, row, {...tile, turn:turns(tile.turn + 1)}) : map;
}

/** Eine Bahn mit anderer Größe; was hineinpasst, bleibt liegen (von links oben aus). */
export function resizeMap(map: TileMap, cols: number, rows: number): TileMap {
  const L = MAP_LIMITS, c = Math.max(L.minCols, Math.min(L.maxCols, Math.round(cols))), r = Math.max(L.minRows, Math.min(L.maxRows, Math.round(rows)));
  const tiles = Array.from({length:c * r}, (_, i) => tileAt(map, i % c, Math.floor(i / c)));
  return {cols:c, rows:r, tiles};
}
export const mapSize = (map: TileMap) => ({width:map.cols * T, height:map.rows * T});

/** So viele Linienenden laufen ins Leere: an den Rand der Bahn oder auf ein Feld, das dort keine Linie hat. */
export function openEnds(map: TileMap): number {
  const step: Record<Side, [number, number, Side]> = {N:[0, -1, 'S'], E:[1, 0, 'W'], S:[0, 1, 'N'], W:[-1, 0, 'E']};
  let open = 0;
  for (let row = 0; row < map.rows; row++) for (let col = 0; col < map.cols; col++){
    const tile = tileAt(map, col, row);
    if (!tile) continue;
    for (const side of tileExits(tile) as unknown as Side[]){
      const [dx, dy, back] = step[side], next = tileAt(map, col + dx, row + dy);
      if (!next || !tileExits(next).includes(back)) open++;
    }
  }
  return open;
}

/**
 * Wo der Roboter auf einer neuen Bahn beginnt: auf der untersten Geraden, mitten auf der Linie, in ihre
 * Richtung schauend. Gibt es keine Gerade, in der Mitte der Bahn.
 */
export function startPose(map: TileMap): Pose {
  for (let row = map.rows - 1; row >= 0; row--) for (let col = 0; col < map.cols; col++){
    const tile = tileAt(map, col, row);
    if (tile?.kind !== 'straight') continue;
    const across = turns(tile.turn) % 2 === 1;   // liegt quer: von links nach rechts
    return {x:(col + 0.5) * T - (across ? 50 : 0), y:(row + 0.5) * T + (across ? 0 : 50), heading:across ? 0 : -90};
  }
  return {x:map.cols * C, y:map.rows * C, heading:0};
}

/** Prüft eine Bahn aus einer Datei oder aus dem Speicher; liefert null, wenn sie nicht stimmt. */
export function readTileMap(value: unknown): TileMap | null {
  const v = value as Partial<TileMap> | null, L = MAP_LIMITS;
  if (!v || typeof v !== 'object' || !Number.isInteger(v.cols) || !Number.isInteger(v.rows) || !Array.isArray(v.tiles)) return null;
  const cols = v.cols as number, rows = v.rows as number;
  if (cols < L.minCols || cols > L.maxCols || rows < L.minRows || rows > L.maxRows || v.tiles.length !== cols * rows) return null;
  const tiles: (Tile | null)[] = [];
  for (const raw of v.tiles as unknown[]){
    if (raw === null){ tiles.push(null); continue; }
    const t = raw as Partial<Tile>;
    if (!t || typeof t !== 'object' || !TILE_KINDS.includes(t.kind as TileKind) || !Number.isInteger(t.turn)) return null;
    const green = Number.isInteger(t.green) ? (t.green as number) & ((1 << greenSpots(t.kind as TileKind).length) - 1) : 0;
    tiles.push(green ? {kind:t.kind as TileKind, turn:turns(t.turn as number), green} : {kind:t.kind as TileKind, turn:turns(t.turn as number)});
  }
  return {cols, rows, tiles};
}

// Vorlagen, in Kurzschrift: je Feld ein Buchstabe für die Platte und die Zahl der Vierteldrehungen, nach
// einem Plus die grünen Punkte; »..« ist ein leeres Feld.
const CODES: Record<string, TileKind> = {s:'straight', c:'curve', k:'corner', t:'tee', x:'cross', g:'gap', z:'zigzag', w:'wave', o:'circle', e:'end', f:'goal',
  D:'dashed', X:'hexwave', B:'sbend', H:'hairpin', Q:'squarewave', M:'semicircle', G:'gentle'};
function build(...rows: string[]): TileMap {
  const cells = rows.map(row => row.trim().split(/\s+/));
  const tiles = cells.flat().map((code): Tile | null => {
    if (code === '..') return null;
    const [, kind, turn, green] = /^([a-zA-Z])(\d)(?:\+(\d+))?$/.exec(code)!;
    return green ? {kind:CODES[kind], turn:Number(turn), green:Number(green)} : {kind:CODES[kind], turn:Number(turn)};
  });
  return {cols:cells[0].length, rows:cells.length, tiles};
}
/** Bahnen zum Anfangen. Die erste ist die, mit der der Simulator beginnt. */
export const TEMPLATES: {id: string; name: string; make(): TileMap}[] = [
  {id:'rundkurs', name:'Rundkurs', make:() => build(
    'c0 s1 s1 c1',
    's0 .. .. s0',
    'c3 s1 s1 c2')},
  // Am oberen Abzweig sagt der grüne Punkt »links ab« (für den, der oben von rechts kommt), am unteren wieder »links«
  {id:'abkuerzung', name:'Abkürzung mit grünen Punkten', make:() => build(
    'c0 t0+4 s1 c1',
    's0 s0   .. s0',
    'c3 t2+8 s1 c2')},
  {id:'parcours', name:'Parcours: Lücke, Schlangenlinie, Zickzack, Ziel', make:() => build(
    'c0 s1 g1 s1 w1 c1',
    's0 .. .. .. .. z0',
    's0 .. .. .. .. s0',
    'c3 s1 f1 s1 s1 c2')},
  {id:'rcja', name:'Rundkurs mit RCJA-Platten', make:() => build(
    'c0 D0 X0 B0 c1',
    's0 .. .. .. s0',
    's0 .. .. .. H1',
    'c3 Q0 M0 G0 c2')},
  {id:'leer', name:'Leere Fläche', make:() => ({cols:4, rows:3, tiles:new Array(12).fill(null)})}
];
