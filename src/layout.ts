// ---------------------------------------------------------------
// Aufteilung der Oberfläche: verschiebbare Trennleisten und einklappbares Terminal
// ---------------------------------------------------------------
const STORE_KEY = 'blockwerk-layout-v1';
interface Layout { codeWidth?: number; termHeight?: number; termOpen?: boolean; codeOpen?: boolean }

function read(): Layout { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } }
function save(patch: Layout){ try { localStorage.setItem(STORE_KEY, JSON.stringify({...read(), ...patch})); } catch { /* ohne Speicher gilt die Einstellung bis zum Neuladen */ } }
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(Math.max(min, max), v));

/**
 * Macht aus `handle` eine Trennleiste. `size` rechnet aus der Zeigerposition die neue Größe,
 * `apply` setzt sie; Pfeiltasten ändern sie in 24-px-Schritten, Doppelklick stellt den Standard wieder her.
 * Beim Ziehen wird nur gesetzt (`store` false) und erst beim Loslassen gespeichert – sonst
 * schriebe jede Zeigerbewegung in den Speicher.
 */
function splitter(handle: HTMLElement, opts: {
  size(e: PointerEvent): number; current(): number; apply(px: number | null, store?: boolean): void; keys: [string, string];
}){
  let dragging = false, moved = false;
  handle.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false; handle.classList.add('drag'); e.preventDefault();
    // der Zeiger soll der Leiste auch folgen, wenn er sie beim Ziehen verlässt
    try { handle.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
  });
  handle.addEventListener('pointermove', (e) => { if (dragging){ moved = true; opts.apply(opts.size(e), false); } });
  const end = () => {
    if (dragging && moved) opts.apply(opts.current());
    dragging = false; handle.classList.remove('drag');
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('dblclick', () => opts.apply(null));
  handle.addEventListener('keydown', (e) => {
    const step = e.key === opts.keys[0] ? 24 : e.key === opts.keys[1] ? -24 : 0;
    if (step){ e.preventDefault(); opts.apply(opts.current() + step); }
  });
}

export interface TerminalPanel {
  /** Klappt das Terminal auf – außer es wurde von Hand zugeklappt; dann zeigt ein Punkt neue Ausgaben an. */
  reveal(): void;
  /** Klappt den Python-Bereich auf, zum Beispiel wenn ein Fehler im Terminal steht. */
  showCode(): void;
}

export function initLayout(): TerminalPanel {
  const main = document.getElementById('main')!, code = document.querySelector<HTMLElement>('aside.code')!;
  const term = document.getElementById('term')!, toggle = document.getElementById('termToggle')!;
  const stored = read();

  // Breite des Codebereichs
  const setWidth = (px: number | null, store = true) => {
    if (px === null){ code.style.removeProperty('--code-w'); save({codeWidth:undefined}); return; }
    const w = Math.round(clamp(px, 280, main.clientWidth - 320));
    code.style.setProperty('--code-w', w + 'px'); if (store) save({codeWidth:w});
  };
  let wantedWidth = stored.codeWidth;
  if (wantedWidth) setWidth(wantedWidth, false);
  splitter(document.getElementById('splitCode')!, {
    size:(e) => main.getBoundingClientRect().right - e.clientX,
    current:() => code.getBoundingClientRect().width, keys:['ArrowLeft', 'ArrowRight'],
    apply:(px, store = true) => { setWidth(px, store); if (store) wantedWidth = px === null ? undefined : read().codeWidth; }
  });

  // Höhe des Terminals
  const setHeight = (px: number | null, store = true) => {
    if (px === null){ term.style.removeProperty('--term-h'); save({termHeight:undefined}); return; }
    const h = Math.round(clamp(px, 70, code.clientHeight - 220));
    term.style.setProperty('--term-h', h + 'px'); if (store) save({termHeight:h});
  };
  if (stored.termHeight) setHeight(stored.termHeight, false);
  splitter(document.getElementById('splitTerm')!, {
    size:(e) => term.getBoundingClientRect().bottom - e.clientY,
    current:() => term.getBoundingClientRect().height, apply:setHeight, keys:['ArrowUp', 'ArrowDown']
  });
  // Ein zu schmal gewordenes Fenster darf den Codebereich nicht über die Arbeitsfläche schieben.
  // Die gewünschte Breite bleibt gemerkt: Wird das Fenster wieder größer, kommt sie zurück.
  window.addEventListener('resize', () => { if (wantedWidth) setWidth(wantedWidth, false); });

  // Python-Bereich ein- und ausklappen
  const codeToggle = document.getElementById('codeToggle')!;
  const setCodeOpen = (open: boolean) => {
    main.classList.toggle('code-closed', !open);
    codeToggle.setAttribute('aria-expanded', String(open));
  };
  setCodeOpen(stored.codeOpen !== false);
  codeToggle.addEventListener('click', () => {
    const open = main.classList.contains('code-closed');
    setCodeOpen(open); save({codeOpen:open});
  });

  // Terminal ein- und ausklappen
  let closedByUser = stored.termOpen === false;
  const setOpen = (open: boolean) => {
    term.classList.toggle('collapsed', !open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) toggle.classList.remove('unread');
  };
  setOpen(stored.termOpen === true);
  toggle.addEventListener('click', () => {
    const open = term.classList.contains('collapsed');
    closedByUser = !open;
    setOpen(open); save({termOpen:open});
  });

  return {
    reveal(){ if (closedByUser) toggle.classList.add('unread'); else setOpen(true); },
    showCode(){ setCodeOpen(true); save({codeOpen:true}); }
  };
}
