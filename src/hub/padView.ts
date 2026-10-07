// ---------------------------------------------------------------
// Steuerfeld als Controller: füllt den ganzen Bildschirm, Joystick und Tasten liegen in einem
// Raster und lassen sich dort verschieben und in der Größe ändern (»Anordnen«).
// Gedacht für Tablets: große Flächen für die Daumen, mehrere Finger zugleich.
// Die Anordnung selbst (Raster, Regeln, Ausgangslage) steht in padLayout.ts.
// Auf dem hochkant gehaltenen Handy liegt die Ansicht quer (um eine Vierteldrehung gedreht, style.css):
// Ein Controller gehört ins Querformat – man dreht das Handy, auch wenn es die Anzeige nicht mitdreht.
// ---------------------------------------------------------------
import { onViewMode, viewMode } from '../viewMode';
import { capture, type Pad } from './pad';
import {
  defaultLayout, fits, GRIDS, moveTile, orientationFor, resizeTile, sanitizeLayouts, sizeRange, TILE_IDS,
  type Orientation, type PadLayouts, type TileId
} from './padLayout';

const STORE_KEY = 'blockwerk-pad-v1';

export interface PadViewState {
  /** Text der Hub-Anzeige, zum Beispiel »kein Hub« oder »Hub – läuft«. */
  hubText: string; connected: boolean; running: boolean; busy: boolean;
  /** Das Programm auf der Arbeitsfläche fragt das Steuerfeld ab. */
  usesPad: boolean;
  /** Name eines Gamepads, das mit diesem Gerät verbunden ist und das Steuerfeld bedient. */
  gamepad: string | null;
}
export interface PadView {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(state: PadViewState): void;
}
export interface PadViewActions { run(): void; stop(): void }

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string){
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function loadLayouts(): PadLayouts {
  try { return sanitizeLayouts(JSON.parse(localStorage.getItem(STORE_KEY) || 'null')); }
  catch { return sanitizeLayouts(null); }
}

export function initPadView(pad: Pad, actions: PadViewActions): PadView {
  let layouts = loadLayouts();
  let orientation: Orientation = 'quer';
  let editing = false, open = false;
  /** Die Ansicht liegt gedreht auf dem hochkant gehaltenen Handy. */
  let turned = false;
  /** Bewegung des Fingers auf dem Bildschirm → Bewegung in der (vielleicht gedrehten) Ansicht. */
  const local = (dx: number, dy: number): [number, number] => turned ? [dy, -dx] : [dx, dy];
  let selected: TileId = 'stick';   // beim Anordnen: das Teil, auf das − und + wirken
  const live = () => open && !editing;
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(layouts)); } catch { /* kein Speicher verfügbar */ } };

  // ----- Aufbau -----
  const root = el('section', 'padv hidden');
  root.tabIndex = 0;
  root.setAttribute('aria-label', 'Steuerfeld als Controller');
  const bar = el('div', 'padv-bar');
  const btnClose = el('button', 'btn', '‹ Zurück'); btnClose.type = 'button';
  const state = el('span', 'padv-state');
  state.setAttribute('role', 'status');
  const btnStop = el('button', 'btn', '■ Stopp'); btnStop.type = 'button';
  const btnRun = el('button', 'btn primary', '▶ Starten'); btnRun.type = 'button';
  // nur beim Anordnen sichtbar: Größe des gewählten Teils, Ausgangslage
  const btnMinus = el('button', 'btn padv-size hidden', '−'); btnMinus.type = 'button';
  const btnPlus = el('button', 'btn padv-size hidden', '+'); btnPlus.type = 'button';
  const btnReset = el('button', 'btn hidden', 'Zurücksetzen'); btnReset.type = 'button';
  const btnEdit = el('button', 'btn', 'Anordnen'); btnEdit.type = 'button';
  btnEdit.setAttribute('aria-pressed', 'false');
  // erscheint, sobald ein Gamepad am Gerät erkannt ist
  const chip = el('span', 'padv-gamepad hidden');
  chip.setAttribute('role', 'status');
  const spacer = el('span', 'padv-space');
  bar.append(btnClose, state, btnStop, btnRun, btnMinus, btnPlus, chip, spacer, btnReset, btnEdit);
  const hint = el('p', 'padv-hint');
  const grid = el('div', 'padv-grid');
  const ghost = el('div', 'padv-ghost hidden');
  // der Hinweis liegt über dem Raster, statt ihm Höhe wegzunehmen
  grid.append(hint, ghost);
  root.append(bar, grid);
  document.body.append(root);

  // ----- Teile: einmal anlegen, danach nur noch verschieben -----
  interface Part { tile: HTMLElement; round: HTMLElement }
  const parts = {} as Record<TileId, Part>;
  for (const id of TILE_IDS){
    const tile = el('div', 'padv-tile');
    tile.dataset.tile = id;
    const round = el('div', id === 'stick' ? 'padv-stick' : 'padv-btn');
    if (id === 'stick'){
      const knob = el('div', 'padv-knob');
      round.append(knob);
      round.setAttribute('aria-label', 'Joystick');
      pad.bindStick(tile, round, knob, live, () => turned);
    } else {
      round.textContent = id;
      round.dataset.pad = id;
      round.setAttribute('role', 'button');
      round.setAttribute('aria-label', 'Taste ' + id);
      pad.bindButton(round, id, live);
    }
    tile.append(round);
    grid.append(tile);
    parts[id] = {tile, round};
    dragToMove(id, tile);
  }
  pad.bindKeys(root, live);

  const tiles = () => layouts[orientation];
  const cell = () => ({w: grid.clientWidth / GRIDS[orientation].cols, h: grid.clientHeight / GRIDS[orientation].rows});
  function place(target: HTMLElement, t: {col: number; row: number; size: number}){
    const g = GRIDS[orientation];
    target.style.left = t.col / g.cols * 100 + '%'; target.style.top = t.row / g.rows * 100 + '%';
    target.style.width = t.size / g.cols * 100 + '%'; target.style.height = t.size / g.rows * 100 + '%';
  }
  /** Setzt alle Teile an ihren Platz. Die runde Fläche ist so groß, wie das Feld es in beiden Richtungen zulässt. */
  function render(){
    const c = cell(), g = GRIDS[orientation];
    grid.style.setProperty('--cell-w', 100 / g.cols + '%');
    grid.style.setProperty('--cell-h', 100 / g.rows + '%');
    for (const t of tiles()){
      const {tile, round} = parts[t.id];
      place(tile, t);
      const d = Math.max(24, Math.floor(Math.min(t.size * c.w, t.size * c.h) * 0.88));
      round.style.width = round.style.height = d + 'px';
      round.style.fontSize = Math.max(16, Math.round(d * 0.36)) + 'px';
      tile.classList.toggle('selected', t.id === selected);
    }
    const sel = tiles().find(t => t.id === selected)!, [min, max] = sizeRange(selected);
    const name = selected === 'stick' ? 'Joystick' : 'Taste ' + selected;
    btnMinus.disabled = sel.size <= min; btnPlus.disabled = sel.size >= max;
    btnMinus.setAttribute('aria-label', name + ' kleiner'); btnMinus.title = name + ' kleiner';
    btnPlus.setAttribute('aria-label', name + ' größer'); btnPlus.title = name + ' größer';
    pad.redraw();
  }
  function measure(){
    if (!open) return;
    const next = orientationFor(grid.clientWidth, grid.clientHeight);
    if (next !== orientation){ orientation = next; root.dataset.orientation = next; }
    render();
  }
  new ResizeObserver(measure).observe(grid);

  // ----- Anordnen -----
  function setEditing(on: boolean){
    editing = on;
    root.classList.toggle('editing', on);
    btnEdit.textContent = on ? 'Fertig' : 'Anordnen';
    btnEdit.classList.toggle('primary', on);
    btnEdit.setAttribute('aria-pressed', String(on));
    btnReset.classList.toggle('hidden', !on);
    btnMinus.classList.toggle('hidden', !on); btnPlus.classList.toggle('hidden', !on);
    state.classList.toggle('hidden', on);
    chip.classList.toggle('hidden', on || !last.gamepad);
    btnRun.classList.toggle('hidden', on); btnStop.classList.toggle('hidden', on);
    pad.release();
    showHint();
  }
  function resize(id: TileId, delta: number){
    const next = resizeTile(tiles(), id, delta, GRIDS[orientation]);
    if (!next){ refuse(parts[id].tile); return; }
    layouts = {...layouts, [orientation]:next}; save(); render();
  }
  function refuse(tile: HTMLElement){
    tile.classList.remove('refused');
    void tile.offsetWidth;   // Animation neu anstoßen
    tile.classList.add('refused');
  }
  function dragToMove(id: TileId, tile: HTMLElement){
    let drag: {pointer: number; x: number; y: number; col: number; row: number; ok: boolean} | null = null;
    const current = () => tiles().find(t => t.id === id)!;
    tile.addEventListener('pointerdown', (e) => {
      if (!editing || drag) return;
      selected = id; render();
      const t = current();
      drag = {pointer:e.pointerId, x:e.clientX, y:e.clientY, col:t.col, row:t.row, ok:true};
      capture(tile, e.pointerId);
      tile.classList.add('dragging');
      place(ghost, t); ghost.classList.remove('hidden', 'bad');
    });
    tile.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const t = current(), c = cell(), g = GRIDS[orientation];
      const [dx, dy] = local(e.clientX - drag.x, e.clientY - drag.y);
      tile.style.transform = `translate(${dx}px, ${dy}px)`;
      drag.col = Math.max(0, Math.min(g.cols - t.size, Math.round(t.col + dx / c.w)));
      drag.row = Math.max(0, Math.min(g.rows - t.size, Math.round(t.row + dy / c.h)));
      const target = {...t, col:drag.col, row:drag.row};
      drag.ok = fits(tiles(), target, g);
      place(ghost, target); ghost.classList.toggle('bad', !drag.ok);
    });
    const drop = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.pointer) return;
      const next = e.type === 'pointerup' && drag.ok ? moveTile(tiles(), id, drag.col, drag.row, GRIDS[orientation]) : null;
      const moved = drag.col !== current().col || drag.row !== current().row;
      drag = null;
      tile.classList.remove('dragging'); tile.style.transform = '';
      ghost.classList.add('hidden');
      if (next){ layouts = {...layouts, [orientation]:next}; save(); render(); }
      else if (moved) refuse(tile);
    };
    tile.addEventListener('pointerup', drop);
    tile.addEventListener('pointercancel', drop);
  }
  btnEdit.addEventListener('click', () => setEditing(!editing));
  btnMinus.addEventListener('click', () => resize(selected, -1));
  btnPlus.addEventListener('click', () => resize(selected, 1));
  btnReset.addEventListener('click', () => { layouts = {...layouts, [orientation]:defaultLayout(orientation)}; save(); render(); });

  // ----- Leiste -----
  let last: PadViewState = {hubText:'kein Hub', connected:false, running:false, busy:false, usesPad:false, gamepad:null};
  function showHint(){
    hint.textContent = editing
      ? 'Zieh Joystick und Tasten dorthin, wo deine Daumen sie gut erreichen. Antippen wählt ein Teil aus, − und + ändern seine Größe.'
      : !last.usesPad ? 'Dieses Programm fragt das Steuerfeld nicht ab. Die Blöcke dazu stehen unter »Fernsteuerung«.'
      : !last.running ? 'Starte das Programm – dann steuern Joystick und Tasten den Roboter.'
      : '';
    hint.classList.toggle('hidden', !hint.textContent);
  }
  function update(s: PadViewState){
    last = s;
    state.textContent = s.hubText; state.title = s.hubText;
    state.classList.toggle('on', s.connected);
    btnRun.disabled = s.busy;
    btnStop.disabled = !s.connected || s.busy || !s.running;
    root.classList.toggle('running', s.running && s.usesPad);
    chip.textContent = s.gamepad ? `Controller: ${s.gamepad}` : '';
    chip.title = s.gamepad ? 'Dieser Controller ist mit dem Gerät verbunden und bedient das Steuerfeld.' : '';
    chip.classList.toggle('hidden', !s.gamepad || editing);
    showHint();
  }
  btnRun.addEventListener('click', actions.run);
  btnStop.addEventListener('click', actions.stop);
  // Die Ansicht legt beim Öffnen einen Eintrag im Verlauf an: So schließt die Zurück-Taste von
  // Android nur die Ansicht, statt Blockwerk zu verlassen. Geschlossen wird immer über den Verlauf.
  const leave = () => { if (history.state?.blockwerkPad) history.back(); else hide(); };
  window.addEventListener('popstate', () => hide());
  btnClose.addEventListener('click', leave);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape'){ e.stopPropagation(); if (editing) setEditing(false); else leave(); } });
  // langes Drücken soll auf dem Tablet kein Menü öffnen
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  const view: PadView = {
    get isOpen(){ return open; },
    open(){
      if (open) return;
      open = true;
      root.classList.remove('hidden');
      document.documentElement.classList.add('pad-open');   // Meldungen wandern nach unten, siehe style.css
      syncTurn();
      setEditing(false);
      measure();
      try { history.pushState({blockwerkPad:true}, ''); } catch { /* ohne Verlauf schließt nur der Knopf */ }
      root.focus({preventScroll:true});
    },
    close(){ if (open) leave(); },
    update
  };
  function hide(){
    if (!open) return;
    open = false;
    setEditing(false);
    pad.release();
    root.classList.add('hidden');
    document.documentElement.classList.remove('pad-open');
    syncTurn();
  }
  /** Hochkant gehaltenes Handy: die Ansicht quer legen. Dreht das Gerät die Anzeige selbst mit, entfällt das wieder. */
  function syncTurn(){
    turned = open && viewMode() === 'phone-portrait';
    root.classList.toggle('turned', turned);
    document.documentElement.classList.toggle('pad-turned', turned);
  }
  onViewMode(() => { if (open){ pad.release(); syncTurn(); measure(); } });
  return view;
}
