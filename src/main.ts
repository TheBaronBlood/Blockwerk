import * as Blockly from 'blockly';
// Schriften liegen im Paket, damit Blockwerk auch ohne Internet gleich aussieht
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './style.css';
import './blocks';
import './category';
import './copy';
import { BLOCKLY_MEDIA, THEME_DARK, THEME_LIGHT } from './theme';
import wasmUrl from '@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url';
import { generate, type CodeLine, type GenerateResult, REMOTE_STATUS } from './generator';
import { HubConnection } from './hub/connection';
import { initConnectDialog, type Transport } from './hub/devicePicker';
import { Hub, HubConnectionError, sleep, type HubListener } from './hub/hub';
import { SerialHub } from './hub/serial';
import { TestHub } from './hub/testHub';
import { initAboutDialog } from './about';
import { ask } from './ask';
import { initSettingsDialog, isDark, loadSettings, onSettings, settings, updateSettings } from './settings';
import { browserGamepads, watchGamepad } from './hub/gamepad';
import { createPad } from './hub/pad';
import { lastFirmware, rememberFirmware } from './hub/lastHub';
import { MONITOR_HEARTBEAT, MONITOR_HEARTBEAT_MS, MONITOR_PROGRAM, MonitorFeed, StrayFilter, type MonitorState } from './hub/monitor';
import { initHubView } from './hub/monitorView';
import { usbHint } from './versions';
import { PAD_BUTTONS } from './hub/padProtocol';
import { initPadView, type PadView } from './hub/padView';
import { encodeModules, MAIN_MODULE, ProgramTooLargeError } from './hub/protocol';
import { TracebackParser } from './hub/traceback';
import { hasWord, initHelp } from './help';
import { highlight } from './highlight';
import { initLayout } from './layout';
import { installSounds } from './sound';
import { BOTTOM_FLYOUT, FIXED_FLYOUT, START_SCALE } from './flyout';
import { BW_TOOLBOX, setToolboxHorizontal } from './toolboxLayout';
import { initViewMode, isPhone, onViewMode } from './viewMode';
import { allPortsSeen, describePorts, deviceLine, foundPorts, missingDeviceHint, PORT_BLOCKS, samePorts, withFoundPorts, type DeviceAt, type FoundPorts } from './ports';
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
/** Was am verbundenen Hub steckt (ports.ts) – daraus entstehen die Vorgaben in der Blockliste; null ohne Hub. */
let detectedPorts: FoundPorts | null = null;
const currentToolbox = () => withFoundPorts(toolboxWith(extensions().map(toolboxCategory) as Blockly.utils.toolbox.ToolboxItemInfo[]), detectedPorts);
Blockly.Scrollbar.scrollbarThickness = 10;   // schmaler als Blocklys Standard
// Ansicht nach dem Format des Fensters (viewMode.ts): Auf dem Handy hochkant liegt der Werkzeugkasten als Leiste unten
const startMode = initViewMode();
const ws = Blockly.inject('blocklyDiv', {
  toolbox:currentToolbox(), theme: isDark() ? THEME_DARK : THEME_LIGHT, renderer:'zelos', media:BLOCKLY_MEDIA, sounds:false, trashcan:false, comments:false,
  horizontalLayout:startMode === 'phone-portrait', toolboxPosition:startMode === 'phone-portrait' ? 'end' : 'start',
  // die Blockliste zoomt nicht mit (flyout.ts); der Werkzeugkasten lässt sich später umstellen (toolboxLayout.ts)
  plugins:{flyoutsVerticalToolbox:FIXED_FLYOUT, flyoutsHorizontalToolbox:BOTTOM_FLYOUT, toolbox:BW_TOOLBOX},
  zoom:{controls:false, wheel:true, startScale:START_SCALE, maxScale:2, minScale:0.35, scaleSpeed:1.15},
  grid:{spacing:26, length:2, colour:isDark() ? '#2C313A' : '#DDE3EA', snap:false},
  move:{scrollbars:true, drag:true, wheel:false}
});
const playSound = installSounds(ws, () => settings().sounds);
// Knöpfe und Kategorien der Blockliste melden sich als Anlass – ob dazu ein Klang kommt, steht in public/klang/klang.json
document.addEventListener('click', (e) => {
  const target = e.target as Element;
  if (target.closest?.('.blocklyToolboxCategory')){ playSound('kategorie'); return; }
  const button = target.closest?.('button, [role=tab]') as HTMLButtonElement | null;
  if (button && !button.disabled && button.id !== 'btnRunWs' && button.id !== 'btnStopWs') playSound('knopf');
}, true);
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
let currentExprs: Record<string, string> = {};
let shownCode: string | null = null;   // was gerade im Python-Bereich steht (Zeilen samt Block)
let simView: import('./sim/view').SimView | null = null;   // der Simulator; entsteht beim ersten Öffnen

function render(){
  let res: GenerateResult;
  try { res = generate(ws); }
  catch (err){ res = {lines:[{text:'# Fehler beim Übersetzen: ' + (err as Error).message, id:null}], warnings:[], usesPad:false, usesXbox:false, modules:[], exprs:{}}; }
  currentLines = res.lines; currentExprs = res.exprs;
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
    // Hilfslinien für die Einrückung: je Stufe ein feiner Strich (style.css). Eine Leerzeile führt die Linien
    // der Zeile fort, mit der es danach weitergeht.
    const level = (text: string) => Math.floor((text.length - text.trimStart().length) / 4);
    const guides: number[] = [];
    // ganz unten bleibt eine Zeile frei – nur in der Anzeige (dort endet auch der Rahmen des letzten Blocks)
    const shownLines: CodeLine[] = [...res.lines, {text:'', id:null}];
    for (let i = shownLines.length - 1, below = 0; i >= 0; i--) guides[i] = below = shownLines[i].text.trim() ? level(shownLines[i].text) : below;
    shownLines.forEach((l, i) => {
      const row = document.createElement('div'); row.className = 'ln';
      if (guides[i]) row.style.setProperty('--ind', String(guides[i]));
      // Passt eine Zeile nicht in die Breite, bricht sie nur in der Anzeige um (das Programm bleibt, wie es ist):
      // Die Folgezeilen beginnen hinter der öffnenden Klammer – wie man es von Hand einrücken würde.
      const indent = l.text.length - l.text.trimStart().length, paren = l.text.indexOf('(');
      row.style.setProperty('--hang', String(l.text.trimStart().startsWith('#') ? indent + 2 : paren >= 0 && paren < 28 ? paren + 1 : indent + 4));
      if (l.id) row.dataset.id = l.id;
      const no = document.createElement('span'); no.className = 'no'; no.textContent = String(i + 1);
      const tx = document.createElement('span'); tx.className = 'tx'; highlight(l.text, tx, hasWord);
      row.append(no, tx); frag.appendChild(row);
    });
    codeEl.appendChild(frag);
    markSelection(selectedId, false);
  }
  if (res.warnings.length){
    warnEl.innerHTML = '';
    const ul = document.createElement('ul');
    res.warnings.forEach(w => { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); });
    warnEl.appendChild(ul); warnEl.classList.remove('hidden');
  } else warnEl.classList.add('hidden');
  simView?.programChanged();
}
/** Der Wertblock (auch eine Zahl im Block), auf den zuletzt gedrückt wurde – Blockly wählt bei einer Zahl den Block darum aus. */
let pressedValue: string | null = null;
const paramMarks = (window as unknown as {Highlight?: typeof Highlight}).Highlight && CSS.highlights ? CSS.highlights : null;
/**
 * Markiert im Code, was zum gewählten Block gehört: bei einer Schleife oder Bedingung den ganzen Abschnitt
 * (Kopfzeile bis letzte Zeile des Inhalts), bei einem Wertblock – einer Zahl, einem Sensor, einer Rechnung –
 * die Zeile der Anweisung und darin den Ausdruck selbst.
 */
function markSelection(id: string | null, scroll = true){
  selectedId = id;
  const block = id ? ws.getBlockById(id) : null;
  // die Anweisung, in der ein Wertblock steckt (nur über Werteingänge nach oben – nicht zum Block darüber)
  const statementOf = (b: Blockly.Block) => { while (b.outputConnection && b.getParent()) b = b.getParent()!; return b; };
  const stmt = block ? statementOf(block) : null;
  // gedrückter Wertblock: gilt nur, wenn er zur gewählten Anweisung gehört
  const pressed = pressedValue ? ws.getBlockById(pressedValue) : null;
  const param = pressed && stmt && statementOf(pressed) === stmt ? pressed : block?.outputConnection ? block : null;
  const rows = [...codeEl.querySelectorAll<HTMLElement>('.ln')];
  const textOf = (i: number) => rows[i].querySelector('.tx')?.textContent ?? '';
  const indentOf = (i: number) => textOf(i).length - textOf(i).trimStart().length;
  const own = (i: number) => rows[i].dataset.id === stmt?.id;
  const ids = new Set<string>();
  if (stmt){
    ids.add(stmt.id);
    // ohne Parameter gehört der Inhalt dazu: alles, was in den Eingängen des Blocks steckt (nicht, was darunter hängt)
    if (!param) for (const input of stmt.inputList) for (const inner of input.connection?.targetBlock()?.getDescendants(false) ?? []) ids.add(inner.id);
    // ein Ereignisblock mit eigener Zeile (»while True:«, »async def …«) umschließt den Stapel, der an ihm hängt
    const hat = !stmt.previousConnection && !stmt.outputConnection && !!stmt.nextConnection;
    if (!param && hat && rows.some((_, i) => own(i))) for (const inner of stmt.getNextBlock()?.getDescendants(false) ?? []) ids.add(inner.id);
  }
  const hits = rows.map((r, i) => r.dataset.id && ids.has(r.dataset.id) ? i : -1).filter(i => i >= 0);
  const from = hits.length ? hits[0] : -1;
  let to = hits.length ? hits[hits.length - 1] : -1;
  const depth = from >= 0 ? indentOf(from) : 0;
  // alles, was unter der Kopfzeile tiefer eingerückt weitergeht, gehört noch dazu (»return«, »pass«)
  if (!param && from >= 0) for (let i = to + 1; i < rows.length && (!textOf(i).trim() ? i + 1 < rows.length && !!textOf(i + 1).trim() && indentOf(i + 1) > depth : indentOf(i) > depth); i++) to = i;
  // Hat der Block einen Inhalt (Schleife, Bedingung, eigener Block), sieht die Markierung aus wie der Block
  // selbst: die Kopfzeile, links ein Steg neben dem Inhalt, darunter ein Balken – der Inhalt bleibt frei.
  // (Maßgeblich ist die Einrückung, nicht der Block: Auch »warte bis« erzeugt eine Schleife mit Inhalt.)
  const deeper = (i: number) => !textOf(i).trim() || indentOf(i) > depth;
  let shaped = false;
  if (!param && from >= 0 && /:\s*(#.*)?$/.test(textOf(from))) for (let i = from + 1; i <= to; i++) if (textOf(i).trim() && deeper(i)) shaped = true;
  // der Balken unten ist die Leerzeile nach dem Abschnitt (fehlt am Ende des Programms)
  const foot = shaped && to + 1 < rows.length && !textOf(to + 1).trim() ? to + 1 : -1;
  rows.forEach((r, i) => {
    const inside = i >= from && i <= to;
    // ein Parameter färbt nur sich selbst (unten) – die ganze Zeile gibt es für den Block
    r.classList.toggle('sel', !shaped && !param && inside && hits.includes(i));
    r.classList.toggle('blk-head', shaped && ((inside && !deeper(i)) || i === foot));
    r.classList.toggle('blk-arm', shaped && inside && deeper(i));
    if (shaped && (inside || i === foot)) r.style.setProperty('--depth', String(depth)); else r.style.removeProperty('--depth');
  });  // den Ausdruck des Parameters in den Zeilen seiner Anweisung suchen und einfärben
  paramMarks?.delete('bw-param');
  const expr = param ? currentExprs[param.id] : undefined;
  if (paramMarks && expr) for (const i of hits){
    const tx = rows[i].querySelector('.tx'), at = tx?.textContent?.indexOf(expr) ?? -1;
    if (!tx || at < 0) continue;
    const range = document.createRange();
    let seen = 0;
    const walker = document.createTreeWalker(tx, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()){
      const len = node.textContent!.length;
      if (at >= seen && at < seen + len) range.setStart(node, at - seen);
      if (at + expr.length > seen && at + expr.length <= seen + len){ range.setEnd(node, at + expr.length - seen); break; }
      seen += len;
    }
    paramMarks.set('bw-param', new Highlight(range));
    break;
  }
  // lässt sich der Ausdruck nicht einzeln zeigen (älterer Browser, umgeformter Code), dann wenigstens die Zeile
  if (param && !paramMarks?.has('bw-param')) for (const i of hits) rows[i].classList.add('sel');
  if (scroll && from >= 0) rows[from].scrollIntoView({block:'nearest'});
}
// Welcher Block unter dem Zeiger liegt, steht an seinem Element – auch bei Zahlen, die Blockly nicht selbst auswählt
$('blocklyDiv').addEventListener('pointerdown', (e) => {
  const pressed = ws.getBlockById((e.target as Element).closest?.('g[data-id]')?.getAttribute('data-id') ?? '');
  pressedValue = pressed?.outputConnection ? pressed.id : null;
  // (ist der Block darum schon gewählt, meldet Blockly keine neue Auswahl)
  setTimeout(() => {
    const now = Blockly.common.getSelected();
    // auf einen Block gedrückt: seine Auswahl gilt (oder die bisherige); daneben gedrückt: nichts ist gewählt
    markSelection(now instanceof Blockly.BlockSvg ? now.id : pressed ? selectedId : null);
  }, 0);
}, true);
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
  if (e.type === Blockly.Events.SELECTED){
    const id = (e as Blockly.Events.Selected).newElementId || null;
    // Solange das Eingabefeld einer Zahl oder eine Auswahlliste offen ist, hebt Blockly die Auswahl auf –
    // die Markierung im Code bleibt trotzdem stehen, bis woanders hingeklickt wird
    if (id || !(Blockly.WidgetDiv.isVisible() || Blockly.DropDownDiv.isVisible())) markSelection(id);
    return;
  }
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
  if (isPhone() || window.matchMedia('(max-width: 820px)').matches){
    // schmale Bildschirme und Handys (auch quer): alles zeigen – aber nicht größer als normal (ein kleines Programm füllte sonst ein Tablet hochkant aus)
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
// Zoom in Prozent zwischen den Lupen: 100 % ist die Größe, mit der Blockwerk beginnt. Ein Klick setzt zurück.
const zoomLevel = $('zoomLevel');
const showZoom = () => { zoomLevel.textContent = Math.round(ws.scale / START_SCALE * 100) + '\u00A0%'; };
ws.addChangeListener((e) => { if (e.type === Blockly.Events.VIEWPORT_CHANGE) showZoom(); });
zoomLevel.addEventListener('click', () => { ws.setScale(START_SCALE); ws.scrollCenter(); showZoom(); });
showZoom();
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
// Schrift im Code kleiner und größer: dieselbe Einstellung wie »Schriftgröße im Code« (10 bis 24 px)
const codeSmaller = $<HTMLButtonElement>('codeSmaller'), codeBigger = $<HTMLButtonElement>('codeBigger');
const stepCodeSize = (by: number) => updateSettings({codeSize:Math.max(10, Math.min(24, settings().codeSize + by))});
codeSmaller.addEventListener('click', () => stepCodeSize(-1));
codeBigger.addEventListener('click', () => stepCodeSize(1));

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
/** Der Knopf »Erweiterungen«: nur wenn eingeschaltet – und nicht auf dem Handy, dort ist der Editor gesperrt (zu wenig Platz). */
function syncExtButton(){ $('btnExt').classList.toggle('hidden', !settings().extensions || isPhone()); }
onSettings((s) => {
  applyTheme();
  codeSmaller.disabled = s.codeSize <= 10; codeBigger.disabled = s.codeSize >= 24;
  syncExtButton();
  if (!s.autoPorts) setDetectedPorts(null);
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
  leader: () => settings().leader,
  // Block aus der Hilfe ziehen: Er entsteht unter dem Zeiger auf der Arbeitsfläche, und Blockly zieht ihn
  // weiter, als wäre er dort angefasst worden. Solange gezogen wird, ist die Hilfe durchscheinend.
  dragBlock: (state, e) => {
    const helpEl = $('help');
    const at = Blockly.utils.svgMath.screenToWsCoordinates(ws, new Blockly.utils.Coordinate(e.clientX, e.clientY));
    // (die Kennungen aus dem Bild der Hilfe gelten dort – hier bekommt jeder Block eine eigene)
    const fresh = JSON.parse(JSON.stringify(state, (key, value) => key === 'id' ? undefined : value)) as Blockly.serialization.blocks.State;
    let block: Blockly.BlockSvg;
    try { block = Blockly.serialization.blocks.append({...fresh, x:at.x - 14, y:at.y - 14}, ws) as Blockly.BlockSvg; }
    catch (err){ console.error(err); return; }
    helpEl.classList.add('dragging');
    block.getSvgRoot().dispatchEvent(new PointerEvent('pointerdown', {bubbles:true, cancelable:true, clientX:e.clientX, clientY:e.clientY,
      pointerId:e.pointerId, pointerType:e.pointerType, isPrimary:e.isPrimary, button:0, buttons:1}));
    const end = (up: Event) => {
      for (const type of ['pointerup', 'pointercancel']) window.removeEventListener(type, end, true);
      helpEl.classList.remove('dragging');
      // Auf dem Handy füllt die Hilfe den ganzen Bildschirm: Nach dem Ablegen macht sie Platz, damit der Block zu sehen ist
      if (isPhone() && up.type !== 'pointercancel'){ helpEl.classList.add('hidden'); return; }
      // über der Hilfe losgelassen: Dort läge der Block unsichtbar unter dem Fenster – er verschwindet wieder
      const r = helpEl.getBoundingClientRect(), p = up as PointerEvent;
      const overHelp = !helpEl.classList.contains('hidden') && p.clientX >= r.left && p.clientX <= r.right && p.clientY >= r.top && p.clientY <= r.bottom;
      if (overHelp || up.type === 'pointercancel') setTimeout(() => { if (!block.isDeadOrDying()) block.dispose(false); }, 0);
    };
    for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, end, true);
  }
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
const btnConnect = $<HTMLButtonElement>('btnConnect'), termOut = $('termOut');
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

// (Auf dem Handy klappt der Griff des Python-Bereichs nichts auf: Dort öffnet er den Code bildschirmfüllend.)
const terminal = initLayout(() => { if (!isPhone()) return false; setView('code'); return true; });
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
  const line = e.line ? runLines[e.line - 1] : null;
  let block = line?.id ? ws.getBlockById(line.id) : null;
  // Fehlt ein Gerät, steht der Fehler in der Zeile, die es anlegt. Sie gehört zu keinem bestimmten Block –
  // markiert wird der erste, der dieses Gerät an diesem Anschluss benutzt.
  const noDevice = /ENODEV/.test(e.message);
  const missing = noDevice && line ? deviceLine(line.text) : null;
  if (!block && missing) block = ws.getAllBlocks(true).find(b => b.isEnabled() && PORT_BLOCKS[b.type] === missing.kind && b.getFieldValue('PORT') === missing.port) ?? null;
  // Der Hub schreibt nach der Fehlerzeile noch eine Erklärung; die Hinweise kommen erst danach, nicht mitten hinein
  const hints = (e.hint ? '→ ' + e.hint + '\n' : '') + (block ? '→ Der Block dazu ist markiert.\n' : '');
  if (hints) setTimeout(() => termWrite(hints, 't-hint'), 250);
  if (block){ Blockly.common.setSelected(block); ws.centerOnBlock(block.id); }
  toast(block ? 'Fehler im Programm – der Block ist markiert.' : 'Fehler im Programm – siehe Terminal.');
  playSound('fehler');
  // … und Blockwerk sieht nach, was wirklich am Hub steckt
  if (noDevice) void recheckPorts(missing);
});

// Verbinden oben rechts an der Arbeitsfläche, Start und Stopp unten rechts
const btnRunWs = $<HTMLButtonElement>('btnRunWs'), btnStopWs = $<HTMLButtonElement>('btnStopWs'), wsHub = $('wsHub');
/** Zwischenstand, der die Anzeige neben dem Verbinden-Knopf kurz ersetzt (»verbinde …«, »lade … 40 %«). */
let hubNote: string | null = null;
function setHubNote(note: string | null){ hubNote = note; updateHubUi(); }
function updateHubUi(){
  // der Knopf zeigt, ob ein Hub verbunden ist: ohne Hub verbindet er, mit Hub öffnet er die Hub-Ansicht
  btnConnect.classList.toggle('on', !!hub);
  btnConnect.classList.toggle('busy', hubBusy && (!hub || scanning));
  btnConnect.disabled = hubBusy;
  btnConnect.title = hub ? `${hub.name} – Hub-Ansicht öffnen, dort lässt sich der Hub auch trennen` : 'Hub verbinden';
  btnConnect.setAttribute('aria-label', hub ? 'Hub-Ansicht öffnen' : 'Hub verbinden');
  btnRunWs.disabled = hubBusy;
  btnStopWs.disabled = !hub || hubBusy || !hub.isRunning;
  btnRunWs.classList.toggle('busy', hubBusy);
  wsHub.classList.toggle('on', !!hub);
  // ohne Hub sagt der Knopf schon alles – der Text erscheint erst, wenn es etwas zu melden gibt
  wsHub.classList.toggle('hidden', !hub && !hubNote);
  const hubText = !hub ? 'kein Hub' : scanning ? `${hub.name} – sieht nach, was angeschlossen ist …` : monitor ? `${hub.name} – Hub-Ansicht`
    : hub.isRunning ? `${hub.name} – läuft${remoteState ? ' · ' + remoteState : ''}` : `${hub.name} – bereit`;
  // neben dem Knopf ist wenig Platz: Dort steht während der Suche nur der Stand des Controllers
  wsHub.textContent = hubNote ?? (hub?.isRunning && remoteState ? remoteState : hubText);
  wsHub.title = hubText;
  // die Controller-Ansicht zeigt denselben Stand (beim ersten Aufruf gibt es sie noch nicht)
  padViewRef?.update({hubText:hubNote ?? hubText, connected:!!hub, running:!!hub?.isRunning, busy:hubBusy, usesPad:hub?.isRunning ? runUsesPad : currentUsesPad, gamepad:deviceGamepad});
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
  hubBusy = true; setHubNote('verbinde …');
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
        hub = null; hubBusy = false; hubNote = null; lastProgram = null; termWrite('— Hub getrennt —\n', 't-info'); playSound('getrennt');
        clearInterval(monitorBeat); monitor = monitorSink = null; monitorLoaded = false; hubView.close();
        scanWake?.(); setDetectedPorts(null);
        updateHubUi();
      }
    });
    if (hub){ playSound('verbunden'); lastProgram = null; rememberFirmware(hub.firmware); termWrite(`— Verbunden mit ${hub.name} über ${hub.via} (Firmware ${hub.firmware}) —\n`, 't-info'); }
    // Im Browser zeigt dessen eigenes Fenster nur eine leere Liste – hier steht, woran es meist liegt
    else if (kind === 'usb' && !tablet && !window.blockwerkDesktop){ terminal.showCode(); termWrite(usbHint(lastFirmware()) + '\n', 't-hint'); }
  } catch (err){ hubFailed(err); }
  connectDialog.close();
  hubBusy = false; setHubNote(null);
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
/**
 * Übersetzt ein Programm samt den Modulen aus Erweiterungen. Liefert null, wenn es sich nicht übersetzen
 * lässt – die Fehler stehen dann im Terminal, außer mit `quiet`.
 */
async function buildProgram(code: string, modules: GenerateResult['modules'], quiet = false){
  const { compileProgram } = await import('./hub/compile');
  const res = await compileProgram(code, wasmUrl);
  if (!res.ok){
    if (!quiet){ termWrite(res.errors.join('\n') + '\n', 't-err'); toast('Das Programm lässt sich nicht übersetzen – siehe Terminal.'); }
    return null;
  }
  // Module aus Erweiterungen kommen hinter das Programm; der Hub startet das erste
  const compiled = [{name:MAIN_MODULE, mpy:res.mpy}];
  for (const m of modules){
    const mod = await compileProgram(m.source, wasmUrl, m.name + '.py');
    if (!mod.ok){
      if (!quiet){ termWrite(`Modul ${m.name} (aus einer Erweiterung):\n${mod.errors.join('\n')}\n`, 't-err'); toast('Eine Erweiterung lässt sich nicht übersetzen – siehe Terminal.'); }
      return null;
    }
    compiled.push({name:m.name, mpy:mod.mpy});
  }
  return compiled;
}
async function runOnHub(){
  if (hubView.isOpen()) return;   // erst die Hub-Ansicht schließen – sie belegt den Hub
  if (!hub && !(await connectHub())) return;
  monitorSink = null;
  const code = currentCode, lines = currentLines, usesPad = currentUsesPad, usesXbox = currentUsesXbox, modules = currentModules;
  hubBusy = true; updateHubUi();
  try {
    setHubNote('übersetze …');
    const compiled = await buildProgram(code, modules);
    if (!compiled) return;
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
    await hub.run(payload, (f) => setHubNote(`lade … ${Math.round(f * 100)}\u00A0%`));
    lastProgram = payload; lastRun = {lines, usesPad};
    if (usesPad){ showPad(true); pad.reset(); }
  } catch (err){ hubFailed(err); }
  finally { hubBusy = false; setHubNote(null); }
}

// ---------------------------------------------------------------
// Hub-Ansicht: was an den Anschlüssen hängt, Messwerte, Akku (hub/monitor.ts, hub/monitorView.ts).
// Dafür läuft auf dem Hub ein kleines Anzeige-Programm; es ersetzt dort das zuletzt geladene.
// Beim Schließen lädt Blockwerk deshalb wieder auf den Hub, was es zuletzt selbst geladen hatte –
// und hat es noch nichts geladen, das Programm der Arbeitsfläche. Das Anzeige-Programm bleibt
// also nie als letztes auf dem Hub liegen, auch nicht nach »Hub trennen« in der Hub-Ansicht.
// ---------------------------------------------------------------
let monitor: MonitorFeed | null = null;         // gesetzt, solange das Anzeige-Programm auf dem Hub läuft
let monitorSink: MonitorFeed | null = null;     // liest kurz nach dessen Ende noch mit: letzte Zeilen gehören nicht ins Terminal
let monitorBeat: number | undefined;
const strayLines = new StrayFilter();
let monitorPayload: Uint8Array | null = null;   // das Anzeige-Programm, übersetzt
let monitorLoaded = false;                      // auf dem Hub liegt gerade das Anzeige-Programm
let monitorClosePending = false;                // geschlossen, während noch geladen wurde
let disconnecting = false;                      // »Hub trennen« läuft: Das Ende des Anzeige-Programms ist gewollt
let scanning = false;                           // das Anzeige-Programm läuft gerade nur, um die Anschlüsse zu erkennen
let scanWake: (() => void) | null = null;       // beendet das Warten der Erkennung: alles gesehen, Programm zu Ende, Hub getrennt
/** Was Blockwerk zuletzt als Programm auf diesen Hub geladen hat – samt dem, was Blockwerk dazu wissen muss. */
let lastProgram: Uint8Array | null = null;
let lastRun: {lines: CodeLine[]; usesPad: boolean} = {lines:[], usesPad:false};
const hubView = initHubView({closed:() => void closeHubView(), restart:() => void startMonitor(), disconnect:() => void disconnectHub()});

/** Das Anzeige-Programm hat aufgehört – am Hub gestoppt oder weil keine Lebenszeichen mehr ankamen. */
function monitorEnded(){
  clearInterval(monitorBeat); retireMonitor();
  scanWake?.();
  if (hubView.isOpen() && !disconnecting) hubView.status('ended');
}
/** Das Anzeige-Programm läuft nicht mehr; was der Hub in den nächsten Sekunden noch von ihm schickt, wird verschluckt. */
function retireMonitor(){
  if (!monitor) return;
  monitor.mute();
  const sink = monitorSink = monitor; monitor = null;
  setTimeout(() => { if (monitorSink === sink) monitorSink = null; }, 2000);
}
/** Das Anzeige-Programm, übersetzt – beim ersten Mal dauert das einen Moment. */
async function monitorProgram(): Promise<Uint8Array> {
  if (!monitorPayload){
    const { compileProgram } = await import('./hub/compile');
    const res = await compileProgram(MONITOR_PROGRAM, wasmUrl);
    if (!res.ok) throw new Error(res.errors.join('\n'));
    monitorPayload = encodeModules([{name:MAIN_MODULE, mpy:res.mpy}]);
  }
  return monitorPayload;
}
async function startMonitor(){
  if (!hub || hubBusy || monitor) return;
  hubBusy = true; updateHubUi(); hubView.status('loading');
  try {
    const payload = await monitorProgram();
    if (!hub) return;
    // Läuft noch etwas – etwa das Anzeige-Programm, am Hub mit der Taste neu gestartet –, zuerst anhalten:
    // Sein Ende darf nicht dem neuen Leser unten zugeschrieben werden.
    await hub.halt();
    if (!hub) return;
    // Fehlermeldungen des Anzeige-Programms gehören zu keinem Block
    runLines = []; runUsesPad = false; traceback.reset();
    monitorSink = null;
    const feed = monitor = new MonitorFeed((state) => {
      hubView.render(state); hubView.status('live');
      // was die Hub-Ansicht sieht, gilt auch für die Blockliste – etwa nach dem Umstecken
      if (settings().autoPorts && allPortsSeen(state)) setDetectedPorts(foundPorts(state));
    });
    // ab dem ersten Schreiben ist das Programm auf dem Hub ersetzt – auch wenn das Laden mittendrin scheitert
    monitorLoaded = true;
    await hub.run(payload);
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
/** `stopFirst`: Ein laufendes Programm wird angehalten (das hat der Nutzer dann schon bestätigt). */
async function openHubView(stopFirst = false){
  if (hubView.isOpen() || hubBusy) return;
  if (!hub && !(await connectHub())) return;
  if (!hub) return;
  if (hub.isRunning && !stopFirst){ toast('Auf dem Hub läuft gerade ein Programm. Stoppe es – dann zeigt die Hub-Ansicht, was an den Anschlüssen hängt.'); return; }
  hubView.open(hub.name);
  await startMonitor();
}
/** Der Verbinden-Knopf: ohne Hub verbinden, mit Hub die Hub-Ansicht öffnen – dort steht auch »Hub trennen«. */
async function connectClicked(){
  if (hubBusy) return;
  // (die Anschlüsse nur hier erkennen: Wer mit dem Startknopf verbindet, will gleich weiter)
  if (!hub){ if (await connectHub()) void scanPorts(); return; }
  if (!hub.isRunning){ void openHubView(); return; }
  // Die Hub-Ansicht braucht den Hub für sich. Läuft ein Programm, entscheidet der Nutzer, ob es anhalten soll.
  const answer = await ask({
    title:'Auf dem Hub läuft ein Programm',
    text:['Die Hub-Ansicht zeigt, was an den Anschlüssen hängt, die Messwerte und den Akku. Dafür muss das laufende Programm anhalten.'],
    buttons:[{id:'disconnect', label:'Hub trennen'}, {id:'view', label:'Anhalten und Hub-Ansicht öffnen', primary:true}]
  });
  if (answer === 'disconnect') void disconnectHub();
  else if (answer === 'view') void openHubView(true);
}
/**
 * Trennt den Hub. Liegt dort noch das Anzeige-Programm (Hub-Ansicht, Erkennung der Anschlüsse), kommt
 * vorher das eigene Programm zurück – sonst startete die Taste am Hub später die Anzeige.
 */
async function disconnectHub(){
  const connected = hub;
  if (!connected) return;
  // lädt gerade etwas, erst das Ende abwarten
  for (let i = 0; i < 100 && hubBusy && hub === connected; i++) await sleep(50);
  if (hub !== connected) return;
  hubBusy = disconnecting = true; updateHubUi();
  if (hubView.isOpen()) hubView.status('loading', 'Lege dein Programm zurück auf den Hub und trenne …');
  try { if (monitor || monitorLoaded){ clearInterval(monitorBeat); await endMonitor(connected); } }
  catch (err){ console.warn('Programm nicht zurückgelegt:', err); }
  finally { retireMonitor(); hubBusy = disconnecting = false; monitorClosePending = false; setHubNote(null); }
  // (schließt über onDisconnect auch die Hub-Ansicht)
  if (hub === connected) connected.disconnect();
}
/** Nach dem Schließen: Anzeige-Programm beenden und das zuletzt geladene Programm wieder auf den Hub legen. */
async function closeHubView(){
  if (hubBusy){ monitorClosePending = true; return; }
  clearInterval(monitorBeat);
  const connected = hub;
  if (!connected){ monitor = null; return; }
  hubBusy = true; updateHubUi();
  try { await endMonitor(connected); }
  catch (err){ hubFailed(err); }
  finally { retireMonitor(); hubBusy = false; updateHubUi(); }
}
/** Hält das Anzeige-Programm an und legt wieder auf den Hub, was Blockwerk zuletzt selbst geladen hatte. */
async function endMonitor(connected: Hub){
  monitor?.mute();
  await connected.halt();
  retireMonitor();
  // inzwischen getrennt (ausgeschaltet, Kabel gezogen): Dann gibt es nichts zurückzuladen
  if (hub !== connected) return;
  if (!monitorLoaded) return;
  setHubNote('lade dein Programm zurück …');
  try {
    if (!lastProgram){
      // Blockwerk hat auf diesen Hub noch nichts geladen: dann das Programm der Arbeitsfläche, sofern es sich übersetzen lässt
      const lines = currentLines, usesPad = currentUsesPad;
      const compiled = await buildProgram(currentCode, currentModules, true).catch(() => null);
      if (hub !== connected) return;
      if (compiled){ lastProgram = encodeModules(compiled); lastRun = {lines, usesPad}; }
    }
    if (lastProgram){
      await connected.load(lastProgram);
      // … und Blockwerk kennt es wieder: Zeilen für die Fehleranzeige, Steuerfeld
      runLines = lastRun.lines; runUsesPad = lastRun.usesPad;
      monitorLoaded = false;
    }
  } finally { hubNote = null; }
}

// ---------------------------------------------------------------
// Anschlüsse erkennen (ports.ts): Nach dem Verbinden läuft das Anzeige-Programm für einen Moment
// ohne Fenster, bis von jedem Anschluss bekannt ist, was dort steckt. Daraus werden die Vorgaben
// in der Blockliste; Blöcke auf der Arbeitsfläche bleiben, wie sie sind. Die Hub-Ansicht frischt
// die Vorgaben auf, solange sie offen ist. Wie dort ersetzt das Anzeige-Programm, was auf dem Hub
// gespeichert war – abschalten lässt sich die Erkennung in den Einstellungen.
// ---------------------------------------------------------------
/** So lange kein neuer Anschluss dazukommt, gilt das Bild als vollständig (Hubs mit weniger als sechs Anschlüssen). */
const SCAN_SETTLE_MS = 700;
/** Länger wartet die Erkennung nicht – der Hub soll nicht belegt bleiben. */
const SCAN_TIMEOUT_MS = 6000;

/** Stellt die Blockliste auf die erkannten Anschlüsse ein (null: wieder die üblichen Vorgaben). */
function setDetectedPorts(found: FoundPorts | null){
  if (samePorts(found, detectedPorts)) return;
  detectedPorts = found;
  const apply = () => {
    // nicht mitten in einem Zug: Der gezogene Block hängt an der Liste, die dabei neu entsteht
    if (ws.isDragging()){ setTimeout(apply, 300); return; }
    const toolbox = ws.getToolbox();
    const open = (toolbox?.getSelectedItem() as Blockly.ToolboxCategory | null)?.getName?.();
    ws.updateToolbox(currentToolbox());
    // war eine Kategorie aufgeklappt, zeigt sie jetzt die neuen Vorgaben
    const again = open && toolbox?.getToolboxItems().find(item => (item as Blockly.ToolboxCategory).getName?.() === open);
    if (again) toolbox!.setSelectedItem(again);
  };
  apply();
}
/**
 * Sieht nach, was am Hub steckt, und stellt die Blockliste darauf ein. Liefert den Stand der Anschlüsse –
 * oder null, wenn nicht nachgesehen wurde (abgeschaltet, Hub beschäftigt, getrennt).
 * `settleMs`: so lange vorher warten, `announce`: das Ergebnis ins Terminal schreiben.
 */
async function scanPorts(settleMs = 600, announce = true): Promise<MonitorState | null> {
  if (!settings().autoPorts || !hub || hubBusy || monitor || hubView.isOpen()) return null;
  const connected = hub;
  hubBusy = scanning = true; updateHubUi();
  let settle: number | undefined, timeout: number | undefined;
  try {
    // Nach dem Verbinden die erste Statusmeldung abwarten: Läuft auf dem Hub schon ein Programm, bleibt es ungestört
    if (settleMs) await sleep(settleMs);
    if (hub !== connected || connected.isRunning) return null;
    const payload = await monitorProgram();
    if (hub !== connected || connected.isRunning) return null;
    runLines = []; runUsesPad = false; traceback.reset();
    monitorSink = null;
    const done = new Promise<void>((resolve) => { scanWake = resolve; });
    let seen = 0;
    const feed = monitor = new MonitorFeed((state) => {
      if (allPortsSeen(state)){ scanWake?.(); return; }
      const count = Object.keys(state.ports).length;
      if (count > seen){ seen = count; clearTimeout(settle); settle = window.setTimeout(() => scanWake?.(), SCAN_SETTLE_MS); }
    });
    monitorLoaded = true;
    await connected.run(payload);
    timeout = window.setTimeout(() => scanWake?.(), SCAN_TIMEOUT_MS);
    await done;
    if (hub !== connected) return null;
    const found = Object.keys(feed.state.ports).length ? foundPorts(feed.state) : null;
    await endMonitor(connected);
    if (!found || hub !== connected) return null;
    setDetectedPorts(found);
    if (announce) termWrite(`— ${describePorts(found)} —\n`, 't-info');
    return feed.state;
  } catch (err){
    // Die Erkennung ist eine Zugabe: Scheitert sie, bleibt es bei den üblichen Vorgaben – ohne Fehlermeldung
    console.warn('Anschlüsse nicht erkannt:', err);
    return null;
  } finally {
    clearTimeout(settle); clearTimeout(timeout); scanWake = null; scanning = false;
    retireMonitor();
    // (wurde inzwischen neu verbunden, gehört »beschäftigt« der neuen Verbindung)
    if (!hub || hub === connected) hubBusy = false;
    updateHubUi();
  }
}
/**
 * Das Programm ist gescheitert, weil an einem Anschluss das erwartete Gerät fehlt: nachsehen, was wirklich
 * steckt, die Blockliste nachziehen und sagen, wo das Gerät ist. (Das gescheiterte Programm liegt danach
 * wieder auf dem Hub – Blockwerk hat es selbst geladen.)
 */
async function recheckPorts(missing: DeviceAt | null){
  const connected = hub;
  if (!connected || !settings().autoPorts) return;
  // erst wenn der Hub das Ende des Programms gemeldet hat
  for (let i = 0; i < 60 && hub === connected && connected.isRunning; i++) await sleep(50);
  if (hub !== connected) return;
  const state = await scanPorts(0, false);
  if (!state) return;
  if (missing) termWrite('→ ' + missingDeviceHint(missing, state) + '\n', 't-hint');
  termWrite(`— ${describePorts(foundPorts(state))} —\n`, 't-info');
}

// Steuerfeld: schickt Joystick und Tasten an das laufende Programm
const padEl = $('pad'), btnPadWs = $('btnPadWs');
/** Stand des Steuerfelds für den Simulator – mitgelesen aus dem, was das Steuerfeld an den Hub schickt (padProtocol.ts). */
const padState: Record<string, number | boolean> = {x:0, y:0, A:false, B:false, C:false, D:false};
function trackPad(byte: number){
  if (byte >= 150 && byte <= 170) padState.x = (byte - 160) * 10;
  else if (byte >= 180 && byte <= 200) padState.y = (byte - 190) * 10;
  else if (byte >= 65 && byte <= 68) padState[String.fromCharCode(byte)] = true;
  else if (byte >= 97 && byte <= 100) padState[String.fromCharCode(byte - 32)] = false;
}
const pad = createPad((byte) => { trackPad(byte); return hub && hub.isRunning && runUsesPad ? hub.sendBytes(new Uint8Array([byte])) : Promise.resolve(); });
// der schmale Streifen unter dem Code: für Maus und Tastatur
pad.bindStick(padEl.querySelector<HTMLElement>('.pad-stick')!, padEl.querySelector<HTMLElement>('.pad-stick')!, padEl.querySelector<HTMLElement>('.pad-knob')!);
for (const b of PAD_BUTTONS) pad.bindButton(padEl.querySelector<HTMLElement>(`[data-pad="${b}"]`)!, b);
pad.bindKeys(padEl);
padEl.querySelector('.pad-stick')!.addEventListener('pointerdown', () => padEl.focus());
// die Controller-Ansicht: bildschirmfüllend, zum Anordnen – auf Geräten mit Fingerbedienung der übliche Weg
const padView = padViewRef = initPadView(pad, {run:() => btnRunWs.click(), stop:() => btnStopWs.click()});
const fingers = () => isTablet() || matchMedia('(pointer:coarse)').matches;
function showPad(on: boolean){
  if (on && (fingers() || isPhone())){ padView.open(); return; }
  padEl.classList.toggle('hidden', !on);
  btnPadWs.setAttribute('aria-pressed', String(on));
  if (on) pad.redraw();
}
$('btnPadBig').addEventListener('click', () => padView.open());
// Der Controller-Knopf klappt den Streifen unter dem Code auf und zu. Ist der Python-Bereich nicht
// zu sehen (eingeklappt, schmaler Bildschirm) oder wird mit dem Finger bedient, öffnet er die große Ansicht.
btnPadWs.addEventListener('click', () => {
  if (fingers() || isPhone() || mainEl.classList.contains('code-closed') || window.matchMedia('(max-width: 820px)').matches) padView.open();
  else showPad(padEl.classList.contains('hidden'));
});
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
const MENU: Record<string, string | (() => void)> = {new:'btnNew', open:'btnOpen', save:'btnSave', settings:'btnSettings', help:'btnHelp', about:'btnAbout',
  extensions:'btnExt', connect:'btnConnect', run:'btnRunWs', stop:'btnStopWs', code:'codeToggle', copy:'btnCopy',
  hubview:() => void openHubView(), disconnect:() => void disconnectHub()};
const menuAction = (action: string) => {
  const target = MENU[action];
  if (typeof target === 'function'){ target(); return; }
  const el = target && $<HTMLButtonElement>(target); if (el && !el.disabled) el.click();
};
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
  for (const b of [btnConnect, wsHub]) b.addEventListener('click', () => void connectClicked());
  btnRunWs.addEventListener('click', () => { playSound('start'); void runOnHub(); });
  btnStopWs.addEventListener('click', () => { playSound('stopp'); hub?.stop().catch(hubFailed); });
} else {
  $('wsConnect').classList.add('hidden'); btnConnect.classList.add('hidden'); $('wsRun').classList.add('hidden');
  $('hubUnsupported').classList.remove('hidden');
}

// ---------------------------------------------------------------
// Simulator (src/sim): steht im Codebereich an der Stelle des Codes. Geladen wird er erst, wenn
// ihn jemand öffnet.
// ---------------------------------------------------------------
const btnSim = $('btnSim');
btnSim.addEventListener('click', async () => {
  const on = btnSim.getAttribute('aria-pressed') !== 'true';
  btnSim.setAttribute('aria-pressed', String(on));
  $('codePanel').classList.toggle('sim-on', on);
  $('sim').classList.toggle('hidden', !on);
  if (!simView){
    const { initSimView } = await import('./sim/view');
    simView ??= initSimView($('sim'), {
      ws, toast, print:termWrite,
      pad:(name) => padState[name] ?? 0, soundOn:() => settings().sounds,
      // fragt das Programm das Steuerfeld ab, klappt es auf
      // (der Streifen unter dem Simulator, auch bei Fingerbedienung – die große Controller-Ansicht würde ihn verdecken)
      onStart:() => { if (!currentUsesPad) return; padEl.classList.remove('hidden'); btnPadWs.setAttribute('aria-pressed', 'true'); pad.redraw(); pad.release(); },
      showBlock:(id) => { const b = ws.getBlockById(id); if (b){ Blockly.common.setSelected(b as Blockly.BlockSvg); ws.centerOnBlock(id); } }
    });
  }
  simView.setShown(btnSim.getAttribute('aria-pressed') === 'true');
});

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
// Handy: Der Code füllt den Bildschirm; zurück geht es mit dem Knopf im Kopf des Python-Bereichs
$('codeBack').addEventListener('click', () => setView('blocks'));

new ResizeObserver(() => Blockly.svgResize(ws)).observe(document.querySelector('.ws-wrap')!);

// Wechsel der Ansicht (Handy gedreht, Fenster schmal gezogen): Der Werkzeugkasten zieht um – hochkant als
// Leiste nach unten, sonst an den linken Rand –, und was nur zu einer Ansicht gehört, wird zurückgesetzt.
/** Der Verbinden-Knopf sitzt auf dem Handy in der Kopfleiste, sonst oben rechts an der Arbeitsfläche. */
function placeConnect(){ (isPhone() ? document.querySelector<HTMLElement>('header.bar')! : $('wsConnect')).appendChild(btnConnect); }
placeConnect();
onViewMode((mode) => {
  setToolboxHorizontal(ws, mode === 'phone-portrait');
  placeConnect();
  syncExtButton();
  if (mode !== 'wide') document.querySelector<HTMLDialogElement>('dialog.ext[open]')?.close();
});

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
