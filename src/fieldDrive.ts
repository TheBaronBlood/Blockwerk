// ---------------------------------------------------------------
// Blockfeld für »Fahrbasis einrichten«: zeigt den Roboter von oben – vorn ist oben – und lässt
// sich direkt im Bild einstellen: Anschluss antippen, Rad antippen (Drehrichtung), Maß antippen.
// Das Feld speichert selbst nichts. Die Werte stehen weiter in den unsichtbaren Feldern des
// Blocks (LEFT_PORT, WHEEL, …); Generator, Simulator und gespeicherte Projekte bleiben gleich.
// Läuft ohne DOM, solange der Block nicht gezeichnet wird (Tests).
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

const W = 252, H = 132;
const MID = 64;                               // Höhe der Radmitte
const WHEEL_BLUE = '#2aa9d2', AXLE_ORANGE = '#c2410c', WHEEL_GREEN = '#15803d', GREY = '#aab1bd';
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

    // Roboter von oben mit Stützrad hinten
    svg('rect', {x:54, y:2, width:96, height:128, rx:20, fill:'#fff'}, g);
    svg('rect', {x:74, y:104, width:56, height:10, rx:5, fill:GREY}, g);
    svg('circle', {cx:102, cy:109, r:10, fill:GREY, stroke:'#d5d9e0', 'stroke-width':1.5}, g);

    // Raddurchmesser: zwei Hilfslinien an den Radkanten, dazwischen der Maßpfeil
    svg('path', {d:'M60 34H144M60 94H144', stroke:WHEEL_GREEN, 'stroke-width':2, fill:'none'}, g);
    svg('path', {d:'M76 37V91M71.500 43L76 36.500L80.500 43M71.500 85L76 91.500L80.500 85', stroke:WHEEL_GREEN, 'stroke-width':2, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, g);
    const wheelHit = hit('WHEEL', 'Raddurchmesser ändern');
    svg('rect', {x:84, y:53, width:58, height:22, rx:6, fill:'#fff', stroke:WHEEL_GREEN, 'stroke-width':1.5}, wheelHit);
    this.wheel = text(113, MID, 13, WHEEL_GREEN, wheelHit);

    // Spurbreite: von Radmitte zu Radmitte
    svg('path', {d:'M50 28H154M50 23V33M154 23V33', stroke:AXLE_ORANGE, 'stroke-width':2, fill:'none', 'stroke-linecap':'round'}, g);
    const axleHit = hit('AXLE', 'Spurbreite ändern');
    svg('rect', {x:71, y:5, width:62, height:20, rx:6, fill:'#fff', stroke:AXLE_ORANGE, 'stroke-width':1.5}, axleHit);
    this.axle = text(102, 15, 13, AXLE_ORANGE, axleHit);

    // Räder mit Pfeil und daneben der Anschluss
    const side = (name: Side, wheelX: number, portX: number, label: string) => {
      const wheel = hit(`${name}_DIR`, `Drehrichtung ${label} umkehren`);
      svg('rect', {x:wheelX - 4, y:30, width:28, height:68, fill:'transparent'}, wheel);   // größere Fläche für den Finger
      svg('rect', {x:wheelX, y:34, width:20, height:60, rx:6, fill:WHEEL_BLUE}, wheel);
      const cx = wheelX + 10;
      this.arrows[name] = svg<SVGGElement>('g', {}, wheel);
      svg('path', {d:`M${cx} 84V46M${cx - 5} 52L${cx} 45L${cx + 5} 52`, stroke:'#fff', 'stroke-width':2.6, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, this.arrows[name]!);

      const port = hit(`${name}_PORT`, `Anschluss ${label} wählen`);
      svg('rect', {x:portX - 15, y:MID - 16, width:30, height:32, rx:8, fill:'#000', 'fill-opacity':0.2}, port);
      this.ports[name] = text(portX, MID, 18, '#fff', port);
    };
    side('LEFT', 40, 20, 'links');
    side('RIGHT', 144, 184, 'rechts');

    // Gyrosensor: Kreisel, darunter das Häkchen
    const gyro = hit('GYRO', 'Gyrosensor ein- oder ausschalten');
    svg('rect', {x:206, y:14, width:44, height:104, fill:'transparent'}, gyro);
    this.gyro = svg<SVGGElement>('g', {}, gyro);
    svg('path', {d:'M228 22V74', stroke:'#fff', 'stroke-width':2.4, 'stroke-linecap':'round', fill:'none'}, this.gyro);
    svg('ellipse', {cx:228, cy:48, rx:17, ry:7, stroke:'#fff', 'stroke-width':2.4, fill:'none'}, this.gyro);
    svg('path', {d:'M221 59.500L215 54.500L222.500 51.500', stroke:'#fff', 'stroke-width':2.4, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, this.gyro);
    svg('rect', {x:216, y:88, width:24, height:24, rx:7, fill:'#fff'}, gyro);
    this.check = svg('path', {d:'M221.500 100.500L226.500 105.500L235 95', stroke:'#1f2933', 'stroke-width':3, fill:'none', 'stroke-linecap':'round', 'stroke-linejoin':'round'}, gyro);
  }

  protected override render_(){
    for (const name of ['LEFT', 'RIGHT'] as const){
      if (this.ports[name]) this.ports[name]!.textContent = this.value(`${name}_PORT`);
      const cx = name === 'LEFT' ? 50 : 154;
      const forward = this.value(`${name}_DIR`) === FORWARD[`${name}_DIR`];
      this.arrows[name]?.setAttribute('transform', forward ? '' : `rotate(180 ${cx} ${MID + 1})`);
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
