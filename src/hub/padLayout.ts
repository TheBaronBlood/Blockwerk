// ---------------------------------------------------------------
// Steuerfeld, Controller-Ansicht: Anordnung von Joystick und Tasten in einem Raster.
// Ohne DOM – die Ansicht selbst steht in padView.ts.
// Jedes Teil ist ein Quadrat aus Rasterfeldern; zwei Teile dürfen sich nicht überdecken.
// Jedes Format hat ein eigenes Raster und eine eigene Anordnung: quer (Tablet), hoch und
// flach (Handy im Querformat – dort wären die Felder des Tablet-Rasters zu niedrig für die Daumen).
// ---------------------------------------------------------------
import { PAD_BUTTONS, type PadButton } from './padProtocol';

export type TileId = 'stick' | PadButton;
export type Orientation = 'quer' | 'flach' | 'hoch';
export interface Tile { id: TileId; col: number; row: number; size: number }
export interface Grid { cols: number; rows: number }
export type PadLayouts = Record<Orientation, Tile[]>;

export const TILE_IDS: TileId[] = ['stick', ...PAD_BUTTONS];
export const GRIDS: Record<Orientation, Grid> = {quer:{cols:16, rows:8}, flach:{cols:16, rows:5}, hoch:{cols:8, rows:16}};
/** Welches Raster passt zu einer Fläche dieser Größe? So gewählt, dass die Felder ungefähr quadratisch sind. */
export const orientationFor = (width: number, height: number): Orientation => width < height ? 'hoch' : width >= height * 2.4 ? 'flach' : 'quer';
/** Kleinste und größte Kantenlänge eines Teils in Rasterfeldern. */
export const sizeRange = (id: TileId): [number, number] => id === 'stick' ? [2, 6] : [1, 4];

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

/** Prüft eine gespeicherte Anordnung; alles Unbrauchbare wird durch die Ausgangslage ersetzt. */
export function sanitizeLayouts(raw: unknown): PadLayouts {
  const out = defaultLayouts();
  if (!raw || typeof raw !== 'object') return out;
  for (const o of Object.keys(GRIDS) as Orientation[]){
    const list = (raw as Record<string, unknown>)[o];
    if (!Array.isArray(list) || list.length !== TILE_IDS.length) continue;
    const tiles: Tile[] = [];
    for (const id of TILE_IDS){
      const t = list.find(x => x && typeof x === 'object' && (x as Tile).id === id) as Tile | undefined;
      if (!t || ![t.col, t.row, t.size].every(Number.isInteger)) break;
      const tile = {id, col:t.col, row:t.row, size:t.size};
      if (!fits(tiles, tile, GRIDS[o])) break;
      tiles.push(tile);
    }
    if (tiles.length === TILE_IDS.length) out[o] = tiles;
  }
  return out;
}
