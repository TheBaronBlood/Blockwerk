// ---------------------------------------------------------------
// Simulator – die Ansicht: Bahn, Roboter und Hindernisse von oben, dazu Start, Stopp und die
// Einstellungen. Roboter und Hindernisse lassen sich mit dem Zeiger verschieben, der Roboter am
// Punkt vor ihm drehen, ein Hindernis an seiner Ecke in der Größe ändern.
// Gerechnet wird in simulation.ts und runner.ts; hier wird nur gezeichnet und bedient.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { BODY, BUMPER, COLOR_SPOT, describeRobot, MOUNT_LIMIT, robotFromWorkspace, ULTRA } from './robot';
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
/** Beim Umbauen füllt der Roboter die Ansicht: So viele Millimeter um ihn herum sind zu sehen. */
const BUILD_SPAN_MM = 380;
/** Hier merkt sich der Simulator, wie der Roboter gebaut ist: versetzte Sensoren und seine Größe. */
const STORE_KEY = 'blockwerk-sim-v1';
/** So breit ist der Streifen links, in dem der Hub liegt – die Bahn beginnt daneben. */
const HUB_LANE_PX = 112;

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

type Drag = {kind: 'sensor'; port: string} | {kind: 'robot'; dx: number; dy: number} | {kind: 'turn'} | {kind: 'move'; o: Obstacle; dx: number; dy: number} | {kind: 'size'; o: Obstacle};

export function initSimView(root: HTMLElement, opts: SimViewOptions): SimView {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const canvas = el<HTMLCanvasElement>('simCanvas'), stage = canvas.parentElement!, g = canvas.getContext('2d')!;
  const btnRun = el<HTMLButtonElement>('simRun'), info = el('simInfo'), values = el('simValues');
  const scaleInput = el<HTMLInputElement>('simScale'), fileInput = el<HTMLInputElement>('simFile');

  const sim = new Simulation(robotFromWorkspace(opts.ws));
  let trackImage: HTMLCanvasElement = startTrack();
  let runner: Runner | null = null;
  let home: Pose;                 // dorthin stellt »Zurück« den Roboter
  let activeBlock: string | null = null;
  let shown = false;
  let nextObstacle = 1;
  let building = false;           // Umbauen: der Roboter groß, seine Sensoren lassen sich versetzen
  let tempo = 1;                  // Zeitlupe und Zeitraffer

  // Wie der Roboter gebaut ist, bleibt über das Neuladen hinweg
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as {mounts?: Record<string, Point>; scale?: number};
    if (stored.mounts && typeof stored.mounts === 'object') sim.mounts = stored.mounts;
    if (typeof stored.scale === 'number' && stored.scale > 0){ sim.scale = stored.scale; scaleInput.value = String(stored.scale); }
  } catch { /* ohne Speicher beginnt der Roboter, wie er ist */ }
  const remember = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify({mounts:sim.mounts, scale:sim.scale})); } catch { /* gilt dann bis zum Neuladen */ } };
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
  const matrix = el('simMatrix'), center = el('simHubCenter');
  const dots = Array.from({length:25}, () => matrix.appendChild(document.createElement('i')));
  let shownHub = '';
  function drawHub(){
    const now = sim.display.join() + sim.light;
    if (now === shownHub) return;
    shownHub = now;
    dots.forEach((dot, i) => dot.style.setProperty('--on', String(sim.display[i] / 100)));
    if (sim.light) center.style.setProperty('--light', LIGHTS[sim.light] ?? '#fff'); else center.style.removeProperty('--light');
  }
  for (const button of root.querySelectorAll<HTMLElement>('[data-hub]')){
    const name = button.dataset.hub!;
    button.addEventListener('pointerdown', (e) => {
      sim.buttons.add(name); button.classList.add('on');
      try { button.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
    });
    // Ein kurzer Tipp soll nicht zwischen zwei Bildern verloren gehen: Die Taste bleibt einen Moment gedrückt
    const release = () => setTimeout(() => { sim.buttons.delete(name); button.classList.remove('on'); }, 80);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
  }
  // die mittlere Taste startet das Programm und beendet es, wie am echten Hub
  center.addEventListener('click', () => { if (runner) finish(runner, '— Programm mit der mittleren Taste beendet —'); else void start(); });
  // Doppelklick auf den Hub (nicht auf seine Tasten): nur noch der Hub, groß – und wieder zurück
  el('simHub').addEventListener('dblclick', (e) => {
    if ((e.target as Element).closest('button')) return;
    const only = root.classList.toggle('hub-only');
    el('simHub').title = only ? 'Doppelklick: zurück zur Bahn' : 'Doppelklick: nur den Hub zeigen';
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
  /** Von der Bahn auf den Bildschirm: Maßstab und Rand, sodass die ganze Bahn in die Ansicht passt. */
  let view = {k:1, ox:0, oy:0};
  function layout(){
    const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    const room = Math.max(w - HUB_LANE_PX, 60);
    if (building){
      // der Roboter in die Mitte, so groß es geht
      const k = Math.min(room, h) / (BUILD_SPAN_MM * sim.scale), mid = toWorld(sim.pose, sim.scale, {x:30, y:0});
      view = {k, ox:w - room / 2 - mid.x * k, oy:h / 2 - mid.y * k};
    } else {
      const k = Math.min(room / trackImage.width, h / trackImage.height) * 0.96;
      view = {k, ox:w - room + (room - trackImage.width * k) / 2, oy:(h - trackImage.height * k) / 2};
    }
    draw();
  }
  const turnHandle = () => toWorld(sim.pose, sim.scale, {x:TURN_HANDLE_MM, y:0});
  const sizeHandle = (o: Obstacle): Point => ({x:o.x + o.w / 2, y:o.y + o.h / 2});

  function draw(){
    if (!shown) return;
    const dpr = window.devicePixelRatio || 1, {robot} = sim;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.translate(view.ox, view.oy); g.scale(view.k, view.k);
    const px = 1 / view.k;   // ein Bildschirmpunkt in Einheiten der Bahn
    g.drawImage(trackImage, 0, 0);
    g.lineWidth = 2 * px; g.strokeStyle = 'rgba(255,255,255,.25)'; g.strokeRect(0, 0, trackImage.width, trackImage.height);

    for (const o of sim.obstacles){
      g.fillStyle = '#E67E17'; g.strokeStyle = '#8A4500'; g.lineWidth = 2 * px;
      g.beginPath(); g.rect(o.x - o.w / 2, o.y - o.h / 2, o.w, o.h); g.fill(); g.stroke();
      const h = sizeHandle(o);
      g.fillStyle = '#fff'; g.fillRect(h.x - HANDLE_PX * px / 2, h.y - HANDLE_PX * px / 2, HANDLE_PX * px, HANDLE_PX * px);
      g.strokeRect(h.x - HANDLE_PX * px / 2, h.y - HANDLE_PX * px / 2, HANDLE_PX * px, HANDLE_PX * px);
    }

    // Kegel des Abstandssensors: reicht bis zum Hindernis, das er sieht – sonst bis zum Ende seiner Reichweite
    if (robot.ultra){
      const from = sim.ultraPoint(), seen = sim.ultrasonic(robot.ultra), hit = seen < ULTRA.nothing;
      const a = sim.pose.heading * Math.PI / 180, half = ULTRA.halfAngle * Math.PI / 180;
      g.beginPath(); g.moveTo(from.x, from.y); g.arc(from.x, from.y, (hit ? seen : ULTRA.range) * sim.scale, a - half, a + half); g.closePath();
      g.fillStyle = hit ? 'rgba(218,48,65,.28)' : 'rgba(44,173,205,.16)'; g.fill();
      g.strokeStyle = hit ? '#DA3041' : 'rgba(44,173,205,.6)'; g.lineWidth = 1.5 * px; g.stroke();
    }

    // der Roboter: ab hier in Millimetern am Roboter, x nach vorn
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
      g.fillStyle = '#0082DD'; g.beginPath(); g.arc(BODY.back + 24, y, 14, 0, 2 * Math.PI); g.fill();
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
      g.beginPath(); g.arc(p.x, p.y, Math.max(COLOR_SPOT * sim.scale, 4 * px), 0, 2 * Math.PI);
      g.fillStyle = `rgb(${light},${light},${light})`; g.fill();
      g.strokeStyle = '#19D1E5'; g.lineWidth = 2 * px; g.stroke();
    });

    // Anfasser zum Drehen
    const t = turnHandle();
    g.setLineDash([4 * px, 4 * px]); g.strokeStyle = 'rgba(25,209,229,.7)'; g.lineWidth = 1.5 * px;
    g.beginPath(); g.moveTo(sim.pose.x, sim.pose.y); g.lineTo(t.x, t.y); g.stroke(); g.setLineDash([]);
    g.beginPath(); g.arc(t.x, t.y, HANDLE_PX * px * 0.7, 0, 2 * Math.PI); g.fillStyle = '#19D1E5'; g.fill();

    // beim Umbauen steht an jedem Sensor sein Anschluss
    if (building){
      g.font = `700 ${13 * px}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const port of sensorPorts()){
        // Farbsensoren tragen ihn vor sich, der Abstandssensor links, Kraftsensoren rechts – so überdecken sie sich nicht
        const p = sim.sensorPoint(port)!, turn = robot.colors.includes(port) ? 0 : port === robot.ultra ? -90 : 90;
        const out = forward(sim.pose.heading + turn), far = (turn ? 34 : 20) * px;
        const x = p.x + out.x * far, y = p.y + out.y * far;
        g.fillStyle = '#16171D'; g.beginPath(); g.arc(x, y, 10 * px, 0, 2 * Math.PI); g.fill();
        g.fillStyle = '#fff'; g.fillText(port, x, y);
      }
    }

    const parts = robot.colors.map(p => `Farbsensor ${p}: ${sim.reflection(p)} %`);
    if (robot.ultra) parts.push(`Abstand ${robot.ultra}: ${sim.ultrasonic(robot.ultra)} mm`);
    for (const p of robot.force) parts.push(`Kraftsensor ${p}: ${sim.forcePressed(p) ? 'gedrückt' : 'frei'}`);
    for (const p of robot.motors) parts.push(`Motor ${p}: ${Math.round(sim.motor(p).angle)}°`);
    if (building) parts.unshift(sensorPorts().length ? 'Umbauen: Sensoren ziehen – Doppelklick setzt einen zurück' : 'Umbauen: Das Programm benutzt noch keinen Sensor');
    if (runner) parts.push(`Zeit: ${(sim.time / 1000).toFixed(1)} s`);
    if (sim.blocked) parts.push('steht am Hindernis an');
    values.textContent = parts.join(' · ');
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
      button.addEventListener('pointerdown', (e) => { sim.forceHeld.add(port); try { button.setPointerCapture(e.pointerId); } catch { /* geht auch ohne */ } draw(); });
      const release = () => setTimeout(() => { sim.forceHeld.delete(port); draw(); }, 80);
      button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release);
      forceBox.appendChild(button);
    }
  }
  function readRobot(){
    sim.robot = robotFromWorkspace(opts.ws);
    forceButtons();
    info.textContent = 'Roboter laut Programm: ' + describeRobot(sim.robot) + (sim.robot.notes.length ? ' – ' + sim.robot.notes.join(' ') : '');
    draw();
  }

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
  const btnBuild = el('simBuild');
  function setBuilding(on: boolean){
    building = on;
    btnBuild.setAttribute('aria-pressed', String(on));
    layout();
  }
  btnBuild.addEventListener('click', () => {
    if (!building && runner) finish(runner, '— Simulation angehalten —');
    setBuilding(!building);
  });
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
    opts.print('— Simulation gestartet —\n', 't-info');
    opts.onStart();
    if (!sim.robot.drive) opts.print('→ Das Programm benutzt weder Fahrblöcke noch zwei Motoren: Der Roboter im Simulator hat keine Räder und bleibt stehen.\n', 't-hint');
    await mine.start();
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
      const bitmap = await createImageBitmap(file), k = Math.min(1, MAX_TRACK_PX / Math.max(bitmap.width, bitmap.height));
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.round(bitmap.width * k)); image.height = Math.max(1, Math.round(bitmap.height * k));
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

  // ---- Zeiger: verschieben, drehen, Größe ändern ----
  const world = (e: PointerEvent | MouseEvent): Point => {
    const r = canvas.getBoundingClientRect();
    return {x:(e.clientX - r.left - view.ox) / view.k, y:(e.clientY - r.top - view.oy) / view.k};
  };
  const near = (a: Point, b: Point, px: number) => Math.hypot(a.x - b.x, a.y - b.y) <= px / view.k;
  const inside = (o: Obstacle, p: Point) => Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.y - o.y) <= o.h / 2;
  /** Was unter dem Zeiger liegt – das Oberste zuerst. */
  function grab(p: Point): Drag | null {
    if (building){
      const port = sensorPorts().reverse().find(s => near(p, sim.sensorPoint(s)!, 16));
      return port ? {kind:'sensor', port} : null;
    }
    if (near(p, turnHandle(), HANDLE_PX * 1.6)) return {kind:'turn'};
    const body = toWorld(sim.pose, sim.scale, BUMPER.at);
    if (Math.hypot(p.x - body.x, p.y - body.y) <= Math.max(BUMPER.radius * sim.scale, 14 / view.k)) return {kind:'robot', dx:sim.pose.x - p.x, dy:sim.pose.y - p.y};
    for (const o of [...sim.obstacles].reverse()){
      if (near(p, sizeHandle(o), HANDLE_PX * 1.6)) return {kind:'size', o};
      if (inside(o, p)) return {kind:'move', o, dx:o.x - p.x, dy:o.y - p.y};
    }
    return null;
  }
  let drag: Drag | null = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = grab(world(e));
    if (!drag) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = world(e);
    if (!drag){ const over = grab(p); canvas.style.cursor = !over ? '' : over.kind === 'size' ? 'nwse-resize' : over.kind === 'turn' ? 'crosshair' : 'grab'; return; }
    if (drag.kind === 'sensor'){
      // zurück in Millimeter am Roboter: x nach vorn, y nach rechts
      const f = forward(sim.pose.heading), dx = (p.x - sim.pose.x) / sim.scale, dy = (p.y - sim.pose.y) / sim.scale;
      const limit = (v: number) => Math.round(Math.max(-MOUNT_LIMIT, Math.min(MOUNT_LIMIT, v)));
      sim.mounts[drag.port] = {x:limit(dx * f.x + dy * f.y), y:limit(dy * f.x - dx * f.y)};
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
  const drop = () => { if (drag?.kind === 'sensor') remember(); drag = null; };
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  // Doppelklick räumt ein Hindernis wieder weg
  canvas.addEventListener('dblclick', (e) => {
    const p = world(e);
    if (building){
      // ein versetzter Sensor geht zurück an seinen üblichen Platz
      const port = sensorPorts().reverse().find(s => near(p, sim.sensorPoint(s)!, 16));
      if (port){ delete sim.mounts[port]; remember(); draw(); }
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
