// ---------------------------------------------------------------
// Mehrere Blöcke auswählen – zum Kopieren, Duplizieren und Löschen in einem Zug (copy.ts).
// Mit der Tastatur: Umschalt gedrückt halten und Blöcke anklicken oder auf der freien Fläche einen
// Rahmen aufziehen. Ohne Tastatur (Tablet): der Knopf »Auswählen« schaltet dasselbe ein.
// Die Auswahl ist Blockwerks eigene: Blockly kennt nur einen gewählten Block und bekommt von
// diesen Klicks nichts mit. Ein gewöhnlicher Klick hebt sie wieder auf.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { copyGroup, GROUP_PASTER, groupStates, isGroupCopy, onGroupPasted, pasteGroupAndTell, topPicked } from './copy';

/** Ein Block gilt als vom Rahmen erfasst, wenn der seine oberste Zeile berührt – so hoch ist die (bei Zoom 100 %). */
const HEADER_PX = 40;
/** Kleiner als das ist kein Rahmen, sondern ein Tipp daneben. */
const TAP_PX = 5;

export function initMultiSelect(ws: Blockly.WorkspaceSvg){
  const host = document.getElementById('blocklyDiv')!, wrap = host.parentElement!;
  const bar = document.getElementById('wsPicked')!, count = document.getElementById('wsPickedCount')!;
  const modeButton = document.getElementById('btnPick')!;
  const picked = new Set<string>();
  /** Der Knopf »Auswählen«: Jeder Tipp wählt, auch ohne Umschalt. */
  let mode = false;

  const blocks = () => [...picked].map(id => ws.getBlockById(id)).filter((b): b is Blockly.BlockSvg => !!b);
  /** Zeigt die Auswahl an den Blöcken und in der Leiste. Was in einem gewählten Block steckt, zählt nicht eigens. */
  function show(){
    const tops = new Set(topPicked(blocks()).map(b => b.id));
    picked.clear(); for (const id of tops) picked.add(id);
    for (const b of ws.getAllBlocks(false)) b.getSvgRoot().classList.toggle('bw-picked', picked.has(b.id));
    bar.classList.toggle('hidden', !picked.size);
    count.textContent = picked.size === 1 ? '1 Block gewählt' : `${picked.size} Blöcke gewählt`;
  }
  function clear(){ if (picked.size){ picked.clear(); show(); } }
  function pick(list: Blockly.Block[]){ picked.clear(); for (const b of list) picked.add(b.id); show(); }
  /**
   * Gibt der Arbeitsfläche die Tasten. Ein Auswahl-Klick kommt bei Blockly nicht an, also auch nicht der
   * Fokus – ohne ihn gingen danach weder Strg+Z noch Blocklys übrige Kürzel.
   */
  function focus(){
    const manager = Blockly.getFocusManager();
    if (manager.getFocusedTree() !== ws) manager.focusTree(ws);
  }

  /** Der Block unter dem Zeiger – bei einer Zahl oder einem Text im Block der Block darum. */
  function blockAt(target: Element): Blockly.BlockSvg | null {
    let block = ws.getBlockById(target.closest('g[data-id]')?.getAttribute('data-id') ?? '');
    while (block?.isShadow()) block = block.getParent();
    return block && !block.isInsertionMarker() ? block : null;
  }
  function toggle(block: Blockly.BlockSvg){
    // Der Block, den Blockly gerade gewählt hat, gehört dazu – wie beim Umschalt-Klick in anderen Programmen
    const selected = Blockly.common.getSelected();
    if (!picked.size && selected instanceof Blockly.BlockSvg && selected.workspace === ws && !selected.isShadow() && selected !== block) picked.add(selected.id);
    if (picked.has(block.id)) picked.delete(block.id); else picked.add(block.id);
    show(); focus();
  }

  // ---- Rahmen aufziehen ----
  function band(start: PointerEvent){
    const frame = document.createElement('div'); frame.className = 'bw-band'; document.body.appendChild(frame);
    const box = (e: PointerEvent) => ({left:Math.min(start.clientX, e.clientX), top:Math.min(start.clientY, e.clientY), right:Math.max(start.clientX, e.clientX), bottom:Math.max(start.clientY, e.clientY)});
    const move = (e: PointerEvent) => {
      const r = box(e);
      Object.assign(frame.style, {left:r.left + 'px', top:r.top + 'px', width:r.right - r.left + 'px', height:r.bottom - r.top + 'px'});
    };
    const end = (e: PointerEvent) => {
      for (const type of ['pointermove', 'pointerup', 'pointercancel'] as const) window.removeEventListener(type, type === 'pointermove' ? move : end, true);
      frame.remove();
      const r = box(e);
      // nur daneben getippt: Im Auswahlmodus hebt das die Auswahl auf (mit Umschalt bleibt sie – man wollte wohl einen Block treffen)
      if (r.right - r.left < TAP_PX && r.bottom - r.top < TAP_PX){ if (!start.shiftKey) clear(); return; }
      if (e.type === 'pointercancel') return;
      for (const block of ws.getAllBlocks(false)){
        if (block.isShadow() || block.isInsertionMarker()) continue;
        // die oberste Zeile des Blocks: Der Umriss einer Schleife reicht um ihren ganzen Inhalt, gemeint ist dann aber der Inhalt
        const path = block.pathObject.svgPath.getBoundingClientRect(), bottom = Math.min(path.bottom, path.top + HEADER_PX * ws.scale);
        if (path.left < r.right && path.right > r.left && path.top < r.bottom && bottom > r.top) picked.add(block.id);
      }
      show(); focus();
    };
    window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
  }

  // ---- Zeiger: vor Blockly, damit ein Auswahl-Klick weder zieht noch Blocklys eigene Auswahl ändert ----
  host.addEventListener('pointerdown', (e) => {
    const target = e.target as Element;
    if (e.button !== 0 || !e.isPrimary || !target.closest) return;
    // Blockliste, Werkzeugkasten und Rollbalken bleiben, wie sie sind
    if (target.closest('.blocklyFlyout, .blocklyToolbox, .blocklyToolboxDiv, .blocklyScrollbarHandle, .blocklyScrollbarBackground')) return;
    if (!e.shiftKey && !mode){ clear(); return; }
    e.preventDefault(); e.stopPropagation();
    const block = blockAt(target);
    if (block) toggle(block); else band(e);
  }, true);

  // ---- Kopieren, Einfügen, Duplizieren, Löschen ----
  /** Löscht die gewählten Blöcke; was darunter hing, rückt nach. Ein Schritt für »Rückgängig«. */
  function remove(){
    Blockly.Events.setGroup(true);
    try { for (const block of blocks()) if (block.isDeletable() && !block.isDeadOrDying()) block.dispose(true, true); }
    finally { Blockly.Events.setGroup(false); }
    picked.clear(); show(); focus();
  }
  /** Die Auswahl gleich noch einmal daneben – ohne die Zwischenablage anzufassen. */
  function duplicate(){
    const stacks = groupStates(blocks());
    if (stacks.length) pasteGroupAndTell({paster:GROUP_PASTER, stacks, pasted:0}, ws);
  }
  // was eingefügt wurde, ist danach gewählt: So sieht man es, und es lässt sich gleich weiterkopieren oder löschen
  onGroupPasted((list) => { pick(list); focus(); });

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    // in Eingabefeldern und Fenstern gelten die Tasten dem Text dort
    if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
    if (document.querySelector('dialog[open]')) return;
    const command = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey, key = e.key.toLowerCase();
    if (command && key === 'v'){
      // nur wenn zuletzt mehrere Blöcke kopiert wurden (sonst fügt Blockly seinen einen Block ein) – und nur an der Arbeitsfläche
      const data = Blockly.clipboard.getLastCopiedData();
      if (!isGroupCopy(data) || !(target === document.body || (target && wrap.contains(target)))) return;
      pasteGroupAndTell(data, ws);
    }
    else if (!picked.size) return;
    else if (command && key === 'c') copyGroup(ws, blocks());
    else if (command && key === 'x'){ if (copyGroup(ws, blocks())) remove(); }
    else if (!e.ctrlKey && !e.metaKey && (e.key === 'Delete' || e.key === 'Backspace')) remove();
    else if (e.key === 'Escape'){ clear(); return; }
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);

  document.getElementById('wsPickedCopy')!.addEventListener('click', duplicate);
  document.getElementById('wsPickedDelete')!.addEventListener('click', remove);
  document.getElementById('wsPickedClear')!.addEventListener('click', clear);
  modeButton.addEventListener('click', () => {
    mode = !mode;
    modeButton.setAttribute('aria-pressed', String(mode));
    wrap.classList.toggle('picking', mode);
    if (!mode) clear();
  });

  // Rechtsklick auf einen der gewählten Blöcke: die ganze Auswahl duplizieren oder löschen
  const group = (scope: Blockly.ContextMenuRegistry.Scope) => !!scope.block && picked.size > 1 && picked.has(scope.block.id);
  Blockly.ContextMenuRegistry.registry.register({
    id:'bw_picked_duplicate', weight:-2, scopeType:Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText:() => `Auswahl duplizieren (${picked.size} Blöcke)`,
    preconditionFn:(scope) => group(scope) ? 'enabled' : 'hidden', callback:duplicate
  });
  Blockly.ContextMenuRegistry.registry.register({
    id:'bw_picked_delete', weight:-1, scopeType:Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    displayText:() => `Auswahl löschen (${picked.size} Blöcke)`,
    preconditionFn:(scope) => group(scope) ? 'enabled' : 'hidden', callback:remove
  });

  // Blöcke, die verschwinden (gelöscht, rückgängig gemacht), fallen aus der Auswahl
  ws.addChangeListener((e) => { if (picked.size && (e.type === Blockly.Events.BLOCK_DELETE || e.type === Blockly.Events.FINISHED_LOADING)) show(); });
}
