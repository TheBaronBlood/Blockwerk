// ---------------------------------------------------------------
// Nachschlagewerk der Pybricks-Klassen, aufgebaut wie eine Python-Dokumentation: Woher kommt die Klasse
// (Import), wie legt man ein Objekt an, welche Funktionen hat es – und welche Blöcke benutzen sie.
// Von Hand steht hier nur, was die Klasse ist und wie ihre Funktionen aufgerufen werden. Welche Blöcke
// eine Funktion erzeugen und wie die Zeile im Programm aussieht, ergibt sich aus den Beispielen der
// Blockhilfe (words.ts). Die Erklärung einer Funktion kommt aus PY_DOCS, wenn dort eine steht.
// Geprüft gegen das Paket `pybricks` 4.0.0. Ohne DOM.
// ---------------------------------------------------------------
import { PY_DOCS } from './python';
import { wordUsage } from './words';

export interface PyMethod {
  /** Weg vom Objekt zur Funktion: `straight`, beim Hub auch `display.text`. */
  path: string;
  /** Aufruf mit den Namen der Eingaben, wie in der Dokumentation von Pybricks: `straight(distance)`. */
  call: string;
  /** Was die Eingaben bedeuten – oder was zurückkommt. */
  detail: string;
  /** Eigene Erklärung, wenn die aus PY_DOCS nicht passt (dasselbe Wort bei zwei Klassen). */
  text?: string;
}
export interface PyClass {
  name: string;
  /** Modul, aus dem die Klasse importiert wird. */
  module: string;
  /** So heißt das Objekt in Programmen von Blockwerk. */
  variable: string;
  /** Muster für diesen Namen im Code (regulärer Ausdruck). */
  object: string;
  /** Die Zeile, die das Objekt anlegt. */
  create: string;
  text: string;
  methods: PyMethod[];
}

export const PY_CLASSES: PyClass[] = [
  {name:'PrimeHub', module:'pybricks.hubs', variable:'hub', object:'hub', create:'hub = PrimeHub()',
   text:'Der Hub selbst – der gelbe Kasten mit Lichtmatrix, Lautsprecher, Tasten und eingebautem Bewegungssensor. Seine Teile erreicht man mit einem Punkt: `hub.display` ist die Lichtmatrix, `hub.speaker` der Lautsprecher, `hub.light` das Licht an der mittleren Taste, `hub.imu` der Bewegungssensor, `hub.buttons` die Tasten.',
   methods:[
     {path:'display.text', call:'hub.display.text(text)', detail:'`text`: der Text, der Buchstabe für Buchstabe über die Lichtmatrix läuft.', text:'Zeigt einen Text auf der Lichtmatrix.'},
     {path:'display.number', call:'hub.display.number(number)', detail:'`number`: eine ganze Zahl von -99 bis 99.', text:'Zeigt eine Zahl auf der Lichtmatrix.'},
     {path:'display.icon', call:'hub.display.icon(icon)', detail:'`icon`: ein eingebautes Bild wie `Icon.HAPPY` – oder ein eigenes Muster als Liste aus fünf Zeilen mit je fünf Helligkeiten.', text:'Zeigt ein Bild auf der Lichtmatrix.'},
     {path:'display.off', call:'hub.display.off()', detail:'Keine Eingaben.', text:'Schaltet die Lichtmatrix aus.'},
     {path:'speaker.beep', call:'hub.speaker.beep(frequency, duration)', detail:'`frequency`: Tonhöhe in Hz. `duration`: Dauer in ms.'},
     {path:'light.on', call:'hub.light.on(color)', detail:'`color`: eine Farbe wie `Color.GREEN`.', text:'Schaltet das Licht an der mittleren Taste in einer Farbe ein.'},
     {path:'light.off', call:'hub.light.off()', detail:'Keine Eingaben.', text:'Schaltet das Licht an der mittleren Taste aus.'},
     {path:'imu.heading', call:'hub.imu.heading()', detail:'Liefert den Winkel in Grad.'},
     {path:'imu.reset_heading', call:'hub.imu.reset_heading(angle)', detail:'`angle`: der Winkel, der ab jetzt für die jetzige Richtung gilt – meist 0.'},
     {path:'buttons.pressed', call:'hub.buttons.pressed()', detail:'Liefert eine Menge: alle Tasten, die gerade gedrückt sind. Geprüft wird mit `in`: `Button.LEFT in hub.buttons.pressed()`.', text:'Fragt die Tasten des Hubs ab. Die mittlere Taste beendet das Programm und lässt sich deshalb nicht abfragen.'}]},
  {name:'DriveBase', module:'pybricks.robotics', variable:'roboter', object:'roboter',
   create:'roboter = DriveBase(motor_A, motor_B, wheel_diameter=56, axle_track=112)',
   text:'Die Fahrbasis: Sie fasst zwei Motoren zu einem Fahrzeug zusammen. Mit dem Raddurchmesser (`wheel_diameter`) und der Spurbreite (`axle_track`, Abstand der Räder) rechnet sie selbst aus, wie weit sich jeder Motor drehen muss. Danach gibt man Strecken in Millimetern und Drehungen in Grad an.',
   methods:[
     {path:'straight', call:'roboter.straight(distance)', detail:'`distance`: Strecke in mm, negativ für rückwärts.'},
     {path:'turn', call:'roboter.turn(angle)', detail:'`angle`: Winkel in Grad, positiv nach rechts, negativ nach links.'},
     {path:'arc', call:'roboter.arc(radius, angle)', detail:'`radius`: Radius des Kreises in mm. `angle`: wie weit der Bogen geht, in Grad.'},
     {path:'drive', call:'roboter.drive(speed, turn_rate)', detail:'`speed`: Tempo in mm/s. `turn_rate`: Drehrate in Grad/s, 0 für geradeaus.'},
     {path:'stop', call:'roboter.stop()', detail:'Keine Eingaben.', text:'Hält die Fahrbasis an; die Motoren rollen aus.'},
     {path:'brake', call:'roboter.brake()', detail:'Keine Eingaben.', text:'Hält die Fahrbasis an und bremst die Motoren.'},
     {path:'settings', call:'roboter.settings(straight_speed, turn_rate)', detail:'`straight_speed`: Tempo für `straight` in mm/s. `turn_rate`: Drehtempo für `turn` in Grad/s. Die Namen werden mitgeschrieben: `straight_speed=300`.'},
     {path:'use_gyro', call:'roboter.use_gyro(use_gyro)', detail:'`use_gyro`: `True` schaltet den Gyrosensor ein, `False` aus.'},
     {path:'reset', call:'roboter.reset()', detail:'Keine Eingaben.', text:'Stellt die gemessene Strecke und den gemessenen Winkel der Fahrbasis auf 0.'},
     {path:'distance', call:'roboter.distance()', detail:'Liefert die Strecke in mm.', text:'Die Strecke, die die Fahrbasis seit dem letzten `reset()` gefahren ist.'},
     {path:'angle', call:'roboter.angle()', detail:'Liefert den Winkel in Grad.', text:'Der Winkel, um den sich der Roboter seit dem letzten `reset()` gedreht hat.'}]},
  {name:'Motor', module:'pybricks.pupdevices', variable:'motor_C (der Buchstabe ist der Anschluss)', object:'motor_[A-F]',
   create:'motor_C = Motor(Port.C)',
   text:'Ein einzelner Motor an einem Anschluss – etwa für einen Greifarm. Soll er andersherum zählen, steht beim Anlegen zusätzlich `Direction.COUNTERCLOCKWISE`. Tempo wird in Grad pro Sekunde angegeben, Winkel in Grad. Achtung bei der Reihenfolge: zuerst immer das Tempo.',
   methods:[
     {path:'run', call:'motor.run(speed)', detail:'`speed`: Tempo in Grad/s, negativ für die andere Richtung.'},
     {path:'run_angle', call:'motor.run_angle(speed, rotation_angle)', detail:'`speed`: Tempo in Grad/s. `rotation_angle`: wie weit er sich weiterdreht, in Grad.'},
     {path:'run_time', call:'motor.run_time(speed, time)', detail:'`speed`: Tempo in Grad/s. `time`: Dauer in ms.'},
     {path:'run_target', call:'motor.run_target(speed, target_angle)', detail:'`speed`: Tempo in Grad/s. `target_angle`: die Stellung, die er anfahren soll, in Grad.'},
     {path:'stop', call:'motor.stop()', detail:'Keine Eingaben.', text:'Schaltet den Motor ab; er rollt aus.'},
     {path:'brake', call:'motor.brake()', detail:'Keine Eingaben.', text:'Bremst den Motor ab.'},
     {path:'hold', call:'motor.hold()', detail:'Keine Eingaben.'},
     {path:'angle', call:'motor.angle()', detail:'Liefert die Stellung in Grad.', text:'Die Drehstellung des Motors.'},
     {path:'speed', call:'motor.speed()', detail:'Liefert das Tempo in Grad/s.'},
     {path:'reset_angle', call:'motor.reset_angle(angle)', detail:'`angle`: der Wert, der ab jetzt für die jetzige Stellung gilt – meist 0.'}]},
  {name:'ColorSensor', module:'pybricks.pupdevices', variable:'farbe_C (der Buchstabe ist der Anschluss)', object:'farbe_[A-F]',
   create:'farbe_C = ColorSensor(Port.C)',
   text:'Der Farbsensor. Er erkennt Farben und misst, wie hell der Untergrund ist. Von sich aus meldet er nur Rot, Gelb, Grün, Blau, Weiß und »keine Farbe« – kein Schwarz. Für schwarze Linien nimmt man deshalb die Helligkeit (`reflection`).',
   methods:[
     {path:'color', call:'sensor.color()', detail:'Liefert eine Farbe wie `Color.RED` – oder `Color.NONE`, wenn er keine erkennt.'},
     {path:'reflection', call:'sensor.reflection()', detail:'Liefert eine Zahl von 0 (dunkel) bis 100 (hell).'},
     {path:'detectable_colors', call:'sensor.detectable_colors(colors)', detail:'`colors`: eine Liste der Farben, die er unterscheiden soll.'}]},
  {name:'UltrasonicSensor', module:'pybricks.pupdevices', variable:'abstand_D (der Buchstabe ist der Anschluss)', object:'abstand_[A-F]',
   create:'abstand_D = UltrasonicSensor(Port.D)',
   text:'Der Abstandssensor. Er misst mit Ultraschall, wie weit das nächste Hindernis entfernt ist.',
   methods:[
     {path:'distance', call:'sensor.distance()', detail:'Liefert den Abstand in mm – und 2000, wenn er nichts erkennt.', text:'Die Entfernung zum nächsten Hindernis.'}]},
  {name:'ForceSensor', module:'pybricks.pupdevices', variable:'kraft_E (der Buchstabe ist der Anschluss)', object:'kraft_[A-F]',
   create:'kraft_E = ForceSensor(Port.E)',
   text:'Der Kraftsensor: ein Taster, der auch misst, wie fest er gedrückt wird.',
   methods:[
     {path:'pressed', call:'sensor.pressed()', detail:'Liefert `True` oder `False`.', text:'Ob der Kraftsensor gerade gedrückt ist.'},
     {path:'force', call:'sensor.force()', detail:'Liefert die Kraft in Newton, etwa 0 bis 10.'}]},
  {name:'StopWatch', module:'pybricks.tools', variable:'stoppuhr', object:'stoppuhr', create:'stoppuhr = StopWatch()',
   text:'Eine Stoppuhr. Sie läuft, sobald sie angelegt ist, und zählt in Millisekunden.',
   methods:[
     {path:'time', call:'stoppuhr.time()', detail:'Liefert die Zeit in ms.'},
     {path:'reset', call:'stoppuhr.reset()', detail:'Keine Eingaben.', text:'Stellt die Stoppuhr auf 0.'}]},
  {name:'XboxController', module:'pybricks.iodevices', variable:'controller', object:'controller', create:'controller = XboxController()',
   text:'Ein Xbox-Controller, der über Bluetooth direkt mit dem Hub verbunden ist. Beim Anlegen sucht der Hub den Controller; das Programm geht erst weiter, wenn er gefunden ist.',
   methods:[
     {path:'joystick_left', call:'controller.joystick_left()', detail:'Liefert zwei Zahlen von -100 bis 100: seitlich und vor/zurück.'},
     {path:'joystick_right', call:'controller.joystick_right()', detail:'Liefert zwei Zahlen von -100 bis 100: seitlich und vor/zurück.'},
     {path:'triggers', call:'controller.triggers()', detail:'Liefert zwei Zahlen von 0 bis 100: linker und rechter Trigger.'},
     {path:'buttons.pressed', call:'controller.buttons.pressed()', detail:'Liefert eine Menge: alle Tasten, die gerade gedrückt sind.', text:'Fragt die Tasten des Controllers ab.'},
     {path:'rumble', call:'controller.rumble(power, duration)', detail:'`power`: Stärke von 0 bis 100. `duration`: Dauer in ms.'}]},
  {name:'Remote', module:'pybricks.pupdevices', variable:'fernbedienung', object:'fernbedienung', create:'fernbedienung = Remote()',
   text:'Die LEGO-Fernbedienung (Powered Up). Beim Anlegen sucht der Hub die Fernbedienung; das Programm geht erst weiter, wenn sie gefunden ist.',
   methods:[
     {path:'buttons.pressed', call:'fernbedienung.buttons.pressed()', detail:'Liefert eine Menge: alle Tasten, die gerade gedrückt sind.', text:'Fragt die Tasten der Fernbedienung ab.'},
     {path:'light.on', call:'fernbedienung.light.on(color)', detail:'`color`: eine Farbe wie `Color.BLUE`.', text:'Stellt die Farbe des Lichts an der Fernbedienung ein.'}]}
];

export const classByName = (name: string) => PY_CLASSES.find(c => c.name === name);
/** Der Name der Funktion ohne den Weg dorthin: `display.text` → `text`. */
export const methodName = (m: PyMethod) => m.path.split('.').pop()!;
/** Die Erklärung einer Funktion: die eigene, sonst die des Worts aus der Python-Hilfe. */
export const methodText = (m: PyMethod) => m.text ?? PY_DOCS[methodName(m)]?.text ?? '';

const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const callPattern = (c: PyClass, m: PyMethod) => new RegExp(`\\b${c.object}\\.${esc(m.path)}\\(`);

/** Welche Blöcke eine Funktion erzeugen, mit den Zeilen aus ihren Beispielen – aus der Blockhilfe abgeleitet. */
export function methodUsage(c: PyClass, m: PyMethod): {type: string; lines: string[]}[] {
  const pattern = callPattern(c, m);
  return wordUsage(methodName(m)).blocks
    .map(b => ({type:b.type, lines:b.lines.filter(l => pattern.test(l))}))
    .filter(b => b.lines.length);
}
/** Die Funktion einer Klasse, zu der eine Codezeile gehört, in der `word` angeklickt wurde. */
export function methodInLine(word: string, line: string): {cls: PyClass; method: PyMethod} | null {
  for (const cls of PY_CLASSES) for (const method of cls.methods)
    if (methodName(method) === word && callPattern(cls, method).test(line)) return {cls, method};
  return null;
}
