import * as Blockly from 'blockly';
// Schriften liegen im Paket, damit Blockwerk auch ohne Internet gleich aussieht
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './style.css';
import './blocks';
import { BLOCKLY_MEDIA, THEME_DARK, THEME_LIGHT } from './theme';
import wasmUrl from '@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url';
import { generate, type CodeLine, type GenerateResult, REMOTE_STATUS } from './generator';
import { HubConnection } from './hub/connection';
import { initConnectDialog, type Transport } from './hub/devicePicker';
import { Hub, HubConnectionError, type HubListener } from './hub/hub';
import { SerialHub } from './hub/serial';
import { TestHub } from './hub/testHub';
import { initAboutDialog } from './about';
import { ask } from './ask';
import { initSettingsDialog, isDark, loadSettings, onSettings, settings, updateSettings } from './settings';
import { browserGamepads, watchGamepad } from './hub/gamepad';
import { createPad } from './hub/pad';
import { lastFirmware, rememberFirmware } from './hub/lastHub';
import { MONITOR_HEARTBEAT, MONITOR_HEARTBEAT_MS, MONITOR_PROGRAM, MonitorFeed, StrayFilter } from './hub/monitor';
import { initHubView } from './hub/monitorView';
import { usbHint } from './versions';
import { PAD_BUTTONS } from './hub/padProtocol';
import { initPadView, type PadView } from './hub/padView';
import { encodeModules, MAIN_MODULE, ProgramTooLargeError } from './hub/protocol';
import { TracebackParser } from './hub/traceback';
import { hasWord, initHelp } from './help';
import { highlight } from './highlight';
import { initLayout } from './layout';
import { isTablet, tabletSystem } from './platform';
import { saveFile } from './files';
import { toolboxWith } from './toolbox';
import { EXAMPLES, type WorkspaceState } from './examples';
import { initExtensionEditor } from './ext/editor';
import { isExtensionType, stripBlocks, toolboxCategory } from './ext/register';
import { extensions, extensionTypes, loadStoredExtensions } from './ext/store';
import { checkState, installBrought, ProjectError, readProject, withoutExtensions, type BroughtExtension } from './project';

/** Versionsnummer aus package.json; setzt Vite beim Bauen ein. */
declare const __APP_VERSION__: string;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
/** Taste für Kürzel in Meldungen: auf dem Mac die Befehlstaste. */
const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Strg+';
$('btnAbout').textContent = 'v' + __APP_VERSION__;

// ---------------------------------------------------------------
// Arbeitsfläche
// ---------------------------------------------------------------
// Kennzeichen für das Stylesheet: App auf dem Tablet (kein Markieren von Knöpfen, kein Gummiband)
document.documentElement.classList.toggle('tablet', isTablet());
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
// Einstellungen gelten, bevor irgendetwas gezeichnet wird. Wer schon Erweiterungen hat, sieht den Knopf weiter.
loadStoredExtensions();
loadSettings({extensions:extensions().length > 0});
// (Die Erweiterungen sind schon angemeldet – ihre Blöcke müssen bekannt sein, bevor das gespeicherte Programm geladen wird.)
const currentToolbox = () => toolboxWith(extensions().map(toolboxCategory) as Blockly.utils.toolbox.ToolboxItemInfo[]);
Blockly.Scrollbar.scrollbarThickness = 10;   // schmaler als Blocklys Standard
const ws = Blockly.inject('blocklyDiv', {
  toolbox:currentToolbox(), theme: isDark() ? THEME_DARK : THEME_LIGHT, renderer:'zelos', media:BLOCKLY_MEDIA, sounds:false, trashcan:false, comments:false,
  zoom:{controls:false, wheel:true, startScale:0.72, maxScale:2, minScale:0.35, scaleSpeed:1.15},
  grid:{spacing:26, length:2, colour:isDark() ? '#2C313A' : '#DDE3EA', snap:false},
  move:{scrollbars:true, drag:true, wheel:false}
});
// für den Selbsttest des Programms (electron/main.cjs), der Blöcke anlegen und anklicken muss
(window as unknown as {__blockwerkWorkspace?: Blockly.WorkspaceSvg}).__blockwerkWorkspace = ws;
function applyTheme(){
  ws.setTheme(isDark() ? THEME_DARK : THEME_LIGHT);
  // die Farbe des Punktrasters legt Blockly nur beim Aufbau fest
  document.querySelectorAll('#blocklyDiv pattern line').forEach(l => l.setAttribute('stroke', isDark() ? '#2C313A' : '#DDE3EA'));
}
darkQuery.addEventListener('change', applyTheme);
ws.addChangeListener(Blockly.Events.disableOrphans);

const codeEl = $('codeLines');
const warnEl = $('warnings');
let currentCode = '';
let currentLines: CodeLine[] = [];
let currentUsesPad = false;
let currentUsesXbox = false;
let padViewRef: PadView | null = null;   // die Controller-Ansicht; entsteht weiter unten
/** Der Controller-Knopf an der Arbeitsfläche erscheint nur, wenn das Programm das Steuerfeld abfragt. */
function syncPadButton(){
  document.getElementById('btnPadWs')?.classList.toggle('hidden', !currentUsesPad);
  document.querySelector('.ws-wrap')?.classList.toggle('has-pad', currentUsesPad);
}
let currentModules: GenerateResult['modules'] = [];
let selectedId: string | null = null;
let shownCode: string | null = null;   // was gerade im Python-Bereich steht (Zeilen samt Block)

function render(){
  let res: GenerateResult;
  try { res = generate(ws); }
  catch (err){ res = {lines:[{text:'# Fehler beim Übersetzen: ' + (err as Error).message, id:null}], warnings:[], usesPad:false, usesXbox:false, modules:[]}; }
  currentLines = res.lines;
  if (currentUsesPad !== res.usesPad){ currentUsesPad = res.usesPad; syncPadButton(); if (padViewRef) updateHubUi(); }
  currentModules = res.modules;
  currentUsesXbox = res.usesXbox;
  currentCode = res.lines.map(l => l.text).join('\n') + '\n';
  // Wer einen Block nur verschiebt, ändert das Programm nicht – dann bleibt die Anzeige stehen
  const shown = res.lines.map(l => (l.id ?? '') + '\t' + l.text).join('\n');
  if (shown !== shownCode){
    shownCode = shown;
    codeEl.textContent = '';
    const frag = document.createDocumentFragment();
    res.lines.forEach((l, i) => {
      const row = document.createElement('div'); row.className = 'ln';
      if (l.id){ row.dataset.id = l.id; if (l.id === selectedId) row.classList.add('sel'); }
      const no = document.createElement('span'); no.className = 'no'; no.textContent = String(i + 1);
      const tx = document.createElement('span'); tx.className = 'tx'; highlight(l.text, tx, hasWord);
      row.append(no, tx); frag.appendChild(row);
    });
    codeEl.appendChild(frag);
  }
  if (res.warnings.length){
    warnEl.innerHTML = '';
    const ul = document.createElement('ul');
    res.warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    warnEl.appendChild(ul); warnEl.classList.remove('hidden');
  } else warnEl.classList.add('hidden');
}
function markSelection(id: string | null){
  selectedId = id;
  let first: HTMLElement | null = null;
  codeEl.querySelectorAll<HTMLElement>('.ln').forEach(r => {
    const on = !!id && r.dataset.id === id;
    r.classList.toggle('sel', on);
    if (on && !first) first = r;
  });
  (first as HTMLElement | null)?.scrollIntoView({block:'nearest'});
}
codeEl.addEventListener('click', (e) => {
  // Klick auf ein erklärtes Wort öffnet die Python-Hilfe, sonst wird der Block zur Zeile markiert
  const word = (e.target as HTMLElement).closest<HTMLElement>('.tk-doc')?.dataset.word;
  if (word){ help.showWord(word, (e.target as HTMLElement).closest('.ln')?.querySelector('.tx')?.textContent ?? undefined); return; }
  const row = (e.target as HTMLElement).closest<HTMLElement>('.ln[data-id]'); if (!row) return;
  const b = ws.getBlockById(row.dataset.id!); if (!b) return;
  Blockly.common.setSelected(b);
  ws.centerOnBlock(b.id);
  if (mainEl.dataset.view === 'code') setView('blocks');
});

const STORE_KEY = 'blockwerk-workspace-v1';
let renderTimer: number | undefined, saveTimer: number | undefined;
ws.addChangeListener((e) => {
  if (e.type === Blockly.Events.SELECTED){ markSelection((e as Blockly.Events.Selected).newElementId || null); return; }
  if (e.isUiEvent) return;
  clearTimeout(renderTimer); renderTimer = window.setTimeout(render, 80);
  clearTimeout(saveTimer); saveTimer = window.setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(Blockly.serialization.workspaces.save(ws))); } catch (err) {}
  }, 400);
});

function loadState(state: WorkspaceState){
  // erst prüfen: Scheitert das Laden (unbekannter Block, Datei einer neueren Fassung), bleibt das jetzige Programm stehen
  checkState(state);
  ws.clear();
  Blockly.serialization.workspaces.load(state, ws);
  if (window.matchMedia('(max-width: 820px)').matches){
    // schmale Bildschirme: alles zeigen – aber nicht größer als normal (ein kleines Programm füllte sonst ein Tablet hochkant aus)
    ws.zoomToFit();
    if (ws.scale > 1){ ws.setScale(1); ws.scrollCenter(); }
  } else ws.scrollCenter();
  render();
}
let restored = false;
const storedRaw = (() => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } })();
try {
  if (storedRaw){ loadState(JSON.parse(storedRaw)); restored = true; }
} catch (err) {
  // Das Programm nicht verlieren: Gleich überschreibt das automatische Speichern den alten Stand
  console.error('Gespeichertes Programm ließ sich nicht laden:', err);
  try { localStorage.setItem(STORE_KEY + '-nicht-ladbar', storedRaw!); } catch { /* kein Speicher verfügbar */ }
  restored = false;
}
if (!restored) loadState(EXAMPLES.quadrat());

// ---------------------------------------------------------------
// Bedienelemente
// ---------------------------------------------------------------
const toastEl = $('toast');
let toastTimer: number | undefined;
function toast(msg: string){ toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2600); }

$<HTMLSelectElement>('examples').addEventListener('change', (e) => {
  const sel = e.target as HTMLSelectElement;
  const key = sel.value; if (!key) return;
  loadState(EXAMPLES[key]()); sel.value = '';
  // ohne Tastatur hilft der Hinweis auf das Tastenkürzel nicht
  toast(fingers() ? 'Beispiel geladen.' : `Beispiel geladen – ${MOD}Z macht es rückgängig.`);
});
$('btnNew').addEventListener('click', () => {
  ws.clear();
  const b = ws.newBlock('pb_start'); b.initSvg(); b.render(); b.moveBy(40, 40);
  render(); toast(`Neue Arbeitsfläche – ${MOD}Z holt das alte Programm zurück.`);
});
$('zoomIn').addEventListener('click', () => ws.zoomCenter(1));
$('zoomOut').addEventListener('click', () => ws.zoomCenter(-1));
// Aufräumen ordnet die Blöcke und holt sie zurück in die Mitte – sonst wirkt der Knopf wirkungslos,
// sobald schon alles geordnet ist und man nur die Ansicht verschoben hat
$('tidy').addEventListener('click', () => { ws.cleanUp(); requestAnimationFrame(() => ws.scrollCenter()); });

async function copyCode(){
  try { await navigator.clipboard.writeText(currentCode); toast('Code kopiert.'); return; } catch (err) {}
  const ta = document.createElement('textarea'); ta.value = currentCode; ta.setAttribute('readonly','');
  ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (err) {}
  ta.remove();
  if (ok) toast('Code kopiert.');
  else {
    const range = document.createRange(); range.selectNodeContents(codeEl);
    const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range);
    toast(`Code ist markiert – mit ${MOD}C kopieren.`);
  }
}
$('btnCopy').addEventListener('click', copyCode);

// Projekt öffnen
const fileInput = $<HTMLInputElement>('fileInput');
// iPadOS und Android kennen die Endungen der SPIKE-Projekte nicht und würden sie ausgrauen
if (isTablet()) fileInput.removeAttribute('accept');
$('btnOpen').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files && fileInput.files[0]; if (!f) return;
  fileInput.value = '';
  try {
    const bytes = new Uint8Array(await f.arrayBuffer());
    // SPIKE-Projekte (.llsp3, .llsp) sind ZIP-Dateien und beginnen mit »PK«
    if (bytes[0] === 0x50 && bytes[1] === 0x4b){ await openSpike(bytes); return; }
    await openProject(new TextDecoder().decode(bytes));
  } catch (err) {
    if (!(err instanceof ProjectError)) console.error(err);
    toast(err instanceof ProjectError ? err.message : 'Das Projekt enthält Blöcke, die Blockwerk hier nicht kennt. Dein Programm ist unverändert.');
  }
});

/** Fragt, ob die Erweiterungen eines Projekts installiert werden sollen: 'with', 'without' oder null (abbrechen). */
function askBrought(brought: BroughtExtension[]){
  const one = brought.length === 1;
  return ask({
    title:one ? 'Das Projekt bringt eine Erweiterung mit' : 'Das Projekt bringt Erweiterungen mit',
    text:['Eine Erweiterung besteht aus eigenen Blöcken mit eigenem Python-Code. Dieser Code läuft auf dem Hub, sobald du das Programm startest. Füge sie nur hinzu, wenn du weißt, von wem die Datei kommt.'],
    items:brought.map(b => ({
      name:b.ext.name,
      note:`${b.ext.blocks.length} ${b.ext.blocks.length === 1 ? 'Block' : 'Blöcke'}` + (b.replaces ? ' – ersetzt deine Erweiterung mit diesem Namen' : ''),
      warn:!!b.replaces})),
    buttons:[{id:'without', label:'Ohne Erweiterungen öffnen'}, {id:'with', label:one ? 'Hinzufügen und öffnen' : 'Alle hinzufügen und öffnen', primary:true}]
  });
}

async function openProject(text: string){
  const project = readProject(text);
  let state = project.state;
  let undo: (() => void) | null = null;
  if (project.brought.length){
    const answer = await askBrought(project.brought);
    if (!answer) return;   // abgebrochen: nichts installiert, nichts geladen
    if (answer === 'with') undo = installBrought(project.brought);
    else state = withoutExtensions(state, project.brought);
  }
  // passt das Programm nicht zu den Blöcken, die es jetzt gibt, kommen auch die Erweiterungen wieder weg
  try { checkState(state); } catch (err){ undo?.(); throw err; }
  if (undo){
    ws.updateToolbox(currentToolbox());
    if (!settings().extensions) updateSettings({extensions:true});   // der Knopf »Erweiterungen«: ansehen und wieder entfernen
  }
  loadState(state);
  const n = project.brought.length;
  toast(undo ? `Projekt geöffnet – mit ${n === 1 ? 'einer Erweiterung' : n + ' Erweiterungen'}.`
    : n ? 'Projekt geöffnet – ohne die Blöcke der Erweiterungen.' : 'Projekt geöffnet.');
}

// Projekt aus der SPIKE-App übersetzen und im Terminal berichten, was angepasst wurde
/** Liefert true, wenn das Projekt vollständig übersetzt auf der Arbeitsfläche liegt. Fehler und Einschränkungen meldet die Funktion selbst. */
async function openSpike(bytes: Uint8Array): Promise<boolean> {
  const { importSpikeFile, SpikeFileError } = await import('./spike/read');
  try {
    const imp = importSpikeFile(bytes);
    loadState(imp.state);
    ws.cleanUp();
    ws.scrollCenter();
    const {converted, notes, unsupported} = imp.report;
    termWrite(`— SPIKE-Projekt »${imp.name}« geöffnet: ${converted} Blöcke übersetzt —\n`, 't-info');
    if (notes.length) termWrite('Beim Übersetzen angepasst:\n' + notes.map(n => '• ' + n + '\n').join(''));
    if (unsupported.length) termWrite('Nicht übersetzt (graue Platzhalter im Programm):\n' + unsupported.map(u => '• ' + u + '\n').join(''), 't-hint');
    toast(unsupported.length ? `SPIKE-Projekt geöffnet – ${unsupported.length} Blockart(en) nicht übersetzt, siehe Terminal.` : 'SPIKE-Projekt geöffnet – Hinweise im Terminal.');
    return unsupported.length === 0;
  } catch (err){
    if (!(err instanceof SpikeFileError)) console.error(err);
    toast(err instanceof SpikeFileError ? err.message : 'Das SPIKE-Projekt lässt sich nicht übersetzen.');
    return false;
  }
}

// Projekt speichern
$('btnSave').addEventListener('click', async () => {
  // Benutzte Erweiterungen wandern mit in die Datei, damit sich das Projekt überall öffnen lässt
  const used = extensions().filter(e => extensionInUse(e.id)).map(e => e.source);
  const data = JSON.stringify({format:'blockwerk', version:1, workspace:Blockly.serialization.workspaces.save(ws), ...(used.length ? {extensions:used} : {})}, null, 1);
  try { if (await saveFile('blockwerk-projekt.json', data, 'application/json')) toast('Projekt gespeichert.'); }
  catch (err){ console.error(err); toast('Das Projekt ließ sich nicht speichern.'); }
});

// ---------------------------------------------------------------
// Erweiterungen
// ---------------------------------------------------------------
const extensionInUse = (id: string) => extensionTypes(id).some(type => ws.getBlocksByType(type).length > 0);
const extensionEditor = initExtensionEditor({
  theme: () => isDark() ? THEME_DARK : THEME_LIGHT,
  compile: async (code, fileName) => {
    const { compileProgram } = await import('./hub/compile');
    const res = await compileProgram(code, wasmUrl, fileName);
    return res.ok ? [] : res.errors;
  },
  // Blöcke wechseln ihr Aussehen nur beim Neuladen – deshalb Programm sichern, ändern, zurückladen
  apply: (change) => {
    const state = Blockly.serialization.workspaces.save(ws) as WorkspaceState;
    change();
    ws.updateToolbox(currentToolbox());
    try { loadState(stripBlocks(state, type => !Blockly.Blocks[type])); }
    catch (err){
      // passt ein Block nicht mehr zu seiner neuen Form, fliegen die Blöcke der Erweiterungen heraus
      console.error(err);
      loadState(stripBlocks(state, type => isExtensionType(type)));
      toast('Einige Blöcke der Erweiterung passten nicht mehr zur neuen Form und wurden aus dem Programm entfernt.');
    }
  },
  inUse: extensionInUse,
  toast
});
$('btnExt').addEventListener('click', () => extensionEditor.open());

// ---------------------------------------------------------------
// Einstellungen
// ---------------------------------------------------------------
const settingsDialog = initSettingsDialog({
  version: __APP_VERSION__,
  resetAll: () => {
    // Das automatische Speichern darf den gelöschten Stand nicht gleich wieder anlegen
    clearTimeout(saveTimer); ws.dispose();
    try { localStorage.clear(); } catch { /* nichts zu löschen */ }
    location.reload();
  }
});
$('btnSettings').addEventListener('click', () => settingsDialog.open());
const aboutDialog = initAboutDialog({hub:() => hub, toast});
$('btnAbout').addEventListener('click', () => aboutDialog.open());
onSettings((s) => {
  applyTheme();
  $('btnExt').classList.toggle('hidden', !s.extensions);
  // Entwickler: Protokoll im Terminal, und in der Konsole ein Zugang zu den Innereien
  Hub.trace = s.dev && s.devTrace ? (dir, bytes) => {
    const hex = [...bytes.subarray(0, 24)].map(b => b.toString(16).padStart(2, '0')).join(' ');
    termWrite(`${dir} ${hex}${bytes.length > 24 ? ` … (${bytes.length} Bytes)` : ''}\n`, 't-info');
  } : null;
  const debug = window as unknown as {blockwerk?: unknown};
  if (s.dev) debug.blockwerk = {ws, Blockly, generate:() => generate(ws), code:() => currentCode, hub:() => hub, settings, updateSettings, extensions, runPython, get connectDialog(){ return connectDialog; }};
  else delete debug.blockwerk;
});

// ---------------------------------------------------------------
// Hilfe
// ---------------------------------------------------------------
const help = initHelp({
  loadExample: (state) => { loadState(state); toast(`Beispiel geladen – ${MOD}Z macht es rückgängig.`); },
  theme: () => isDark() ? THEME_DARK : THEME_LIGHT,
  // Programme des Kurses sind SPIKE-Projekte der AG; sie werden beim Laden übersetzt
  loadProgram: async (file) => {
    // die Erfolgsmeldung nur, wenn es geklappt hat – sonst überdeckte sie die Fehlermeldung von openSpike()
    try { const { courseProgram } = await import('./docs/kursProgramme'); if (await openSpike(await courseProgram(file))) toast('Programm aus dem Kurs geladen.'); }
    catch (err){ console.error(err); toast('Das Programm lässt sich nicht laden.'); }
  },
  leader: () => settings().leader
});
$('btnHelp').addEventListener('click', () => {
  const sel = Blockly.common.getSelected();
  if (sel instanceof Blockly.BlockSvg && help.hasBlock(sel.type)) help.showBlock(sel.type); else help.showIndex();
});
Blockly.ContextMenuRegistry.registry.register({
  id:'bw_help', weight:0, scopeType:Blockly.ContextMenuRegistry.ScopeType.BLOCK,
  displayText:'Hilfe zu diesem Block',
  preconditionFn:(scope) => scope.block && help.hasBlock(scope.block.type) ? 'enabled' : 'hidden',
  callback:(scope) => { if (scope.block) help.showBlock(scope.block.type); }
});

// ---------------------------------------------------------------
// Hub: verbinden, Programm laden, Terminal
// ---------------------------------------------------------------
const btnConnect = $<HTMLButtonElement>('btnConnect'), btnRun = $<HTMLButtonElement>('btnRun'), btnStop = $<HTMLButtonElement>('btnStop');
const hubState = $('hubState'), termOut = $('termOut');
const RUN_LABEL = '▶ Starten';
const connectDialog = initConnectDialog({ownBleList:isTablet()});
// Was hier geht: Bluetooth, USB-Kabel, beides oder nichts davon. In der App auf dem Tablet
// laufen beide über die nativen Wege des Geräts (am iPad gibt es kein Kabel); die Module dafür
// werden erst beim Verbinden geladen.
const tablet = isTablet();
const realTransports: Transport[] = tablet
  ? ['ble', ...(tabletSystem() === 'android' ? ['usb' as const] : [])]
  : [...(HubConnection.supported() ? ['ble' as const] : []), ...(SerialHub.supported() ? ['usb' as const] : [])];
const transports = (): Transport[] => settings().dev && settings().devTestHub ? [...realTransports, 'test'] : realTransports;
const CONNECT: Record<Transport, (listener: HubListener) => Promise<Hub | null>> = {
  // in der App zeigt Blockwerk die gefundenen Hubs in seinem eigenen Fenster, wie im Programm am Computer
  ble: tablet ? async (l) => (await import('./hub/nativeBle')).NativeBleHub.connect(l, (subscribe) => connectDialog.pick('ble', subscribe)) : (l) => HubConnection.connect(l),
  usb: tablet ? async (l) => (await import('./hub/nativeSerial')).connectNativeSerial(l) : (l) => SerialHub.connect(l),
  test: (l) => TestHub.connect(l)
};
let hub: Hub | null = null;
let hubBusy = false;
let runUsesPad = false;        // das laufende Programm fragt das Steuerfeld ab
let runLines: CodeLine[] = [];   // Stand des Programms, das gerade auf dem Hub läuft
// Fernsteuergerät am Hub (Xbox-Controller, LEGO-Fernbedienung): Das Programm meldet im Terminal,
// wann es sucht und wann die Verbindung steht – daraus entsteht die Anzeige neben dem Hub-Namen.
let remoteState: string | null = null;
let remoteTail = '';
function watchRemoteStatus(text: string){
  remoteTail = (remoteTail + text).slice(-200);
  for (const [what, name] of [[REMOTE_STATUS.xbox, 'Xbox-Controller'], [REMOTE_STATUS.remote, 'Fernbedienung']] as const){
    const found = remoteTail.lastIndexOf(what.found), search = remoteTail.lastIndexOf(what.search);
    if (found < 0 && search < 0) continue;
    const next = found > search ? `${name} verbunden` : `sucht ${name} …`;
    if (next === remoteState) continue;
    remoteState = next;
    toast(found > search ? `${name} ist mit dem Hub verbunden.`
      : name === 'Fernbedienung' ? 'Der Hub sucht die Fernbedienung – grüne Taste drücken, bis ihr Licht blinkt.'
      : 'Der Hub sucht den Xbox-Controller – Kopplungstaste halten, bis das Licht schnell blinkt.');
    updateHubUi();
  }
}
/** Name eines Gamepads, das mit diesem Gerät verbunden ist (nicht mit dem Hub). */
let deviceGamepad: string | null = null;

const terminal = initLayout();
// Ausgaben sammeln und höchstens alle 30 ms in die Seite schreiben: Ein Programm, das in einer
// Schleife druckt, schickt viele kleine Stücke je Sekunde, und jedes würde die Seite neu vermessen.
// (Zeitgeber statt requestAnimationFrame – der läuft auch im unsichtbaren Fenster des Selbsttests.)
let termPending: {text: string; cls: string}[] = [];
let termTimer: number | undefined;
function termFlush(){
  termTimer = undefined;
  const atEnd = termOut.scrollHeight - termOut.scrollTop - termOut.clientHeight < 30;
  const frag = document.createDocumentFragment();
  for (const {text, cls} of termPending){
    if (cls){ const s = document.createElement('span'); s.className = cls; s.textContent = text; frag.appendChild(s); }
    else frag.appendChild(document.createTextNode(text));
  }
  termPending = [];
  termOut.appendChild(frag);
  while (termOut.childNodes.length > 2000) termOut.firstChild!.remove();
  if (atEnd) termOut.scrollTop = termOut.scrollHeight;
}
function termWrite(text: string, cls = ''){
  terminal.reveal();
  const last = termPending[termPending.length - 1];
  if (last && last.cls === cls) last.text += text; else termPending.push({text, cls});
  termTimer ??= window.setTimeout(termFlush, 30);
}
const traceback = new TracebackParser((e) => {
  const id = e.line ? runLines[e.line - 1]?.id : null;
  const block = id ? ws.getBlockById(id) : null;
  if (e.hint) termWrite('→ ' + e.hint + '\n', 't-hint');
  if (block){
    Blockly.common.setSelected(block); ws.centerOnBlock(block.id);
    termWrite('→ Der Block dazu ist markiert.\n', 't-hint');
  }
  toast(block ? 'Fehler im Programm – der Block ist markiert.' : 'Fehler im Programm – siehe Terminal.');
});

// dieselben Knöpfe noch einmal an der Arbeitsfläche
const btnRunWs = $<HTMLButtonElement>('btnRunWs'), btnStopWs = $<HTMLButtonElement>('btnStopWs'), wsHub = $('wsHub');
const btnHubView = $<HTMLButtonElement>('btnHubView');
function updateHubUi(){
  btnConnect.textContent = hub ? 'Trennen' : 'Hub verbinden';
  btnConnect.disabled = btnHubView.disabled = hubBusy;
  btnRun.disabled = btnRunWs.disabled = hubBusy;
  btnStop.disabled = btnStopWs.disabled = !hub || hubBusy || !hub.isRunning;
  btnRunWs.classList.toggle('busy', hubBusy);
  hubState.classList.toggle('on', !!hub); wsHub.classList.toggle('on', !!hub);
  hubState.textContent = !hub ? 'kein Hub' : monitor ? `${hub.name} – Hub-Ansicht`
    : hub.isRunning ? `${hub.name} – läuft${remoteState ? ' · ' + remoteState : ''}` : `${hub.name} – bereit`;
  // an der Arbeitsfläche ist wenig Platz: Dort steht während der Suche nur der Stand des Controllers
  wsHub.textContent = hub?.isRunning && remoteState ? remoteState : hubState.textContent;
  hubState.title = wsHub.title = `${hubState.textContent} – anklicken öffnet die Hub-Ansicht`;
  // die Controller-Ansicht zeigt denselben Stand (beim ersten Aufruf gibt es sie noch nicht)
  padViewRef?.update({hubText:hubState.textContent!, connected:!!hub, running:!!hub?.isRunning, busy:hubBusy, usesPad:hub?.isRunning ? runUsesPad : currentUsesPad, gamepad:deviceGamepad});
}
function hubFailed(err: unknown){
  console.error(err);
  terminal.showCode();   // die Meldung steht im Terminal – das soll nicht eingeklappt sein
  const msg = err instanceof HubConnectionError ? err.message
    : err instanceof ProgramTooLargeError ? `Das Programm ist zu groß für den Hub (${err.actual} von ${err.max} Bytes).`
    : 'Unerwarteter Fehler: ' + (err instanceof Error ? err.message : String(err));
  termWrite(msg + '\n', 't-err'); toast(msg);
}
async function connectHub(){
  const available = transports();
  const kind = available.length > 1 ? await connectDialog.choose(available) : available[0];
  if (!kind) return false;
  hubBusy = true; updateHubUi(); hubState.textContent = wsHub.textContent = 'verbinde …';
  connectDialog.searching(kind);
  try {
    hub = await CONNECT[kind]({
      onStatus: (running) => {
        // das Anzeige-Programm der Hub-Ansicht meldet sich nicht im Terminal
        if (monitor){ if (!running) monitorEnded(); updateHubUi(); return; }
        if (!running){ remoteState = null; remoteTail = ''; termWrite('— Programm beendet —\n', 't-info'); }
        updateHubUi();
      },
      onStdout: (text) => {
        // Zeilen des Anzeige-Programms gehen an die Hub-Ansicht; was übrig bleibt (eine Fehlermeldung), ins Terminal
        // … und läuft es ohne Hub-Ansicht (auf dem Hub mit der Taste gestartet), verschwinden seine Zeilen ganz
        const feed = monitor ?? monitorSink;
        text = feed ? feed.push(text) : strayLines.push(text);
        if (!text) return;
        termWrite(text); traceback.feed(text); watchRemoteStatus(text);
      },
      onDisconnect: () => {
        if (!hub) return;
        hub = null; hubBusy = false; lastProgram = null; btnRun.textContent = RUN_LABEL; termWrite('— Hub getrennt —\n', 't-info');
        clearInterval(monitorBeat); monitor = monitorSink = null; monitorLoaded = false; hubView.close();
        updateHubUi();
      }
    });
    if (hub){ lastProgram = null; rememberFirmware(hub.firmware); termWrite(`— Verbunden mit ${hub.name} über ${hub.via} (Firmware ${hub.firmware}) —\n`, 't-info'); }
    // Im Browser zeigt dessen eigenes Fenster nur eine leere Liste – hier steht, woran es meist liegt
    else if (kind === 'usb' && !tablet && !window.blockwerkDesktop){ terminal.showCode(); termWrite(usbHint(lastFirmware()) + '\n', 't-hint'); }
  } catch (err){ hubFailed(err); }
  connectDialog.close();
  hubBusy = false; updateHubUi();
  return !!hub;
}
/** Entwickleroption (Konsole: `blockwerk.runPython('print(1)')`): eigenes Python auf dem verbundenen Hub ausführen. */
async function runPython(code: string){
  if (!hub) throw new Error('Kein Hub verbunden.');
  const { compileProgram } = await import('./hub/compile');
  const res = await compileProgram(code, wasmUrl);
  if (!res.ok) throw new Error(res.errors.join('\n'));
  runLines = []; runUsesPad = false; traceback.reset();
  const payload = encodeModules([{name:MAIN_MODULE, mpy:res.mpy}]);
  await hub.run(payload, () => {});
  lastProgram = payload; lastRun = {lines:[], usesPad:false};
}
async function runOnHub(){
  if (hubView.isOpen()) return;   // erst die Hub-Ansicht schließen – sie belegt den Hub
  if (!hub && !(await connectHub())) return;
  monitorSink = null;
  const code = currentCode, lines = currentLines, usesPad = currentUsesPad, usesXbox = currentUsesXbox, modules = currentModules;
  hubBusy = true; updateHubUi();
  try {
    btnRun.textContent = 'Übersetze …';
    const { compileProgram } = await import('./hub/compile');
    const res = await compileProgram(code, wasmUrl);
    if (!res.ok){
      termWrite(res.errors.join('\n') + '\n', 't-err');
      toast('Das Programm lässt sich nicht übersetzen – siehe Terminal.');
      return;
    }
    // Module aus Erweiterungen kommen hinter das Programm; der Hub startet das erste
    const compiled = [{name:MAIN_MODULE, mpy:res.mpy}];
    for (const m of modules){
      const mod = await compileProgram(m.source, wasmUrl, m.name + '.py');
      if (!mod.ok){
        termWrite(`Modul ${m.name} (aus einer Erweiterung):\n${mod.errors.join('\n')}\n`, 't-err');
        toast('Eine Erweiterung lässt sich nicht übersetzen – siehe Terminal.');
        return;
      }
      compiled.push({name:m.name, mpy:mod.mpy});
    }
    // Das Übersetzen dauert einen Moment – inzwischen kann der Hub getrennt worden sein
    if (!hub) return;
    runLines = lines; runUsesPad = usesPad; traceback.reset();
    remoteState = null; remoteTail = '';
    termWrite('— Programm wird geladen —\n', 't-info');
    // Die Xbox-Blöcke brauchen den Controller am Hub. Hängt er gerade an diesem Gerät, findet der Hub ihn nicht.
    if (usesXbox && deviceGamepad){
      const hint = `Der Controller »${deviceGamepad}« ist mit diesem Gerät verbunden. Die Xbox-Blöcke brauchen ihn direkt am Hub: hier trennen und am Controller die Kopplungstaste halten. Oder die Steuerfeld-Blöcke nehmen – die bedient er über Blockwerk.`;
      termWrite('→ ' + hint + '\n', 't-hint'); toast(hint);
    }
    const payload = encodeModules(compiled);
    await hub.run(payload, (f) => { btnRun.textContent = `Lade … ${Math.round(f * 100)} %`; });
    lastProgram = payload; lastRun = {lines, usesPad};
    if (usesPad){ showPad(true); pad.reset(); }
  } catch (err){ hubFailed(err); }
  finally { hubBusy = false; btnRun.textContent = RUN_LABEL; updateHubUi(); }
}

// ---------------------------------------------------------------
// Hub-Ansicht: was an den Anschlüssen hängt, Messwerte, Akku (hub/monitor.ts, hub/monitorView.ts).
// Dafür läuft auf dem Hub ein kleines Anzeige-Programm; es ersetzt dort das zuletzt geladene.
// Beim Schließen lädt Blockwerk deshalb wieder auf den Hub, was es zuletzt selbst geladen hatte.
// ---------------------------------------------------------------
let monitor: MonitorFeed | null = null;         // gesetzt, solange das Anzeige-Programm auf dem Hub läuft
let monitorSink: MonitorFeed | null = null;     // liest kurz nach dessen Ende noch mit: letzte Zeilen gehören nicht ins Terminal
let monitorBeat: number | undefined;
const strayLines = new StrayFilter();
let monitorPayload: Uint8Array | null = null;   // das Anzeige-Programm, übersetzt
let monitorLoaded = false;                      // auf dem Hub liegt gerade das Anzeige-Programm
let monitorClosePending = false;                // geschlossen, während noch geladen wurde
/** Was Blockwerk zuletzt als Programm auf diesen Hub geladen hat – samt dem, was Blockwerk dazu wissen muss. */
let lastProgram: Uint8Array | null = null;
let lastRun: {lines: CodeLine[]; usesPad: boolean} = {lines:[], usesPad:false};
const hubView = initHubView({closed:() => void closeHubView(), restart:() => void startMonitor()});

/** Das Anzeige-Programm hat aufgehört – am Hub gestoppt oder weil keine Lebenszeichen mehr ankamen. */
function monitorEnded(){
  clearInterval(monitorBeat); retireMonitor();
  if (hubView.isOpen()) hubView.status('ended');
}
/** Das Anzeige-Programm läuft nicht mehr; was der Hub in den nächsten Sekunden noch von ihm schickt, wird verschluckt. */
function retireMonitor(){
  if (!monitor) return;
  monitor.mute();
  const sink = monitorSink = monitor; monitor = null;
  setTimeout(() => { if (monitorSink === sink) monitorSink = null; }, 2000);
}
async function startMonitor(){
  if (!hub || hubBusy || monitor) return;
  hubBusy = true; updateHubUi(); hubView.status('loading');
  try {
    if (!monitorPayload){
      const { compileProgram } = await import('./hub/compile');
      const res = await compileProgram(MONITOR_PROGRAM, wasmUrl);
      if (!res.ok) throw new Error(res.errors.join('\n'));
      monitorPayload = encodeModules([{name:MAIN_MODULE, mpy:res.mpy}]);
    }
    if (!hub) return;
    // Läuft noch etwas – etwa das Anzeige-Programm, am Hub mit der Taste neu gestartet –, zuerst anhalten:
    // Sein Ende darf nicht dem neuen Leser unten zugeschrieben werden.
    await hub.halt();
    if (!hub) return;
    // Fehlermeldungen des Anzeige-Programms gehören zu keinem Block
    runLines = []; runUsesPad = false; traceback.reset();
    monitorSink = null;
    const feed = monitor = new MonitorFeed((state) => { hubView.render(state); hubView.status('live'); });
    // ab dem ersten Schreiben ist das Programm auf dem Hub ersetzt – auch wenn das Laden mittendrin scheitert
    monitorLoaded = true;
    await hub.run(monitorPayload);
    const beat = () => {
      if (!hub || monitor !== feed) return;
      hub.sendBytes(new Uint8Array([MONITOR_HEARTBEAT])).catch(() => { /* getrennt – das meldet der Hub selbst */ });
      if (feed.stale) hubView.status('stale');
    };
    beat();
    clearInterval(monitorBeat); monitorBeat = window.setInterval(beat, MONITOR_HEARTBEAT_MS);
  } catch (err){
    clearInterval(monitorBeat); retireMonitor();
    hubFailed(err); hubView.status('error');
  } finally {
    hubBusy = false; updateHubUi();
    if (monitorClosePending){ monitorClosePending = false; void closeHubView(); }
  }
}
async function openHubView(){
  if (hubView.isOpen() || hubBusy) return;
  if (!hub && !(await connectHub())) return;
  if (!hub) return;
  if (hub.isRunning){ toast('Auf dem Hub läuft gerade ein Programm. Stoppe es – dann zeigt die Hub-Ansicht, was an den Anschlüssen hängt.'); return; }
  hubView.open(hub.name);
  await startMonitor();
}
/** Nach dem Schließen: Anzeige-Programm beenden und das zuletzt geladene Programm wieder auf den Hub legen. */
async function closeHubView(){
  if (hubBusy){ monitorClosePending = true; return; }
  clearInterval(monitorBeat);
  const connected = hub;
  if (!connected){ monitor = null; return; }
  hubBusy = true; updateHubUi();
  try {
    monitor?.mute();
    await connected.halt();
    retireMonitor();
    // inzwischen getrennt (ausgeschaltet, Kabel gezogen): Dann gibt es nichts zurückzuladen
    if (hub !== connected) return;
    if (monitorLoaded && lastProgram){
      hubState.textContent = wsHub.textContent = 'lade dein Programm zurück …';
      await connected.load(lastProgram);
      // … und Blockwerk kennt es wieder: Zeilen für die Fehleranzeige, Steuerfeld
      runLines = lastRun.lines; runUsesPad = lastRun.usesPad;
    }
    monitorLoaded = false;
  } catch (err){ hubFailed(err); }
  finally { retireMonitor(); hubBusy = false; updateHubUi(); }
}
for (const opener of [btnHubView, hubState, wsHub]) opener.addEventListener('click', () => void openHubView());

// Steuerfeld: schickt Joystick und Tasten an das laufende Programm
const padEl = $('pad'), btnPad = $('btnPad');
const pad = createPad((byte) => hub && hub.isRunning && runUsesPad ? hub.sendBytes(new Uint8Array([byte])) : Promise.resolve());
// der schmale Streifen unter dem Code: für Maus und Tastatur
pad.bindStick(padEl.querySelector<HTMLElement>('.pad-stick')!, padEl.querySelector<HTMLElement>('.pad-stick')!, padEl.querySelector<HTMLElement>('.pad-knob')!);
for (const b of PAD_BUTTONS) pad.bindButton(padEl.querySelector<HTMLElement>(`[data-pad="${b}"]`)!, b);
pad.bindKeys(padEl);
padEl.querySelector('.pad-stick')!.addEventListener('pointerdown', () => padEl.focus());
// die Controller-Ansicht: bildschirmfüllend, zum Anordnen – auf Geräten mit Fingerbedienung der übliche Weg
const padView = padViewRef = initPadView(pad, {run:() => btnRun.click(), stop:() => btnStop.click()});
const fingers = () => isTablet() || matchMedia('(pointer:coarse)').matches;
function showPad(on: boolean){
  if (on && fingers()){ padView.open(); return; }
  padEl.classList.toggle('hidden', !on);
  btnPad.setAttribute('aria-pressed', String(on));
  if (on) pad.redraw();
}
btnPad.addEventListener('click', () => showPad(padEl.classList.contains('hidden')));
$('btnPadBig').addEventListener('click', () => padView.open());
$('btnPadWs').addEventListener('click', () => padView.open());
// Ein Gamepad, das mit diesem Gerät verbunden ist, bedient das Steuerfeld. Der Browser zeigt es
// erst, nachdem daran eine Taste gedrückt wurde.
const gamepads = browserGamepads();
if (gamepads) watchGamepad({
  setStick:(x, y) => pad.setStick(x, y),
  setButton:(button, down) => pad.setButton(button, down),
  onGamepad:(name) => {
    deviceGamepad = name;
    const chip = $('padGamepad');
    chip.textContent = name ? `Controller: ${name}` : '';
    chip.classList.toggle('hidden', !name);
    toast(name ? `Controller erkannt: ${name}. Er bedient das Steuerfeld.` : 'Der Controller ist nicht mehr verbunden.');
    updateHubUi();
  }
}, gamepads);
syncPadButton(); updateHubUi();

// Menü des Programms und Tastenkürzel: lösen dieselben Knöpfe aus wie ein Klick
const MENU: Record<string, string> = {new:'btnNew', open:'btnOpen', save:'btnSave', settings:'btnSettings', help:'btnHelp', about:'btnAbout',
  extensions:'btnExt', connect:'btnConnect', run:'btnRun', stop:'btnStop', hubview:'btnHubView', code:'codeToggle', copy:'btnCopy'};
const menuAction = (action: string) => { const el = MENU[action] && $<HTMLButtonElement>(MENU[action]); if (el && !el.disabled) el.click(); };
const desktopMenu = (window.blockwerkDesktop as {onMenu?(cb: (action: string) => void): void} | undefined)?.onMenu;
if (desktopMenu) desktopMenu(menuAction);
else window.addEventListener('keydown', (e) => {
  // im Browser gibt es kein Menü – die wichtigsten Kürzel gelten trotzdem
  const key = e.key.toLowerCase();
  const action = (e.ctrlKey || e.metaKey) && !e.altKey ? ({s:'save', o:'open', ',':'settings'} as Record<string, string>)[key] : key === 'f5' ? (e.shiftKey ? 'stop' : 'run') : undefined;
  if (action){ e.preventDefault(); menuAction(action); }
});

// das Terminal gibt es auch ohne Weg zum Hub – der SPIKE-Import berichtet dort
$('btnTermClear').addEventListener('click', () => { termPending = []; termOut.textContent = ''; });
if (transports().length){
  btnConnect.addEventListener('click', () => { if (hub) hub.disconnect(); else connectHub(); });
  for (const b of [btnRun, btnRunWs]) b.addEventListener('click', runOnHub);
  for (const b of [btnStop, btnStopWs]) b.addEventListener('click', () => { hub?.stop().catch(hubFailed); });
} else {
  $('hubBar').classList.add('hidden'); $('wsRun').classList.add('hidden');
  $('hubUnsupported').classList.remove('hidden');
}

// Reiter auf schmalen Bildschirmen
const mainEl = $('main');
const tabBlocks = $('tabBlocks'), tabCode = $('tabCode');
function setView(view: 'blocks' | 'code'){
  mainEl.dataset.view = view;
  tabBlocks.setAttribute('aria-selected', String(view === 'blocks'));
  tabCode.setAttribute('aria-selected', String(view === 'code'));
  if (view === 'blocks') setTimeout(() => Blockly.svgResize(ws), 0);
}
tabBlocks.addEventListener('click', () => setView('blocks'));
tabCode.addEventListener('click', () => setView('code'));

new ResizeObserver(() => Blockly.svgResize(ws)).observe(document.querySelector('.ws-wrap')!);

// Ladebildschirm ausblenden: Hier steht die Arbeitsfläche; es fehlen höchstens noch die Schriften
const splash = $('splash');
let splashHidden = false;
function hideSplash(){
  if (splashHidden) return;
  splashHidden = true;
  splash.classList.add('done');
  setTimeout(() => splash.remove(), 300);
}
// Unsichtbare Fenster (Selbsttest unter Linux/xvfb) rufen requestAnimationFrame nie auf –
// deshalb zusätzlich ein Zeitgeber
document.fonts.ready.catch(() => {}).then(() => {
  requestAnimationFrame(hideSplash);
  setTimeout(hideSplash, 200);
});
