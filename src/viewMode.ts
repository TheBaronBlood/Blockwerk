// ---------------------------------------------------------------
// Ansicht je nach Format des Fensters: breit (Computer, Tablet), Handy hochkant, Handy quer.
// Maßgeblich ist allein das Format – ein schmales Browserfenster am Computer bekommt deshalb
// dieselbe Ansicht wie ein Handy. Die Ansicht steht als `data-layout` am <html>; das Stylesheet
// und der Werkzeugkasten (toolboxLayout.ts) richten sich danach.
// ---------------------------------------------------------------
export type ViewMode = 'wide' | 'phone-portrait' | 'phone-landscape';

/** Bis zu dieser Breite gilt ein hochkant stehendes Fenster als Handy. */
export const PHONE_MAX_WIDTH = 600;
/** Bis zu dieser Höhe gilt ein quer liegendes Fenster als Handy (Tablets sind quer deutlich höher). */
export const PHONE_MAX_HEIGHT = 480;

/** Die Ansicht für ein Fenster dieser Größe. Ohne DOM. */
export function viewModeFor(width: number, height: number): ViewMode {
  if (width > height && height <= PHONE_MAX_HEIGHT) return 'phone-landscape';
  if (width <= PHONE_MAX_WIDTH) return 'phone-portrait';
  return 'wide';
}

let mode: ViewMode = 'wide';
const listeners: ((mode: ViewMode) => void)[] = [];
export const viewMode = () => mode;
export const isPhone = () => mode !== 'wide';
/** Meldet jeden Wechsel der Ansicht (nicht den Anfangszustand). */
export function onViewMode(listener: (mode: ViewMode) => void){ listeners.push(listener); }

/** Stellt die Ansicht fest, schreibt sie ans <html> und beobachtet das Fenster. Vor dem Aufbau der Arbeitsfläche aufrufen. */
export function initViewMode(): ViewMode {
  const root = document.documentElement;
  let lastWidth = window.innerWidth;
  // Die Bildschirmtastatur macht das Fenster niedriger, ohne dass sich das Gerät gedreht hätte: Solange
  // jemand tippt und sich nur die Höhe ändert, bleibt die Ansicht stehen.
  const typing = () => {
    const el = document.activeElement as HTMLElement | null;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  };
  const apply = () => {
    if (window.innerWidth === lastWidth && typing()) return;
    lastWidth = window.innerWidth;
    const next = viewModeFor(window.innerWidth, window.innerHeight);
    if (next === mode && root.dataset.layout === next) return;
    const changed = next !== mode;
    mode = next;
    root.dataset.layout = next;
    if (changed) for (const listener of listeners) listener(next);
  };
  mode = viewModeFor(window.innerWidth, window.innerHeight);
  root.dataset.layout = mode;
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 0));
  // nach dem Tippen nachholen, was währenddessen liegen blieb
  window.addEventListener('focusout', () => setTimeout(apply, 0));
  return mode;
}
