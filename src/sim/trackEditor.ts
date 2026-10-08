// ---------------------------------------------------------------
// Simulator – Bahn bauen: zeichnet eine Bahn aus Platten (tiles.ts) und stellt die Leiste, mit der
// man sie baut – Platten zur Auswahl, grüner Punkt, Radierer, Größe, Vorlagen, Speichern und Öffnen.
// Auf welches Feld getippt wurde, meldet die Ansicht (view.ts); hier wird daraus die neue Bahn.
// ---------------------------------------------------------------
import { saveFile } from '../files';
import {
  LINE_MM, MAP_LIMITS, openEnds, readTileMap, resizeMap, tapTile, TEMPLATES, TILE_KINDS, TILE_MM, TILE_NAMES, tileShapes, turnTile,
  cellAt, type Tile, type TileMap, type Tool
} from './tiles';
import type { Point } from './world';

const COLORS = {line:'#000000', green:'#1FA84A', red:'#D22B2B', tile:'#FFFFFF', seam:'#E4E4DF'};

/** Zeichnet eine Platte an den Ursprung, in Millimetern. */
function drawTile(g: CanvasRenderingContext2D, tile: Tile, lineWidth = LINE_MM){
  const {lines, rects} = tileShapes(tile);
  g.strokeStyle = COLORS.line; g.lineWidth = lineWidth; g.lineJoin = 'round'; g.lineCap = 'butt';
  for (const line of lines){
    g.beginPath();
    line.forEach((p, i) => { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); });
    // ein Kreis schließt sich – sonst bliebe an seiner Naht eine Kerbe
    if (line.length > 2 && line[0].x === line[line.length - 1].x && line[0].y === line[line.length - 1].y) g.closePath();
    g.stroke();
  }
  for (const r of rects){ g.fillStyle = COLORS[r.color]; g.fillRect(r.x, r.y, r.w, r.h); }
}

/** Die ganze Bahn als Bild, ein Bildpunkt je Millimeter: weiße Platten mit feinen Fugen, darauf Linien und Punkte. */
export function renderTiles(map: TileMap): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = map.cols * TILE_MM; canvas.height = map.rows * TILE_MM;
  const g = canvas.getContext('2d')!;
  g.fillStyle = COLORS.tile; g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = COLORS.seam; g.lineWidth = 2;
  g.beginPath();
  for (let col = 0; col <= map.cols; col++){ g.moveTo(col * TILE_MM, 0); g.lineTo(col * TILE_MM, canvas.height); }
  for (let row = 0; row <= map.rows; row++){ g.moveTo(0, row * TILE_MM); g.lineTo(canvas.width, row * TILE_MM); }
  g.stroke();
  map.tiles.forEach((tile, i) => {
    if (!tile) return;
    g.save(); g.translate((i % map.cols) * TILE_MM, Math.floor(i / map.cols) * TILE_MM); drawTile(g, tile); g.restore();
  });
  return canvas;
}

/** Das Bildchen auf einem Knopf der Auswahl. */
function icon(tool: Tool): HTMLCanvasElement {
  const size = 28, canvas = document.createElement('canvas'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = size * dpr; canvas.style.width = canvas.style.height = size + 'px';
  const g = canvas.getContext('2d')!;
  g.scale(size * dpr / TILE_MM, size * dpr / TILE_MM);
  g.fillStyle = COLORS.tile; g.beginPath(); g.roundRect(0, 0, TILE_MM, TILE_MM, 36); g.fill();
  // (die Linie kräftiger als auf der Bahn – in dieser Größe wäre sie sonst ein Haar)
  if (tool === 'green') drawTile(g, {kind:'cross', turn:0}, 30);
  else if (tool !== 'erase') drawTile(g, {kind:tool, turn:0}, 34);
  if (tool === 'green'){ g.fillStyle = COLORS.green; g.fillRect(174, 174, 86, 86); }
  if (tool === 'erase'){
    g.strokeStyle = '#B0303C'; g.lineWidth = 30; g.lineCap = 'round';
    g.beginPath(); g.moveTo(85, 85); g.lineTo(215, 215); g.moveTo(215, 85); g.lineTo(85, 215); g.stroke();
  }
  return canvas;
}

export interface TrackEditorHost {
  /** Die Bahn, an der gebaut wird. */
  map(): TileMap;
  /** Eine neue Bahn gilt. `fresh`: Sie ist eine andere (Vorlage, Datei) – der Roboter beginnt neu. */
  change(map: TileMap, fresh?: boolean): void;
  toast(message: string): void;
}
export interface TrackEditor {
  /** Ein Tipp auf die Bahn (Millimeter) mit dem gewählten Werkzeug. */
  tap(at: Point): void;
  /** Dreht oder leert das Feld unter einem Punkt (Tasten R und Entf). */
  turn(at: Point): void;
  erase(at: Point): void;
  /** Zeigt Größe und offene Enden der Bahn an – nach jeder Änderung aufrufen. */
  refresh(): void;
}

const TOOLS: {tool: Tool; name: string}[] = [
  ...TILE_KINDS.map(kind => ({tool:kind as Tool, name:TILE_NAMES[kind]})),
  {tool:'green', name:'Grüner Punkt'},
  {tool:'erase', name:'Radierer'}
];

export function initTrackEditor(root: HTMLElement, host: TrackEditorHost): TrackEditor {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const palette = el('simTiles'), hint = el('simTrackHint'), fileInput = el<HTMLInputElement>('simTrackFile');
  const templates = el<HTMLSelectElement>('simTemplate');
  let tool: Tool = 'straight';

  // ---- Auswahl der Platten ----
  const buttons = TOOLS.map(({tool:t, name}) => {
    const button = document.createElement('button');
    button.type = 'button'; button.title = name; button.setAttribute('aria-label', name); button.setAttribute('role', 'radio');
    button.appendChild(icon(t));
    button.addEventListener('click', () => { tool = t; mark(); });
    palette.appendChild(button);
    return {tool:t, button};
  });
  const mark = () => { for (const b of buttons) b.button.setAttribute('aria-checked', String(b.tool === tool)); };

  // ---- Größe ----
  const resize = (cols: number, rows: number) => {
    const now = host.map(), next = resizeMap(now, now.cols + cols, now.rows + rows);
    if (next.cols !== now.cols || next.rows !== now.rows) host.change(next);
  };
  el('simColsLess').addEventListener('click', () => resize(-1, 0)); el('simColsMore').addEventListener('click', () => resize(1, 0));
  el('simRowsLess').addEventListener('click', () => resize(0, -1)); el('simRowsMore').addEventListener('click', () => resize(0, 1));

  // ---- Vorlagen ----
  for (const t of TEMPLATES){ const option = document.createElement('option'); option.value = t.id; option.textContent = t.name; templates.appendChild(option); }
  templates.addEventListener('change', () => {
    const template = TEMPLATES.find(t => t.id === templates.value);
    templates.value = '';
    if (template) host.change(template.make(), true);
  });

  // ---- Speichern und Öffnen: die Bahn als Datei, zum Weitergeben ----
  el('simTrackSave').addEventListener('click', async () => {
    try { if (await saveFile('blockwerk-bahn.json', JSON.stringify({format:'blockwerk-bahn', version:1, bahn:host.map()}, null, 1), 'application/json')) host.toast('Bahn gespeichert.'); }
    catch (err){ console.error(err); host.toast('Die Bahn ließ sich nicht speichern.'); }
  });
  el('simTrackOpen').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file) return;
    let map: TileMap | null = null;
    try { const data = JSON.parse(await file.text()); map = readTileMap(data?.format === 'blockwerk-bahn' ? data.bahn : data); } catch { /* keine Bahn */ }
    if (map) host.change(map, true); else host.toast('Diese Datei enthält keine Bahn von Blockwerk.');
  });

  function refresh(){
    const map = host.map(), L = MAP_LIMITS, open = openEnds(map);
    el('simCols').textContent = String(map.cols); el('simRows').textContent = String(map.rows);
    el<HTMLButtonElement>('simColsLess').disabled = map.cols <= L.minCols; el<HTMLButtonElement>('simColsMore').disabled = map.cols >= L.maxCols;
    el<HTMLButtonElement>('simRowsLess').disabled = map.rows <= L.minRows; el<HTMLButtonElement>('simRowsMore').disabled = map.rows >= L.maxRows;
    // (nur, was man der Bahn nicht ansieht: Linien, die nirgends ankommen)
    hint.textContent = open === 1 ? '1 Linienende läuft ins Leere' : open ? `${open} Linienenden laufen ins Leere` : '';
  }

  const act = (next: TileMap) => { if (next !== host.map()) host.change(next); };
  mark(); refresh();
  return {
    tap(at){ act(tapTile(host.map(), tool, at)); },
    turn(at){ const cell = cellAt(host.map(), at); if (cell) act(turnTile(host.map(), cell.col, cell.row)); },
    erase(at){ act(tapTile(host.map(), 'erase', at)); },
    refresh
  };
}
