// ---------------------------------------------------------------
// Hub-Ansicht: der Hub von oben, links und rechts seine Anschlüsse mit dem, was dort steckt und
// was es gerade misst; darunter Akku und Lage. Dieses Modul zeichnet nur – woher die Werte kommen,
// steht in monitor.ts, den Ablauf (Programm laden, stoppen) steuert main.ts.
// Alle Werte gehen als Text oder als Zahl in die Seite.
// ---------------------------------------------------------------
import { batteryLevel, colorName, deviceName, hsvToCss, PORT_NAMES, type HubReading, type MonitorState, type PortReading } from './monitor';

export interface HubViewHost {
  /** Das Fenster wurde geschlossen: Anzeige-Programm beenden. */
  closed(): void;
  /** »Wieder anzeigen« nach einem Ende am Hub. */
  restart(): void;
  /** »Hub trennen«: Programm zurücklegen, dann trennen – das Fenster schließt sich danach von selbst. */
  disconnect(): void;
}
export type HubViewStatus = 'loading' | 'live' | 'stale' | 'ended' | 'error';
export interface HubView {
  open(hubName: string): void;
  close(): void;
  isOpen(): boolean;
  render(state: MonitorState): void;
  status(kind: HubViewStatus, text?: string): void;
}

const SVG = 'http://www.w3.org/2000/svg';
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const node = document.createElement(tag); if (cls) node.className = cls; if (text) node.textContent = text; return node;
};
const svg = (tag: string, attrs: Record<string, string | number>, parent?: Element) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  parent?.appendChild(node);
  return node;
};
const num = (value: number, digits = 0) => value.toLocaleString('de-DE', {minimumFractionDigits:digits, maximumFractionDigits:digits});
/** Links am Hub sitzen A, C, E, rechts B, D, F – von oben gesehen, die Lichtmatrix über der großen Taste. */
const LEFT = ['A', 'C', 'E'], RIGHT = ['B', 'D', 'F'];
const STATUS_TEXT: Record<HubViewStatus, string> = {
  loading:'Lade die Anzeige auf den Hub …',
  live:'',
  stale:'Seit ein paar Sekunden kommen keine Werte mehr vom Hub.',
  ended:'Die Anzeige auf dem Hub wurde beendet.',
  error:'Die Anzeige ließ sich nicht starten – siehe Terminal.'
};
const CHARGE_TEXT = ['', 'lädt', 'voll geladen', 'Störung beim Laden'];

/** Der Hub von oben, schlicht gezeichnet; die Anschlüsse färben sich, sobald etwas steckt. */
function drawHub(): {root: SVGElement; ports: Record<string, SVGElement>} {
  const root = svg('svg', {viewBox:'0 0 150 200', class:'hubv-drawing', role:'img', 'aria-label':'Hub von oben'}) as SVGElement;
  const ports: Record<string, SVGElement> = {};
  [LEFT, RIGHT].forEach((side, s) => side.forEach((name, i) => {
    const y = 34 + i * 54, x = s === 0 ? 4 : 126;
    ports[name] = svg('rect', {x, y, width:20, height:30, rx:4, class:'hubv-socket'}, root) as SVGElement;
    svg('text', {x:x + 10, y:y + 20, class:'hubv-socket-letter', 'text-anchor':'middle'}, root).textContent = name;
  }));
  svg('rect', {x:22, y:6, width:106, height:188, rx:14, class:'hubv-case'}, root);
  // Lichtmatrix 5×5
  for (let row = 0; row < 5; row++) for (let col = 0; col < 5; col++)
    svg('rect', {x:40 + col * 15, y:24 + row * 15, width:10, height:10, rx:2, class:'hubv-pixel'}, root);
  // große Taste, links/rechts, Bluetooth
  svg('circle', {cx:75, cy:138, r:17, class:'hubv-button'}, root);
  svg('rect', {x:36, y:128, width:14, height:20, rx:7, class:'hubv-button'}, root);
  svg('rect', {x:100, y:128, width:14, height:20, rx:7, class:'hubv-button'}, root);
  svg('circle', {cx:108, cy:174, r:6, class:'hubv-button'}, root);
  return {root, ports};
}

interface PortCard {
  root: HTMLElement; name: HTMLElement; visual: HTMLElement; value: HTMLElement; detail: HTMLElement; modes: HTMLElement;
  /** Art und Nummer des Geräts, für das die Karte gerade aufgebaut ist. */
  built: string;
  /** Farbsensor: was groß angezeigt wird. */
  colorMode: 'color' | 'reflection';
  needle?: SVGElement; swatch?: HTMLElement; bar?: HTMLElement;
}

export function initHubView(host: HubViewHost): HubView {
  const dialog = document.createElement('dialog');
  dialog.className = 'hubv';
  dialog.innerHTML = `
    <div class="connect-head"><h2>Hub-Ansicht</h2><button type="button" class="btn hubv-disconnect" data-act="disconnect" title="Legt dein Programm zurück auf den Hub und trennt die Verbindung">Hub trennen</button><button type="button" class="btn" data-act="close" aria-label="Schließen">✕</button></div>
    <div class="hubv-body">
      <p class="hubv-status" data-status role="status"><span></span><button type="button" class="btn hidden" data-act="restart">Wieder anzeigen</button></p>
      <div class="hubv-grid">
        <div class="hubv-col" data-side="left"></div>
        <div class="hubv-mid"><div data-drawing></div><div class="hubv-info" data-info></div></div>
        <div class="hubv-col" data-side="right"></div>
      </div>
      <p class="settings-note">Solange dieses Fenster offen ist, läuft auf dem Hub ein kleines Anzeige-Programm von Blockwerk. Es bewegt nichts: Dreh einen Motor von Hand und sieh dem Winkel zu, halte etwas vor einen Sensor.</p>
    </div>`;
  document.body.appendChild(dialog);
  const title = dialog.querySelector('h2')!;
  const statusEl = dialog.querySelector<HTMLElement>('[data-status]')!, statusText = statusEl.querySelector('span')!;
  const restart = dialog.querySelector<HTMLButtonElement>('[data-act=restart]')!;
  const info = dialog.querySelector<HTMLElement>('[data-info]')!;
  const hub = drawHub();
  dialog.querySelector('[data-drawing]')!.appendChild(hub.root);

  const cards: Record<string, PortCard> = {};
  for (const [side, names] of [['left', LEFT], ['right', RIGHT]] as const){
    const column = dialog.querySelector<HTMLElement>(`[data-side=${side}]`)!;
    for (const port of names){
      const root = column.appendChild(el('section', 'hubv-port'));
      root.dataset.port = port;
      const head = root.appendChild(el('header'));
      head.append(el('b', 'hubv-letter', port));
      const name = head.appendChild(el('span', 'hubv-name'));
      const row = root.appendChild(el('div', 'hubv-row'));
      const visual = row.appendChild(el('div', 'hubv-visual'));
      const texts = row.appendChild(el('div', 'hubv-texts'));
      const value = texts.appendChild(el('div', 'hubv-value')), detail = texts.appendChild(el('div', 'hubv-detail'));
      const modes = root.appendChild(el('div', 'hubv-modes'));
      cards[port] = {root, name, visual, value, detail, modes, built:'', colorMode:'color'};
    }
  }

  /** Baut die Karte für ein Gerät neu auf – nur wenn sich geändert hat, was am Anschluss steckt. */
  function build(card: PortCard, r: PortReading | undefined){
    const key = r ? `${r.kind}:${r.id}` : 'wait';
    if (card.built === key) return;
    card.built = key;
    card.root.dataset.kind = r?.kind ?? 'wait';
    card.visual.textContent = ''; card.modes.textContent = ''; card.value.textContent = ''; card.detail.textContent = '';
    card.needle = card.swatch = card.bar = undefined;
    card.name.textContent = !r ? '…' : r.kind === 'none' ? 'frei' : deviceName(r.id);
    if (!r || r.kind === 'none') return;
    if (r.kind === 'motor'){
      // die Achse: ein Zeiger, der sich mit dem Winkel dreht
      const dial = svg('svg', {viewBox:'0 0 44 44', class:'hubv-dial', 'aria-hidden':'true'});
      svg('circle', {cx:22, cy:22, r:19}, dial);
      card.needle = svg('line', {x1:22, y1:22, x2:22, y2:6}, dial) as SVGElement;
      svg('circle', {cx:22, cy:22, r:3, class:'hubv-hubcap'}, dial);
      card.visual.appendChild(dial);
    } else if (r.kind === 'color'){
      card.swatch = card.visual.appendChild(el('div', 'hubv-swatch'));
      for (const [mode, label] of [['color', 'Farbe'], ['reflection', 'Reflexion']] as const){
        const b = card.modes.appendChild(el('button', '', label)); b.type = 'button'; b.dataset.mode = mode;
        b.addEventListener('click', () => { card.colorMode = mode; update(card, last.ports[card.root.dataset.port!]); });
      }
      card.bar = card.root.appendChild(el('div', 'hubv-bar')).appendChild(el('i'));
    } else if (r.kind === 'ultra' || r.kind === 'force'){
      card.bar = card.root.appendChild(el('div', 'hubv-bar')).appendChild(el('i'));
    } else card.detail.textContent = 'Die Hub-Ansicht kann dieses Gerät nicht auslesen.';
  }
  const fill = (card: PortCard, fraction: number) => { if (card.bar) card.bar.style.width = `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`; };
  // Balken, die build() an die Karte selbst gehängt hat, beim Neuaufbau wieder entfernen
  const clearBars = (card: PortCard) => card.root.querySelectorAll('.hubv-bar').forEach(b => b.remove());

  function update(card: PortCard, r: PortReading | undefined){
    const key = r ? `${r.kind}:${r.id}` : 'wait';
    if (card.built !== key){ clearBars(card); build(card, r); }
    if (!r) return;
    if (r.kind === 'motor'){
      // als Stil gesetzt, damit der Zeiger zwischen zwei Meldungen gleitet (style.css) statt zu springen
      if (card.needle) card.needle.style.transform = `rotate(${r.angle ?? 0}deg)`;
      card.value.textContent = `${num(r.angle ?? 0)}°`;
      card.detail.textContent = `${num(r.speed ?? 0)} Grad/s`;
    } else if (r.kind === 'color'){
      if (card.swatch) card.swatch.style.background = hsvToCss(r.h ?? 0, r.s ?? 0, r.v ?? 0);
      const reflection = card.colorMode === 'reflection';
      card.modes.querySelectorAll<HTMLElement>('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === card.colorMode)));
      card.value.textContent = reflection ? `${num(r.reflection ?? 0)}\u00A0%` : colorName(r.color ?? 'NONE');
      card.detail.textContent = reflection ? 'so viel Licht kommt zurück' : `Farbton ${num(r.h ?? 0)} · Sättigung ${num(r.s ?? 0)} · Helligkeit ${num(r.v ?? 0)}`;
      card.root.querySelector<HTMLElement>('.hubv-bar')!.classList.toggle('hidden', !reflection);
      fill(card, (r.reflection ?? 0) / 100);
    } else if (r.kind === 'ultra'){
      const nothing = (r.distance ?? 2000) >= 2000;
      card.value.textContent = nothing ? 'nichts erkannt' : `${num(r.distance ?? 0)}\u00A0mm`;
      card.detail.textContent = nothing ? 'der Block liefert dann 2000' : 'Abstand';
      fill(card, nothing ? 0 : (r.distance ?? 0) / 2000);
    } else if (r.kind === 'force'){
      card.value.textContent = `${num(r.force ?? 0, 1)}\u00A0N`;
      card.detail.textContent = r.pressed ? 'gedrückt' : 'nicht gedrückt';
      fill(card, (r.force ?? 0) / 10);
    }
  }

  let shownHub = '';
  function renderHub(h: HubReading | null){
    // nur neu aufbauen, wenn sich am Hub etwas geändert hat – die Meldungen der Motoren kommen viel öfter
    const key = JSON.stringify(h);
    if (key === shownHub) return;
    shownHub = key;
    info.textContent = '';
    if (!h) return;
    const battery = info.appendChild(el('div', 'hubv-battery'));
    battery.title = 'Aus der Spannung geschätzt';
    const cell = battery.appendChild(el('span', 'hubv-cell'));
    cell.appendChild(el('i')).style.width = `${Math.round(batteryLevel(h.millivolts) * 100)}%`;
    cell.classList.toggle('low', batteryLevel(h.millivolts) < 0.2);
    battery.append(el('b', '', `${num(h.millivolts / 1000, 2)} V`));
    const charge = CHARGE_TEXT[h.charge] || (h.plugged ? 'Ladekabel steckt' : '');
    if (charge) battery.append(el('span', 'hubv-charge', charge));
    info.append(el('div', 'hubv-line', `Strom ${num(h.milliamps)} mA`));
    if (h.pitch !== null && h.roll !== null) info.append(el('div', 'hubv-line', `Neigung ${num(h.pitch)}° / ${num(h.roll)}°`));
    if (h.heading !== null) info.append(el('div', 'hubv-line', `Richtung ${num(h.heading)}°`));
  }

  let last: MonitorState = {version:null, ports:{}, hub:null};
  function render(state: MonitorState){
    last = state;
    for (const port of PORT_NAMES){
      update(cards[port], state.ports[port]);
      hub.ports[port].classList.toggle('on', !!state.ports[port] && state.ports[port].kind !== 'none');
    }
    renderHub(state.hub);
  }
  function status(kind: HubViewStatus, text?: string){
    statusText.textContent = text ?? STATUS_TEXT[kind];
    statusEl.dataset.kind = kind;
    statusEl.classList.toggle('hidden', kind === 'live');
    restart.classList.toggle('hidden', kind !== 'ended' && kind !== 'error');
    dialog.classList.toggle('paused', kind !== 'live');
  }
  function close(){ if (dialog.open) dialog.close(); }

  dialog.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close' || e.target === dialog) close();
    else if (act === 'restart') host.restart();
    else if (act === 'disconnect') host.disconnect();
  });
  // jedes Schließen – Knopf, Esc, Klick daneben – beendet das Anzeige-Programm
  dialog.addEventListener('close', () => host.closed());

  return {
    open(hubName){
      title.textContent = hubName ? `Hub-Ansicht – ${hubName}` : 'Hub-Ansicht';
      render({version:null, ports:{}, hub:null});
      status('loading');
      if (!dialog.open) dialog.showModal();
    },
    close, isOpen: () => dialog.open, render, status
  };
}
