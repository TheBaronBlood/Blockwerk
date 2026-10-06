// ---------------------------------------------------------------
// Einstellungen: Darstellung, zuschaltbare Funktionen, Entwickleroptionen.
// Abgelegt in localStorage; jede Änderung wirkt sofort.
// ---------------------------------------------------------------
import { where } from './platform';

const STORE_KEY = 'blockwerk-settings-v1';

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  /** Größe der ganzen Oberfläche in Prozent – nur im Programm (im Browser: Strg und Plus). */
  zoom: number;
  /** Schriftgröße des Python-Codes und des Terminals in Pixeln. */
  codeSize: number;
  /** »atkinson«, »system« oder der Name einer installierten Schrift. */
  uiFont: string;
  /** »jetbrains«, »system« oder der Name einer installierten Schrift. */
  codeFont: string;
  /** Leiser Klang beim Zusammenstecken von Blöcken. */
  sounds: boolean;
  /** Knopf »Erweiterungen« zeigen. */
  extensions: boolean;
  /** Entwickleroptionen zeigen. */
  dev: boolean;
  /** Entwickler: jede Nachricht von und zum Hub im Terminal mitschreiben. */
  devTrace: boolean;
  /** Entwickler: beim Verbinden einen Test-Hub anbieten, der ohne Gerät auskommt. */
  devTestHub: boolean;
  /** Kursleitung: Im Kurs erscheinen Stolpersteine und Lösungen. */
  leader: boolean;
}
export const DEFAULTS: Settings = {
  theme:'system', zoom:100, codeSize:13.5, uiFont:'atkinson', codeFont:'jetbrains', sounds:true,
  extensions:false, dev:false, devTrace:false, devTestHub:false, leader:false
};
const FONTS = {
  atkinson:'"Atkinson Hyperlegible","Segoe UI",system-ui,-apple-system,sans-serif',
  system:'"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif',
  jetbrains:'"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  mono:'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace'
};

/** Schriftangabe für CSS: die mitgelieferte, die des Systems oder eine installierte mit Ausweichschrift. */
function fontStack(choice: string, bundledKey: string, bundled: string, fallback: string): string {
  return choice === bundledKey ? bundled : choice === 'system' ? fallback : `"${choice}",${fallback}`;
}

interface LocalFont { family: string }
/**
 * Fragt die Schriften ab, die auf dem Computer installiert sind (nur Chromium; der Browser
 * fragt beim ersten Mal um Erlaubnis). Liefert alle Familien und davon die mit fester
 * Zeichenbreite – nur die taugen für Code.
 */
export async function systemFonts(): Promise<{all: string[]; mono: string[]}> {
  const query = (window as unknown as {queryLocalFonts?(): Promise<LocalFont[]>}).queryLocalFonts;
  if (!query) throw new Error('nicht unterstützt');
  const all = [...new Set((await query.call(window)).map(f => f.family))].sort((a, b) => a.localeCompare(b));
  // Jede Schrift einmal auszumessen dauert bei einigen hundert Schriften spürbar – deshalb in
  // kleinen Portionen, damit die Oberfläche dabei nicht einfriert
  const ctx = document.createElement('canvas').getContext('2d')!;
  const mono: string[] = [];
  for (let i = 0; i < all.length; i += 6){
    for (const family of all.slice(i, i + 6)){
      ctx.font = `16px "${family}"`;
      if (Math.abs(ctx.measureText('iiiiiiii').width - ctx.measureText('MMMMMMMM').width) < 0.5) mono.push(family);
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  return {all, mono};
}
export const systemFontsSupported = () => typeof window !== 'undefined' && 'queryLocalFonts' in window;

interface DataInfo { dir: string; source: 'program' | 'custom' | 'default'; defaultDir: string; missing?: string; problem?: string }
interface MoveResult { dir?: string; cancelled?: boolean; error?: string }
interface DesktopExtras {
  setZoom?(factor: number): void; openDevTools?(): void;
  data?: {info(): Promise<DataInfo>; choose(): Promise<MoveResult>; reset(): Promise<MoveResult>; open(): Promise<unknown>; restart(): Promise<unknown>};
}
const desktop = () => (window as unknown as {blockwerkDesktop?: DesktopExtras}).blockwerkDesktop;

/** Liest gespeicherte Einstellungen; Unbekanntes und Unsinniges fällt auf die Vorgabe zurück. */
export function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <K extends keyof Settings>(key: K, ok: (v: unknown) => boolean): Settings[K] => ok(r[key]) ? r[key] as Settings[K] : DEFAULTS[key];
  const oneOf = (...values: string[]) => (v: unknown) => values.includes(v as string);
  const between = (min: number, max: number) => (v: unknown) => typeof v === 'number' && v >= min && v <= max;
  const bool = (v: unknown) => typeof v === 'boolean';
  // der Name landet in einer CSS-Angabe – Zeichen, die dort etwas anrichten könnten, sind ausgeschlossen
  const fontName = (v: unknown) => typeof v === 'string' && /^[^"'\\;{}<>\r\n]{1,80}$/.test(v);
  return {
    theme:pick('theme', oneOf('system', 'light', 'dark')), zoom:pick('zoom', between(70, 160)), codeSize:pick('codeSize', between(10, 24)),
    uiFont:pick('uiFont', fontName), codeFont:pick('codeFont', fontName),
    sounds:pick('sounds', bool), extensions:pick('extensions', bool), dev:pick('dev', bool), devTrace:pick('devTrace', bool), devTestHub:pick('devTestHub', bool), leader:pick('leader', bool)
  };
}

let current: Settings = DEFAULTS;
const listeners: ((s: Settings) => void)[] = [];
export const settings = () => current;
/** Meldet jede Änderung – und einmal sofort den aktuellen Stand. */
export function onSettings(listener: (s: Settings) => void){ listeners.push(listener); listener(current); }

function apply(){
  const root = document.documentElement;
  if (current.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', current.theme);
  root.style.setProperty('--ui', fontStack(current.uiFont, 'atkinson', FONTS.atkinson, FONTS.system));
  root.style.setProperty('--mono', fontStack(current.codeFont, 'jetbrains', FONTS.jetbrains, FONTS.mono));
  root.style.setProperty('--code-size', current.codeSize + 'px');
  desktop()?.setZoom?.(current.zoom / 100);
  listeners.forEach(l => l(current));
}
export function updateSettings(patch: Partial<Settings>){
  current = sanitize({...current, ...patch});
  try { localStorage.setItem(STORE_KEY, JSON.stringify(current)); } catch { /* gilt dann bis zum Neuladen */ }
  apply();
}
/** Beim Start aufrufen, bevor die Oberfläche aufgebaut wird. `fallback` gilt für noch nie Gespeichertes. */
export function loadSettings(fallback: Partial<Settings> = {}){
  let stored: unknown = null;
  try { stored = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch { /* beschädigt – Vorgaben */ }
  current = sanitize({...fallback, ...(stored && typeof stored === 'object' ? stored : {})});
  apply();
}
/** Ob gerade das dunkle Design gilt. */
export function isDark(){
  return current.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : current.theme === 'dark';
}

// ---------------------------------------------------------------
// Fenster »Einstellungen«
// ---------------------------------------------------------------
export interface SettingsHost {
  version: string;
  /** Löscht alles Gespeicherte (Programm, Erweiterungen, Einstellungen) und lädt neu. */
  resetAll(): void;
}

export function initSettingsDialog(host: SettingsHost): {open(): void} {
  const inApp = !!desktop();
  const dialog = document.createElement('dialog');
  dialog.className = 'settings';
  dialog.innerHTML = `
    <div class="connect-head"><h2>Einstellungen</h2><button type="button" class="btn" data-act="close" aria-label="Schließen">✕</button></div>
    <div class="settings-body">
      <h3>Darstellung</h3>
      <div class="settings-row"><span>Design</span>
        <div class="settings-seg" role="radiogroup" aria-label="Design">
          <button type="button" role="radio" data-theme-choice="system">System</button>
          <button type="button" role="radio" data-theme-choice="light">Hell</button>
          <button type="button" role="radio" data-theme-choice="dark">Dunkel</button>
        </div></div>
      <label class="settings-row" data-only="app"><span>Größe der Oberfläche</span><input type="range" name="zoom" min="70" max="160" step="10"><output></output></label>
      <p class="settings-note" data-only="browser">Die Größe der ganzen Oberfläche stellst du im Browser mit ${/Mac/.test(navigator.platform) ? '⌘' : 'Strg'} und Plus oder Minus ein.</p>
      <label class="settings-row"><span>Schriftgröße im Code</span><input type="range" name="codeSize" min="10" max="24" step="0.5"><output></output></label>
      <label class="settings-row"><span>Schrift der Oberfläche</span>
        <select name="uiFont" class="btn"><option value="atkinson">Atkinson Hyperlegible (gut lesbar)</option><option value="system">Schrift des Systems</option></select></label>
      <label class="settings-row"><span>Schrift im Code</span>
        <select name="codeFont" class="btn"><option value="jetbrains">JetBrains Mono</option><option value="system">Schrift des Systems</option></select></label>
      <div class="settings-buttons" data-fonts><button type="button" class="btn" data-act="fonts">Schriften dieses Computers anzeigen</button><span class="settings-note" data-fonts-state></span></div>

      <h3>Funktionen</h3>
      <label class="settings-check"><input type="checkbox" name="sounds"><span><b>Klang</b><br>Blöcke klicken leise, wenn sie zusammengesteckt werden.</span></label>

      <label class="settings-check"><input type="checkbox" name="extensions"><span><b>Erweiterungen</b><br>Zeigt den Knopf »Erweiterungen«: eigene Blöcke mit eigenem Python-Code bauen.</span></label>

      <label class="settings-check"><input type="checkbox" name="leader"><span><b>Kursleitung</b><br>Zeigt im Kurs der Robotik-AG die Stolpersteine und die Lösungen. Für die Teilnehmenden ausgeschaltet lassen.</span></label>

      <h3 data-only="app">Speicherort</h3>
      <div data-only="app" class="settings-data">
        <p class="settings-note">Hier liegen das Programm auf der Arbeitsfläche, die Erweiterungen und diese Einstellungen.</p>
        <p class="settings-path" data-path></p>
        <div class="settings-buttons">
          <button type="button" class="btn" data-act="data-choose">Ordner ändern …</button>
          <button type="button" class="btn" data-act="data-reset">Standardordner</button>
          <button type="button" class="btn" data-act="data-open">Ordner zeigen</button>
        </div>
        <p class="settings-note" data-data-state></p>
      </div>

      <h3>Für Entwickler</h3>
      <label class="settings-check"><input type="checkbox" name="dev"><span><b>Entwickleroptionen</b><br>Werkzeuge zum Testen und zur Fehlersuche.</span></label>
      <div class="settings-dev">
        <label class="settings-check"><input type="checkbox" name="devTestHub"><span><b>Test-Hub</b><br>»Hub verbinden« bietet einen nachgestellten Hub an – zum Ausprobieren ohne Gerät.</span></label>
        <label class="settings-check"><input type="checkbox" name="devTrace"><span><b>Protokoll mitschreiben</b><br>Jede Nachricht von und zum Hub erscheint im Terminal.</span></label>
        <div class="settings-buttons">
          <button type="button" class="btn" data-act="devtools" data-only="app">Entwicklerwerkzeuge öffnen</button>
          <button type="button" class="btn" data-act="reset">Alles Gespeicherte löschen …</button>
        </div>
        <p class="settings-note">In der Konsole der Entwicklerwerkzeuge steht <code>blockwerk</code> bereit: Arbeitsfläche, erzeugter Code, Hub und Einstellungen.</p>
        <p class="settings-note settings-about"></p>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  // »app« gilt nur im Programm am Computer, »browser« nur im Browser – in der App auf dem Tablet keins von beiden
  dialog.querySelectorAll<HTMLElement>('[data-only]').forEach(el => el.classList.toggle('hidden', el.dataset.only !== where()));
  dialog.querySelector('.settings-about')!.textContent = `Blockwerk ${host.version} · ${{app:'Programm', tablet:'App', browser:'Browser'}[where()]} · ${navigator.userAgent.match(/(Electron|Chrome|Edg|Firefox|Safari)\/[\d.]+/g)?.join(' ') ?? ''}`;

  const field = <T extends HTMLElement>(name: string) => dialog.querySelector<T>(`[name=${name}]`)!;

  // Installierte Schriften: kommen als eigene Gruppe in beide Listen
  const fontsRow = dialog.querySelector<HTMLElement>('[data-fonts]')!, fontsState = dialog.querySelector<HTMLElement>('[data-fonts-state]')!;
  fontsRow.classList.toggle('hidden', !systemFontsSupported());
  let fontsLoaded = false, fontsLoading = false;
  function fillFonts(select: HTMLSelectElement, families: string[]){
    select.querySelector('optgroup')?.remove();
    const group = select.appendChild(document.createElement('optgroup'));
    group.label = 'Auf diesem Computer installiert';
    for (const family of families){ const o = group.appendChild(document.createElement('option')); o.value = o.textContent = family; }
  }
  /** Eine gespeicherte Schrift steht in der Liste, auch wenn die installierten noch nicht abgefragt sind. */
  function ensureOption(select: HTMLSelectElement, value: string){
    if ([...select.options].some(o => o.value === value)) return;
    const o = select.appendChild(document.createElement('option')); o.value = o.textContent = value;
  }
  async function loadFonts(quiet: boolean){
    if (fontsLoaded || fontsLoading || !systemFontsSupported()) return;
    fontsLoading = true; fontsState.textContent = 'Schriften werden gesucht …';
    try {
      const {all, mono} = await systemFonts();
      if (!all.length) throw new Error('keine Erlaubnis');
      fillFonts(field<HTMLSelectElement>('uiFont'), all);
      fillFonts(field<HTMLSelectElement>('codeFont'), mono);
      fontsLoaded = true;
      fontsRow.querySelector('button')!.classList.add('hidden');
      fontsState.textContent = `${all.length} Schriften gefunden, davon ${mono.length} mit fester Breite für den Code.`;
      show(settings());
    } catch (err){
      fontsState.textContent = quiet ? '' : 'Die Schriften ließen sich nicht abfragen – vielleicht wurde die Erlaubnis abgelehnt.';
    }
    fontsLoading = false;
  }

  // Speicherort (nur im Programm): Ein Wechsel gilt erst nach dem Neustart, weil die Daten dann umziehen
  const data = desktop()?.data;
  const pathEl = dialog.querySelector<HTMLElement>('[data-path]')!, dataState = dialog.querySelector<HTMLElement>('[data-data-state]')!;
  const dataButton = (act: string) => dialog.querySelector<HTMLButtonElement>(`[data-act=${act}]`)!;
  async function showData(){
    if (!data) return;
    const info = await data.info();
    pathEl.textContent = info.dir;
    const fixed = info.source === 'program';
    dataButton('data-choose').disabled = fixed;
    dataButton('data-reset').disabled = fixed || info.source === 'default';
    dataState.textContent = fixed ? 'Die Daten liegen im Ordner »Blockwerk-Daten« neben dem Programm und wandern mit ihm mit. Um das zu ändern, den Ordner dort entfernen.'
      : info.missing ? `Der gewählte Ordner ${info.missing} ist nicht erreichbar – Blockwerk benutzt vorerst den Standardordner.`
      : info.problem ? `Beim Umzug der Daten gab es ein Problem: ${info.problem}` : '';
  }
  async function moveData(request: () => Promise<MoveResult>){
    const result = await request();
    if (result.error){ dataState.textContent = result.error; return; }
    if (!result.dir) return;
    dataState.textContent = `Ab dem nächsten Start liegen die Daten in ${result.dir}. Der bisherige Ordner bleibt bestehen; du kannst ihn danach löschen.`;
    if (confirm('Blockwerk muss neu starten, damit der neue Speicherort gilt. Jetzt neu starten?')) data!.restart();
  }

  function show(s: Settings){
    ensureOption(field<HTMLSelectElement>('uiFont'), s.uiFont); ensureOption(field<HTMLSelectElement>('codeFont'), s.codeFont);
    dialog.querySelectorAll<HTMLElement>('[data-theme-choice]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeChoice === s.theme)));
    for (const name of ['zoom', 'codeSize'] as const){
      const input = field<HTMLInputElement>(name);
      input.value = String(s[name]);
      (input.nextElementSibling as HTMLOutputElement).textContent = name === 'zoom' ? s.zoom + ' %' : s.codeSize + ' px';
    }
    field<HTMLSelectElement>('uiFont').value = s.uiFont;
    field<HTMLSelectElement>('codeFont').value = s.codeFont;
    for (const name of ['sounds', 'extensions', 'leader', 'dev', 'devTestHub', 'devTrace'] as const) field<HTMLInputElement>(name).checked = s[name];
    dialog.querySelector('.settings-dev')!.classList.toggle('hidden', !s.dev);
  }
  onSettings(show);

  dialog.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    if (!el.name) return;
    const value = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el instanceof HTMLInputElement && el.type === 'range' ? Number(el.value) : el.value;
    updateSettings({[el.name]:value} as Partial<Settings>);
  });
  dialog.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-theme-choice]');
    if (!el) return;
    if (el.dataset.themeChoice) updateSettings({theme:el.dataset.themeChoice as Settings['theme']});
    else if (el.dataset.act === 'close') dialog.close();
    else if (el.dataset.act === 'fonts') loadFonts(false);
    else if (el.dataset.act === 'data-choose') moveData(() => data!.choose());
    else if (el.dataset.act === 'data-reset') moveData(() => data!.reset());
    else if (el.dataset.act === 'data-open') data?.open();
    else if (el.dataset.act === 'devtools') desktop()?.openDevTools?.();
    else if (el.dataset.act === 'reset' && confirm('Wirklich alles löschen? Das Programm auf der Arbeitsfläche, alle Erweiterungen und die Einstellungen gehen verloren.')) host.resetAll();
  });
  return {open(){
    if (!dialog.open) dialog.showModal();
    // im Programm ohne Nachfrage; im Browser erst auf Knopfdruck, weil er um Erlaubnis fragt
    if (inApp){ loadFonts(true); showData(); }
  }};
}
