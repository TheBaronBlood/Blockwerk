// ---------------------------------------------------------------
// Blockfeld für ein Muster der Lichtmatrix: zeigt das Muster klein auf dem Block und öffnet
// beim Anklicken einen Editor – links das Raster, rechts die Helligkeit, darunter Vorlagen.
// Läuft ohne DOM, solange der Block nicht gezeichnet wird (Tests).
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { DEFAULT_PATTERN, EMPTY, PRESETS, isPattern, setPixel } from './matrix';

const CELL = 5, GAP = 1.5, PAD = 3;
const SIZE = PAD * 2 + CELL * 5 + GAP * 4;
/** Deckkraft eines Punkts: aus ist noch schwach zu sehen, damit das Raster erkennbar bleibt. */
const opacity = (digit: number) => digit === 0 ? 0.2 : 0.35 + 0.65 * digit / 9;

export class FieldMatrix extends Blockly.Field<string> {
  override SERIALIZABLE = true;
  private cells: SVGRectElement[] = [];
  /** Helligkeit, mit der gerade gemalt wird (1–9). */
  private pen = 9;

  constructor(value?: string){
    super(isPattern(value) ? value : DEFAULT_PATTERN);
    this.size_ = new Blockly.utils.Size(SIZE, SIZE);
  }
  static override fromJson(options: Blockly.FieldConfig & {value?: string}){ return new this(options.value); }

  protected override doClassValidation_(value?: unknown): string | null { return isPattern(value) ? value : null; }
  override getText(){ return 'Muster'; }

  protected override initView(){
    this.fieldGroup_!.style.cursor = 'pointer';
    Blockly.utils.dom.createSvgElement(Blockly.utils.Svg.RECT, {x:0, y:0, width:SIZE, height:SIZE, rx:4, fill:'#000', 'fill-opacity':0.22}, this.fieldGroup_);
    this.cells = [];
    for (let i = 0; i < 25; i++){
      this.cells.push(Blockly.utils.dom.createSvgElement(Blockly.utils.Svg.RECT, {
        x:PAD + (i % 5) * (CELL + GAP), y:PAD + Math.floor(i / 5) * (CELL + GAP), width:CELL, height:CELL, rx:1, fill:'#fff'
      }, this.fieldGroup_));
    }
  }
  protected override render_(){
    const value = this.getValue() || EMPTY;
    this.cells.forEach((cell, i) => cell.setAttribute('fill-opacity', String(opacity(Number(value[i])))));
    this.size_ = new Blockly.utils.Size(SIZE, SIZE);
  }

  protected override showEditor_(){
    const block = this.getSourceBlock() as Blockly.BlockSvg;
    Blockly.DropDownDiv.clearContent();
    Blockly.DropDownDiv.getContentDiv().appendChild(this.buildEditor());
    Blockly.DropDownDiv.setColour(block.getColour(), block.getColourTertiary());
    Blockly.DropDownDiv.showPositionedByField(this as unknown as Blockly.Field);
  }

  private buildEditor(): HTMLElement {
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement) => {
      const e = document.createElement(tag); e.className = cls; parent?.appendChild(e); return e;
    };
    const root = el('div', 'mx');
    const top = el('div', 'mx-top', root);

    // Raster: Klick setzt den Punkt auf die gewählte Helligkeit; hat er sie schon, geht er aus.
    // Mit gedrückter Maustaste lässt sich malen.
    const grid = el('div', 'mx-grid', top);
    const pixels: HTMLButtonElement[] = [];
    let painting: number | null = null;   // Helligkeit des laufenden Strichs
    const paint = (i: number) => { if (painting !== null) this.setValue(setPixel(this.getValue() || EMPTY, i, painting)); refresh(); };
    for (let i = 0; i < 25; i++){
      const b = el('button', 'mx-px', grid); b.type = 'button';
      b.setAttribute('aria-label', `Zeile ${Math.floor(i / 5) + 1}, Spalte ${i % 5 + 1}`);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        Blockly.Events.setGroup(true);   // ein gemalter Strich ist ein Schritt für »Rückgängig«
        painting = Number((this.getValue() || EMPTY)[i]) === this.pen ? 0 : this.pen;
        paint(i);
      });
      b.addEventListener('pointerenter', () => paint(i));
      // Tastatur: Leertaste und Eingabe lösen »click« aus, die Maus hat schon bei pointerdown gemalt
      b.addEventListener('click', (e) => { if (e.detail === 0){ painting = Number((this.getValue() || EMPTY)[i]) === this.pen ? 0 : this.pen; paint(i); painting = null; } });
      pixels.push(b);
    }
    const stop = () => { if (painting !== null) Blockly.Events.setGroup(false); painting = null; };
    root.addEventListener('pointerup', stop); root.addEventListener('pointerleave', stop);

    // Helligkeit: oben hell, unten dunkel
    const levels = el('div', 'mx-levels', top);
    levels.setAttribute('role', 'radiogroup'); levels.setAttribute('aria-label', 'Helligkeit');
    const levelButtons: HTMLButtonElement[] = [];
    for (let d = 9; d >= 1; d--){
      const b = el('button', 'mx-level', levels); b.type = 'button';
      b.style.setProperty('--mx-on', String(opacity(d)));
      b.setAttribute('role', 'radio'); b.title = `Helligkeit ${Math.round(d * 100 / 9)} %`;
      b.addEventListener('click', () => { this.pen = d; refresh(); });
      levelButtons[d] = b;
    }

    // Alles an, alles aus und die Vorlagen
    const tools = el('div', 'mx-tools', root);
    const tool = (label: string, pattern: () => string) => {
      const b = el('button', 'mx-tool', tools); b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => { this.setValue(pattern()); refresh(); });
    };
    tool('alle aus', () => EMPTY);
    tool('alle an', () => String(this.pen).repeat(25));
    const presets = el('div', 'mx-presets', root);
    for (const [label, pattern] of PRESETS){
      const b = el('button', 'mx-preset', presets); b.type = 'button'; b.title = label; b.setAttribute('aria-label', label);
      for (let i = 0; i < 25; i++) el('i', pattern[i] === '0' ? '' : 'on', b);
      // die Vorlage erscheint in der gewählten Helligkeit
      b.addEventListener('click', () => { this.setValue(pattern.replace(/9/g, String(this.pen))); refresh(); });
    }

    const refresh = () => {
      const value = this.getValue() || EMPTY;
      pixels.forEach((b, i) => { b.style.setProperty('--mx-on', String(opacity(Number(value[i])))); b.classList.toggle('on', value[i] !== '0'); });
      levelButtons.forEach((b, d) => b?.setAttribute('aria-checked', String(d === this.pen)));
    };
    refresh();
    return root;
  }
}
Blockly.fieldRegistry.register('field_matrix', FieldMatrix);
