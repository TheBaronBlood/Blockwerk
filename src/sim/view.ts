// ---------------------------------------------------------------
// Simulator – die Ansicht: Bahn, Roboter und Hindernisse von oben, darüber in der Ecke der Hub,
// dazu Start, Stopp und die Einstellungen. Roboter und Hindernisse lassen sich mit dem Zeiger
// verschieben, der Roboter am Punkt vor ihm drehen, ein Hindernis an seiner Ecke in der Größe
// ändern. Die Bahn lässt sich heranholen (Mausrad, zwei Finger) und an freier Stelle verschieben.
// »Umbauen« zeigt den Roboter groß mit der Nase nach oben; dort lassen sich seine Sensoren
// versetzen (build.ts). »Bahn bauen« legt die Bahn aus Platten zusammen (tiles.ts, trackEditor.ts).
// Gerechnet wird in simulation.ts und runner.ts; hier wird nur gezeichnet und bedient.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
import { ANGLE_STEP, ANGLE_STEP_COARSE, GRID_MM, mirrorPartner, MOUNT_AREA, mountsFor, placeSensor, rotateSensor, saveMounts, type BuildOptions, type Mount, type SavedMounts } from './build';
import { BODY, BUMPER, COLOR_SPOT, defaultMounts, describeRobot, robotFromWorkspace, ULTRA } from './robot';
import { Runner } from './runner';
import { Simulation } from './simulation';
import { cellAt, mapSize, readTileMap, startPose, TEMPLATES, TILE_MM, type TileMap } from './tiles';
import { initTrackEditor, renderTiles } from './trackEditor';
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

/** Ein geladenes Bild wird auf diese Kantenlänge verkleinert – mehr sieht der Sensor ohnehin nicht. */
const MAX_TRACK_PX = 1600;
/** Abstand des Drehpunkts vor dem Roboter und die Größe der Anfasser, in Bildschirmpunkten. */
const TURN_HANDLE_MM = 150, HANDLE_PX = 9;
const MIN_OBSTACLE = 20;
/** So weit lässt sich die Bahn heranholen, und so viel der Fläche füllt sie, wenn sie ganz zu sehen ist. */
const MAX_ZOOM = 8, FIT = 0.94;
/** Beim Umbauen füllt der Roboter die Ansicht: so viele Millimeter sind zu sehen, um diesen Punkt am Roboter. */
const BUILD_SPAN_MM = 340, BUILD_CENTER: Point = {x:32, y:0};
/** So weit vor dem gewählten Sensor sitzt der Knopf, an dem man ihn dreht (Bildschirmpunkte). */
const KNOB_PX = 46;
/**
 * Hier merkt sich der Simulator, wie der Roboter gebaut ist – versetzte Sensoren (je Gruppe von Sensoren), seine
 * Größe, Raster und Symmetrie – und die Bahn: ihre Platten, ihr Rand, wo der Roboter beginnt und die Hindernisse.
 */
const STORE_KEY = 'blockwerk-sim-v1';
/** Farben, die der Farbsensor beim Namen nennt – neben der Reflexion steht, wenn er eine davon sieht (ein grüner Punkt, die rote Ziellinie). */
const SEEN: Record<string, string> = {GREEN:'Grün', RED:'Rot', BLUE:'Blau', YELLOW:'Gelb'};
/** Geschütztes Leerzeichen: hält Zahl und Einheit in einer Zeile zusammen. */
const NB = String.fromCharCode(160);

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

/** `pan`: an freier Stelle angefasst – Ziehen verschiebt die herangeholte Bahn; beim Bauen der Bahn ist es ohne Ziehen ein Tipp auf ein Feld (`tap`). */
type Drag = {kind: 'pan'; from: Point; cam: Point; moved: boolean; tap: Point | null} | {kind: 'sensor'; port: string; from: Mount} | {kind: 'spin'; port: string} | {kind: 'robot'; dx: number; dy: number} | {kind: 'turn'} | {kind: 'move'; o: Obstacle; dx: number; dy: number} | {kind: 'size'; o: Obstacle};

export function initSimView(root: HTMLElement, opts: SimViewOptions): SimView {
  const el = <T extends HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const canvas = el<HTMLCanvasElement>('simCanvas'), stage = canvas.parentElement!, g = canvas.getContext('2d')!;
  const btnRun = el<HTMLButtonElement>('simRun'), info = el('simInfo'), values = el('simValues');
  const scaleInput = el<HTMLInputElement>('simScale'), fileInput = el<HTMLInputElement>('simFile');
  const gridInput = el<HTMLInputElement>('simGrid'), symmetryInput = el<HTMLInputElement>('simSymmetry');
  /** Mit dem Finger trifft man weniger genau: Die Anfasser sind dann großzügiger. */
  const reach = matchMedia('(pointer:coarse)').matches ? 1.7 : 1;

  const sim = new Simulation(robotFromWorkspace(opts.ws));
  /** Die Bahn aus Platten. Sie bleibt gemerkt, auch während gerade ein eigenes Bild als Bahn dient (`usingImage`). */
  let tileMap: TileMap = TEMPLATES[0].make();
  let usingImage = false;
  let trackImage: HTMLCanvasElement;
  let runner: Runner | null = null;
  let home: Pose;                 // dorthin stellt »Zurück« den Roboter
  let activeBlock: string | null = null;
  let shown = false;
  let nextObstacle = 1;
  let building = false;           // Umbauen: der Roboter groß, seine Sensoren lassen sich versetzen
  let editing = false;            // Bahn bauen: Tipps auf die Bahn legen und drehen Platten
  let hover: Point | null = null; // beim Bauen der Bahn: wo der Zeiger gerade ist
  let tempo = 1;                  // Zeitlupe und Zeitraffer
  let zoom = 1;                   // 1: die ganze Bahn ist zu sehen
  let cam: Point | null = null;   // herangeholt: die Stelle der Bahn in der Mitte der Ansicht
  /** Zwei Finger auf der Bahn: wie weit sie am Anfang auseinander waren, der Zoom dabei und die Stelle der Bahn zwischen ihnen. */
  let pinch: {apart: number; zoom: number; under: Point} | null = null;
  let drag: Drag | null = null;
  /** Der Sensor, der beim Umbauen zuletzt angefasst wurde: Er zeigt seinen Drehknopf und hört auf die Tasten. */
  let selected: string | null = null;
  const build: BuildOptions = {grid:true, symmetry:true};
  /** Versetzte Sensoren, wie sie gemerkt sind – auch die für Sensoren, die das Programm gerade nicht benutzt. */
  let saved: SavedMounts = {};

  // Wie der Roboter gebaut ist und wie die Bahn aussieht, bleibt über das Neuladen hinweg
  let storedStart: Pose | null = null, storedObstacles: Obstacle[] = [];
  const finite = (...values: unknown[]) => values.every(v => typeof v === 'number' && Number.isFinite(v));
  try {
    const stored = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as {layouts?: SavedMounts; scale?: number; grid?: boolean; symmetry?: boolean; track?: unknown; start?: Pose; obstacles?: Obstacle[]; fence?: boolean};
    if (typeof stored.fence === 'boolean') sim.fence = stored.fence;
    const map = readTileMap(stored.track);
    if (map){
      tileMap = map;
      const s = stored.start;
      if (s && finite(s.x, s.y, s.heading)) storedStart = {x:s.x, y:s.y, heading:s.heading};
      if (Array.isArray(stored.obstacles)) storedObstacles = stored.obstacles.filter(o => o && finite(o.x, o.y, o.w, o.h)).map((o, i) => ({id:i + 1, x:o.x, y:o.y, w:o.w, h:o.h}));
    }
    if (stored.layouts && typeof stored.layouts === 'object') saved = stored.layouts;
    if (typeof stored.scale === 'number' && stored.scale > 0){ sim.scale = stored.scale; scaleInput.value = String(stored.scale); }
    if (typeof stored.grid === 'boolean') build.grid = stored.grid;
    if (typeof stored.symmetry === 'boolean') build.symmetry = stored.symmetry;
  } catch { /* ohne Speicher beginnt der Roboter, wie er ist */ }
  gridInput.checked = build.grid; symmetryInput.checked = build.symmetry;
  const remember = () => {
    saved = saveMounts(sim.robot, saved, sim.mounts);
    const store = {layouts:saved, scale:sim.scale, ...build, fence:sim.fence, track:tileMap, ...(usingImage ? {} : {start:home, obstacles:sim.obstacles})};
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* gilt dann bis zum Neuladen */ }
  };
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
    // die mittlere Taste leuchtet, solange ein Programm läuft: grün – oder in der Farbe, die das Programm einstellt
    const light = runner ? sim.light : null, now = sim.display.join() + light;
    if (now === shownHub) return;
    shownHub = now;
    dots.forEach((dot, i) => dot.style.setProperty('--on', String(sim.display[i] / 100)));
    if (light) center.style.setProperty('--light', LIGHTS[light] ?? '#fff'); else center.style.removeProperty('--light');
    center.classList.toggle('lit', !!light);
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
    if (editing) setEditing(false);
    const only = root.classList.toggle('hub-only');
    hub.title = only ? 'Doppelklick: zurück zur Bahn' : 'Doppelklick: nur den Hub zeigen';
    if (!only) layout();
  });

  function useTrack(image: HTMLCanvasElement, pose: Pose, obstacles: Obstacle[] = []){
    trackImage = image;
    sim.track = {width:image.width, height:image.height, data:image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data};
    sim.pose = pose; home = {...pose};
    sim.obstacles = obstacles;
    nextObstacle = Math.max(0, ...obstacles.map(o => o.id)) + 1;
  }
  // Start: die gemerkte Bahn – oder der Rundkurs –, der Roboter dort, wo er zuletzt hingestellt wurde
  useTrack(renderTiles(tileMap), storedStart ?? startPose(tileMap), storedObstacles);
  /**
   * Eine andere Bahn aus Platten gilt (ein Tipp beim Bauen, eine Vorlage, eine Datei). `fresh`: Sie ist eine ganz
   * andere – der Roboter beginnt neu, die Hindernisse sind weg. Sonst bleibt alles stehen, was noch auf die Bahn passt.
   */
  function changeMap(map: TileMap, fresh = false){
    if (runner) finish(runner, '— Simulation angehalten —');
    const size = mapSize(map), on = (p: Point) => p.x >= 0 && p.y >= 0 && p.x <= size.width && p.y <= size.height;
    const keep = !fresh && !usingImage;
    if (!keep){ zoom = 1; cam = null; }
    tileMap = map; usingImage = false;
    useTrack(renderTiles(map), keep && on(sim.pose) ? sim.pose : startPose(map), keep ? sim.obstacles.filter(on) : []);
    editor.refresh(); remember(); layout();
  }

  // ---- Zeichnen ----
  /** Bildschirmpunkte je Einheit der Bahn. */
  let k = 1;
  /** Von der Bahn auf den Bildschirm und zurück. Beim Umbauen ist die Bahn gedreht: Die Nase des Roboters zeigt nach oben. */
  let toScreen = new DOMMatrix(), toTrack = new DOMMatrix();
  /** Maßstab, bei dem die ganze Bahn in die Ansicht passt. Der Hub liegt in seiner Ecke über der Bahn. */
  const fitScale = () => Math.min(stage.clientWidth / trackImage.width, stage.clientHeight / trackImage.height) * FIT;
  const trackMid = (): Point => ({x:trackImage.width / 2, y:trackImage.height / 2});
  /** Legt fest, wo die Bahn auf dem Bildschirm liegt – nach dem Zoomen, Schieben und wenn sich die Größe ändert. */
  function place(){
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    if (building){
      // der Roboter in die Mitte, so groß es geht
      k = Math.min(w, h) / (BUILD_SPAN_MM * sim.scale);
      const mid = toWorld(sim.pose, sim.scale, BUILD_CENTER);
      toScreen = new DOMMatrix().translate(w / 2, h / 2).scale(k).rotate(-90 - sim.pose.heading).translate(-mid.x, -mid.y);
    } else {
      k = fitScale() * zoom;
      // herangeholt lässt sich die Bahn schieben – aber nie weiter, als sie reicht
      const hold = (want: number, size: number, seen: number) => seen >= size ? size / 2 : Math.max(seen / 2, Math.min(size - seen / 2, want));
      const want = cam ?? trackMid(), at = {x:hold(want.x, trackImage.width, w / k), y:hold(want.y, trackImage.height, h / k)};
      cam = zoom > 1 ? at : null;
      toScreen = new DOMMatrix().translate(w / 2, h / 2).scale(k).translate(-at.x, -at.y);
    }
    toTrack = toScreen.inverse();
  }
  function layout(){
    const dpr = window.devicePixelRatio || 1, w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    place(); draw();
  }
  /** Holt die Bahn heran oder rückt sie weg; die Stelle unter `at` (Bildschirmpunkte) bleibt, wo sie ist. */
  function zoomAt(at: Point, factor: number){
    if (building) return;
    const under = toTrack.transformPoint(at);
    zoom = Math.max(1, Math.min(MAX_ZOOM, zoom * factor));
    const next = fitScale() * zoom;
    cam = {x:under.x - (at.x - stage.clientWidth / 2) / next, y:under.y - (at.y - stage.clientHeight / 2) / next};
    place(); draw();
  }
  /** Herangeholt und in Fahrt: Kommt der Roboter dem Rand der Ansicht nahe, wandert die Bahn mit. */
  function follow(){
    if (zoom <= 1 || building || drag || pinch) return;
    const w = stage.clientWidth, h = stage.clientHeight, at = toScreen.transformPoint(sim.pose);
    const past = (v: number, size: number) => { const edge = size * 0.22; return v < edge ? v - edge : v > size - edge ? v - (size - edge) : 0; };
    const dx = past(at.x, w), dy = past(at.y, h);
    if (!dx && !dy) return;
    const now = cam ?? trackMid();
    cam = {x:now.x + dx / k, y:now.y + dy / k};
    place();
  }
  const zoomMid = (factor: number) => zoomAt({x:stage.clientWidth / 2, y:stage.clientHeight / 2}, factor);
  el('simZoomIn').addEventListener('click', () => zoomMid(1.5));
  el('simZoomOut').addEventListener('click', () => zoomMid(1 / 1.5));
  el('simZoomFit').addEventListener('click', () => { zoom = 1; cam = null; place(); draw(); });
  canvas.addEventListener('wheel', (e) => {
    if (building) return;
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt({x:e.clientX - r.left, y:e.clientY - r.top}, e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }, {passive:false});
  const turnHandle = () => toWorld(sim.pose, sim.scale, {x:TURN_HANDLE_MM, y:0});
  /** Wo der Drehknopf eines Sensors liegt: ein Stück vor ihm in seiner Blickrichtung. */
  const sensorKnob = (port: string): Point => {
    const at = sim.sensorPoint(port)!, out = forward(sim.sensorHeading(port));
    return {x:at.x + out.x * KNOB_PX / k, y:at.y + out.y * KNOB_PX / k};
  };
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
    // der Rand der Bahn: durchgezogen hält er den Roboter auf, gestrichelt ist er abgeschaltet (ein Klick darauf schaltet um)
    const rim = (sim.fence ? 5 : 1.5) * px;
    g.lineWidth = rim; g.strokeStyle = sim.fence ? '#FFB515' : 'rgba(255,255,255,.4)';
    if (!sim.fence) g.setLineDash([6 * px, 5 * px]);
    g.strokeRect(-rim / 2, -rim / 2, trackImage.width + rim, trackImage.height + rim); g.setLineDash([]);
    if (editing){
      // Bahn bauen: die Felder als Raster, das Feld unter dem Zeiger hervorgehoben; Roboter und Hindernisse treten zurück
      g.beginPath();
      for (let col = 0; col <= tileMap.cols; col++){ g.moveTo(col * TILE_MM, 0); g.lineTo(col * TILE_MM, trackImage.height); }
      for (let row = 0; row <= tileMap.rows; row++){ g.moveTo(0, row * TILE_MM); g.lineTo(trackImage.width, row * TILE_MM); }
      g.strokeStyle = 'rgba(0,130,221,.55)'; g.lineWidth = 1.5 * px; g.stroke();
      const cell = hover && cellAt(tileMap, hover);
      if (cell){
        g.fillStyle = 'rgba(0,130,221,.13)'; g.strokeStyle = '#0082DD'; g.lineWidth = 3 * px;
        g.beginPath(); g.rect(cell.col * TILE_MM, cell.row * TILE_MM, TILE_MM, TILE_MM); g.fill(); g.stroke();
      }
      g.globalAlpha = 0.3;
    }

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
      const a = sim.ultraHeading() * Math.PI / 180, half = ULTRA.halfAngle * Math.PI / 180;
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
    /** Zeichnet ein Bauteil an seinem Platz, gedreht wie eingestellt: `shape` zeichnet es um den Ursprung, x nach vorn. */
    const part = (port: string, shape: () => void) => {
      const at = sim.mount(port)!;
      g.save(); g.translate(at.x, at.y); g.rotate((at.angle ?? 0) * Math.PI / 180); shape(); g.restore();
    };
    if (robot.ultra) part(robot.ultra, () => { g.fillStyle = '#2CADCD'; g.beginPath(); g.roundRect(-8, -22, 12, 44, 4); g.fill(); });
    for (const port of robot.force) part(port, () => {
      const pressed = sim.forcePressed(port);
      // der Taster vorn: gedrückt sitzt er tiefer im Sensor
      g.fillStyle = '#8A1420'; g.beginPath(); g.roundRect(4, -5, pressed ? 4 : 8, 10, 2); g.fill();
      g.fillStyle = pressed ? '#FF8A95' : '#DA3041'; g.beginPath(); g.roundRect(-6, -12, 12, 24, 4); g.fill();
    });
    // Beim Umbauen zeigt ein Gehäuse, wie die Farbsensoren gedreht sind. (Gemessen wird trotzdem genau unter ihnen.)
    if (building) for (const port of robot.colors) part(port, () => {
      g.fillStyle = 'rgba(255,255,255,.92)'; g.strokeStyle = '#19D1E5'; g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(-12, -12, 24, 24, 5); g.fill(); g.stroke();
      g.fillStyle = '#19D1E5'; g.beginPath(); g.roundRect(8, -6, 4, 12, 2); g.fill();   // die Vorderkante
    });
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
      const mirrored = selected && build.symmetry ? mirrorPartner(robot, selected) : null;
      g.font = '700 12px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const port of sensorPorts()){
        const s = toScreen.transformPoint(sim.sensorPoint(port)!), active = port === selected || port === mirrored;
        circle(s.x, s.y, 13); g.strokeStyle = active ? '#E644B9' : 'rgba(22,23,29,.5)'; g.lineWidth = active ? 3 : 1.5; g.stroke();
        // Farbsensoren tragen das Schild vor sich, der Abstandssensor links, Kraftsensoren rechts – so überdecken sie
        // sich nicht. Beim gewählten Sensor sitzt vorn der Drehknopf: Sein Schild rückt nach hinten.
        // (Auf dem Bildschirm zeigt »geradeaus« nach oben – eine Drehung des Sensors zählt von dort.)
        const back = forward((sim.mount(port)!.angle ?? 0) + 90);
        const [dx, dy] = port === selected ? [back.x * 27, back.y * 27] : robot.colors.includes(port) ? [0, -27] : port === robot.ultra ? [-29, 0] : [29, 0];
        circle(s.x + dx, s.y + dy, 10); g.fillStyle = active ? '#E644B9' : '#16171D'; g.fill();
        g.fillStyle = '#fff'; g.fillText(port, s.x + dx, s.y + dy + 0.5);
      }
      const at = selected && sim.mount(selected);
      if (selected && at){
        // der Drehknopf: eine Linie vom Sensor in seine Blickrichtung, am Ende der Knopf
        const s = toScreen.transformPoint(sim.sensorPoint(selected)!), t = toScreen.transformPoint(sensorKnob(selected));
        g.strokeStyle = '#E644B9'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x, s.y); g.lineTo(t.x, t.y); g.stroke();
        circle(t.x, t.y, 7); g.fillStyle = '#E644B9'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
        parts.push(`Sensor ${selected}: ${Math.abs(at.x)} mm ${at.x < 0 ? 'hinter' : 'vor'} der Achse, ${at.y ? `${Math.abs(at.y)} mm ${at.y < 0 ? 'links' : 'rechts'}` : 'mittig'}`
          + (at.angle ? `, ${Math.abs(at.angle)}° nach ${at.angle < 0 ? 'links' : 'rechts'} gedreht` : ''));
      }
      else if (!sensorPorts().length) parts.push('Das Programm benutzt noch keinen Sensor');
    } else if (!editing){
      // Anfasser zum Drehen
      const t = turnHandle();
      g.setLineDash([4 * px, 4 * px]); g.strokeStyle = 'rgba(25,209,229,.7)'; g.lineWidth = 1.5 * px;
      g.beginPath(); g.moveTo(sim.pose.x, sim.pose.y); g.lineTo(t.x, t.y); g.stroke(); g.setLineDash([]);
      circle(t.x, t.y, HANDLE_PX * px * 0.7); g.fillStyle = '#19D1E5'; g.fill();
    }

    g.globalAlpha = 1;
    for (const p of robot.colors) parts.push(`Farbsensor ${p}: ${sim.reflection(p)} %` + (SEEN[sim.color(p)] ? ` (${SEEN[sim.color(p)]})` : ''));
    if (robot.ultra) parts.push(`Abstand ${robot.ultra}: ${sim.ultrasonic(robot.ultra)} mm`);
    for (const p of robot.force) parts.push(`Kraftsensor ${p}: ${sim.forcePressed(p) ? 'gedrückt' : 'frei'}`);
    for (const p of robot.motors) parts.push(`Motor ${p}: ${Math.round(sim.motor(p).angle)}°`);
    if (runner) parts.push(`Zeit: ${(sim.time / 1000).toFixed(1).replace('.', ',')} s`);
    if (sim.blocked) parts.push('steht an');
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
    // Plätze gelten nur für die Sensoren, für die sie eingestellt wurden: Hat das Programm jetzt andere
    // (einen Farbsensor statt zwei), sitzen sie am üblichen Platz – der einzelne in der Mitte
    sim.mounts = mountsFor(sim.robot, saved);
    if (selected && !sensorPorts().includes(selected)) selected = null;
    forceButtons();
    info.textContent = 'Roboter laut Programm: ' + describeRobot(sim.robot) + (sim.robot.notes.length ? ' – ' + sim.robot.notes.join(' ') : '');
    draw();
  }

  // ---- Umbauen ----
  const btnBuild = el('simBuild');
  function setBuilding(on: boolean){
    if (on && editing) setEditing(false);
    building = on; drag = null; selected = null;
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

  // ---- Bahn bauen ----
  const btnTrack = el('simTrack');
  const editor = initTrackEditor(root, {map:() => tileMap, change:changeMap, toast:opts.toast});
  function setEditing(on: boolean){
    if (on && building) setBuilding(false);
    if (on && runner) finish(runner, '— Simulation angehalten —');
    editing = on; drag = null; hover = null;
    root.classList.toggle('tracking', on);
    btnTrack.setAttribute('aria-pressed', String(on));
    btnTrack.textContent = on ? 'Fertig' : 'Bahn bauen';
    // diente gerade ein eigenes Bild als Bahn, kommt jetzt wieder die aus Platten
    if (on && usingImage) changeMap(tileMap, true); else layout();
  }
  btnTrack.addEventListener('click', () => setEditing(!editing));

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
    if (editing) setEditing(false);
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
      follow(); draw();
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
    remember(); draw();
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
      usingImage = true; zoom = 1; cam = null;
      useTrack(image, {x:image.width / 2, y:image.height / 2, heading:0});
      layout();
      opts.toast('Bahn geladen. Zieh den Roboter auf die Linie und stell seine Größe ein.');
    } catch (err){ console.error(err); opts.toast('Dieses Bild lässt sich nicht als Bahn laden.'); }
  });

  // ---- Zeiger: verschieben, drehen, Größe ändern, Sensoren versetzen ----
  /** Wo der Zeiger auf der Leinwand ist (Bildschirmpunkte) – und wo das auf der Bahn ist. */
  const local = (e: PointerEvent): Point => { const r = canvas.getBoundingClientRect(); return {x:e.clientX - r.left, y:e.clientY - r.top}; };
  const world = (e: PointerEvent): Point => { const p = toTrack.transformPoint(local(e)); return {x:p.x, y:p.y}; };
  /** Finger auf der Leinwand: Zwei davon holen die Bahn heran und schieben sie. */
  const fingers = new Map<number, Point>();
  /** Ob der Zeiger auf dem Rand der Bahn liegt: auf dem Rahmen um sie herum, kaum darin. */
  function onFence(p: Point): boolean {
    const out = Math.max(-p.x, -p.y, p.x - trackImage.width, p.y - trackImage.height);
    return out > 0 ? out <= 10 * reach / k : Math.min(p.x, p.y, trackImage.width - p.x, trackImage.height - p.y) <= 3 / k;
  }
  const near = (a: Point, b: Point, px: number) => Math.hypot(a.x - b.x, a.y - b.y) <= px * reach / k;
  const inside = (o: Obstacle, p: Point) => Math.abs(p.x - o.x) <= o.w / 2 && Math.abs(p.y - o.y) <= o.h / 2;
  /** Der Sensor unter dem Zeiger (beim Umbauen). */
  const sensorAt = (p: Point) => sensorPorts().reverse().find(port => near(p, sim.sensorPoint(port)!, 15)) ?? null;
  /**
   * Zusatztasten beim Umbauen, wie in Zeichenprogrammen üblich: Alt schaltet das Einrasten ab, Strg (auf dem Mac
   * die Befehlstaste) bewegt nur diesen einen Sensor, ohne den gegenüber zu spiegeln.
   */
  const snapping = (e: {altKey: boolean}) => build.grid && !e.altKey;
  const mirroring = (e: {ctrlKey: boolean; metaKey: boolean}) => build.symmetry && !e.ctrlKey && !e.metaKey;
  /** Was unter dem Zeiger liegt – das Oberste zuerst. */
  function grab(p: Point): Drag | null {
    if (building){
      if (selected && near(p, sensorKnob(selected), 13)) return {kind:'spin', port:selected};
      const port = sensorAt(p);
      return port ? {kind:'sensor', port, from:{...sim.mount(port)!}} : null;
    }
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
    fingers.set(e.pointerId, local(e));
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ohne Zeigerbindung geht es trotzdem */ }
    if (fingers.size === 2 && !building){
      // der zweite Finger: ab jetzt wird herangeholt und geschoben – was der erste angefangen hat, gilt nicht mehr
      const [a, b] = [...fingers.values()], under = toTrack.transformPoint({x:(a.x + b.x) / 2, y:(a.y + b.y) / 2});
      pinch = {apart:Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom, under:{x:under.x, y:under.y}};
      drag = null;
      return;
    }
    if (fingers.size > 1) return;
    const p = world(e), pan = (tap: Point | null): Drag => ({kind:'pan', from:local(e), cam:cam ?? trackMid(), moved:false, tap});
    if (!building && onFence(p)){ sim.fence = !sim.fence; remember(); draw(); return; }
    e.preventDefault();
    if (editing){
      // Bahn bauen: ohne Ziehen ist es ein Tipp auf das Feld; die Leinwand bekommt die Tasten (R dreht, Entf leert)
      canvas.focus({preventScroll:true});
      hover = p; drag = pan(p);
      return;
    }
    drag = grab(p);
    if (building){
      // angefasst ist gewählt; daneben getippt wählt ab. Die Leinwand bekommt die Tasten (Pfeile, R).
      selected = drag?.kind === 'sensor' || drag?.kind === 'spin' ? drag.port : null;
      canvas.focus({preventScroll:true});
    }
    else drag ??= pan(null);
    draw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (fingers.has(e.pointerId)) fingers.set(e.pointerId, local(e));
    if (pinch && fingers.size >= 2){
      const [a, b] = [...fingers.values()], mid = {x:(a.x + b.x) / 2, y:(a.y + b.y) / 2};
      zoom = Math.max(1, Math.min(MAX_ZOOM, pinch.zoom * Math.hypot(a.x - b.x, a.y - b.y) / pinch.apart));
      const next = fitScale() * zoom;
      cam = {x:pinch.under.x - (mid.x - stage.clientWidth / 2) / next, y:pinch.under.y - (mid.y - stage.clientHeight / 2) / next};
      place(); draw();
      return;
    }
    const p = world(e);
    if (drag?.kind === 'pan'){
      const at = local(e);
      if (Math.hypot(at.x - drag.from.x, at.y - drag.from.y) > 6) drag.moved = true;
      if (drag.moved && zoom > 1){ cam = {x:drag.cam.x - (at.x - drag.from.x) / k, y:drag.cam.y - (at.y - drag.from.y) / k}; place(); }
      if (editing) hover = p;
      draw();
      return;
    }
    // der Rand der Bahn: ein Klick schaltet ihn um
    const rim = !building && onFence(p);
    canvas.title = rim ? (sim.fence ? 'Rand der Bahn: an' : 'Rand der Bahn: aus') : '';
    if (rim){ canvas.style.cursor = 'pointer'; return; }
    if (editing){ hover = p; canvas.style.cursor = cellAt(tileMap, p) ? 'pointer' : ''; draw(); return; }
    if (!drag){ const over = grab(p); canvas.style.cursor = !over ? '' : over.kind === 'size' ? 'nwse-resize' : over.kind === 'turn' || over.kind === 'spin' ? 'crosshair' : 'grab'; return; }
    if (drag.kind === 'sensor'){
      // zurück in Millimeter am Roboter: x nach vorn, y nach rechts
      const f = forward(sim.pose.heading), dx = (p.x - sim.pose.x) / sim.scale, dy = (p.y - sim.pose.y) / sim.scale;
      const at = {x:dx * f.x + dy * f.y, y:dy * f.x - dx * f.y}, from = drag.from;
      // Umschalt: nur vor und zurück oder nur seitlich – je nachdem, wohin es weiter geht
      const fixed = !e.shiftKey ? undefined : Math.abs(at.x - from.x) >= Math.abs(at.y - from.y) ? {y:from.y} : {x:from.x};
      sim.mounts = placeSensor(sim.robot, sim.mounts, drag.port, at, defaultMounts(sim.robot), {grid:snapping(e), symmetry:mirroring(e), fixed});
    }
    else if (drag.kind === 'spin'){
      // der Winkel vom Sensor zum Zeiger, gezählt ab »geradeaus«. Er rastet in 15-Grad-Schritten ein, mit Umschalt in 45ern.
      const at = sim.sensorPoint(drag.port)!, angle = Math.atan2(p.y - at.y, p.x - at.x) * 180 / Math.PI - sim.pose.heading;
      const step = !snapping(e) ? 0 : e.shiftKey ? ANGLE_STEP_COARSE : ANGLE_STEP;
      sim.mounts = rotateSensor(sim.robot, sim.mounts, drag.port, angle, defaultMounts(sim.robot), {step, symmetry:mirroring(e)});
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
  const drop = (e: PointerEvent) => {
    fingers.delete(e.pointerId);
    if (fingers.size < 2) pinch = null;
    if (!drag) return;
    if (drag.kind === 'pan'){
      // nicht gezogen: beim Bauen der Bahn ein Tipp auf das Feld
      const tap = !drag.moved && e.type === 'pointerup' ? drag.tap : null;
      drag = null;
      if (tap) editor.tap(tap); else draw();
      return;
    }
    // wo der Roboter von Hand hingestellt wird, beginnt er – auch nach dem Neuladen
    if ((drag.kind === 'robot' || drag.kind === 'turn') && !runner) home = {...sim.pose};
    remember();
    drag = null; draw();
  };
  canvas.addEventListener('pointerleave', () => { if (editing && hover){ hover = null; draw(); } });
  canvas.addEventListener('pointerup', drop);
  canvas.addEventListener('pointercancel', drop);
  // Doppelklick: setzt beim Umbauen einen Sensor an seinen üblichen Platz zurück (mit Symmetrie auch den
  // gegenüber), sonst räumt er ein Hindernis weg
  onDoubleTap(canvas, (e) => {
    if (editing) return;
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
    if (hit){ sim.obstacles = sim.obstacles.filter(o => o !== hit); remember(); draw(); }
  });

  // Tasten beim Umbauen, für den gewählten Sensor: Pfeile versetzen ihn um einen Rasterschritt (mit Alt um einen
  // Millimeter), R dreht ihn um 15 Grad nach rechts, Umschalt+R nach links (mit Alt um ein Grad).
  canvas.tabIndex = 0;
  canvas.addEventListener('keydown', (e) => {
    if (editing){
      // Bahn bauen: R dreht die Platte unter dem Zeiger, Entf leert das Feld
      if (!hover || e.ctrlKey || e.metaKey) return;
      if (e.key.toLowerCase() === 'r') editor.turn(hover); else if (e.key === 'Delete' || e.key === 'Backspace') editor.erase(hover); else return;
      e.preventDefault();
      return;
    }
    const at = building && selected ? sim.mount(selected) : null;
    if (!selected || !at || e.ctrlKey || e.metaKey) return;
    const usual = defaultMounts(sim.robot), step = snapping(e) ? GRID_MM : 1;
    const move = ({ArrowUp:[step, 0], ArrowDown:[-step, 0], ArrowLeft:[0, -step], ArrowRight:[0, step]} as Record<string, number[]>)[e.key];
    // (die andere Richtung bleibt genau, wie sie ist – sonst spränge ein Sensor neben dem Raster beim ersten Schritt auch seitlich)
    if (move) sim.mounts = placeSensor(sim.robot, sim.mounts, selected, {x:at.x + move[0], y:at.y + move[1]}, usual,
      {grid:snapping(e), symmetry:build.symmetry, fixed:move[0] ? {y:at.y} : {x:at.x}});
    else if (e.key.toLowerCase() === 'r') sim.mounts = rotateSensor(sim.robot, sim.mounts, selected, (at.angle ?? 0) + (e.shiftKey ? -1 : 1) * (snapping(e) ? ANGLE_STEP : 1), usual, {step:0, symmetry:build.symmetry});
    else if (e.key === 'Escape') selected = null;
    else return;
    e.preventDefault();
    remember(); draw();
  });

  new ResizeObserver(layout).observe(stage);
  readRobot();
  return {
    programChanged(){ if (!runner) readRobot(); },
    setShown(on){ shown = on; if (on) layout(); else if (runner) finish(runner, '— Simulation angehalten —'); }
  };
}
