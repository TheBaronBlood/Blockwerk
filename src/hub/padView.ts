// ---------------------------------------------------------------
// Steuerfeld als Controller: füllt den ganzen Bildschirm, Joysticks und Tasten liegen in einem
// Raster und lassen sich dort verschieben, in der Größe ändern, hinzufügen und entfernen (»Anordnen«).
// Gedacht für Tablets: große Flächen für die Daumen, mehrere Finger zugleich.
// Die Anordnung selbst (Raster, Regeln, Ausgangslage) steht in padLayout.ts. Sie gehört dieser
// Ansicht; der Streifen unter dem Code (padStrip.ts) zeigt dieselben Teile.
// Auf dem hochkant gehaltenen Handy liegt die Ansicht quer (um eine Vierteldrehung gedreht, style.css):
// Ein Controller gehört ins Querformat – man dreht das Handy, auch wenn es die Anzeige nicht mitdreht.
// ---------------------------------------------------------------
import { onViewMode, viewMode } from '../viewMode';
import { capture, type Pad } from './pad';
import {
  addPart, BASE_IDS, fits, GRIDS, isStick, moveTile, nextPart, orientationFor, partName, partsOf, removePart,
  resetLayout, resizeTile, sanitizeLayouts, sizeRange, stickNumber, TILE_IDS, type Orientation, type PadLayouts, type TileId
} from './padLayout';

const STORE_KEY = 'blockwerk-pad-v1';

export interface PadViewState {
  /** Text der Hub-Anzeige, zum Beispiel »kein Hub« oder »Hub – läuft«. */
  hubText: string; connected: boolean; running: boolean; busy: boolean;
  /** Das Programm auf der Arbeitsfläche fragt das Steuerfeld ab. */
  usesPad: boolean;
  /** Die Teile, die das Programm abfragt – fehlt eines, kommt es dazu. */
  needs: TileId[];
  /** Name eines Gamepads, das mit diesem Gerät verbunden ist und das Steuerfeld bedient. */
  gamepad: string | null;
}
export interface PadView {
  open(): void;
  close(): void;
  readonly isOpen: boolean;
  update(state: PadViewState): void;
  /** Die Teile, die das Steuerfeld gerade hat. */
  parts(): TileId[];
  /** Meldet jede Änderung der Teile (hinzugefügt, entfernt). */
  onParts(listener: (parts: TileId[]) => void): void;
}
export interface PadViewActions { run(): void; stop(): void }

/** Zeichen für die Leiste, im Stil der übrigen Leisten (Simulator). */
const svg = (paths: string) => `<svg viewBox="0 0 24 24" class="ico" aria-hidden="true">${paths}</svg>`;
export const PAD_ICONS = {
  back:svg('<path d="M15 5l-7 7 7 7"/>'),
  stop:svg('<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>'),
  play:svg('<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>'),
  arrange:svg('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
  done:svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  reset:svg('<path d="M3 12a9 9 0 1 0 2.6-6.3L3 8"/><path d="M3 3v5h5"/>'),
  button:svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  stick:svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><path d="M19.5 2.5v5M17 5h5"/>'),
  remove:svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  expand:svg('<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>'),
  close:svg('<path d="M6 6l12 12M18 6 6 18"/>')
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string){
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
/** Knopf mit Zeichen und Wort; auf schmalen Bildschirmen bleibt nur das Zeichen (style.css). */
function iconButton(icon: string, text: string, cls = ''){
  const b = el('button', 'btn ' + cls);
  b.type = 'button';
  b.innerHTML = icon;
  b.append(el('span', '', text));
  return b;
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
  const listeners: ((parts: TileId[]) => void)[] = [];
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(layouts)); } catch { /* kein Speicher verfügbar */ } };
  /** Übernimmt eine neue Anordnung; ändern sich dabei die Teile, erfahren es alle, die zuhören. */
  function commit(next: PadLayouts){
    const before = partsOf(layouts).join();
    layouts = next; save();
    if (!partsOf(layouts).includes(selected)) selected = 'stick';
    render();
    if (partsOf(layouts).join() !== before) for (const l of listeners) l(partsOf(layouts));
  }

  // ----- Aufbau -----
  const root = el('section', 'padv hidden');
  root.tabIndex = 0;
  root.setAttribute('aria-label', 'Steuerfeld als Controller');
  const bar = el('div', 'padv-bar');
  const btnClose = iconButton(PAD_ICONS.back, 'Zurück');
  const state = el('span', 'padv-state padv-live');
  state.setAttribute('role', 'status');
  const btnStop = iconButton(PAD_ICONS.stop, 'Stopp', 'padv-live');
  const btnRun = iconButton(PAD_ICONS.play, 'Starten', 'primary padv-live');
  // nur beim Anordnen sichtbar: Teile hinzufügen und entfernen, Größe des gewählten Teils, Ausgangslage
  const btnAddButton = iconButton(PAD_ICONS.button, 'Taste', 'padv-edit');
  const btnAddStick = iconButton(PAD_ICONS.stick, 'Joystick', 'padv-edit');
  const sizer = el('span', 'padv-sizer padv-edit');
  const selName = el('span', 'padv-sel');
  const btnMinus = el('button', 'btn padv-size', '−'); btnMinus.type = 'button';
  const btnPlus = el('button', 'btn padv-size', '+'); btnPlus.type = 'button';
  sizer.append(btnMinus, selName, btnPlus);
  const btnRemove = iconButton(PAD_ICONS.remove, 'Entfernen', 'padv-edit');
  const btnReset = iconButton(PAD_ICONS.reset, 'Zurücksetzen', 'padv-edit');
  const btnEdit = iconButton(PAD_ICONS.arrange, 'Anordnen');
  btnEdit.setAttribute('aria-pressed', 'false');
  // erscheint, sobald ein Gamepad am Gerät erkannt ist
  const chip = el('span', 'padv-gamepad hidden');
  chip.setAttribute('role', 'status');
  const spacer = el('span', 'padv-space');
  const sep = () => el('span', 'padv-sep padv-edit');
  bar.append(btnClose, state, btnStop, btnRun, chip, btnAddButton, btnAddStick, sep(), sizer, btnRemove, spacer, btnReset, btnEdit);
  const hint = el('p', 'padv-hint');
  const grid = el('div', 'padv-grid');
  const ghost = el('div', 'padv-ghost hidden');
  // der Hinweis liegt über dem Raster, statt ihm Höhe wegzunehmen
  grid.append(hint, ghost);
  root.append(bar, grid);
  document.body.append(root);

  // ----- Teile: alle einmal anlegen, danach nur noch verschieben, zeigen und verbergen -----
  interface Part { tile: HTMLElement; round: HTMLElement }
  const parts = {} as Record<TileId, Part>;
  for (const id of TILE_IDS){
    const tile = el('div', 'padv-tile hidden');
    tile.dataset.tile = id;
    const round = el('div', isStick(id) ? 'padv-stick' : 'padv-btn');
    if (isStick(id)){
      const knob = el('div', 'padv-knob');
      round.append(knob, el('span', 'padv-num', String(stickNumber(id))));
      round.dataset.stick = String(stickNumber(id));
      round.setAttribute('aria-label', partName(id));
      pad.bindStick(tile, round, knob, {stick:stickNumber(id), active:live, turned:() => turned});
    } else {
      round.textContent = id;
      round.dataset.pad = id;
      round.setAttribute('role', 'button');
      round.setAttribute('aria-label', partName(id));
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
    const shown = new Set(tiles().map(t => t.id));
    // die Nummer am Joystick braucht es erst, wenn es mehrere gibt
    root.classList.toggle('sticks', tiles().filter(t => isStick(t.id)).length > 1);
    for (const id of TILE_IDS) parts[id].tile.classList.toggle('hidden', !shown.has(id));
    for (const t of tiles()){
      const {tile, round} = parts[t.id];
      place(tile, t);
      const d = Math.max(24, Math.floor(Math.min(t.size * c.w, t.size * c.h) * 0.88));
      round.style.width = round.style.height = d + 'px';
      round.style.fontSize = Math.max(16, Math.round(d * 0.36)) + 'px';
      tile.classList.toggle('selected', t.id === selected);
    }
    const sel = tiles().find(t => t.id === selected)!, [min, max] = sizeRange(selected);
    const name = partName(selected);
    selName.textContent = name;
    btnMinus.disabled = sel.size <= min; btnPlus.disabled = sel.size >= max;
    btnMinus.setAttribute('aria-label', name + ' kleiner'); btnMinus.title = name + ' kleiner';
    btnPlus.setAttribute('aria-label', name + ' größer'); btnPlus.title = name + ' größer';
    const base = BASE_IDS.includes(selected), needed = last.needs.includes(selected);
    btnRemove.disabled = base || needed;
    btnRemove.title = base ? `${name} gehört fest zum Steuerfeld` : needed ? `Das Programm fragt ${name} ab` : `${name} entfernen`;
    const nextButton = nextPart(layouts, 'button'), nextStick = nextPart(layouts, 'stick');
    btnAddButton.disabled = !nextButton; btnAddButton.title = nextButton ? `Taste ${nextButton} hinzufügen` : 'Mehr Tasten gibt es nicht';
    btnAddStick.disabled = !nextStick; btnAddStick.title = nextStick ? `${partName(nextStick)} hinzufügen` : 'Mehr Joysticks gibt es nicht';
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
    btnEdit.querySelector('span')!.textContent = on ? 'Fertig' : 'Anordnen';
    btnEdit.querySelector('svg')!.outerHTML = on ? PAD_ICONS.done : PAD_ICONS.arrange;
    btnEdit.classList.toggle('primary', on);
    btnEdit.setAttribute('aria-pressed', String(on));
    chip.classList.toggle('hidden', on || !last.gamepad);
    pad.release();
    showHint();
  }
  function resize(id: TileId, delta: number){
    const next = resizeTile(tiles(), id, delta, GRIDS[orientation]);
    if (!next){ refuse(parts[id].tile); return; }
    commit({...layouts, [orientation]:next});
  }
  function add(kind: 'stick' | 'button'){
    const id = nextPart(layouts, kind);
    if (!id) return;
    const next = addPart(layouts, id);
    if (!next){ refuse(grid); return; }
    selected = id;
    commit(next);
  }
  function refuse(target: HTMLElement){
    target.classList.remove('refused');
    void target.offsetWidth;   // Animation neu anstoßen
    target.classList.add('refused');
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
      if (next) commit({...layouts, [orientation]:next});
      else if (moved) refuse(tile);
    };
    tile.addEventListener('pointerup', drop);
    tile.addEventListener('pointercancel', drop);
  }
  btnEdit.addEventListener('click', () => setEditing(!editing));
  btnMinus.addEventListener('click', () => resize(selected, -1));
  btnPlus.addEventListener('click', () => resize(selected, 1));
  btnAddButton.addEventListener('click', () => add('button'));
  btnAddStick.addEventListener('click', () => add('stick'));
  btnRemove.addEventListener('click', () => { const next = removePart(layouts, selected); if (next) commit(next); });
  btnReset.addEventListener('click', () => commit(resetLayout(layouts, orientation)));

  // ----- Leiste -----
  let last: PadViewState = {hubText:'kein Hub', connected:false, running:false, busy:false, usesPad:false, needs:[], gamepad:null};
  function showHint(){
    hint.textContent = editing ? 'Ziehen verschiebt, Antippen wählt aus.'
      : !last.usesPad ? 'Dieses Programm fragt das Steuerfeld nicht ab. Die Blöcke dazu stehen unter »Fernsteuerung«.'
      : !last.running ? 'Starte das Programm – dann steuert das Steuerfeld den Roboter.'
      : '';
    hint.classList.toggle('hidden', !hint.textContent);
  }
  /** Fragt das Programm ein Teil ab, das fehlt, kommt es dazu. */
  function ensure(ids: TileId[]){
    let next = layouts;
    for (const id of ids) if (!partsOf(next).includes(id)) next = addPart(next, id) ?? next;
    if (next !== layouts) commit(next);
  }
  function update(s: PadViewState){
    last = s;
    ensure(s.needs);
    state.textContent = s.hubText; state.title = s.hubText;
    state.classList.toggle('on', s.connected);
    btnRun.disabled = s.busy;
    btnStop.disabled = !s.connected || s.busy || !s.running;
    root.classList.toggle('running', s.running && s.usesPad);
    chip.textContent = s.gamepad ? `Controller: ${s.gamepad}` : '';
    chip.title = s.gamepad ? 'Dieser Controller ist mit dem Gerät verbunden und bedient das Steuerfeld.' : '';
    chip.classList.toggle('hidden', !s.gamepad || editing);
    showHint();
    if (open) render();
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
    update,
    parts:() => partsOf(layouts),
    onParts(listener){ listeners.push(listener); }
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
