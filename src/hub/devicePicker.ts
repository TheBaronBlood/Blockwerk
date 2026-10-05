// ---------------------------------------------------------------
// Fenster »Hub verbinden«: erst die Frage Bluetooth oder Kabel, dann – im Programm
// (Electron) – die Liste der gefundenen Hubs. Im Browser zeigt Chrome oder Edge die Liste
// selbst; dessen Fenster lässt sich nicht gestalten. Im Programm kommt die Liste über
// `window.blockwerkDesktop`.
// ---------------------------------------------------------------
import { usbHint } from '../versions';
import { lastFirmware } from './lastHub';

export type Transport = 'ble' | 'usb' | 'test';

/** Ein gefundener Hub; `rssi` ist die Empfangsstärke in dBm, wenn die Suche sie liefert. */
export interface FoundDevice { id: string; name: string; rssi?: number }
interface DesktopBridge {
  onDevices(callback: (devices: FoundDevice[]) => void): void;
  chooseDevice(id: string): void;
  startSearch?(): void;
}
declare global { interface Window { blockwerkDesktop?: DesktopBridge } }

export interface ConnectDialog {
  /** Fragt, wie der Hub verbunden ist – zur Wahl stehen die genannten Wege. Liefert null, wenn abgebrochen wurde. */
  choose(available: Transport[]): Promise<Transport | null>;
  /** Vor der Suche aufrufen; im Programm erscheint dann die Liste der Hubs. */
  searching(kind: Transport): void;
  /**
   * Liste für eine Suche, die die Seite selbst führt (App auf dem Tablet oder Handy): zeigt
   * laufend, was `subscribe` meldet, und liefert die Kennung des gewählten Hubs – oder null,
   * wenn abgebrochen wurde.
   */
  pick(kind: 'ble' | 'usb', subscribe: (found: (devices: FoundDevice[]) => void) => void): Promise<string | null>;
  /** Schließen, sobald die Suche beendet ist – egal wie sie ausging. */
  close(): void;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON = {
  ble: svg('<path d="M7 7l10 10-5 5V2l5 5L7 17"/>'),
  usb: svg('<circle cx="12" cy="19" r="2.5"/><path d="M12 16.500V3M9 6l3-3 3 3M12 13l-5-2.500V8M12 15l5-2.500V10"/><circle cx="7" cy="7" r="1.200"/><path d="M16 8h2v2h-2z"/>'),
  test: svg('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400a2 2 0 0 0 1.800-3l-5-9V3M7.500 14h9"/>'),
  hub: svg('<rect x="5" y="2.500" width="14" height="19" rx="3"/><path d="M9 7h.01M12 7h.01M15 7h.01M9 10h.01M12 10h.01M15 10h.01M9 13h.01M12 13h.01M15 13h.01"/><circle cx="12" cy="17.500" r="1.300"/>')
};
const TEXT: Record<'ble' | 'usb', {title: string; searching: string; found: string}> = {
  ble:{title:'Hub über Bluetooth suchen', searching:'Suche läuft … Der Hub muss eingeschaltet sein; seine Bluetooth-Taste blinkt blau.', found:'Gefundene Hubs – wähle deinen aus:'},
  usb:{title:'Hub am USB-Kabel', searching:'', found:'Angeschlossene Hubs – wähle deinen aus:'}
};

/** Empfangsstärke als drei Balken: nah, mittel, weit. */
function signal(rssi: number){
  const level = rssi >= -60 ? 3 : rssi >= -75 ? 2 : 1;
  const bar = (x: number, h: number, on: boolean) => `<rect x="${x}" y="${20 - h}" width="4" height="${h}" rx="1" fill="currentColor" opacity="${on ? 1 : 0.25}"/>`;
  return `<svg class="connect-signal" viewBox="0 0 24 24" width="22" height="22" role="img" aria-label="${['', 'schwacher', 'mittlerer', 'starker'][level]} Empfang">${bar(4, 6, true)}${bar(10, 11, level >= 2)}${bar(16, 16, level >= 3)}</svg>`;
}

/** @param ownBleList die Seite sucht selbst nach Hubs (App): Das Fenster bleibt nach der Wahl »Bluetooth« offen */
export function initConnectDialog(opts: {ownBleList?: boolean} = {}): ConnectDialog {
  const bridge = window.blockwerkDesktop;
  const dialog = document.createElement('dialog');
  dialog.className = 'connect';
  dialog.innerHTML = `
    <div class="connect-head"><h2></h2><button type="button" class="btn" data-act="cancel" aria-label="Abbrechen">✕</button></div>
    <div class="connect-step" data-step="transport">
      <p class="connect-note">Wie ist der Hub verbunden?</p>
      <div class="connect-cards">
        <button type="button" data-kind="ble">${ICON.ble}<b>Bluetooth</b><span>ohne Kabel – der Hub muss eingeschaltet sein</span></button>
        <button type="button" data-kind="usb">${ICON.usb}<b>USB-Kabel</b><span>nur mit einer Pybricks-Firmware, die USB kann (Beta 4.1)</span></button>
        <button type="button" data-kind="test">${ICON.test}<b>Test-Hub</b><span>Entwickleroption – ein nachgestellter Hub ohne Gerät</span></button>
      </div>
    </div>
    <div class="connect-step" data-step="devices">
      <p class="connect-note"><span class="connect-spin" aria-hidden="true"></span><span></span></p>
      <ul class="connect-list"></ul>
    </div>
    <div class="connect-actions"><button type="button" class="btn" data-act="cancel">Abbrechen</button></div>`;
  document.body.appendChild(dialog);

  const title = dialog.querySelector('h2')!, list = dialog.querySelector<HTMLElement>('.connect-list')!;
  const note = dialog.querySelector<HTMLElement>('[data-step=devices] .connect-note span:last-child')!;
  const spin = dialog.querySelector<HTMLElement>('.connect-spin')!;
  let step: 'transport' | 'devices' | null = null;
  let kind: 'ble' | 'usb' | null = null;                    // läuft gerade eine Suche, und welche
  let picked: (kind: Transport | null) => void = () => {};
  // wartet pick() auf eine Auswahl, geht sie dorthin; sonst an das Programm (Electron)
  let chosen: ((id: string) => void) | null = null;
  // läuft eine Suche, auf die noch keine Antwort gegeben wurde (Hub gewählt oder abgebrochen)
  let pending = false;
  const choose = (id: string) => { pending = false; if (chosen){ const done = chosen; chosen = null; done(id); } else bridge?.chooseDevice(id); };

  function show(next: 'transport' | 'devices'){
    step = next; dialog.dataset.step = next;
    title.textContent = next === 'transport' ? 'Hub verbinden' : TEXT[kind!].title;
    if (!dialog.open) dialog.showModal();
  }
  function hide(){ step = null; if (dialog.open) dialog.close(); }
  function cancel(){
    if (step === 'transport'){ hide(); picked(null); }
    else if (step === 'devices'){ hide(); choose(''); }
  }
  function showDevices(devices: FoundDevice[]){
    list.textContent = '';
    // der nächste Hub zuerst – im Raum mit vielen Hubs ist das meist der eigene
    const sorted = [...devices].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999));
    for (const d of sorted){
      const b = list.appendChild(document.createElement('li')).appendChild(document.createElement('button'));
      b.type = 'button'; b.innerHTML = ICON.hub;
      b.appendChild(document.createElement('span')).textContent = d.name || 'Hub ohne Namen';
      if (d.rssi !== undefined) b.insertAdjacentHTML('beforeend', signal(d.rssi));
      b.addEventListener('click', () => { hide(); choose(d.id); });
    }
    // am Kabel nichts gefunden: erklären, woran es meist liegt (Firmware ohne USB)
    note.textContent = devices.length ? TEXT[kind!].found : kind === 'usb' ? usbHint(lastFirmware()) : TEXT[kind!].searching;
    // Bluetooth sucht weiter, solange das Fenster offen ist; am Kabel gibt es nichts zu suchen
    spin.classList.toggle('hidden', kind === 'usb');
    show('devices');
  }

  dialog.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act], [data-kind]');
    if (el?.dataset.act === 'cancel') cancel();
    else if (el?.dataset.kind && step === 'transport'){
      const k = el.dataset.kind as Transport;
      // Im Programm bleibt das Fenster für Bluetooth gleich offen und zeigt die Suche
      if ((bridge || opts.ownBleList) && k === 'ble'){ kind = k; showDevices([]); } else hide();
      picked(k);
    }
  });
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); cancel(); });   // Esc-Taste
  bridge?.onDevices((devices) => { if (kind) showDevices(devices); });

  return {
    choose(available){
      dialog.querySelectorAll<HTMLElement>('[data-kind]').forEach(card => card.classList.toggle('hidden', !available.includes(card.dataset.kind as Transport)));
      return new Promise((resolve) => { picked = resolve; kind = null; show('transport'); });
    },
    searching(k){
      if (!bridge || k === 'test') return;
      kind = k; pending = true;
      // dem Programm sagen, dass eine neue Suche beginnt – ein »Abbrechen« von vorhin darf sie nicht treffen
      bridge.startSearch?.();
      // Am Kabel erscheint die Liste nur, wenn es etwas zu wählen oder zu melden gibt
      if (k === 'ble') showDevices([]);
    },
    pick(k, subscribe){
      return new Promise((resolve) => {
        kind = k; pending = true;
        chosen = (id) => resolve(id || null);
        showDevices([]);
        subscribe((devices) => { if (chosen) showDevices(devices); });
      });
    },
    // Aufräumen nach dem Versuch: nur abbrechen, wenn wirklich noch eine Suche auf Antwort wartet
    close(){ kind = null; hide(); if (pending) choose(''); }
  };
}
