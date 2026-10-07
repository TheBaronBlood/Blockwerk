// ---------------------------------------------------------------
// Kategorien im Werkzeugkasten: farbiger Balken links, Schrift in der Farbe der Kategorie,
// die gewählte ganz ausgefüllt. Blockly schreibt Rand und Hintergrund sonst direkt an die Zeile;
// hier bekommt sie nur ihre Farbe als `--cat` mit – das Aussehen steht in style.css.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

class Category extends Blockly.ToolboxCategory {
  protected override addColourBorder_(colour: string){
    this.rowDiv_?.style.setProperty('--cat', colour);
  }
  override setSelected(isSelected: boolean){
    if (!this.rowDiv_ || !this.htmlDiv_) return;
    this.rowDiv_.classList.toggle('blocklyToolboxSelected', isSelected);
    Blockly.utils.aria.setState(this.htmlDiv_, Blockly.utils.aria.State.SELECTED, isSelected);
  }
}
Blockly.registry.register(Blockly.registry.Type.TOOLBOX_ITEM, Blockly.ToolboxCategory.registrationName, Category, true);
