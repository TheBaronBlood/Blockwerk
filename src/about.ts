// Fenster »Über Blockwerk«: welche Fassungen hier zusammenarbeiten, was auf dem Hub läuft und
// ob es bei Pybricks eine neuere Firmware gibt. Ins Internet geht es nur auf Knopfdruck.
import {
  apiNote, BUILD, firmwareState, isPrerelease, pickLatest, PYBRICKS_API, PYBRICKS_CODE, PYBRICKS_CODE_BETA,
  PYBRICKS_MIN, PYBRICKS_RELEASES, PYBRICKS_USB, type Latest, type Release
} from './versions';
import { tabletSystem, where } from './platform';

export interface AboutHub { name: string; via: string; firmware: string; protocol: string }
export interface AboutHost { hub(): AboutHub | null; toast(msg: string): void }

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag); node.textContent = text; if (className) node.className = className; return node;
};
const germanDate = (iso: string) => { const [y, m, d] = iso.split('-'); return d ? `${Number(d)}.${Number(m)}.${y}` : ''; };

export function initAboutDialog(host: AboutHost): {open(): void} {
  const runsAs = {app:'Programm am Computer', browser:'Seite im Browser',
    tablet:`App (${tabletSystem() === 'ios' ? 'iPadOS' : 'Android'})`}[where()];
  const ua = (name: string) => new RegExp(name + '/([\\d.]+)').exec(navigator.userAgent)?.[1] ?? '';
  const dialog = document.createElement('dialog');
  dialog.className = 'settings about';
  dialog.innerHTML = `
    <div class="connect-head"><h2>Über Blockwerk</h2><button type="button" class="btn" data-act="close" aria-label="Schließen">✕</button></div>
    <div class="settings-body">
      <h3>Blockwerk</h3><dl data-list="app"></dl>
      <h3>Pybricks</h3><dl data-list="pybricks"></dl>
      <h3>Hub</h3><dl data-list="hub"></dl>
      <div class="settings-buttons">
        <button type="button" class="btn" data-act="check">Nach neuer Pybricks-Firmware suchen</button>
        <span class="settings-note" data-check-state></span>
      </div>
      <div data-result></div>
      <h3>Eingebaut</h3><dl data-list="parts"></dl>
      <p class="settings-note">Blockwerk ist freie Software unter der MIT-Lizenz. Eingebaut sind unter anderem Blockly (Apache-2.0) und der Python-Übersetzer von Pybricks (MIT). Blockwerk gehört weder zu LEGO noch zu Pybricks.</p>
      <div class="settings-buttons">
        <button type="button" class="btn" data-act="copy">Angaben kopieren</button>
        <button type="button" class="btn" data-act="licenses" aria-expanded="false">Lizenzen anzeigen</button>
      </div>
      <pre class="about-licenses hidden" data-licenses tabindex="0"></pre>
    </div>`;
  document.body.appendChild(dialog);
  const list = (name: string) => dialog.querySelector<HTMLElement>(`[data-list=${name}]`)!;
  const result = dialog.querySelector<HTMLElement>('[data-result]')!, checkState = dialog.querySelector<HTMLElement>('[data-check-state]')!;
  const checkButton = dialog.querySelector<HTMLButtonElement>('[data-act=check]')!;
  const licensesButton = dialog.querySelector<HTMLButtonElement>('[data-act=licenses]')!, licensesEl = dialog.querySelector<HTMLElement>('[data-licenses]')!;
  let latest: Latest | null = null;

  function fill(target: HTMLElement, rows: [string, string][]){
    target.textContent = '';
    for (const [name, value] of rows) if (value) target.append(el('dt', name), el('dd', value));
  }
  function rows(): Record<string, [string, string][]> {
    const hub = host.hub();
    return {
      app: [['Version', BUILD.app], ['Läuft als', runsAs]],
      pybricks: [
        ['Blöcke geprüft gegen', `Pybricks ${PYBRICKS_API}`],
        ['USB-Kabel geprüft gegen', `Pybricks ${PYBRICKS_USB} (Vorabfassung)`],
        ['Älteste Firmware', `Pybricks ${PYBRICKS_MIN}`]],
      hub: hub
        ? [['Name', hub.name], ['Verbunden über', hub.via], ['Firmware', `Pybricks ${hub.firmware.replace(/^v/, '')}`], ['Protokoll', hub.protocol]]
        : [['Verbindung', 'kein Hub verbunden – die Firmware des Hubs erscheint hier nach »Hub verbinden«']],
      parts: [
        ['Blockly', BUILD.blockly], ['Python-Übersetzer', `mpy-cross-v6 ${BUILD.mpyCross} (MicroPython-Format 6)`],
        ['Electron', ua('Electron')], ['Chromium', ua('Chrome')], ['WebKit', ua('Chrome') ? '' : ua('AppleWebKit')]]
    };
  }
  function render(){
    const all = rows();
    for (const name of Object.keys(all)) fill(list(name), all[name]);
    renderResult();
  }

  function releaseLine(label: string, release: Release): HTMLElement {
    const p = el('p', `${label}: Pybricks ${release.version}${release.date ? ` vom ${germanDate(release.date)}` : ''}`);
    if (release.url){ const a = el('a', 'Was ist neu?'); a.href = release.url; a.target = '_blank'; a.rel = 'noopener'; p.append(' · ', a); }
    return p;
  }
  function renderResult(){
    result.textContent = '';
    if (!latest) return;
    const box = result.appendChild(el('div', '', 'about-result'));
    if (!latest.stable && !latest.beta){ box.append(el('p', 'Pybricks hat keine Liste geliefert. Bitte später noch einmal versuchen.')); return; }
    if (latest.stable) box.append(releaseLine('Aktuelle Firmware', latest.stable));
    if (latest.beta) box.append(releaseLine('Vorabfassung (kann USB)', latest.beta));
    const hub = host.hub();
    const judged = hub ? firmwareState(hub.firmware, latest) : null;
    if (judged) box.append(el('p', judged.text, judged.target ? 'about-warn' : 'about-ok'));
    else box.append(el('p', 'Verbinde einen Hub, dann vergleicht Blockwerk seine Firmware damit.'));
    const note = apiNote(latest);
    if (note) box.append(el('p', note));
    // Die Firmware spielt Pybricks Code auf – das kann Blockwerk nicht selbst
    const beta = !!judged?.target && isPrerelease(judged.target.version);
    const link = el('a', beta ? 'Pybricks Code (Beta) öffnen' : 'Pybricks Code öffnen', 'btn');
    link.href = beta ? PYBRICKS_CODE_BETA : PYBRICKS_CODE; link.target = '_blank'; link.rel = 'noopener';
    const how = el('p', (where() === 'tablet' ? 'Firmware aktualisieren geht nur an einem Computer mit Chrome oder Edge: dort ' : 'Firmware aktualisieren: ') +
      'Pybricks Code öffnen, links auf das Zahnrad, dann »Pybricks-Firmware installieren« und den ' +
      'Schritten folgen. Der Hub hängt dabei am USB-Kabel. Vorher in Blockwerk trennen.', 'settings-note');
    const buttons = el('div', '', 'settings-buttons'); buttons.append(link);
    box.append(buttons, how);
  }

  async function check(){
    checkButton.disabled = true; checkState.textContent = 'Frage bei Pybricks nach …';
    try {
      const response = await fetch(PYBRICKS_RELEASES, {headers:{Accept:'application/vnd.github+json'}});
      if (!response.ok) throw new Error(String(response.status));
      latest = pickLatest(await response.json());
      checkState.textContent = '';
    } catch {
      latest = null;
      checkState.textContent = 'Das hat nicht geklappt – dafür braucht es eine Internetverbindung.';
    }
    checkButton.disabled = false;
    renderResult();
  }

  // Die Lizenztexte der eingebauten Software legt der Build als lizenzen.txt neben die Seite (build/lizenzen.mjs)
  let licensesLoaded = false;
  async function toggleLicenses(){
    const hidden = licensesEl.classList.toggle('hidden');
    licensesButton.textContent = hidden ? 'Lizenzen anzeigen' : 'Lizenzen ausblenden';
    licensesButton.setAttribute('aria-expanded', String(!hidden));
    if (hidden || licensesLoaded) return;
    try {
      const response = await fetch('./lizenzen.txt');
      const text = response.ok ? await response.text() : '';
      // der Entwicklungsserver antwortet auf alles mit der Seite selbst
      if (!text.startsWith('Blockwerk')) throw new Error('fehlt');
      licensesEl.textContent = text; licensesLoaded = true;
    } catch { licensesEl.textContent = 'Die Lizenztexte liegen dem gebauten Blockwerk als Datei lizenzen.txt bei.'; }
  }

  function copyText(): string {
    const all = rows();
    const lines = ([['Blockwerk', all.app], ['Pybricks', all.pybricks], ['Hub', all.hub], ['Eingebaut', all.parts]] as [string, [string, string][]][])
      .map(([title, part]) => `${title}\n` + part.filter(r => r[1]).map(([name, value]) => `  ${name}: ${value}`).join('\n'));
    return lines.join('\n') + `\nSystem\n  ${navigator.userAgent}\n`;
  }

  dialog.addEventListener('click', (e) => {
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close' || e.target === dialog) dialog.close();
    else if (act === 'check') void check();
    else if (act === 'licenses') void toggleLicenses();
    else if (act === 'copy') navigator.clipboard.writeText(copyText()).then(() => host.toast('Angaben kopiert'), () => host.toast('Kopieren hat nicht geklappt'));
  });
  return {open(){ render(); if (!dialog.open) dialog.showModal(); }};
}
