// ---------------------------------------------------------------
// Blockfeld für »Fahrbasis einrichten«: zeigt den Roboter von oben – vorn ist oben – und lässt
// sich direkt im Bild einstellen: Anschluss antippen, Rad antippen (Drehrichtung), Maß antippen.
// Das Feld speichert selbst nichts. Die Werte stehen weiter in den unsichtbaren Feldern des
// Blocks (LEFT_PORT, WHEEL, …); Generator, Simulator und gespeicherte Projekte bleiben gleich.
// Läuft ohne DOM, solange der Block nicht gezeichnet wird (Tests).
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { COL } from './theme';

const W = 222, H = 190;
const MID = 84;                               // Höhe der Radmitte
const LEFT_X = 17, RIGHT_X = 123, CX = 70;    // Radmitten und Mitte des Roboters
const WHEEL_BLUE = '#2aa9d2', AXLE_YELLOW = COL.event[0], WHEEL_GREEN = COL.op[0], INK = '#475569';
const PORTS = ['A','B','C','D','E','F'];
/** Drehrichtung, bei der das Rad bei üblichem Einbau vorwärts rollt – der linke Motor sitzt gespiegelt. */
const FORWARD = {LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_DIR:'CLOCKWISE'} as const;
type Side = 'LEFT' | 'RIGHT';

const svg = <T extends SVGElement = SVGElement>(tag: string, attrs: Record<string, string | number>, parent: Element) =>
  Blockly.utils.dom.createSvgElement(tag, attrs, parent) as unknown as T;

export class FieldDrive extends Blockly.Field<string> {
  override SERIALIZABLE = false;
  // anklickbar, aber ohne eigenen Wert: gehört nicht ins gespeicherte Projekt
  override isSerializable(){ return false; }
  private ports: Partial<Record<Side, SVGTextElement>> = {};
  private arrows: Partial<Record<Side, SVGGElement>> = {};
  private axle: SVGTextElement | null = null;
  private wheel: SVGTextElement | null = null;
  private gyro: SVGGElement | null = null;
  private check: SVGElement | null = null;
  /** Teil des Bilds, an dem sich der gerade geöffnete Editor ausrichtet. */
  private anchor: Element | null = null;

  constructor(){
    super(Blockly.Field.SKIP_SETUP);
    this.size_ = new Blockly.utils.Size(W, H);
  }
  static override fromJson(){ return new this(); }
  override getText(){ return ''; }

  private value(name: string){ return String(this.getSourceBlock()?.getFieldValue(name) ?? ''); }
  private set(name: string, value: string | number){ this.getSourceBlock()?.setFieldValue(value, name); this.forceRerender(); }

  protected override initView(){
    const g = this.fieldGroup_!;
    /** Anklickbarer Teil des Bilds; `part` sagt showEditor_, was gemeint ist. */
    const hit = (part: string, title: string) => {
      const group = svg<SVGGElement>('g', {'data-part':part, class:'fd-hit'}, g);
      svg('title', {}, group).textContent = title;
      return group;
    };
    const text = (x: number, y: number, size: number, fill: string, parent: Element) =>
      svg<SVGTextElement>('text', {x, y, 'text-anchor':'middle', 'dominant-baseline':'central', class:'fd-text', style:`fill:${fill};font-size:${size}px`}, parent);

    // Roboter von oben. Im Roboter steht nur, was zu ihm gehört – Anschlüsse
    // und Gyrosensor; die beiden Maße liegen wie in einer Zeichnung außen.
    svg('rect', {x:22, y:40, width:96, height:148, rx:22, fill:'#fff'}, g);

    // Spurbreite: über dem Roboter, von Radmitte zu Radmitte
    svg('path', {d:`M${LEFT_X} 36V50M${RIGHT_X} 36V50`, stroke:AXLE_YELLOW, 'stroke-width':1.5, 'stroke-dasharray':'3 3', fill:'none'}, g);
    svg('path', {d:`M${LEFT_X} 30H${RIGHT_X}M${LEFT_X} 24V36M${RIGHT_X} 24V36`, stroke:AXLE_YELLOW, 'stroke-width':2, fill:'none', 'stroke-linecap':'round'}, g);
    const axleHit = hit('AXLE', 'Spurbreite ändern');
    svg('rect', {x:CX - 34, y:1, width:68, height:22, rx:7, fill:AXLE_YELLOW}, axleHit);
    this.axle = text(CX, 12, 14, '#fff', axleHit);

    // Raddurchmesser: rechts neben dem Rad
    svg('path', {d:'M138 52H156M138 116H156', stroke:WHEEL_GREEN, 'stroke-width':2, fill:'none', 'stroke-linecap':'round'}, g);
    svg('path', {d:'M150 56V112M145.500 62L150 55L154.500 62M145.500 106L150 113L154.500 106', stroke:WHEEL_GREEN, 'stroke-width':2, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, g);
    const wheelHit = hit('WHEEL', 'Raddurchmesser ändern');
    svg('rect', {x:160, y:MID - 11, width:60, height:22, rx:7, fill:WHEEL_GREEN}, wheelHit);
    this.wheel = text(190, MID, 14, '#fff', wheelHit);

    // Räder mit Pfeil, innen daneben der Anschluss
    const side = (name: Side, cx: number, portX: number, label: string) => {
      const wheel = hit(`${name}_DIR`, `Drehrichtung ${label} umkehren`);
      svg('rect', {x:cx - 15, y:48, width:30, height:72, fill:'transparent'}, wheel);   // größere Fläche für den Finger
      svg('rect', {x:cx - 11, y:52, width:22, height:64, rx:7, fill:WHEEL_BLUE}, wheel);
      this.arrows[name] = svg<SVGGElement>('g', {}, wheel);
      svg('path', {d:`M${cx} 104V65M${cx - 5} 71L${cx} 64L${cx + 5} 71`, stroke:'#fff', 'stroke-width':2.6, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, this.arrows[name]!);

      const port = hit(`${name}_PORT`, `Anschluss ${label} wählen`);
      svg('rect', {x:portX - 15, y:MID - 16, width:30, height:32, rx:8, fill:WHEEL_BLUE}, port);
      this.ports[name] = text(portX, MID, 18, '#fff', port);
    };
    side('LEFT', LEFT_X, 49, 'links');
    side('RIGHT', RIGHT_X, 91, 'rechts');

    // Gyrosensor sitzt im Hub: Kreisel und darunter das Häkchen
    const gyro = hit('GYRO', 'Gyrosensor ein- oder ausschalten');
    svg('rect', {x:44, y:108, width:52, height:68, fill:'transparent'}, gyro);
    this.gyro = svg<SVGGElement>('g', {}, gyro);
    svg('path', {d:'M70 111V145', stroke:INK, 'stroke-width':2.2, 'stroke-linecap':'round', fill:'none'}, this.gyro);
    svg('ellipse', {cx:CX, cy:128, rx:15, ry:6.5, stroke:INK, 'stroke-width':2.2, fill:'none'}, this.gyro);
    svg('path', {d:'M65 138L59 133.500L66 130.500', stroke:INK, 'stroke-width':2.2, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, this.gyro);
    svg('rect', {x:59, y:151, width:22, height:22, rx:6, fill:'#fff', stroke:INK, 'stroke-width':2}, gyro);
    this.check = svg('path', {d:'M64 162.500L68.500 167L76 157.500', stroke:INK, 'stroke-width':3, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, gyro);
  }

  protected override render_(){
    for (const name of ['LEFT', 'RIGHT'] as const){
      if (this.ports[name]) this.ports[name]!.textContent = this.value(`${name}_PORT`);
      const cx = name === 'LEFT' ? LEFT_X : RIGHT_X;
      const forward = this.value(`${name}_DIR`) === FORWARD[`${name}_DIR`];
      this.arrows[name]?.setAttribute('transform', forward ? '' : `rotate(180 ${cx} ${MID})`);
    }
    if (this.axle) this.axle.textContent = `${this.value('AXLE')} mm`;
    if (this.wheel) this.wheel.textContent = `${this.value('WHEEL')} mm`;
    const gyro = this.value('GYRO') === 'TRUE';
    this.gyro?.setAttribute('opacity', gyro ? '1' : '0.4');
    this.check?.setAttribute('visibility', gyro ? 'visible' : 'hidden');
    this.size_ = new Blockly.utils.Size(W, H);
  }

  /** Der Editor hängt am angetippten Teil, nicht am ganzen Bild. */
  override getScaledBBox(){
    if (!this.anchor) return super.getScaledBBox();
    const r = this.anchor.getBoundingClientRect();
    return new Blockly.utils.Rect(r.top, r.bottom, r.left, r.right);
  }

  protected override showEditor_(e?: Event){
    const part = (e?.target as Element | null)?.closest?.('[data-part]');
    const name = part?.getAttribute('data-part');
    if (!part || !name) return;
    if (name === 'GYRO') return this.set('GYRO', this.value('GYRO') === 'TRUE' ? 'FALSE' : 'TRUE');
    if (name === 'LEFT_DIR' || name === 'RIGHT_DIR') return this.set(name, this.value(name) === 'CLOCKWISE' ? 'COUNTERCLOCKWISE' : 'CLOCKWISE');

    const block = this.getSourceBlock() as Blockly.BlockSvg;
    const content = name === 'WHEEL' ? this.numberEditor(name, 'Raddurchmesser')
      : name === 'AXLE' ? this.numberEditor(name, 'Spurbreite')
      : this.portEditor(name);
    Blockly.DropDownDiv.clearContent();
    Blockly.DropDownDiv.getContentDiv().appendChild(content);
    Blockly.DropDownDiv.setColour(block.getColour(), block.getColourTertiary());
    this.anchor = part;
    Blockly.DropDownDiv.showPositionedByField(this as unknown as Blockly.Field);
    this.anchor = null;
    content.querySelector('input')?.select();
  }

  private portEditor(name: string): HTMLElement {
    const root = document.createElement('div'); root.className = 'fd-ports';
    for (const p of PORTS){
      const b = document.createElement('button'); b.type = 'button'; b.className = 'fd-port'; b.textContent = p;
      b.setAttribute('aria-pressed', String(p === this.value(name)));
      b.addEventListener('click', () => { this.set(name, p); Blockly.DropDownDiv.hideIfOwner(this as unknown as Blockly.Field); });
      root.appendChild(b);
    }
    return root;
  }

  private numberEditor(name: string, label: string): HTMLElement {
    const root = document.createElement('label'); root.className = 'fd-num';
    root.append(label + ' ');
    const input = document.createElement('input');
    input.type = 'number'; input.min = '1'; input.inputMode = 'decimal'; input.value = this.value(name);
    root.append(input, ' mm');
    // ungültige Eingaben fängt das Zahlenfeld des Blocks ab
    // alles Getippte ist ein Schritt für »Rückgängig«
    const group = Blockly.utils.idGenerator.genUid();
    const apply = () => {
      if (input.value.trim() === '') return;
      Blockly.Events.setGroup(group);
      this.set(name, Number(input.value));
      Blockly.Events.setGroup(false);
    };
    input.addEventListener('input', apply);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'Escape') Blockly.DropDownDiv.hideIfOwner(this as unknown as Blockly.Field); e.stopPropagation(); });
    return root;
  }
}
Blockly.fieldRegistry.register('field_drive', FieldDrive);
