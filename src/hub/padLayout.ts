// ---------------------------------------------------------------
// Steuerfeld, Controller-Ansicht: Anordnung von Joysticks und Tasten in einem Raster.
// Ohne DOM – die Ansicht selbst steht in padView.ts.
// Jedes Teil ist ein Quadrat aus Rasterfeldern; zwei Teile dürfen sich nicht überdecken.
// Jedes Format hat ein eigenes Raster und eine eigene Anordnung: quer (Tablet), hoch und
// flach (Handy im Querformat – dort wären die Felder des Tablet-Rasters zu niedrig für die Daumen).
// Joystick 1 und die Tasten A bis D gibt es immer; weitere Joysticks und die Tasten E bis J lassen
// sich hinzufügen und wieder entfernen. Alle drei Formate haben dieselben Teile.
// ---------------------------------------------------------------
import { PAD_BUTTONS, PAD_STICKS, type PadButton } from './padProtocol';

/** `stick` ist Joystick 1, `stick2` und `stick3` die weiteren. */
export type StickId = 'stick' | 'stick2' | 'stick3';
export type TileId = StickId | PadButton;
export type Orientation = 'quer' | 'flach' | 'hoch';
export interface Tile { id: TileId; col: number; row: number; size: number }
export interface Grid { cols: number; rows: number }
export type PadLayouts = Record<Orientation, Tile[]>;

export const STICK_IDS: StickId[] = (['stick', 'stick2', 'stick3'] as StickId[]).slice(0, PAD_STICKS);
/** Alle Teile, die es geben kann, in der Reihenfolge für Anzeige und Speicher. */
export const TILE_IDS: TileId[] = [...STICK_IDS, ...PAD_BUTTONS];
/** Diese Teile sind immer da. */
export const BASE_IDS: TileId[] = ['stick', 'A', 'B', 'C', 'D'];
export const isStick = (id: TileId): id is StickId => id.startsWith('stick');
/** Nummer des Joysticks, gezählt ab 1. */
export const stickNumber = (id: StickId) => STICK_IDS.indexOf(id) + 1;
/** Name zum Vorlesen und für Hinweise, zum Beispiel »Joystick 2« oder »Taste E«. */
export const partName = (id: TileId) => isStick(id) ? `Joystick ${stickNumber(id)}` : `Taste ${id}`;

export const GRIDS: Record<Orientation, Grid> = {quer:{cols:16, rows:8}, flach:{cols:16, rows:5}, hoch:{cols:8, rows:16}};
const ORIENTATIONS = Object.keys(GRIDS) as Orientation[];
/** Welches Raster passt zu einer Fläche dieser Größe? So gewählt, dass die Felder ungefähr quadratisch sind. */
export const orientationFor = (width: number, height: number): Orientation => width < height ? 'hoch' : width >= height * 2.4 ? 'flach' : 'quer';
/** Kleinste und größte Kantenlänge eines Teils in Rasterfeldern. */
export const sizeRange = (id: TileId): [number, number] => isStick(id) ? [2, 6] : [1, 4];

/** Ausgangslage: Joystick unten links für den linken Daumen, Tasten unten rechts für den rechten. */
export function defaultLayout(o: Orientation): Tile[] {
  switch (o){
    // Tasten als Raute wie bei einem Gamepad
    case 'quer': return [{id:'stick', col:1, row:4, size:3},
      {id:'D', col:12, row:2, size:2}, {id:'C', col:10, row:4, size:2}, {id:'B', col:14, row:4, size:2}, {id:'A', col:12, row:6, size:2}];
    // für die Raute reicht die Höhe nicht: Tasten im Viereck
    case 'flach': return [{id:'stick', col:1, row:2, size:3},
      {id:'C', col:11, row:1, size:2}, {id:'D', col:13, row:1, size:2}, {id:'A', col:11, row:3, size:2}, {id:'B', col:13, row:3, size:2}];
    case 'hoch': return [{id:'stick', col:0, row:11, size:3},
      {id:'C', col:4, row:10, size:2}, {id:'D', col:6, row:10, size:2}, {id:'A', col:4, row:12, size:2}, {id:'B', col:6, row:12, size:2}];
  }
}
export const defaultLayouts = (): PadLayouts => ({quer:defaultLayout('quer'), flach:defaultLayout('flach'), hoch:defaultLayout('hoch')});

const overlap = (a: Tile, b: Tile) => a.col < b.col + b.size && b.col < a.col + a.size && a.row < b.row + b.size && b.row < a.row + a.size;
const inside = (t: Tile, g: Grid) => t.col >= 0 && t.row >= 0 && t.col + t.size <= g.cols && t.row + t.size <= g.rows;

/** Passt das Teil an diese Stelle – im Raster und ohne ein anderes zu überdecken? */
export function fits(tiles: Tile[], tile: Tile, grid: Grid): boolean {
  const [min, max] = sizeRange(tile.id);
  return tile.size >= min && tile.size <= max && inside(tile, grid) && tiles.every(t => t.id === tile.id || !overlap(t, tile));
}

/** Schiebt ein Teil an eine andere Stelle. Liefert null, wenn dort kein Platz ist. */
export function moveTile(tiles: Tile[], id: TileId, col: number, row: number, grid: Grid): Tile[] | null {
  const old = tiles.find(t => t.id === id);
  if (!old) return null;
  const next = {...old, col, row};
  return fits(tiles, next, grid) ? tiles.map(t => t.id === id ? next : t) : null;
}

/**
 * Macht ein Teil um `delta` Felder größer oder kleiner. Es wächst möglichst um seine Mitte;
 * ist dort kein Platz, bleibt eine der Ecken stehen. Liefert null, wenn es nirgends passt.
 */
export function resizeTile(tiles: Tile[], id: TileId, delta: number, grid: Grid): Tile[] | null {
  const old = tiles.find(t => t.id === id);
  if (!old) return null;
  const size = old.size + delta, shift = old.size - size;
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max - size, v));
  const tries: [number, number][] = [
    [old.col + Math.round(shift / 2), old.row + Math.round(shift / 2)],
    [old.col, old.row], [old.col + shift, old.row], [old.col, old.row + shift], [old.col + shift, old.row + shift]];
  for (const [c, r] of tries){
    const next = {...old, size, col:clamp(c, grid.cols), row:clamp(r, grid.rows)};
    if (fits(tiles, next, grid)) return tiles.map(t => t.id === id ? next : t);
  }
  return null;
}

/**
 * Sucht einen freien Platz für ein neues Teil: so groß wie die übrigen seiner Art, sonst kleiner.
 * Joysticks rücken von links ein, Tasten von rechts – jeweils von unten, wo die Daumen sind.
 */
export function placeTile(tiles: Tile[], id: TileId, grid: Grid): Tile | null {
  const [min] = sizeRange(id), stick = isStick(id);
  const same = tiles.filter(t => isStick(t.id) === stick).map(t => t.size);
  const start = same.length ? Math.max(...same) : stick ? 3 : 2;
  for (let size = start; size >= min; size--){
    for (let row = grid.rows - size; row >= 0; row--){
      for (let i = 0; i <= grid.cols - size; i++){
        const tile = {id, col:stick ? i : grid.cols - size - i, row, size};
        if (fits(tiles, tile, grid)) return tile;
      }
    }
  }
  return null;
}

/** Die Teile, die das Steuerfeld gerade hat. */
export const partsOf = (layouts: PadLayouts): TileId[] => TILE_IDS.filter(id => layouts.quer.some(t => t.id === id));

/** Das nächste Teil dieser Art, das sich hinzufügen lässt: der kleinste freie Joystick bzw. Buchstabe. */
export function nextPart(layouts: PadLayouts, kind: 'stick' | 'button'): TileId | null {
  const have = partsOf(layouts);
  return (kind === 'stick' ? STICK_IDS : PAD_BUTTONS).find(id => !have.includes(id)) ?? null;
}

/** Fügt ein Teil in allen Formaten hinzu. Liefert null, wenn es schon da ist oder in einem Format kein Platz ist. */
export function addPart(layouts: PadLayouts, id: TileId): PadLayouts | null {
  if (partsOf(layouts).includes(id)) return null;
  const out = {} as PadLayouts;
  for (const o of ORIENTATIONS){
    const tile = placeTile(layouts[o], id, GRIDS[o]);
    if (!tile) return null;
    out[o] = [...layouts[o], tile];
  }
  return out;
}

/** Nimmt ein hinzugefügtes Teil wieder weg; Joystick 1 und A bis D bleiben. */
export function removePart(layouts: PadLayouts, id: TileId): PadLayouts | null {
  if (BASE_IDS.includes(id) || !partsOf(layouts).includes(id)) return null;
  const out = {} as PadLayouts;
  for (const o of ORIENTATIONS) out[o] = layouts[o].filter(t => t.id !== id);
  return out;
}

/** Ein Format zurück auf die Ausgangslage; hinzugefügte Teile bekommen darin wieder einen freien Platz. */
export function resetLayout(layouts: PadLayouts, o: Orientation): PadLayouts {
  let tiles = defaultLayout(o);
  for (const id of partsOf(layouts)){
    if (BASE_IDS.includes(id)) continue;
    const tile = placeTile(tiles, id, GRIDS[o]);
    if (tile) tiles = [...tiles, tile];
    // passt es nicht mehr hinein, fällt es in allen Formaten weg
    else return resetLayout(removePart(layouts, id)!, o);
  }
  return {...layouts, [o]:tiles};
}

/** Welche Teile braucht ein Programm, das diese Eingaben abfragt (`x2`, `F` …)? */
export function partsFor(names: Iterable<string>): TileId[] {
  const out = new Set<TileId>();
  for (const n of names){
    const m = /^[xy]([23]?)$/.exec(n), stick = m && STICK_IDS[Number(m[1] || 1) - 1];
    if (stick) out.add(stick);
    else if (PAD_BUTTONS.includes(n as PadButton)) out.add(n as PadButton);
  }
  return TILE_IDS.filter(id => out.has(id));
}

/**
 * Prüft eine gespeicherte Anordnung. Ein Format, in dem Joystick 1 oder eine der Tasten A bis D fehlt
 * oder nicht passt, beginnt wieder mit der Ausgangslage. Hinzugefügte Teile bleiben, wo sie lagen;
 * fehlt eines in einem Format, bekommt es dort einen freien Platz – gibt es keinen, fällt es überall weg.
 */
export function sanitizeLayouts(raw: unknown): PadLayouts {
  const lists = ORIENTATIONS.map(o => {
    const list = raw && typeof raw === 'object' ? (raw as Record<string, unknown>)[o] : null;
    return Array.isArray(list) ? list : [];
  });
  const stored = (list: unknown[], id: TileId) => list.find(x => x && typeof x === 'object' && (x as Tile).id === id) as Tile | undefined;
  const extras = TILE_IDS.filter(id => !BASE_IDS.includes(id) && lists.some(list => stored(list, id)));
  let out = {} as PadLayouts;
  ORIENTATIONS.forEach((o, i) => {
    const take = (tiles: Tile[], ids: TileId[]) => {
      for (const id of ids){
        const t = stored(lists[i], id);
        if (!t || ![t.col, t.row, t.size].every(Number.isInteger)) continue;
        const tile = {id, col:t.col, row:t.row, size:t.size};
        if (fits(tiles, tile, GRIDS[o])) tiles.push(tile);
      }
      return tiles;
    };
    const base = take([], BASE_IDS);
    out[o] = take(base.length === BASE_IDS.length ? base : defaultLayout(o), extras);
  });
  for (const id of extras){
    const missing = ORIENTATIONS.filter(o => !out[o].some(t => t.id === id));
    const placed = missing.map(o => placeTile(out[o], id, GRIDS[o]));
    if (placed.every(Boolean)) missing.forEach((o, i) => { out[o] = [...out[o], placed[i]!]; });
    else out = removePart(out, id) ?? out;
  }
  return out;
}
