// ---------------------------------------------------------------
// Simulator – die Ansicht: Bahn, Roboter und Hindernisse von oben, daneben der Hub, dazu Start,
// Stopp und die Einstellungen. Roboter und Hindernisse lassen sich mit dem Zeiger verschieben,
// der Roboter am Punkt vor ihm drehen, ein Hindernis an seiner Ecke in der Größe ändern.
// »Umbauen« zeigt den Roboter groß mit der Nase nach oben; dort lassen sich seine Sensoren
// versetzen (build.ts).
// Gerechnet wird in simulation.ts und runner.ts; hier wird nur gezeichnet und bedient.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { GRID_MM, mirrorPartner, MOUNT_AREA, placeSensor, type BuildOptions } from './build';
import { BODY, BUMPER, COLOR_SPOT, defaultMounts, describeRobot, robotFromWorkspace, ULTRA } from './robot';
import { Runner } from './runner';
import { Simulation } from './simulation';
import { forward, toWorld, type Obstacle, type Point, type Pose } from './world';

export interface SimViewOptions {
  ws: Blockly.WorkspaceSvg;
  /** Schreibt ins Terminal; `cls` wie dort üblich (»t-info«, »t-err«, »t-hint«). */
  print(text: string, cls?: string): void;
  toast(message: string): void;
  /** Markiert den Block, an dem das Programm gescheitert ist. */
  showBlock(id: string): void;
  /** Stand des Steuerfelds: Joystick (x, y) und Tasten (A–D). */
  pad(name: string): number | boolean;
  /** Ob Blockwerk gerade Klänge abspielt (Einstellungen). */
  soundOn(): boolean;
  /** Ein Programm startet im Simulator. */
  onStart(): void;
}
export interface SimView {
  /** Das Programm hat sich geändert: Der Roboter wird neu aus den Blöcken gelesen. */
  programChanged(): void;
  /** Die Ansicht ist jetzt zu sehen (oder nicht mehr). */
  setShown(shown: boolean): void;
}

/** Größe der Bahn, mit der der Simulator beginnt, und Breite ihrer Linie (ein Bildpunkt ist ein Millimeter). */
const START_TRACK = {width:1200, height:800, line:20, inset:150, radius:200};
/** Ein geladenes Bild wird auf diese Kantenlänge verkleinert – mehr sieht der Sensor ohnehin nicht. */
const MAX_TRACK_PX = 1600;
/** Abstand des Drehpunkts vor dem Roboter und die Größe der Anfasser, in Bildschirmpunkten. */
const TURN_HANDLE_MM = 150, HANDLE_PX = 9;
const MIN_OBSTACLE = 20;
/** So viel Platz braucht der Hub in seiner Ecke unten links – die Bahn liegt daneben oder darüber. */
const HUB_LANE = {w:112, h:146};
/** Beim Umbauen füllt der Roboter die Ansicht: so viele Millimeter sind zu sehen, um diesen Punkt am Roboter. */
const BUILD_SPAN_MM = 340, BUILD_CENTER: Point = {x:32, y:0};
/** Hier merkt sich der Simulator, wie der Roboter gebaut ist: versetzte Sensoren, seine Größe, Raster und Symmetrie. */
const STORE_KEY = 'blockwerk-sim-v1';
/** Geschütztes Leerzeichen: hält Zahl und Einheit in einer Zeile zusammen. */
const NB = String.fromCharCode(160);

/** Die Bahn für den Anfang: eine schwarze Linie als Rundkurs. */
function startTrack(): HTMLCanvasElement {
  const {width, height, line, inset, radius} = START_TRACK;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, width, height);
  g.strokeStyle = '#000'; g.lineWidth = line;
  g.beginPath(); g.roundRect(inset, inset, width - 2 * inset, height - 2 * inset, radius); g.stroke();
  return canvas;
}

/**
 * Doppelklick, der auch mit dem Finger geht: zweimal kurz hintereinander an derselben Stelle
 * getippt, ohne dazwischen zu ziehen. (Auf manchen Tablets kommt »dblclick« gar nicht an.)
 */
function onDoubleTap(target: HTMLElement, handler: (e: PointerEvent) => void){
  let down: Point | null = null, last = {time:-1e9, x:0, y:0};
  target.addEventListener('pointerdown', (e) => { down = {x:e.clientX, y:e.clientY}; });
  target.addEventListener('pointerup', (e) => {
    const tapped = !!down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10;
    down = null;
    if (!tapped){ last.time = -1e9; return; }
    const again = e.timeStamp - last.time < 400 && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 30;
    last = {time:again ? -1e9 : e.timeStamp, x:e.clientX, y:e.clientY};
    if (again) handler(e);
  });
}

type Drag = {kind: 'sensor'; port: string} | {kind: 'robot'; dx: number; dy: number} | {kind: 'turn'} | {kind: 'move'; o: Obstacle; dx: number; dy: number} | {kind: 'size'; o: Obstacle};

export function initSimView(root: HTMLElement, opts: SimViewOptions): SimView {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const canvas = el<HTMLCanvasElement>('simCanvas'), stage = canvas.parentElement!, g = canvas.getContext('2d')!;
  const btnRun = el<HTMLButtonElement>('simRun'), info = el('simInfo'), values = el('simValues');
  const scaleInput = el<HTMLInputElement>('simScale'), fileInput = el<HTMLInputElement>('simFile');
  const gridInput = el<HTMLInputElement>('simGrid'), symmetryInput = el<HTMLInputElement>('simSymmetry');
  /** Mit dem Finger trifft man weniger genau: Die Anfasser sind dann großzügiger. */
  const reach = matchMedia('(pointer:coarse)').matches ? 1.7 : 1;

  const sim = new Simulation(robotFromWorkspace(opts.ws));
  let trackImage: HTMLCanvasElement = startTrack();
  let runner: Runner | null = null;
  let home: Pose;                 // dorthin stellt »Zurück« den Roboter
  let activeBlock: string | null = null;
  let shown = false;
  let nextObstacle = 1;
  let building = false;           // Umbauen: der Roboter groß, seine Sensoren lassen sich versetzen
  let tempo = 1;                  // Zeitlupe und Zeitraffer
  let drag: Drag | null = null;
  const build: BuildOptions = {grid:true, symmetry:true};

  // Wie der Roboter gebaut ist, bleibt über das Neuladen hinweg
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as {mounts?: Record<string, Point>; scale?: number; grid?: boolean; symmetry?: boolean};
    if (stored.mounts && typeof stored.mounts === 'object') sim.mounts = stored.mounts;
    if (typeof stored.scale === 'number' && stored.scale > 0){ sim.scale = stored.scale; scaleInput.value = String(stored.scale); }
    if (typeof stored.grid === 'boolean') build.grid = stored.grid;
    if (typeof stored.symmetry === 'boolean') build.symmetry = stored.symmetry;
  } catch { /* ohne Speicher beginnt der Roboter, wie er ist */ }
  gridInput.checked = build.grid; symmetryInput.checked = build.symmetry;
  const remember = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({mounts:sim.mounts, scale:sim.scale, ...build})); } catch { /* gilt dann bis zum Neuladen */ } };
  /** Alle Sensoren, die der Roboter laut Programm hat (Anschlüsse). */
  const sensorPorts = () => [...sim.robot.colors, ...(sim.robot.ultra ? [sim.robot.ultra] : []), ...sim.robot.force];

  // ---- Ton ----
  let audio: AudioContext | null = null;
  function beep(frequency: number, ms: number){
    if (!opts.soundOn() || !(ms > 0)) return;
    try {
      audio ??= new AudioContext();
      const tone = audio.createOscillator(), volume = audio.createGain();
      tone.type = 'square'; tone.frequency.value = Math.max(40, Math.min(12000, frequency));
      volume.gain.value = 0.05;
      tone.connect(volume).connect(audio.destination);
      tone.start(); tone.stop(audio.currentTime + ms / 1000 / tempo);
    } catch { /* ohne Tonausgabe bleibt es still */ }
  }

  // ---- Hub: Lichtmatrix, Statuslicht und Tasten ----
  const LIGHTS: Record<string, string> = {GREEN:'#00B94D', RED:'#DA3041', BLUE:'#0082DD', YELLOW:'#FFD945', WHITE:'#FFFFFF'};
  const hub = el('simHub'), matrix = el('simMatrix'), center = el('simHubCenter');
  const dots = Array.from({length:25}, () => matrix.appendChild(document.createElement('i')));
  let shownHub = '';
  function drawHub(){
    const now = sim.display.join() + sim.light;
    if (now === shownHub) return;
    shownHub = now;
    dots.forEach((dot, i) => dot.style.setProperty('--on', String(sim.display[i] / 100)));
    if (sim.light) center.style.setProperty('--light', LIGHTS[sim.light] ?? '#fff'); else center.style.removeProperty('--light');
  }
  /** Ein Knopf zum Gedrückthalten. Ein kurzer Tipp soll nicht zwischen zwei Bildern verloren gehen: Er bleibt einen Moment gedrückt. */
  function holdButton(button: HTMLElement, set: (down: boolean) => void){
    button.addEventListener('pointerdown', (e) => {
      set(true); button.classList.add('on');
      try { button.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
    });
    const release = () => setTimeout(() => { set(false); button.classList.remove('on'); }, 80);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }
  for (const button of root.querySelectorAll<HTMLElement>('[data-hub]')){
    const name = button.dataset.hub!;
    holdButton(button, (down) => { if (down) sim.buttons.add(name); else sim.buttons.delete(name); });
  }
  // die mittlere Taste startet das Programm und beendet es, wie am echten Hub
  center.addEventListener('click', () => { if (runner) finish(runner, '— Programm mit der mittleren Taste beendet —'); else void start(); });
  // Doppelklick auf den Hub (nicht auf seine Tasten): nur noch der Hub, groß – und wieder zurück
  onDoubleTap(hub, (e) => {
    if ((e.target as Element).closest('button')) return;
    if (building) setBuilding(false);
    const only = root.classList.toggle('hub-only');
    hub.title = only ? 'Doppelklick: zurück zur Bahn' : 'Doppelklick: nur den Hub zeigen';
    if (!only) layout();
  });

  function useTrack(image: HTMLCanvasElement, pose: Pose){
    trackImage = image;
    sim.track = {width:image.width, height:image.height, data:image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data};
    sim.pose = pose; home = {...pose};
    sim.obstacles = [];
  }
  // Start: unten auf dem Rundkurs, der mittlere Sensor über der inneren Kante der Linie
  useTrack(trackImage, {x:START_TRACK.width / 2 - 200, y:START_TRACK.height - START_TRACK.inset - START_TRACK.line / 2, heading:0});

  // ---- Zeichnen ----
  /** Bildschirmpunkte je Einheit der Bahn. */
  let k = 1;
  /** Von der Bahn auf den Bildschirm und zurück. Beim Umbauen ist die Bahn gedreht: Die Nase des Roboters zeigt nach oben. */
  let toScreen = new DOMMatrix(), toTrack = new DOMMatrix();
  function layout(){
    const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    // Der Hub liegt unten links. Die Bahn bekommt den Platz neben ihm oder über ihm – je nachdem, wo sie größer wird.
    const beside = {x:HUB_LANE.w, y:0, w:Math.max(w - HUB_LANE.w, 40), h}, above = {x:0, y:0, w, h:Math.max(h - HUB_LANE.h, 40)};
    const fit = (a: typeof beside) => building ? Math.min(a.w, a.h) : Math.min(a.w / trackImage.width, a.h / trackImage.height);
    const area = fit(beside) >= fit(above) ? beside : above;
    if (building){
      k = fit(area) / (BUILD_SPAN_MM * sim.scale);
      const mid = toWorld(sim.pose, sim.scale, BUILD_CENTER);
      toScreen = new DOMMatrix().translate(area.x + area.w / 2, area.y + area.h / 2).scale(k).rotate(-90 - sim.pose.heading).translate(-mid.x, -mid.y);
    } else {
      k = fit(area) * 0.96;
      toScreen = new DOMMatrix().translate(area.x + (area.w - trackImage.width * k) / 2, area.y + (area.h - trackImage.height * k) / 2).scale(k);
    }
    toTrack = toScreen.inverse();
    draw();
  }
  const turnHandle = () => toWorld(sim.pose, sim.scale, {x:TURN_HANDLE_MM, y:0});
  const sizeHandle = (o: Obstacle): Point => ({x:o.x + o.w / 2, y:o.y + o.h / 2});
  const circle = (x: number, y: number, r: number) => { g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); };

  let shownValues = '';
  function draw(){
    if (!shown) return;
    const dpr = window.devicePixelRatio || 1, {robot} = sim, m = toScreen;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    g.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    const px = 1 / k;   // ein Bildschirmpunkt in Einheiten der Bahn
    g.drawImage(trackImage, 0, 0);
    g.lineWidth = 2 * px; g.strokeStyle = 'rgba(255,255,255,.25)'; g.strokeRect(0, 0, trackImage.width, trackImage.height);

    for (const o of sim.obstacles){
      g.fillStyle = '#E67E17'; g.strokeStyle = '#8A4500'; g.lineWidth = 2 * px;
      g.beginPath(); g.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); g.fill(); g.stroke();
      if (building) continue;
      const h = sizeHandle(o), size = HANDLE_PX * px;
      g.fillStyle = '#fff'; g.fillRect(h.x - size / 2, h.y - size / 2, size, size); g.strokeRect(h.x - size / 2, h.y - size / 2, size, size);
    }

    // der Roboter: ab hier in Millimetern am Roboter, x nach vorn
    g.save();
    g.translate(sim.pose.x, sim.pose.y); g.rotate(sim.pose.heading * Math.PI / 180); g.scale(sim.scale, sim.scale);
    if (building){
      // die Fläche, auf der Sensoren sitzen dürfen, mit dem Raster der Noppen und der Mittellinie
      const A = MOUNT_AREA, mm = px / sim.scale;
      g.fillStyle = 'rgba(255,255,255,.86)'; g.fillRect(A.back, -A.side, A.front - A.back, 2 * A.side);
      if (build.grid){
        g.beginPath();
        for (let x = A.back; x <= A.front; x += GRID_MM){ g.moveTo(x, -A.side); g.lineTo(x, A.side); }
        for (let y = -A.side; y <= A.side; y += GRID_MM){ g.moveTo(A.back, y); g.lineTo(A.front, y); }
        g.strokeStyle = 'rgba(0,130,221,.2)'; g.lineWidth = mm; g.stroke();
      }
      g.strokeStyle = 'rgba(0,130,221,.55)'; g.lineWidth = 1.5 * mm; g.strokeRect(A.back, -A.side, A.front - A.back, 2 * A.side);
      if (build.symmetry){
        g.setLineDash([7 * mm, 5 * mm]); g.strokeStyle = '#E644B9'; g.lineWidth = 2 * mm;
        g.beginPath(); g.moveTo(A.back, 0); g.lineTo(A.front, 0); g.stroke(); g.setLineDash([]);
      }
    }
    g.restore();

    // Kegel des Abstandssensors: reicht bis zum Hindernis, das er sieht – sonst bis zum Ende seiner Reichweite
    if (robot.ultra){
      const from = sim.ultraPoint(), seen = sim.ultrasonic(robot.ultra), hit = seen < ULTRA.nothing;
      const a = sim.pose.heading * Math.PI / 180, half = ULTRA.halfAngle * Math.PI / 180;
      g.beginPath(); g.moveTo(from.x, from.y); g.arc(from.x, from.y, (hit ? seen : ULTRA.range) * sim.scale, a - half, a + half); g.closePath();
      g.fillStyle = hit ? 'rgba(218,48,65,.28)' : 'rgba(44,173,205,.16)'; g.fill();
      g.strokeStyle = hit ? '#DA3041' : 'rgba(44,173,205,.6)'; g.lineWidth = 1.5 * px; g.stroke();
    }

    g.save();
    g.translate(sim.pose.x, sim.pose.y); g.rotate(sim.pose.heading * Math.PI / 180); g.scale(sim.scale, sim.scale);
    const axle = robot.drive?.axle ?? 112, wheel = robot.drive?.wheel ?? 56, half = Math.max(BODY.minWidth, axle - 30) / 2;
    if (robot.drive){
      g.fillStyle = '#22252B';
      for (const side of [-1, 1]){ g.beginPath(); g.roundRect(-wheel / 2, side * axle / 2 - 9, wheel, 18, 5); g.fill(); }
    }
    g.fillStyle = sim.blocked ? '#FFB515' : '#FFD945'; g.strokeStyle = '#5E4B00'; g.lineWidth = 2;
    g.beginPath(); g.roundRect(BODY.back, -half, BODY.front - BODY.back, 2 * half, 10); g.fill(); g.stroke();
    // Pfeil: Hier ist vorn
    g.fillStyle = '#5E4B00'; g.beginPath(); g.moveTo(BODY.front - 12, 0); g.lineTo(BODY.front - 34, -14); g.lineTo(BODY.front - 34, 14); g.closePath(); g.fill();
    // einzelne Motoren (ein Greifarm etwa): eine Scheibe mit Zeiger, die sich mitdreht
    robot.motors.forEach((port, i) => {
      const y = (i - (robot.motors.length - 1) / 2) * 34, a = sim.motor(port).angle * Math.PI / 180;
      g.fillStyle = '#0082DD'; circle(BODY.back + 24, y, 14); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(BODY.back + 24, y); g.lineTo(BODY.back + 24 + 11 * Math.cos(a), y + 11 * Math.sin(a)); g.stroke(); g.lineCap = 'butt';
    });
    const ultraAt = robot.ultra && sim.mount(robot.ultra);
    if (ultraAt){ g.fillStyle = '#2CADCD'; g.beginPath(); g.roundRect(ultraAt.x - 8, ultraAt.y - 22, 12, 44, 4); g.fill(); }
    for (const port of robot.force){
      const at = sim.mount(port)!;
      g.fillStyle = sim.forcePressed(port) ? '#FF8A95' : '#DA3041'; g.beginPath(); g.roundRect(at.x - 6, at.y - 12, 12, 24, 4); g.fill();
    }
    g.restore();

    // Farbsensoren: gefüllt mit dem, was sie gerade sehen
    sim.colorPoints().forEach((p, i) => {
      const light = Math.round(sim.reflection(robot.colors[i]) * 2.55);
      circle(p.x, p.y, Math.max(COLOR_SPOT * sim.scale, 4 * px));
      g.fillStyle = `rgb(${light},${light},${light})`; g.fill();
      g.strokeStyle = '#19D1E5'; g.lineWidth = 2 * px; g.stroke();
    });

    const parts: string[] = [];
    if (building){
      // Beim Umbauen hat jeder Sensor einen Ring zum Anfassen und ein Schild mit seinem Anschluss. Gezeichnet
      // wird das in Bildschirmpunkten – die Schrift soll gerade stehen, auch wenn die Bahn gedreht ist.
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const moving = drag?.kind === 'sensor' ? drag.port : null, mirrored = moving && build.symmetry ? mirrorPartner(robot, moving) : null;
      g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const port of sensorPorts()){
        const s = toScreen.transformPoint(sim.sensorPoint(port)!), active = port === moving || port === mirrored;
        circle(s.x, s.y, 13); g.strokeStyle = active ? '#E644B9' : 'rgba(22,23,29,.5)'; g.lineWidth = active ? 3 : 1.5; g.stroke();
        // Farbsensoren tragen das Schild vor sich, der Abstandssensor links, Kraftsensoren rechts – so überdecken sie sich nicht
        const [dx, dy] = robot.colors.includes(port) ? [0, -27] : port === robot.ultra ? [-29, 0] : [29, 0];
        circle(s.x + dx, s.y + dy, 10); g.fillStyle = active ? '#E644B9' : '#16171D'; g.fill();
        g.fillStyle = '#fff'; g.fillText(port, s.x + dx, s.y + dy + 0.5);
      }
      const at = moving && sim.mount(moving);
      if (at) parts.push(`Sensor ${moving}: ${at.x} mm vor der Achse, ${at.y ? `${Math.abs(at.y)} mm ${at.y < 0 ? 'links' : 'rechts'}` : 'mittig'}`);
      else parts.push(sensorPorts().length ? 'Sensor ziehen – zweimal antippen setzt ihn zurück' : 'Das Programm benutzt noch keinen Sensor, den man versetzen könnte');
    } else {
      // Anfasser zum Drehen
      const t = turnHandle();
      g.setLineDash([4 * px, 4 * px]); g.strokeStyle = 'rgba(25,209,229,.7)'; g.lineWidth = 1.5 * px;
      g.beginPath(); g.moveTo(sim.pose.x, sim.pose.y); g.lineTo(t.x, t.y); g.stroke(); g.setLineDash([]);
      circle(t.x, t.y, HANDLE_PX * px * 0.7); g.fillStyle = '#19D1E5'; g.fill();
    }

    for (const p of robot.colors) parts.push(`Farbsensor ${p}: ${sim.reflection(p)} %`);
    if (robot.ultra) parts.push(`Abstand ${robot.ultra}: ${sim.ultrasonic(robot.ultra)} mm`);
    for (const p of robot.force) parts.push(`Kraftsensor ${p}: ${sim.forcePressed(p) ? 'gedrückt' : 'frei'}`);
    for (const p of robot.motors) parts.push(`Motor ${p}: ${Math.round(sim.motor(p).angle)}°`);
    if (runner) parts.push(`Zeit: ${(sim.time / 1000).toFixed(1).replace('.', ',')} s`);
    if (sim.blocked) parts.push('steht am Hindernis an');
    // umbrochen wird nur zwischen den Angaben – Zahl und Einheit bleiben zusammen
    const text = parts.map(part => part.replace(/ /g, NB)).join(' · ');
    if (text !== shownValues) values.textContent = shownValues = text;
    drawHub();
  }

  // ---- Roboter aus dem Programm ----
  const forceBox = el('simForce');
  let forceShown = '';
  /** Je Kraftsensor ein Knopf zum Drücken von Hand. */
  function forceButtons(){
    const ports = sim.robot.force.join();
    if (ports === forceShown) return;
    forceShown = ports; forceBox.textContent = ''; sim.forceHeld.clear();
    for (const port of sim.robot.force){
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn'; button.textContent = 'Kraftsensor ' + port; button.title = 'Gedrückt halten: drückt den Kraftsensor';
      holdButton(button, (down) => { if (down) sim.forceHeld.add(port); else sim.forceHeld.delete(port); draw(); });
      forceBox.appendChild(button);
    }
  }
  function readRobot(){
    sim.robot = robotFromWorkspace(opts.ws);
    forceButtons();
    info.textContent = 'Roboter laut Programm: ' + describeRobot(sim.robot) + (sim.robot.notes.length ? ' – ' + sim.robot.notes.join(' ') : '');
    draw();
  }

  // ---- Umbauen ----
  const btnBuild = el('simBuild');
  function setBuilding(on: boolean){
    building = on; drag = null;
    root.classList.toggle('building', on);
    btnBuild.setAttribute('aria-pressed', String(on));
    btnBuild.textContent = on ? 'Fertig' : 'Umbauen';
    layout();
  }
  btnBuild.addEventListener('click', () => {
    if (!building && runner) finish(runner, '— Simulation angehalten —');
    setBuilding(!building);
  });
  gridInput.addEventListener('change', () => { build.grid = gridInput.checked; remember(); draw(); });
  symmetryInput.addEventListener('change', () => { build.symmetry = symmetryInput.checked; remember(); draw(); });
  el('simMountsReset').addEventListener('click', () => { sim.mounts = {}; remember(); draw(); });

  // ---- Laufen lassen ----
  function finish(mine: Runner, message: string | null){
    if (runner !== mine) return;
    runner = null;
    mine.stop();
    opts.ws.highlightBlock(null);
    btnRun.textContent = '▶ Start'; btnRun.classList.add('primary');
    if (mine.ignored.size) opts.print('→ Der Simulator hat Blöcke übersprungen, die er nicht nachbilden kann (Erweiterungen, Xbox-Controller, Fernbedienung).\n', 't-hint');
    if (message) opts.print(message + '\n', 't-info');
    readRobot();
  }
  el<HTMLSelectElement>('simSpeed').addEventListener('change', (e) => { tempo = Number((e.target as HTMLSelectElement).value) || 1; });

  async function start(){
    if (building) setBuilding(false);
    readRobot();
    home = {...sim.pose};
    const mine: Runner = runner = new Runner(opts.ws, sim, {
      print:(text) => opts.print(text),
      beep, pad:(name) => opts.pad(name),
      onBlock:(id) => { activeBlock = id; },
      error:(message, blockId) => {
        opts.print(message + '\n', 't-err');
        if (blockId) opts.showBlock(blockId);
        opts.toast('Fehler im Programm – siehe Terminal.');
      }
    });
    btnRun.textContent = '■ Stopp'; btnRun.classList.remove('primary');
    activeBlock = null;
    opts.print('— Simulation gestartet —\n', 't-info');
    opts.onStart();
    await mine.start();
    if (!mine.tasks) opts.print('→ Unter »wenn Programm startet« hängt kein Block – es gibt nichts auszuführen.\n', 't-hint');
    else if (!sim.robot.drive) opts.print('→ Das Programm benutzt weder Fahrblöcke noch zwei Motoren: Der Roboter im Simulator hat keine Räder und bleibt stehen.\n', 't-hint');
    let last = performance.now(), highlighted: string | null = null;
    const frame = async (now: number) => {
      if (runner !== mine) return;
      // ein Fenster im Hintergrund holt die verpasste Zeit nicht in einem Sprung nach
      const ms = Math.min(now - last, 100); last = now;
      await mine.advance(ms * tempo);
      if (runner !== mine) return;
      if (activeBlock !== highlighted) opts.ws.highlightBlock(highlighted = activeBlock);
      draw();
      if (mine.running) requestAnimationFrame(frame); else finish(mine, '— Simulation beendet —');
    };
    requestAnimationFrame(frame);
  }
  btnRun.addEventListener('click', () => { if (runner) finish(runner, '— Simulation angehalten —'); else void start(); });
  el('simReset').addEventListener('click', () => {
    if (runner) finish(runner, '— Simulation angehalten —');
    sim.pose = {...home}; sim.blocked = false; draw();
  });

  // ---- Einstellen ----
  scaleInput.addEventListener('input', () => { sim.scale = Number(scaleInput.value); remember(); if (building) layout(); else draw(); });
  el('simObstacle').addEventListener('click', () => {
    // vor den Roboter, damit man es sieht – und der Abstandssensor auch
    const at = toWorld(sim.pose, sim.scale, {x:350, y:0}), size = 120 * sim.scale;
    sim.obstacles.push({id:nextObstacle++, x:at.x, y:at.y, w:size, h:size});
    draw();
  });
  el('simImage').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0]; fileInput.value = '';
    if (!file) return;
    try {
      const bitmap = await createImageBitmap(file), shrink = Math.min(1, MAX_TRACK_PX / Math.max(bitmap.width, bitmap.height));
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.round(bitmap.width * shrink)); image.height = Math.max(1, Math.round(bitmap.height * shrink));
      const ctx = image.getContext('2d')!;
      // durchsichtige Stellen eines Bildes sind weißer Tisch
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, image.width, image.height);
      ctx.drawImage(bitmap, 0, 0, image.width, image.height);
      if (runner) finish(runner, '— Simulation angehalten —');
      useTrack(image, {x:image.width / 2, y:image.height / 2, heading:0});
      layout();
      opts.toast('Bahn geladen. Zieh den Roboter auf die Linie und stell seine Größe ein.');
    } catch (err){ console.error(err); opts.toast('Dieses Bild lässt sich nicht als Bahn laden.'); }
  });

  // ---- Zeiger: verschieben, drehen, Größe ändern, Sensoren versetzen ----
  const world = (e: PointerEvent): Point => {
    const r = canvas.getBoundingClientRect(), p = toTrack.transformPoint({x:e.clientX - r.left, y:e.clientY - r.top});
    return {x:p.x, y:p.y};
  };
  const near = (a: Point, b: Point, px: number) => Math.hypot(a.x - b.x, a.y - b.y) <= px * reach / k;
  const inside = (o: Obstacle, p: Point) => Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.y - o.y) <= o.h / 2;
  /** Der Sensor unter dem Zeiger (beim Umbauen). */
  const sensorAt = (p: Point) => sensorPorts().reverse().find(port => near(p, sim.sensorPoint(port)!, 15)) ?? null;
  /** Was unter dem Zeiger liegt – das Oberste zuerst. */
  function grab(p: Point): Drag | null {
    if (building){ const port = sensorAt(p); return port ? {kind:'sensor', port} : null; }
    if (near(p, turnHandle(), HANDLE_PX * 1.6)) return {kind:'turn'};
    const body = toWorld(sim.pose, sim.scale, BUMPER.at);
    if (Math.hypot(p.x - body.x, p.y - body.y) <= Math.max(BUMPER.radius * sim.scale, 14 * reach / k)) return {kind:'robot', dx:sim.pose.x - p.x, dy:sim.pose.y - p.y};
    for (const o of [...sim.obstacles].reverse()){
      if (near(p, sizeHandle(o), HANDLE_PX * 1.6)) return {kind:'size', o};
      if (inside(o, p)) return {kind:'move', o, dx:o.x - p.x, dy:o.y - p.y};
    }
    return null;
  }
  canvas.addEventListener('pointerdown', (e) => {
    drag = grab(world(e));
    if (!drag) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = world(e);
    if (!drag){ const over = grab(p); canvas.style.cursor = !over ? '' : over.kind === 'size' ? 'nwse-resize' : over.kind === 'turn' ? 'crosshair' : 'grab'; return; }
    if (drag.kind === 'sensor'){
      // zurück in Millimeter am Roboter: x nach vorn, y nach rechts
      const f = forward(sim.pose.heading), dx = (p.x - sim.pose.x) / sim.scale, dy = (p.y - sim.pose.y) / sim.scale;
      sim.mounts = placeSensor(sim.robot, sim.mounts, drag.port, {x:dx * f.x + dy * f.y, y:dy * f.x - dx * f.y}, defaultMounts(sim.robot)[drag.port], build);
    }
    else if (drag.kind === 'robot') sim.pose = {...sim.pose, x:p.x + drag.dx, y:p.y + drag.dy};
    else if (drag.kind === 'turn') sim.pose = {...sim.pose, heading:Math.atan2(p.y - sim.pose.y, p.x - sim.pose.x) * 180 / Math.PI};
    else if (drag.kind === 'move'){ drag.o.x = p.x + drag.dx; drag.o.y = p.y + drag.dy; }
    else {
      // die gegenüberliegende Ecke bleibt stehen
      const o = drag.o, left = o.x - o.w / 2, top = o.y - o.h / 2;
      o.w = Math.max(MIN_OBSTACLE, p.x - left); o.h = Math.max(MIN_OBSTACLE, p.y - top);
      o.x = left + o.w / 2; o.y = top + o.h / 2;
    }
    draw();
  });
  const drop = () => {
    if (!drag) return;
    if (drag.kind === 'sensor') remember();
    drag = null; draw();
  };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  // Doppelklick: setzt beim Umbauen einen Sensor an seinen üblichen Platz zurück (mit Symmetrie auch den
  // gegenüber), sonst räumt er ein Hindernis weg
  onDoubleTap(canvas, (e) => {
    const p = world(e);
    if (building){
      const port = sensorAt(p), partner = port && build.symmetry ? mirrorPartner(sim.robot, port) : null;
      if (!port) return;
      const mounts = {...sim.mounts};
      delete mounts[port]; if (partner) delete mounts[partner];
      sim.mounts = mounts; remember(); draw();
      return;
    }
    const hit = [...sim.obstacles].reverse().find(o => inside(o, p));
    if (hit){ sim.obstacles = sim.obstacles.filter(o => o !== hit); draw(); }
  });

  new ResizeObserver(layout).observe(stage);
  readRobot();
  return {
    programChanged(){ if (!runner) readRobot(); },
    setShown(on){ shown = on; if (on) layout(); else if (runner) finish(runner, '— Simulation angehalten —'); }
  };
}
