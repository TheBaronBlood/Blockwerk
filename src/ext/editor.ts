// ---------------------------------------------------------------
// Editor für Erweiterungen: links die Liste, in der Mitte der Quelltext, rechts die
// Vorschau der Blöcke. Der Quelltext ist die einzige Wahrheit – auch die Farbe steht dort.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { DEFAULT_COLOUR, parseExtension, setColour, type ExtError, type Extension } from './parse';
import { registerExtension, toolboxBlocks, unregisterTypes } from './register';
import { extensions, getExtension, installExtension, removeExtension } from './store';
import { testProgram } from './check';
import { CHEAT_SHEET, TEMPLATE } from './template';
import { GUIDE } from './guide';
import { highlightExtension } from '../highlight';
import { BLOCKLY_MEDIA } from '../theme';
import { saveFile } from '../files';

export interface EditorHost {
  theme(): Blockly.Theme;
  /** Übersetzt Python probeweise; liefert die Fehlermeldungen (leer = in Ordnung). */
  compile(code: string, fileName: string): Promise<string[]>;
  /** Führt eine Änderung an den installierten Erweiterungen aus und bringt Arbeitsfläche und Werkzeugkasten nach. */
  apply(change: () => void): void;
  /** Ob Blöcke dieser Erweiterung im Programm stecken. */
  inUse(id: string): boolean;
  toast(text: string): void;
}

const PREVIEW = 'extprev';

/**
 * Die Vorschau rollt wie eine Liste: Sie beginnt oben links und lässt sich nur so weit nach unten und nach
 * rechts schieben, wie die Blöcke reichen. Blockly ließe sonst in jede Richtung ins Leere rollen.
 */
class ListMetrics extends Blockly.MetricsManager {
  override getScrollMetrics(workspaceCoordinates?: boolean, view?: Blockly.MetricsManager.ContainerRegion, content?: Blockly.MetricsManager.ContainerRegion){
    const scale = workspaceCoordinates ? this.workspace_.scale : 1;
    const v = view || this.getViewMetrics(false), c = content || this.getContentMetrics(false);
    const pad = 16 * this.workspace_.scale;
    return {left:0, top:0, width:Math.max(v.width, c.left + c.width + pad) / scale, height:Math.max(v.height, c.top + c.height + pad) / scale};
  }
}

export function initExtensionEditor(host: EditorHost): {open(): void} {
  const dialog = document.createElement('dialog');
  dialog.className = 'ext';
  dialog.innerHTML = `
    <div class="ext-head"><h2>Erweiterungen</h2><span class="ext-sub">Eigene Blöcke mit eigenem Python-Code</span><button type="button" class="btn ext-full" data-act="full" aria-label="Vollbild" aria-pressed="false"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button><button type="button" class="btn" data-act="close" aria-label="Schließen">✕</button></div>
    <div class="ext-body">
      <nav class="ext-list" aria-label="Installierte Erweiterungen">
        <ul></ul>
        <button type="button" class="btn" data-act="new">＋ Neue Erweiterung</button>
        <button type="button" class="btn" data-act="load">Datei laden …</button>
        <input type="file" accept=".py,.txt,text/plain" class="hidden">
      </nav>
      <section class="ext-edit">
        <div class="ext-tools">
          <label>Farbe <input type="color" value="${DEFAULT_COLOUR}"></label>
          <span class="ext-state" role="status"></span>
          <button type="button" class="btn" data-act="delete">Entfernen</button>
          <button type="button" class="btn" data-act="export">Als Datei speichern</button>
          <button type="button" class="btn primary" data-act="save">Hinzufügen</button>
        </div>
        <div class="ext-code">
          <div class="ext-gutter" aria-hidden="true"></div>
          <pre class="ext-hl" aria-hidden="true"></pre>
          <textarea spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off" aria-label="Quelltext der Erweiterung"></textarea>
        </div>
        <ul class="ext-errors" aria-live="polite"></ul>
      </section>
      <section class="ext-side" data-tab="preview">
        <div class="ext-tabs" role="tablist">
          <button type="button" role="tab" data-tab="preview">Vorschau</button>
          <button type="button" role="tab" data-tab="guide">Anleitung</button>
        </div>
        <div class="ext-preview"></div>
        <div class="ext-guide"></div>
        <details class="ext-cheat"><summary>Kurzanleitung</summary><dl></dl></details>
      </section>
    </div>`;
  document.body.appendChild(dialog);

  const q = <T extends HTMLElement>(sel: string) => dialog.querySelector<T>(sel)!;
  const listEl = q('.ext-list ul'), text = q<HTMLTextAreaElement>('textarea'), errorsEl = q('.ext-errors');
  const colour = q<HTMLInputElement>('input[type=color]'), fileInput = q<HTMLInputElement>('input[type=file]');
  const stateEl = q('.ext-state'), saveBtn = q<HTMLButtonElement>('[data-act=save]'), deleteBtn = q<HTMLButtonElement>('[data-act=delete]');
  const cheat = q('.ext-cheat dl');
  for (const [code, what] of CHEAT_SHEET){
    cheat.appendChild(document.createElement('dt')).appendChild(document.createElement('code')).textContent = code;
    cheat.appendChild(document.createElement('dd')).textContent = what;
  }

  // Anleitung mit Beispielen, gefärbt wie der Quelltext links
  const guide = q('.ext-guide'), side = q('.ext-side');
  const codeBlock = (code: string) => {
    const pre = document.createElement('pre'); pre.className = 'ext-sample';
    for (const line of code.split('\n')) highlightExtension(line, pre.appendChild(document.createElement('div')));
    return pre;
  };
  for (const section of GUIDE){
    guide.appendChild(document.createElement('h4')).textContent = section.title;
    for (const p of section.text) guide.appendChild(document.createElement('p')).textContent = p;
    if (section.code) guide.appendChild(codeBlock(section.code));
  }
  function showTab(tab: string){
    side.dataset.tab = tab;
    side.querySelectorAll<HTMLElement>('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    if (tab === 'preview' && preview) Blockly.svgResize(preview);
  }

  // Der sichtbare, gefärbte Text liegt unter dem durchsichtigen Eingabefeld und rollt mit ihm
  const hl = q('.ext-hl'), gutter = q('.ext-gutter');
  let errorLines = new Set<number>();
  function paint(){
    const lines = text.value.split('\n');
    hl.textContent = '';
    for (const line of lines){ const row = hl.appendChild(document.createElement('div')); highlightExtension(line, row); if (!line) row.textContent = '​'; }
    gutter.textContent = '';
    lines.forEach((_, i) => { const n = gutter.appendChild(document.createElement('div')); n.textContent = String(i + 1); if (errorLines.has(i + 1)) n.className = 'bad'; });
    syncScroll();
  }
  function syncScroll(){
    hl.style.transform = `translate(${-text.scrollLeft}px, ${-text.scrollTop}px)`;
    gutter.style.transform = `translateY(${-text.scrollTop}px)`;
  }

  let preview: Blockly.WorkspaceSvg | null = null;
  let previewTypes: string[] = [];

  // Aufteilung: Liste links und Vorschau/Anleitung rechts lassen sich durch Ziehen breiter und schmaler
  // machen, das Fenster füllt auf Wunsch den ganzen Bildschirm. Beides bleibt gemerkt.
  const LAYOUT_KEY = 'blockwerk-ext-layout-v1';
  const layout: {list?: number; side?: number; full?: boolean} = (() => {
    try { return JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}') || {}; } catch { return {}; }
  })();
  const keepLayout = () => { try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* gilt dann bis zum Neuladen */ } };
  const body = q('.ext-body'), fullBtn = q<HTMLButtonElement>('[data-act=full]');
  function applyLayout(){
    for (const key of ['list', 'side'] as const){
      const px = layout[key];
      if (typeof px === 'number') body.style.setProperty('--ext-' + key, px + 'px'); else body.style.removeProperty('--ext-' + key);
    }
    dialog.classList.toggle('full', !!layout.full);
    fullBtn.setAttribute('aria-pressed', String(!!layout.full));
    fullBtn.title = layout.full ? 'Vollbild verlassen' : 'Vollbild';
    if (preview) Blockly.svgResize(preview);
  }
  function addSplit(before: Element, key: 'list' | 'side', label: string){
    const handle = document.createElement('div');
    handle.className = 'ext-split'; handle.tabIndex = 0;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.setAttribute('aria-label', label);
    handle.title = 'Ziehen: Breite ändern · Doppelklick: Standard';
    before.before(handle);
    // die Mitte mit dem Quelltext behält immer Platz
    const set = (x: number, store: boolean) => {
      const r = body.getBoundingClientRect();
      layout[key] = Math.round(key === 'list' ? Math.max(130, Math.min(x - r.left, r.width * 0.35)) : Math.max(220, Math.min(r.right - x, r.width * 0.6)));
      applyLayout(); if (store) keepLayout();
    };
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      dragging = true; handle.classList.add('drag'); e.preventDefault();
      try { handle.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
    });
    handle.addEventListener('pointermove', (e) => { if (dragging) set(e.clientX, false); });
    const end = () => { if (dragging) keepLayout(); dragging = false; handle.classList.remove('drag'); };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('dblclick', () => { delete layout[key]; applyLayout(); keepLayout(); });
    handle.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
      if (step){ e.preventDefault(); set(handle.getBoundingClientRect().left + step, true); }
    });
  }
  addSplit(q('.ext-edit'), 'list', 'Breite der Liste ändern');
  addSplit(q('.ext-side'), 'side', 'Breite von Vorschau und Anleitung ändern');
  applyLayout();
  let current: Extension | null = null;     // zuletzt fehlerfrei gelesener Stand des Quelltexts
  let editingId: string | null = null;      // welche installierte Erweiterung gerade offen ist

  function showErrors(errors: ExtError[] | string[]){
    errorsEl.textContent = '';
    for (const e of errors){
      const li = errorsEl.appendChild(document.createElement('li'));
      li.textContent = typeof e === 'string' ? e : `Zeile ${e.line}: ${e.text}`;
    }
  }

  function renderList(){
    listEl.textContent = '';
    for (const ext of extensions()){
      const b = listEl.appendChild(document.createElement('li')).appendChild(document.createElement('button'));
      b.type = 'button'; b.textContent = ext.name;
      b.style.setProperty('--ext-colour', ext.colour);
      b.setAttribute('aria-current', String(ext.id === editingId));
      b.addEventListener('click', () => edit(ext.source, ext.id));
    }
  }

  function renderPreview(ext: Extension | null){
    if (!preview) return;
    preview.clear();
    unregisterTypes(previewTypes);
    previewTypes = ext ? registerExtension(ext, PREVIEW) : [];
    if (!ext) return;
    let y = 16;
    for (const entry of toolboxBlocks(ext, PREVIEW)){
      const block = Blockly.serialization.blocks.append({...entry, x:16, y} as Blockly.serialization.blocks.State, preview) as Blockly.BlockSvg;
      y += block.getHeightWidth().height + 18;
    }
  }

  let timer: number | undefined;
  function refresh(){
    const {ext, errors} = parseExtension(text.value);
    showErrors(errors);
    errorLines = new Set(errors.map(e => e.line));
    paint();
    current = errors.length ? null : ext;
    if (ext && ext.colour !== colour.value.toUpperCase()) colour.value = ext.colour;
    // die Vorschau zeigt auch einen Stand mit Fehlern, soweit er sich lesen ließ
    try { renderPreview(ext && ext.blocks.length ? ext : null); } catch (err){ console.error(err); }
    const known = !!(ext && getExtension(ext.id));
    saveBtn.textContent = known ? 'Änderungen übernehmen' : 'Hinzufügen';
    saveBtn.disabled = !current;
    deleteBtn.disabled = !editingId;
    stateEl.textContent = errors.length ? `${errors.length} Fehler` : ext ? `${ext.blocks.length} ${ext.blocks.length === 1 ? 'Block' : 'Blöcke'}` : '';
    stateEl.classList.toggle('bad', errors.length > 0);
  }
  function edit(source: string, id: string | null){
    editingId = id; text.value = source;
    renderList(); refresh();
  }

  // gefärbt wird sofort, gelesen und in der Vorschau gezeigt mit kleiner Verzögerung
  text.addEventListener('input', () => { paint(); clearTimeout(timer); timer = window.setTimeout(refresh, 250); });
  text.addEventListener('scroll', syncScroll);
  // Tab rückt ein, statt das Feld zu verlassen – Python lebt von der Einrückung
  text.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    text.setRangeText('    ', text.selectionStart, text.selectionEnd, 'end');
    text.dispatchEvent(new Event('input'));
  });
  colour.addEventListener('input', () => { text.value = setColour(text.value, colour.value); refresh(); });

  async function save(){
    if (!current) return;
    const ext = current;
    saveBtn.disabled = true; stateEl.textContent = 'prüfe Python …';
    const problems: string[] = [];
    try {
      for (const e of await host.compile(testProgram(ext), 'erweiterung.py')) problems.push(e);
      for (const m of ext.modules) for (const e of await host.compile(m.source, m.name + '.py')) problems.push(`Modul ${m.name}: ${e}`);
    } catch (err){ console.error(err); problems.push('Die Prüfung des Python-Codes ist fehlgeschlagen.'); }
    if (problems.length){
      showErrors(['Der Python-Code enthält einen Fehler:', ...problems.filter(p => p.trim())]);
      stateEl.textContent = 'Python-Fehler'; stateEl.classList.add('bad'); saveBtn.disabled = false;
      return;
    }
    // Wurde die Erweiterung umbenannt, ersetzt der neue Name den alten
    const renamed = editingId && editingId !== ext.id ? editingId : null;
    host.apply(() => { if (renamed) removeExtension(renamed); installExtension(ext.source); });
    editingId = ext.id;
    renderList(); refresh();
    host.toast(`Erweiterung »${ext.name}« ist im Werkzeugkasten.`);
  }
  function remove(){
    const ext = editingId ? getExtension(editingId) : null;
    if (!ext) return;
    const used = host.inUse(ext.id);
    if (!confirm(used ? `»${ext.name}« entfernen? Die Blöcke dieser Erweiterung verschwinden auch aus dem Programm.` : `»${ext.name}« entfernen?`)) return;
    host.apply(() => removeExtension(ext.id));
    edit(TEMPLATE, null);
    host.toast(`Erweiterung »${ext.name}« entfernt.`);
  }
  function exportFile(){
    const {ext} = parseExtension(text.value);
    saveFile(`${ext?.id || 'erweiterung'}.blockwerk.py`, text.value, 'text/x-python')
      .catch((err) => { console.error(err); host.toast('Die Datei ließ sich nicht speichern.'); });
  }
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files && fileInput.files[0]; if (!f) return;
    fileInput.value = '';
    const source = await f.text();
    const id = parseExtension(source).ext?.id;
    edit(source, id && getExtension(id) ? id : null);
  });

  dialog.addEventListener('click', (e) => {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[role=tab]')?.dataset.tab;
    if (tab){ showTab(tab); return; }
    const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'close') dialog.close();
    else if (act === 'full'){ layout.full = !layout.full; applyLayout(); keepLayout(); }
    else if (act === 'new') edit(TEMPLATE, null);
    else if (act === 'load') fileInput.click();
    else if (act === 'save') save();
    else if (act === 'delete') remove();
    else if (act === 'export') exportFile();
  });

  return {
    open(){
      dialog.showModal();
      showTab(side.dataset.tab || 'preview');
      if (!preview){
        preview = Blockly.inject(q('.ext-preview'), {
          readOnly:true, renderer:'zelos', theme:host.theme(), media:BLOCKLY_MEDIA, sounds:false, trashcan:false, comments:false,
          zoom:{controls:false, wheel:false, startScale:0.8}, move:{scrollbars:true, drag:true, wheel:true},
          plugins:{metricsManager:ListMetrics}
        });
      } else { preview.setTheme(host.theme()); Blockly.svgResize(preview); }
      const first = editingId ? getExtension(editingId) : extensions()[0];
      if (first) edit(first.source, first.id); else edit(text.value || TEMPLATE, null);
    }
  };
}
