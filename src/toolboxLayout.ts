// ---------------------------------------------------------------
// Werkzeugkasten je nach Ansicht: senkrecht am linken Rand (Computer, Tablet, Handy quer) oder als
// Leiste am unteren Rand (Handy hochkant). Blockly legt das beim Aufbau der Arbeitsfläche fest; hier
// lässt es sich nachträglich umstellen – etwa wenn das Handy gedreht wird –, ohne die Arbeitsfläche
// neu aufzubauen (dabei ginge die Verbindung zum Hub verloren).
// Dazu ein Werkzeugkasten, der auf Geräten mit Fingerbedienung erst beim Antippen eine Kategorie
// wählt: Blockly wählt schon beim Aufsetzen des Fingers, und dann öffnete jedes Wischen durch die
// Kategorien eine davon.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { isPhone } from './viewMode';

/** Name, unter dem der Werkzeugkasten bei Blockly angemeldet ist (»plugins« beim Aufbau der Arbeitsfläche). */
export const BW_TOOLBOX = 'blockwerkWerkzeugkasten';

const tapSelects = () => isPhone() || window.matchMedia('(pointer:coarse)').matches;

class Toolbox extends Blockly.Toolbox {
  /** Die Kategorie, die gewählt war, als der Finger aufsetzte – ein Tipp auf sie klappt die Liste wieder zu. */
  private selectedAtPress: Blockly.ISelectableToolboxItem | null = null;

  // Wie Blocklys eigene Anbindung, nur dass der Zeigerdruck je nach Bedienung etwas anderes heißt: mit der Maus
  // wählt er sofort (Blockly), mit dem Finger merkt er sich nur den Stand, und gewählt wird beim Antippen (click).
  // Entschieden wird bei jedem Druck neu – die Ansicht kann wechseln, ohne dass der Werkzeugkasten neu entsteht.
  protected override attachEvents_(container: HTMLDivElement, contentsContainer: HTMLDivElement){
    // Blocklys Merker »Maus ist unten« verhindert, dass der Fokus die Kategorie von sich aus wählt
    const own = this as unknown as {mouseDown: boolean};
    const {bind, conditionalBind} = Blockly.browserEvents;
    this.boundEvents_.push(conditionalBind(container, 'pointerdown', this, (e: PointerEvent) => {
      if (!tapSelects()){ this.onClick_(e); return; }
      own.mouseDown = true; this.selectedAtPress = this.getSelectedItem();
    }, false));
    for (const type of ['pointerup', 'pointercancel']) this.boundEvents_.push(bind(container, type, this, () => { own.mouseDown = false; }));
    this.boundEvents_.push(bind(container, 'click', this, (e: Event) => { if (tapSelects()) this.tapped(e); }));
    this.boundEvents_.push(conditionalBind(contentsContainer, 'keydown', this, this.onKeyDown_, false));
  }
  private tapped(e: Event){
    const row = (e.target as Element).closest?.('[id]');
    const item = row && this.HtmlDiv?.contains(row) ? this.getToolboxItemById(row.id) : null;
    if (!item || !item.isSelectable()){ this.clearSelection(); Blockly.hideChaff(false); return; }
    const selectable = item as Blockly.ISelectableToolboxItem;
    if (selectable === this.selectedAtPress){ this.clearSelection(); Blockly.hideChaff(false); }
    else { if (this.getSelectedItem() !== selectable) this.setSelectedItem(selectable); Blockly.hideChaff(true); }
  }

  /**
   * Die Fläche, auf der losgelassene Blöcke gelöscht werden. Die Leiste unten schiebt sich nach oben,
   * solange die Blockliste offen ist; gelöscht wird aber dort, wo sie in Ruhe liegt.
   */
  override getClientRect(){
    const rect = super.getClientRect();
    if (!rect || !this.isHorizontal() || !this.HtmlDiv) return rect;
    const frame = this.workspace_.getInjectionDiv().getBoundingClientRect();
    return new Blockly.utils.Rect(frame.bottom - this.HtmlDiv.offsetHeight, rect.bottom, rect.left, rect.right);
  }
}
Blockly.registry.register(Blockly.registry.Type.TOOLBOX, BW_TOOLBOX, Toolbox);

/** Stellt den Werkzeugkasten um: `true` als Leiste unten, `false` senkrecht links. Die Arbeitsfläche bleibt, wie sie ist. */
export function setToolboxHorizontal(ws: Blockly.WorkspaceSvg, horizontal: boolean): void {
  if (ws.horizontalLayout === horizontal) return;
  const position = horizontal ? Blockly.utils.toolbox.Position.BOTTOM : Blockly.utils.toolbox.Position.LEFT;
  ws.getToolbox()?.dispose();
  ws.options.horizontalLayout = ws.horizontalLayout = horizontal;
  ws.options.toolboxPosition = ws.toolboxPosition = position;
  // Blockly baut den Werkzeugkasten sonst nur einmal, beim Aufbau der Arbeitsfläche; das Feld ist dort privat
  const ToolboxClass = Blockly.registry.getClassFromOptions(Blockly.registry.Type.TOOLBOX, ws.options, true)!;
  const toolbox = new ToolboxClass(ws);
  (ws as unknown as {toolbox: Blockly.IToolbox}).toolbox = toolbox;
  toolbox.init();
  Blockly.svgResize(ws);
}
