// ---------------------------------------------------------------
// Hilfetexte zu den Blöcken
// Text in `Backticks` wird als Code dargestellt. Das Python-Beispiel jeder Seite
// entsteht aus `example` mit dem echten Generator – es kann also nicht veralten.
// ---------------------------------------------------------------
import { N, T } from '../toolbox';
import { at, B, cmp, NB, refl, S, seq, setup, ws_, type BlockState, type WorkspaceState } from '../examples';

export interface BlockDoc {
  title: string;
  /** Was der Block tut, in einfachen Worten. Absätze durch Leerzeile trennen. */
  text: string;
  /** Eingabefelder: [Beschriftung, Erklärung mit Einheit]. */
  fields?: [string, string][];
  /** Erklärung der Python-Zeile, die der Block erzeugt. */
  python: string;
  /** Typische Stolpersteine. */
  tips?: string[];
  /** Kleines vollständiges Programm, das den Block benutzt. */
  example: () => WorkspaceState;
}

const prog = (...blocks: BlockState[]) => ws_([at(seq(B('pb_start'), ...blocks), 40, 40)]);
const drv = (...blocks: BlockState[]) => prog(setup(), ...blocks);
const blk = (block: BlockState) => ({block});
const straight = (mm: number) => B('pb_drive_straight', null, {DIST:N(mm)});
const turn = (deg: number) => B('pb_drive_turn', null, {ANGLE:N(deg)});
const wait = (ms: number) => B('pb_wait', null, {MS:N(ms)});
const showNum = (value: BlockState) => B('pb_display_number', null, {NUM:NB(0, value)});
const forever = (...blocks: BlockState[]) => B('pb_forever', null, {DO:S(...blocks)});
const waitUntil = (cond: BlockState) => B('pb_wait_until', null, {COND:blk(cond)});
const icon = (name: string) => B('pb_display_icon', {ICON:name});
/** Gibt einen Wert im Terminal aus. */
const say = (value: BlockState) => B('pb_print', null, {TEXT:{...T(''), block:value}});
const VAR = {id:'doc_var'};
const withVar = (name: string, ...blocks: BlockState[]) => ws_([at(seq(B('pb_start'), ...blocks), 40, 40)], [{name, id:VAR.id}]);
const setVar = (n: number) => B('variables_set', {VAR}, {VALUE:N(n)});
const getVar = () => B('variables_get', {VAR});

const list3 = () => B('lists_create_with', null, {ADD0:N(100), ADD1:N(200), ADD2:N(300)}, {itemCount:3});
/** Programm, das zuerst die Liste »Strecken« anlegt. */
const listEx = (...blocks: BlockState[]) => withVar('Strecken', B('variables_set', {VAR}, {VALUE:blk(list3())}), ...blocks);

const PORT_FIELD: [string, string] = ['Anschluss', 'Buchstabe A bis F, an dem das Gerät am Hub steckt.'];
const SPEED_FIELD: [string, string] = ['Tempo', 'Grad pro Sekunde. 360 ist eine Umdrehung pro Sekunde; negative Werte drehen rückwärts.'];

export const BLOCK_DOCS: Record<string, BlockDoc> = {
  // ----- Ereignisse -----
  pb_start: {
    title:'wenn Programm startet',
    text:'Hier beginnt das Programm. Der Hub arbeitet die Blöcke darunter von oben nach unten ab.\n\nBlöcke, die nicht an einem Startblock hängen, werden grau und nicht übersetzt.',
    python:'Der Startblock erzeugt selbst keine Zeile. Python fängt einfach in der ersten Zeile an. Darüber stehen die Importe und die Geräte – das ist der Kopf des Programms.',
    tips:['Gibt es mehrere Startblöcke oder weitere Ereignisse, laufen sie gleichzeitig. Das Programm sieht dann anders aus – siehe »wenn …«.'],
    example:() => prog(icon('HAPPY'), wait(2000))
  },
  pb_when: {
    title:'wenn …',
    text:'Die Blöcke darunter laufen jedes Mal, wenn die Bedingung wahr wird: wenn die Taste gedrückt wird, der Sensor Rot sieht oder etwas näher als 100 mm kommt. In das Feld passt jeder sechseckige Block.\n\nDas Ereignis läuft gleichzeitig mit dem übrigen Programm. Der Roboter kann also fahren und trotzdem auf eine Taste reagieren.\n\nAusgelöst wird nur beim Wechsel von falsch auf wahr. Bleibt die Taste gedrückt, läuft der Stapel einmal – erst nach dem Loslassen kann er wieder starten.',
    fields:[['Bedingung', 'Ein sechseckiger Block aus »Sensoren« oder »Operatoren«.']],
    python:'Gibt es mehr als ein Ereignis, wird jedes zu einer eigenen Funktion mit `async def`. Die letzte Zeile `run_task(multitask(...))` startet alle gleichzeitig. Vor jedem Befehl, der wartet oder einen Sensor abfragt, steht dann `await` – an diesen Stellen kommen die anderen Programmteile an die Reihe.\n\nDas Ereignis selbst ist eine Endlosschleife: warten, bis die Bedingung wahr ist, den Stapel ausführen, warten, bis sie wieder falsch ist.\n\nGibt es nur ein einziges Ereignis, bleibt das Programm ohne `async` und `await`.',
    tips:['Zwei Programmteile sollten nicht dieselben Motoren steuern – sie kommen sich sonst in die Quere.',
      'Läuft der Stapel noch, wird ein neues Auslösen übersehen.',
      'Eine Schleife ohne wartenden Befehl bekommt bei mehreren Ereignissen die Zeile `await wait(0)`. Ohne sie kämen die anderen Programmteile nie dran.',
      'Die mittlere Taste beendet das ganze Programm und eignet sich deshalb nicht als Ereignis.'],
    example:() => ws_([
      at(seq(B('pb_start'), setup(), forever(straight(200), turn(90))), 40, 40),
      at(seq(B('pb_when', null, {COND:blk(B('pb_button', {BUTTON:'LEFT'}))}), B('pb_beep', null, {FREQ:N(440), DUR:N(200)})), 40, 260)])
  },
  pb_when_message: {
    title:'wenn ich … empfange',
    text:'Die Blöcke darunter laufen jedes Mal, wenn ein anderer Programmteil mit »sende« eine Nachricht mit demselben Namen schickt. So stößt ein Programmteil einen anderen an.\n\nDen Namen der Nachricht wählt ihr selbst. Er muss bei »sende« und »wenn ich … empfange« genau gleich geschrieben sein.',
    fields:[['Name', 'Der Name der Nachricht, zum Beispiel »los«.']],
    python:'Der Stapel wird zur Funktion `nachricht_…`. Darin wartet `await warte_auf(\'los\')`, bis die Nachricht gesendet wurde. `warte_auf` steht im Kopf des Programms: Die Funktion merkt sich, wie oft die Nachricht bisher gesendet wurde, und wartet, bis die Zahl steigt.',
    tips:['Kommt die Nachricht, während der Stapel noch läuft, wird sie übersehen.',
      'Eine Nachricht bleibt im Hub. Andere Hubs oder Blockwerk bekommen sie nicht.'],
    example:() => ws_([
      at(seq(B('pb_start'), wait(1000), B('pb_send_message', {NAME:'los'})), 40, 40),
      at(seq(B('pb_when_message', {NAME:'los'}), icon('HAPPY')), 40, 200)])
  },
  pb_send_message: {
    title:'sende …',
    text:'Schickt eine Nachricht an alle Blöcke »wenn ich … empfange« mit demselben Namen. Das Programm wartet nicht auf sie, es macht sofort mit dem nächsten Block weiter.',
    fields:[['Name', 'Der Name der Nachricht. Er muss beim Empfänger genau gleich geschrieben sein.']],
    python:'`sende(\'los\')` ruft eine kleine Funktion aus dem Kopf des Programms auf. Sie zählt in `nachrichten` mit, wie oft jede Nachricht gesendet wurde. Die Empfänger schauen auf diese Zahl.',
    tips:['Wartet niemand auf die Nachricht, passiert nichts. Blockwerk meldet das als Hinweis.'],
    example:() => ws_([
      at(seq(B('pb_start'), B('pb_forever', null, {DO:S(waitUntil(B('pb_button', {BUTTON:'LEFT'})), B('pb_send_message', {NAME:'los'}), wait(500))})), 40, 40),
      at(seq(B('pb_when_message', {NAME:'los'}), B('pb_beep', null, {FREQ:N(440), DUR:N(200)})), 40, 260)])
  },

  // ----- Fahren -----
  pb_drive_setup: {
    title:'Fahrbasis einrichten',
    text:'Beschreibt euren Roboter: Welche Motoren treiben die Räder an, wie groß sind die Räder und wie weit stehen sie auseinander? Erst damit kann der Hub ausrechnen, wie weit er die Motoren für 200 mm Strecke oder 90 Grad Drehung drehen muss.\n\nDer Block gilt für das ganze Programm, egal an welcher Stelle er hängt.',
    fields:[['linker / rechter Motor', 'Anschlüsse der beiden Antriebsmotoren.'],
      ['Drehrichtung', 'Sind die Motoren spiegelbildlich eingebaut, muss einer »umgekehrt« laufen.'],
      ['Raddurchmesser', 'in mm. Das kleine SPIKE-Rad hat 56 mm, das große 88 mm.'],
      ['Spurbreite', 'Abstand zwischen den Mitten der beiden Räder in mm.'],
      ['Gyrosensor nutzen', 'Der Hub korrigiert mit seinem Drehsensor, damit der Roboter gerade fährt und genau dreht.']],
    python:'Aus diesem Block entstehen mehrere Zeilen im Kopf: je ein `Motor(Port.A, …)` für die beiden Motoren, dann `roboter = DriveBase(motor_A, motor_B, wheel_diameter=56, axle_track=112)`. `use_gyro(True)` schaltet die Korrektur mit dem Gyrosensor ein.',
    tips:['Fährt der Roboter rückwärts statt vorwärts: bei beiden Motoren die Drehrichtung umstellen.',
      'Dreht er sich im Kreis statt geradeaus zu fahren: nur bei einem Motor die Drehrichtung umstellen.',
      'Dreht er bei »90 Grad« zu weit oder zu wenig und der Gyrosensor ist aus: Spurbreite nachmessen.',
      'Fehlt der Block, nimmt Blockwerk Standardwerte (Motoren A und B, 56 mm, 112 mm).'],
    example:() => drv(straight(200))
  },
  pb_drive_straight: {
    title:'fahre geradeaus',
    text:'Der Roboter fährt die angegebene Strecke und bleibt dann stehen. Erst danach geht das Programm mit dem nächsten Block weiter.',
    fields:[['Strecke', 'in mm. 10 mm sind 1 cm. Negative Werte fahren rückwärts.']],
    python:'`roboter.straight(200)` – `roboter` ist die Fahrbasis, `straight` heißt geradeaus, und in der Klammer steht die Strecke in mm.',
    tips:['Die SPIKE-App rechnet in cm, Pybricks in mm: 20 cm sind 200 mm.'],
    example:() => drv(straight(200), wait(500), straight(-200))
  },
  pb_drive_turn: {
    title:'drehe auf der Stelle',
    text:'Der Roboter dreht sich auf der Stelle um den angegebenen Winkel: Ein Rad läuft vorwärts, das andere rückwärts.',
    fields:[['Winkel', 'in Grad. Positive Werte drehen nach rechts, negative nach links. 90 ist eine Vierteldrehung.']],
    python:'`roboter.turn(90)` – `turn` heißt drehen; die Zahl ist der Winkel des ganzen Roboters, nicht der Räder.',
    example:() => drv(turn(90), wait(500), turn(-90))
  },
  pb_drive_arc: {
    title:'fahre Kurve',
    text:'Der Roboter fährt einen Kreisbogen. Der Radius bestimmt, wie eng die Kurve ist, der Winkel, wie weit er sie fährt.',
    fields:[['Radius', 'in mm, gemessen vom Mittelpunkt des Kreises bis zur Mitte des Roboters. Positiv: Kurve nach rechts, negativ: nach links.'],
      ['Winkel', 'in Grad. 360 ist ein ganzer Kreis.']],
    python:'`roboter.arc(150, 90)` – zuerst der Radius, dann der Winkel. `arc` heißt Bogen.',
    tips:['Ein Radius von 0 ist dasselbe wie eine Drehung auf der Stelle.'],
    example:() => drv(B('pb_drive_arc', null, {RADIUS:N(150), ANGLE:N(180)}))
  },
  pb_drive_drive: {
    title:'fahre los',
    text:'Startet die Fahrt und geht sofort zum nächsten Block weiter. Der Roboter fährt so lange, bis ein Block »Fahrbasis anhalten« kommt oder das Programm endet.\n\nDas braucht ihr, wenn der Roboter fahren soll, bis ein Sensor etwas meldet.',
    fields:[['Tempo', 'in mm pro Sekunde. Negativ fährt rückwärts.'],
      ['Drehrate', 'in Grad pro Sekunde. 0 ist geradeaus, positive Werte lenken nach rechts.']],
    python:'`roboter.drive(200, 0)` – Tempo und Drehrate. Anders als `straight` wartet `drive` nicht, sondern läuft im Hintergrund weiter.',
    tips:['Steht direkt danach nichts mehr, endet das Programm und der Roboter bleibt sofort stehen. Es braucht ein »warte« oder »warte bis« danach.'],
    example:() => drv(B('pb_drive_drive', null, {SPEED:N(200), RATE:N(0)}), wait(2000), B('pb_drive_stop', {MODE:'brake'}))
  },
  pb_drive_stop: {
    title:'Fahrbasis anhalten / bremsen',
    text:'Beendet eine Fahrt, die mit »fahre los« gestartet wurde.',
    fields:[['anhalten', 'Die Motoren werden abgeschaltet, der Roboter rollt aus.'],
      ['bremsen', 'Die Motoren bremsen, der Roboter steht schneller.']],
    python:'`roboter.stop()` lässt ausrollen, `roboter.brake()` bremst.',
    example:() => drv(B('pb_drive_drive', null, {SPEED:N(150), RATE:N(0)}), waitUntil(cmp('LT', B('pb_distance', {PORT:'D'}), 100)), B('pb_drive_stop', {MODE:'brake'}))
  },
  pb_drive_settings: {
    title:'setze Fahrtempo und Drehtempo',
    text:'Legt fest, wie schnell »fahre geradeaus«, »drehe« und »fahre Kurve« ab jetzt sind. Die Einstellung gilt, bis sie wieder geändert wird.',
    fields:[['Fahrtempo', 'in mm pro Sekunde.'], ['Drehtempo', 'in Grad pro Sekunde.']],
    python:'`roboter.settings(straight_speed=300, turn_rate=180)` – die Werte haben Namen, damit klar ist, welche Zahl was bedeutet.',
    tips:['Langsamer ist genauer. Für präzise Aufgaben lieber 100 bis 200 mm/s.'],
    example:() => drv(B('pb_drive_settings', null, {SPEED:N(100), RATE:N(90)}), straight(200), turn(90))
  },
  pb_drive_reset: {
    title:'setze Strecke und Winkel auf 0',
    text:'Stellt die beiden Zähler der Fahrbasis – gefahrene Strecke und gedrehter Winkel – auf 0 zurück.',
    python:'`roboter.reset()` – `reset` heißt zurücksetzen.',
    example:() => drv(straight(300), B('pb_drive_reset'), straight(100), showNum(B('pb_drive_distance')), wait(2000))
  },
  pb_drive_distance: {
    title:'gefahrene Strecke',
    text:'Liefert, wie weit der Roboter seit dem Programmstart oder dem letzten Zurücksetzen gefahren ist. Rückwärtsfahren zieht ab.',
    python:'`roboter.distance()` – die leere Klammer bedeutet: Hier wird etwas abgefragt, ohne dass eine Angabe nötig ist. Das Ergebnis ist eine Zahl in mm.',
    example:() => drv(B('pb_drive_drive', null, {SPEED:N(150), RATE:N(0)}), waitUntil(cmp('GT', B('pb_drive_distance'), 500)), B('pb_drive_stop', {MODE:'brake'}))
  },
  pb_drive_angle: {
    title:'gedrehter Winkel',
    text:'Liefert, um wie viel Grad sich der Roboter seit dem Programmstart oder dem letzten Zurücksetzen gedreht hat. Rechts ist positiv.',
    python:'`roboter.angle()` – Ergebnis in Grad.',
    example:() => drv(turn(90), turn(45), say(B('pb_drive_angle')))
  },

  // ----- Motoren -----
  pb_motor_run_angle: {
    title:'Motor dreht sich um … Grad',
    text:'Dreht einen einzelnen Motor um einen bestimmten Winkel weiter und wartet, bis er fertig ist. Gut für Greifer und Arme.',
    fields:[PORT_FIELD, ['Winkel', 'in Grad. 360 ist eine volle Umdrehung, negative Werte drehen andersherum.'], SPEED_FIELD],
    python:'`motor_C.run_angle(500, 360)` – Achtung, in Python steht zuerst das Tempo, dann der Winkel. `motor_C` wird im Kopf des Programms mit `Motor(Port.C)` angelegt.',
    example:() => prog(B('pb_motor_run_angle', {PORT:'C'}, {ANGLE:N(360), SPEED:N(500)}))
  },
  pb_motor_run_time: {
    title:'Motor läuft … ms',
    text:'Lässt den Motor eine bestimmte Zeit laufen und wartet so lange.',
    fields:[PORT_FIELD, ['Zeit', 'in Millisekunden. 1000 ms sind eine Sekunde.'], SPEED_FIELD],
    python:'`motor_C.run_time(500, 1000)` – zuerst das Tempo, dann die Zeit.',
    example:() => prog(B('pb_motor_run_time', {PORT:'C'}, {TIME:N(1000), SPEED:N(500)}))
  },
  pb_motor_run_target: {
    title:'Motor fährt zur Position',
    text:'Dreht den Motor auf eine feste Stellung – egal, wo er gerade steht. Position 0 ist die Stellung beim Programmstart oder beim letzten »setze Winkel«.\n\nDamit landet ein Arm immer an derselben Stelle, auch wenn er vorher verschoben wurde.',
    fields:[PORT_FIELD, ['Position', 'in Grad.'], SPEED_FIELD],
    python:'`motor_C.run_target(500, 90)` – `target` heißt Ziel.',
    tips:['»dreht sich um 90 Grad« dreht jedes Mal 90 Grad weiter. »fährt zur Position 90« bleibt beim zweiten Mal stehen, weil der Motor schon dort ist.'],
    example:() => prog(B('pb_motor_reset', {PORT:'C'}, {ANGLE:N(0)}), B('pb_motor_run_target', {PORT:'C'}, {TARGET:N(90), SPEED:N(300)}), wait(1000), B('pb_motor_run_target', {PORT:'C'}, {TARGET:N(0), SPEED:N(300)}))
  },
  pb_motor_run: {
    title:'Motor startet',
    text:'Schaltet den Motor ein und geht sofort zum nächsten Block weiter. Er läuft, bis ein Block »Motor … ausrollen lassen / bremsen / Position halten« kommt.',
    fields:[PORT_FIELD, SPEED_FIELD],
    python:'`motor_C.run(500)` – läuft im Hintergrund weiter.',
    example:() => prog(B('pb_motor_run', {PORT:'C'}, {SPEED:N(500)}), wait(2000), B('pb_motor_stop', {PORT:'C', MODE:'brake'}))
  },
  pb_motor_stop: {
    title:'Motor anhalten',
    text:'Hält einen Motor an. Es gibt drei Arten.',
    fields:[PORT_FIELD, ['ausrollen lassen', 'Strom aus – der Motor dreht frei aus.'],
      ['bremsen', 'Der Motor bremst, lässt sich danach aber von Hand drehen.'],
      ['Position halten', 'Der Motor bleibt stehen und stemmt sich gegen jede Bewegung. Gut für Arme, die etwas tragen.']],
    python:'`motor_C.stop()`, `motor_C.brake()` oder `motor_C.hold()`.',
    example:() => prog(B('pb_motor_run', {PORT:'C'}, {SPEED:N(300)}), wait(1000), B('pb_motor_stop', {PORT:'C', MODE:'hold'}), wait(3000))
  },
  pb_motor_reset: {
    title:'setze Winkel von Motor',
    text:'Legt fest, welche Zahl die aktuelle Stellung des Motors bekommt. Meist nimmt man 0: Dann zählt die jetzige Stellung als Nullpunkt.',
    fields:[PORT_FIELD, ['Winkel', 'in Grad – der neue Wert für die aktuelle Stellung.']],
    python:'`motor_C.reset_angle(0)`.',
    example:() => prog(B('pb_motor_reset', {PORT:'C'}, {ANGLE:N(0)}), B('pb_motor_run_angle', {PORT:'C'}, {ANGLE:N(120), SPEED:N(300)}), showNum(B('pb_motor_angle', {PORT:'C'})), wait(2000))
  },
  pb_motor_angle: {
    title:'Winkel von Motor',
    text:'Liefert, wie weit der Motor seit dem Nullpunkt gedreht wurde. Der Wert zählt über 360 hinaus weiter und kann negativ sein.',
    fields:[PORT_FIELD],
    python:'`motor_C.angle()` – Ergebnis in Grad.',
    tips:['Der Motor misst auch, wenn man ihn von Hand dreht. So wird er zum Drehknopf.'],
    example:() => prog(forever(showNum(B('pb_motor_angle', {PORT:'C'})), wait(100)))
  },
  pb_motor_speed: {
    title:'Tempo von Motor',
    text:'Liefert, wie schnell sich der Motor gerade dreht.',
    fields:[PORT_FIELD],
    python:'`motor_C.speed()` – Ergebnis in Grad pro Sekunde.',
    example:() => prog(B('pb_motor_run', {PORT:'C'}, {SPEED:N(400)}), wait(1000), say(B('pb_motor_speed', {PORT:'C'})), B('pb_motor_stop', {PORT:'C', MODE:'stop'}))
  },

  // ----- Sensoren -----
  pb_color_is: {
    title:'Farbsensor sieht …',
    text:'Prüft, ob der Farbsensor gerade eine bestimmte Farbe erkennt. Das Ergebnis ist wahr oder falsch und passt in »falls« und »warte bis«.',
    fields:[PORT_FIELD, ['Farbe', 'Rot, Grün, Blau, Gelb, Weiß, Schwarz oder »keine Farbe«.']],
    python:'`farbe_C.color() == Color.RED` – `color()` fragt den Sensor, `==` vergleicht. Ein doppeltes Gleichheitszeichen heißt »ist gleich?«, ein einfaches weist einen Wert zu.',
    tips:['Von sich aus meldet der Sensor kein Schwarz. Wird im Block »Schwarz« gewählt, schreibt Blockwerk deshalb eine Zeile mit `detectable_colors([...])` in den Kopf, die Schwarz in die Liste der erkennbaren Farben aufnimmt.',
      'Für schwarze Linien ist »Reflexion« trotzdem meist zuverlässiger.',
      'Der Sensor sollte 1 bis 2 cm über der Fläche sitzen.'],
    example:() => drv(B('pb_drive_drive', null, {SPEED:N(100), RATE:N(0)}), waitUntil(B('pb_color_is', {PORT:'C', COLOR:'RED'})), B('pb_drive_stop', {MODE:'brake'}))
  },
  pb_reflection: {
    title:'Reflexion am Farbsensor',
    text:'Misst, wie viel Licht der Untergrund zurückwirft: 0 ist sehr dunkel, 100 sehr hell. Damit lassen sich schwarze Linien auf hellem Boden zuverlässig erkennen.',
    fields:[PORT_FIELD],
    python:'`farbe_C.reflection()` – Ergebnis in Prozent.',
    tips:['Die Werte hängen vom Licht im Raum ab. Erst messen (weißer Boden, schwarze Linie), dann den Grenzwert in die Mitte legen.'],
    example:() => prog(forever(showNum(refl()), wait(200)))
  },
  pb_distance: {
    title:'Abstand am Sensor',
    text:'Der Abstandssensor misst per Ultraschall, wie weit das nächste Hindernis entfernt ist.',
    fields:[PORT_FIELD],
    python:'`abstand_D.distance()` – Ergebnis in mm.',
    tips:['Sieht der Sensor nichts, liefert er 2000.', 'Sehr nahe (unter etwa 4 cm), schräge oder weiche Flächen erkennt er schlecht.'],
    example:() => drv(B('pb_drive_drive', null, {SPEED:N(150), RATE:N(0)}), waitUntil(cmp('LT', B('pb_distance', {PORT:'D'}), 100)), B('pb_drive_stop', {MODE:'brake'}))
  },
  pb_force_pressed: {
    title:'Kraftsensor gedrückt',
    text:'Wahr, sobald der Taster des Kraftsensors gedrückt ist. Praktisch als Startknopf oder als Stoßstange.',
    fields:[PORT_FIELD],
    python:'`kraft_E.pressed()` – Ergebnis ist `True` oder `False`.',
    example:() => prog(icon('ARROW_UP'), waitUntil(B('pb_force_pressed', {PORT:'E'})), icon('HAPPY'), wait(2000))
  },
  pb_force: {
    title:'Kraft am Sensor',
    text:'Liefert, wie fest der Kraftsensor gedrückt wird.',
    fields:[PORT_FIELD],
    python:'`kraft_E.force()` – Ergebnis in Newton, von 0 bis etwa 10.',
    example:() => prog(forever(showNum(B('pb_force', {PORT:'E'})), wait(100)))
  },
  pb_heading: {
    title:'Ausrichtung des Hubs',
    text:'Der Hub hat einen eingebauten Gyrosensor. Er merkt sich, wie weit sich der Hub seit dem Start gedreht hat – auch wenn der Roboter geschoben wird.',
    python:'`hub.imu.heading()` – `imu` ist der Bewegungssensor im Hub. Ergebnis in Grad, rechts herum positiv; der Wert zählt über 360 hinaus weiter.',
    tips:['Beim Programmstart muss der Hub ruhig stehen, sonst driftet der Wert.'],
    example:() => prog(forever(showNum(B('pb_heading')), wait(100)))
  },
  pb_reset_heading: {
    title:'setze Ausrichtung des Hubs',
    text:'Legt fest, welchen Wert die aktuelle Richtung bekommt. Mit 0 wird die jetzige Blickrichtung zum neuen Bezug.',
    fields:[['Winkel', 'in Grad.']],
    python:'`hub.imu.reset_heading(0)`.',
    example:() => drv(turn(90), B('pb_reset_heading', null, {ANGLE:N(0)}), showNum(B('pb_heading')), wait(2000))
  },
  pb_button: {
    title:'Hub-Taste gedrückt',
    text:'Wahr, solange die linke oder rechte Taste am Hub gedrückt ist.',
    fields:[['Taste', 'links oder rechts.']],
    python:'`Button.LEFT in hub.buttons.pressed()` – `pressed()` liefert die Menge aller gerade gedrückten Tasten; `in` prüft, ob die gesuchte dabei ist.',
    tips:['Die mittlere Taste beendet bei Pybricks das Programm und lässt sich deshalb nicht abfragen.'],
    example:() => prog(forever(B('controls_if', null, {IF0:blk(B('pb_button', {BUTTON:'LEFT'})), DO0:S(icon('ARROW_LEFT'))}),
      B('controls_if', null, {IF0:blk(B('pb_button', {BUTTON:'RIGHT'})), DO0:S(icon('ARROW_RIGHT'))}), wait(50)))
  },
  pb_timer_reset: {
    title:'setze Stoppuhr auf 0',
    text:'Startet die Zeitmessung neu.',
    python:'`stoppuhr.reset()` – die Stoppuhr wird im Kopf mit `stoppuhr = StopWatch()` angelegt.',
    example:() => drv(B('pb_timer_reset'), straight(500), say(B('pb_timer')))
  },
  pb_timer: {
    title:'Stoppuhr',
    text:'Liefert die Zeit seit dem Programmstart oder dem letzten Zurücksetzen.',
    python:'`stoppuhr.time()` – Ergebnis in Millisekunden. 1000 ms sind eine Sekunde.',
    example:() => prog(B('controls_whileUntil', {MODE:'WHILE'}, {BOOL:blk(cmp('LT', B('pb_timer'), 5000)), DO:S(icon('HEART'), wait(300), B('pb_display_off'), wait(300))}))
  },

  // ----- Licht und Ton -----
  pb_display_text: {
    title:'zeige Text',
    text:'Lässt einen Text Buchstabe für Buchstabe über die Lichtmatrix laufen. Das Programm wartet, bis der Text durch ist.',
    fields:[['Text', 'Buchstaben und Ziffern. Umlaute kann die Matrix nicht darstellen.']],
    python:'`hub.display.text(\'Hallo\')` – Text steht in Python immer in Anführungszeichen. Steckt eine Zahl im Block, macht `str(…)` daraus einen Text.',
    example:() => prog(B('pb_display_text', null, {TEXT:T('Hallo')}))
  },
  pb_display_number: {
    title:'zeige Zahl',
    text:'Zeigt eine Zahl auf der Lichtmatrix und geht sofort weiter.',
    fields:[['Zahl', 'von −99 bis 99. Größere Zahlen passen nicht auf die Matrix.']],
    python:'`hub.display.number(42)`.',
    tips:['Für größere Werte oder Kommazahlen »gib … im Terminal aus« nehmen.'],
    example:() => prog(B('controls_repeat_ext', null, {TIMES:N(3), DO:S(B('pb_display_number', null, {NUM:N(42)}), wait(500), B('pb_display_off'), wait(500))}))
  },
  pb_display_icon: {
    title:'zeige Bild',
    text:'Zeigt ein fertiges Bild auf der Lichtmatrix. Es bleibt stehen, bis etwas anderes angezeigt wird.',
    python:'`hub.display.icon(Icon.HAPPY)` – `Icon` ist die Sammlung der eingebauten Bilder.',
    tips:['Endet das Programm direkt danach, verschwindet das Bild sofort. Ein »warte« dahinter hilft.'],
    example:() => prog(icon('HEART'), wait(2000))
  },
  pb_display_pixels: {
    title:'zeige Muster',
    text:'Zeigt ein eigenes Muster auf der Lichtmatrix. Ein Klick auf das kleine Muster im Block öffnet den Editor.\n\nIm Editor schaltest du Punkte mit einem Klick an und aus; mit gedrückter Maustaste kannst du malen. Rechts wählst du die Helligkeit, unten stehen Vorlagen zum Weiterbearbeiten.',
    fields:[['Muster', '5 × 5 Punkte, jeder von aus bis voll hell.']],
    python:'`hub.display.icon([...])` bekommt eine Liste mit fünf Zeilen. Jede Zeile ist wieder eine Liste mit fünf Zahlen: die Helligkeit der Punkte in Prozent, `0` ist aus und `100` voll hell.',
    tips:['Für die fertigen Bilder wie Smiley oder Pfeile ist »zeige Bild« kürzer.', 'Mehrere Muster nacheinander mit kurzem »warte« dazwischen ergeben eine Animation.'],
    example:() => prog(B('pb_display_pixels', {PIXELS:'0000009090000009000909990'}), wait(2000))
  },
  pb_display_off: {
    title:'schalte Lichtmatrix aus',
    text:'Löscht alles, was auf der Lichtmatrix zu sehen ist.',
    python:'`hub.display.off()`.',
    example:() => prog(icon('HAPPY'), wait(1000), B('pb_display_off'), wait(1000))
  },
  pb_light: {
    title:'Statuslicht',
    text:'Stellt die Farbe des Lichts rund um die mittlere Taste ein oder schaltet es aus.',
    python:'`hub.light.on(Color.GREEN)` schaltet ein, `hub.light.off()` aus.',
    example:() => prog(B('pb_light', {COLOR:'RED'}), wait(1000), B('pb_light', {COLOR:'GREEN'}), wait(1000))
  },
  pb_beep: {
    title:'Piepton',
    text:'Spielt einen Ton und wartet, bis er vorbei ist.',
    fields:[['Frequenz', 'in Hertz (Hz) – die Tonhöhe. 440 Hz ist der Kammerton a, die doppelte Zahl klingt eine Oktave höher.'],
      ['Dauer', 'in Millisekunden.']],
    python:'`hub.speaker.beep(440, 200)` – zuerst die Tonhöhe, dann die Dauer.',
    example:() => prog(B('pb_beep', null, {FREQ:N(440), DUR:N(200)}), B('pb_beep', null, {FREQ:N(660), DUR:N(200)}), B('pb_beep', null, {FREQ:N(880), DUR:N(400)}))
  },
  pb_print: {
    title:'gib … im Terminal aus',
    text:'Schreibt einen Text oder einen Wert ins Terminal unter dem Python-Code. Das ist das wichtigste Werkzeug zur Fehlersuche: So seht ihr, was ein Sensor wirklich misst oder welchen Wert eine Variable hat.',
    python:'`print(\'Hallo\')` – `print` gibt es in jedem Python, nicht nur bei Pybricks.',
    tips:['Die Ausgabe erscheint nur, solange der Hub verbunden ist.'],
    example:() => prog(forever(say(refl()), wait(500)))
  },

  // ----- Fernsteuerung -----
  pb_pad_stick: {
    title:'Steuerfeld: Joystick',
    text:'Liefert die Stellung des Joysticks im Steuerfeld von Blockwerk. So lässt sich der Roboter vom Computer oder Handy aus live steuern, während das Programm läuft.\n\nDas Steuerfeld öffnet sich über den Knopf »Steuerfeld« über dem Python-Code. Der Hub muss dazu mit Blockwerk verbunden bleiben.\n\nEin Controller, der mit dem Handy, Tablet oder Computer verbunden ist (Xbox, PlayStation und andere), bedient das Steuerfeld ebenfalls: linker Stick oder Steuerkreuz für den Joystick, die vier Tasten rechts für A bis D. Drückt einmal eine Taste am Controller, dann zeigt Blockwerk an, dass es ihn erkannt hat.\n\nAuf dem Tablet und über »Controller-Ansicht« füllt das Steuerfeld den ganzen Bildschirm: Joystick links, Tasten rechts, für beide Daumen. Mit »Anordnen« schiebt ihr Joystick und Tasten in einem Raster an die Stelle, die euch am besten passt, und ändert ihre Größe. Blockwerk merkt sich die Anordnung.',
    fields:[['x (seitlich)', '−100 ganz links, 0 Mitte, 100 ganz rechts.'], ['y (vor und zurück)', '100 ganz vorn, 0 Mitte, −100 ganz hinten.']],
    python:'`steuerung(\'x\')` – die Funktion `steuerung` steht im Kopf des Programms. Sie liest, was Blockwerk seit dem letzten Mal geschickt hat, und gibt den gewünschten Wert zurück.',
    tips:['Der Block muss in einer Schleife immer wieder abgefragt werden, sonst merkt das Programm nichts von der Bewegung.',
      'Die Werte kommen in Zehnerschritten an. Mit »mal 3« wird aus 100 ein Tempo von 300 mm/s.',
      'Bricht die Verbindung ab oder wird das Browserfenster verdeckt, stellt das Programm nach einer Sekunde Joystick und Tasten auf Ruhe – der Roboter bleibt stehen.',
      'Tastatur: Erst ins Steuerfeld klicken, dann steuern die Pfeiltasten oder W, A, S, D den Joystick.',
      'Joystick und Tasten lassen sich gleichzeitig bedienen – mit zwei Fingern oder mit Tastatur und Maus.'],
    example:() => drv(forever(B('pb_drive_drive', null, {
      SPEED:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('pb_pad_stick', {AXIS:'y'})), B:N(3)})),
      RATE:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('pb_pad_stick', {AXIS:'x'})), B:N(2)}))}), wait(20)))
  },
  pb_pad_button: {
    title:'Steuerfeld: Taste gedrückt',
    text:'Wahr, solange eine der vier Tasten A bis D im Steuerfeld von Blockwerk gedrückt ist.',
    fields:[['Taste', 'A, B, C oder D. Auf der Tastatur die Zifferntasten 1 bis 4, nachdem ins Steuerfeld geklickt wurde.']],
    python:'`steuerung(\'A\')` liefert `True` oder `False`.',
    example:() => prog(forever(B('controls_if', null, {IF0:blk(B('pb_pad_button', {BUTTON:'A'})), DO0:S(icon('HAPPY')), ELSE:S(B('pb_display_off'))}, {hasElse:true}), wait(20)))
  },
  pb_xbox_stick: {
    title:'Controller: Stick',
    text:'Liefert die Stellung eines der beiden Sticks am Xbox-Controller. Der Hub verbindet sich beim Programmstart selbst per Bluetooth mit dem Controller – ein Computer ist dafür nicht nötig.\n\nOb die Verbindung steht, seht ihr in Blockwerk: Neben dem Namen des Hubs steht erst »sucht Xbox-Controller …« und dann »Xbox-Controller verbunden«. Im Terminal erscheinen dieselben Meldungen.',
    fields:[['Stick', 'links oder rechts.'], ['Achse', 'x ist seitlich, y ist vor und zurück. Werte von −100 bis 100, in der Mitte 0.']],
    python:'`controller.joystick_left()[1]` – `joystick_left()` liefert zwei Zahlen auf einmal: x und y. Die eckige Klammer wählt eine aus; gezählt wird ab 0, also ist `[0]` x und `[1]` y.',
    tips:['Vor dem Start den Controller einschalten und die Kopplungstaste oben gedrückt halten, bis das Xbox-Licht schnell blinkt.',
      'Der Controller darf dabei nicht mit dem Handy, Tablet oder Computer verbunden sein – sonst findet der Hub ihn nicht. Dort erst trennen oder Bluetooth kurz ausschalten.',
      'Soll der Controller am Handy oder Computer bleiben, nehmt die Blöcke »Steuerfeld: …«. Ein Controller am Gerät bedient das Steuerfeld von Blockwerk.',
      'Findet der Hub nach 10 Sekunden keinen Controller, bricht das Programm mit einem Fehler ab.',
      'Es funktionieren Xbox-Controller mit Bluetooth (ab Modell 1708). PlayStation- und Switch-Controller unterstützt Pybricks nicht.'],
    example:() => drv(forever(B('pb_drive_drive', null, {
      SPEED:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('pb_xbox_stick', {SIDE:'left', AXIS:'1'})), B:N(3)})),
      RATE:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('pb_xbox_stick', {SIDE:'right', AXIS:'0'})), B:N(2)}))}), wait(20)))
  },
  pb_xbox_trigger: {
    title:'Controller: Trigger',
    text:'Liefert, wie weit einer der beiden Trigger (die Hebel hinten am Controller) gedrückt ist.',
    fields:[['Seite', 'links oder rechts. Werte von 0 (losgelassen) bis 100 (ganz gedrückt).']],
    python:'`controller.triggers()[0]` – `triggers()` liefert beide Werte, `[0]` ist der linke, `[1]` der rechte.',
    example:() => prog(forever(B('pb_motor_run', {PORT:'C'}, {SPEED:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('pb_xbox_trigger', {SIDE:'1'})), B:N(5)}))}), wait(20)))
  },
  pb_xbox_button: {
    title:'Controller: Taste gedrückt',
    text:'Wahr, solange die gewählte Taste am Xbox-Controller gedrückt ist.',
    fields:[['Taste', 'A, B, X, Y, die Schultertasten LB und RB, das Steuerkreuz oder die Tasten Menü und Ansicht.']],
    python:'`Button.A in controller.buttons.pressed()` – `pressed()` liefert alle gerade gedrückten Tasten; `in` prüft, ob die gesuchte dabei ist.',
    example:() => prog(forever(B('controls_if', null, {IF0:blk(B('pb_xbox_button', {BUTTON:'A'})), DO0:S(B('pb_beep', null, {FREQ:N(880), DUR:N(100)}))}), wait(20)))
  },
  pb_xbox_rumble: {
    title:'Controller vibriert',
    text:'Lässt den Xbox-Controller vibrieren – zum Beispiel als Rückmeldung, wenn der Roboter irgendwo anstößt. Das Programm wartet nicht, sondern läuft sofort weiter.',
    fields:[['Stärke', 'in Prozent, 0 bis 100.'], ['Dauer', 'in Millisekunden.']],
    python:'`controller.rumble(100, 200)` – zuerst die Stärke, dann die Dauer. `rumble` heißt rumpeln.',
    example:() => prog(forever(B('controls_if', null, {IF0:blk(B('pb_force_pressed', {PORT:'E'})), DO0:S(B('pb_xbox_rumble', null, {POWER:N(100), DUR:N(200)}), wait(300))}), wait(20)))
  },
  pb_remote_button: {
    title:'Fernbedienung: Taste gedrückt',
    text:'Wahr, solange die gewählte Taste an der LEGO-Fernbedienung (Powered Up, Nr. 88010) gedrückt ist. Der Hub verbindet sich beim Programmstart selbst mit der Fernbedienung.',
    fields:[['Taste', 'links und rechts je Plus, Rot und Minus, dazu die grüne Taste in der Mitte.']],
    python:'`Button.LEFT_PLUS in fernbedienung.buttons.pressed()`.',
    tips:['Vor dem Start die grüne Taste der Fernbedienung drücken, damit ihr Licht blinkt.',
      'Findet der Hub nach 10 Sekunden keine Fernbedienung, bricht das Programm mit einem Fehler ab.'],
    example:() => drv(forever(
      B('controls_if', null, {IF0:blk(B('pb_remote_button', {BUTTON:'LEFT_PLUS'})), DO0:S(B('pb_drive_drive', null, {SPEED:N(200), RATE:N(0)})), ELSE:S(B('pb_drive_stop', {MODE:'stop'}))}, {hasElse:true}), wait(20)))
  },
  pb_remote_light: {
    title:'Licht der Fernbedienung',
    text:'Stellt die Farbe des Lichts an der LEGO-Fernbedienung ein. Praktisch, um mehrere Fernbedienungen zu unterscheiden oder einen Zustand anzuzeigen.',
    python:'`fernbedienung.light.on(Color.GREEN)` schaltet ein, `fernbedienung.light.off()` aus.',
    example:() => prog(B('pb_remote_light', {COLOR:'BLUE'}), waitUntil(B('pb_remote_button', {BUTTON:'CENTER'})), B('pb_remote_light', {COLOR:'GREEN'}), wait(1000))
  },

  // ----- Steuerung -----
  pb_wait: {
    title:'warte',
    text:'Das Programm macht eine Pause. Motoren, die mit »startet« oder »fahre los« eingeschaltet wurden, laufen in der Pause weiter.',
    fields:[['Zeit', 'in Millisekunden. 1000 ms sind eine Sekunde.']],
    python:'`wait(1000)` – `wait` kommt aus `pybricks.tools` und wird im Kopf importiert.',
    example:() => prog(icon('HAPPY'), wait(1000), icon('SAD'), wait(1000))
  },
  controls_repeat_ext: {
    title:'wiederhole … mal',
    text:'Führt die Blöcke im Inneren so oft aus, wie angegeben. Danach geht es unter dem Block weiter.',
    fields:[['Anzahl', 'wie oft wiederholt wird.']],
    python:'`for count in range(4):` – `range(4)` zählt 0, 1, 2, 3, also viermal. Alles, was darunter eingerückt steht, gehört zur Schleife.',
    example:() => drv(B('controls_repeat_ext', null, {TIMES:N(4), DO:S(straight(200), turn(90))}))
  },
  pb_forever: {
    title:'wiederhole fortlaufend',
    text:'Führt die Blöcke im Inneren immer wieder aus, bis das Programm beendet wird. Darunter lässt sich nichts anhängen, denn dort käme das Programm nie an.',
    python:'`while True:` – »solange wahr«. Weil `True` immer wahr ist, hört die Schleife nie auf.',
    tips:['In fast jede Endlosschleife gehört ein kurzes »warte«, damit der Hub Luft bekommt und Anzeigen lesbar bleiben.',
      'Mit »die Schleife abbrechen« kommt man trotzdem heraus.'],
    example:() => prog(forever(icon('HEART'), wait(500), B('pb_display_off'), wait(500)))
  },
  controls_if: {
    title:'falls … mache',
    text:'Führt die Blöcke im Inneren nur aus, wenn die Bedingung wahr ist. Mit dem Zahnrad am Block lässt sich ein »sonst«-Zweig ergänzen: Er läuft, wenn die Bedingung falsch ist.',
    fields:[['Bedingung', 'ein sechseckiger Block, der wahr oder falsch liefert, zum Beispiel ein Vergleich.']],
    python:'`if …:` für »falls«, `else:` für »sonst«, `elif …:` für »sonst falls«. Der Doppelpunkt und die Einrückung zeigen, was dazugehört.',
    tips:['»falls« prüft nur einmal, in dem Moment, in dem das Programm dort ankommt. Soll ständig geprüft werden, gehört der Block in eine Schleife.'],
    example:() => prog(forever(B('controls_if', null, {IF0:blk(cmp('LT', refl(), 30)), DO0:S(icon('SAD')), ELSE:S(icon('HAPPY'))}, {hasElse:true}), wait(100)))
  },
  pb_wait_until: {
    title:'warte bis',
    text:'Das Programm bleibt an dieser Stelle stehen, bis die Bedingung wahr wird. Motoren, die schon laufen, laufen weiter.',
    fields:[['Bedingung', 'zum Beispiel »Abstand < 100« oder »Kraftsensor gedrückt«.']],
    python:'`while not (…):` und darunter `wait(10)` – solange die Bedingung nicht erfüllt ist, wartet das Programm immer wieder 10 ms und prüft dann neu.',
    example:() => drv(waitUntil(B('pb_force_pressed', {PORT:'E'})), straight(300))
  },
  controls_whileUntil: {
    title:'wiederhole solange / bis',
    text:'Wiederholt die Blöcke im Inneren, solange eine Bedingung wahr ist – oder umgekehrt, bis sie wahr wird. Geprüft wird vor jedem Durchgang.',
    fields:[['solange / bis', 'legt fest, ob bei wahr weitergemacht oder aufgehört wird.']],
    python:'`while …:` für »solange«, `while not …:` für »bis«.',
    example:() => drv(B('controls_whileUntil', {MODE:'UNTIL'}, {BOOL:blk(B('pb_force_pressed', {PORT:'E'})), DO:S(straight(100), wait(500))}))
  },
  controls_flow_statements: {
    title:'die Schleife abbrechen / fortfahren',
    text:'Funktioniert nur in einer Schleife. »abbrechen« verlässt die Schleife sofort. »mit der nächsten Iteration fortfahren« überspringt den Rest dieses Durchgangs und beginnt den nächsten.',
    python:'`break` bricht ab, `continue` springt zum nächsten Durchgang.',
    example:() => prog(B('controls_repeat_ext', null, {TIMES:N(100), DO:S(icon('HEART'), wait(100),
      B('controls_if', null, {IF0:blk(B('pb_force_pressed', {PORT:'E'})), DO0:S(B('controls_flow_statements', {FLOW:'BREAK'}))}))}), icon('HAPPY'), wait(1000))
  },

  // ----- Operatoren -----
  math_number: {
    title:'Zahl',
    text:'Eine feste Zahl. Kommazahlen schreibt man mit Punkt: 1.5.',
    python:'Zahlen stehen in Python einfach so da: `42` oder `1.5`.',
    example:() => prog(B('pb_display_number', null, {NUM:N(42)}), wait(2000))
  },
  math_arithmetic: {
    title:'Rechnen',
    text:'Rechnet mit zwei Zahlen: plus, minus, mal, geteilt oder hoch.',
    python:'`+`, `-`, `*` für mal, `/` für geteilt und `**` für hoch. Klammern legen fest, was zuerst gerechnet wird.',
    tips:['Geteilt liefert in Python immer eine Kommazahl: `6 / 2` ergibt `3.0`.', 'Teilen durch 0 bricht das Programm mit einem Fehler ab.'],
    example:() => prog(showNum(B('math_arithmetic', {OP:'MULTIPLY'}, {A:N(6), B:N(7)})), wait(2000))
  },
  pb_abs: {
    title:'Betrag',
    text:'Macht aus einer negativen Zahl eine positive; positive Zahlen bleiben, wie sie sind. Praktisch, wenn nur die Größe einer Abweichung zählt, nicht die Richtung.',
    python:'`abs(-5)` ergibt `5`.',
    example:() => prog(showNum(B('pb_abs', null, {NUM:N(-5)})), wait(2000))
  },
  math_round: {
    title:'runden',
    text:'Macht aus einer Kommazahl eine ganze Zahl: kaufmännisch runden, aufrunden oder abrunden.',
    python:'`round(3.1)` ergibt `3`.',
    example:() => prog(showNum(B('math_round', {OP:'ROUND'}, {NUM:N(3.7)})), wait(2000))
  },
  math_modulo: {
    title:'Rest von',
    text:'Liefert den Rest einer Division: 10 geteilt durch 3 ist 3, Rest 1. Damit lässt sich zum Beispiel prüfen, ob eine Zahl gerade ist (Rest von … ÷ 2 ist 0).',
    python:'`10 % 3` ergibt `1`. Das Prozentzeichen hat hier nichts mit Prozent zu tun.',
    example:() => prog(showNum(B('math_modulo', null, {DIVIDEND:N(10), DIVISOR:N(3)})), wait(2000))
  },
  math_constrain: {
    title:'begrenze … zwischen',
    text:'Hält einen Wert in einem Bereich: Ist er kleiner als die untere Grenze, kommt die untere Grenze heraus, ist er größer als die obere, die obere.',
    python:'`min(max(wert, -100), 100)` – `max` sorgt für die untere Grenze, `min` für die obere.',
    tips:['Nützlich bei Reglern, damit ein berechnetes Tempo nicht zu groß wird.'],
    example:() => drv(forever(B('pb_drive_drive', null, {SPEED:N(100), RATE:NB(0, B('math_constrain', null, {VALUE:NB(0, B('math_arithmetic', {OP:'MULTIPLY'}, {A:blk(B('math_arithmetic', {OP:'MINUS'}, {A:blk(refl()), B:N(50)})), B:N(3)})), LOW:N(-90), HIGH:N(90)}))})))
  },
  logic_compare: {
    title:'Vergleich',
    text:'Vergleicht zwei Werte und liefert wahr oder falsch: gleich, ungleich, kleiner, größer.',
    python:'`==` gleich, `!=` ungleich, `<` kleiner, `<=` kleiner oder gleich, `>` größer, `>=` größer oder gleich.',
    tips:['Messwerte treffen selten genau eine Zahl. Statt »Abstand = 100« besser »Abstand < 100«.'],
    example:() => prog(waitUntil(cmp('LT', B('pb_distance', {PORT:'D'}), 100)), B('pb_beep', null, {FREQ:N(880), DUR:N(300)}))
  },
  logic_operation: {
    title:'und / oder',
    text:'Verknüpft zwei Bedingungen. »und« ist nur wahr, wenn beide wahr sind. »oder« ist wahr, wenn mindestens eine wahr ist.',
    python:'`and` und `or`.',
    example:() => prog(waitUntil(B('logic_operation', {OP:'OR'}, {A:blk(B('pb_button', {BUTTON:'LEFT'})), B:blk(B('pb_button', {BUTTON:'RIGHT'}))})), icon('HAPPY'), wait(1000))
  },
  logic_negate: {
    title:'nicht',
    text:'Dreht eine Bedingung um: Aus wahr wird falsch, aus falsch wird wahr.',
    python:'`not …`.',
    example:() => prog(B('controls_whileUntil', {MODE:'WHILE'}, {BOOL:blk(B('logic_negate', null, {BOOL:blk(B('pb_force_pressed', {PORT:'E'}))})), DO:S(icon('HEART'), wait(100))}))
  },
  logic_boolean: {
    title:'wahr / falsch',
    text:'Ein fester Wahrheitswert. Man braucht ihn selten direkt – zum Beispiel, um sich in einer Variable zu merken, ob etwas schon passiert ist.',
    python:'`True` und `False`, in Python immer mit großem Anfangsbuchstaben.',
    example:() => withVar('gefunden', B('variables_set', {VAR}, {VALUE:blk(B('logic_boolean', {BOOL:'FALSE'}))}),
      waitUntil(cmp('LT', refl(), 30)), B('variables_set', {VAR}, {VALUE:blk(B('logic_boolean', {BOOL:'TRUE'}))}),
      say(getVar()))
  },
  text: {
    title:'Text',
    text:'Ein fester Text aus Buchstaben, Ziffern und Zeichen.',
    python:'Text steht in Anführungszeichen: `\'Hallo\'`. Ohne Anführungszeichen hielte Python das Wort für eine Variable.',
    example:() => prog(B('pb_print', null, {TEXT:T('Hallo')}))
  },
  text_join: {
    title:'erstelle Text aus',
    text:'Hängt mehrere Teile zu einem Text zusammen, auch Zahlen und Messwerte. Mit dem Zahnrad lassen sich weitere Teile ergänzen.',
    python:'`str(…) + str(…)` – `str` macht aus jedem Wert einen Text, `+` hängt Texte aneinander.',
    example:() => prog(say(B('text_join', null, {ADD0:blk(B('text', {TEXT:'Abstand: '})), ADD1:blk(B('pb_distance', {PORT:'D'}))}, {itemCount:2})))
  },

  math_random_int: {
    title:'ganzzahlige Zufallszahl',
    text:'Liefert bei jedem Aufruf eine zufällige ganze Zahl aus dem angegebenen Bereich – wie ein Würfel. Beide Grenzen können selbst vorkommen.',
    fields:[['von / bis', 'kleinste und größte mögliche Zahl.']],
    python:'`random.randint(1, 6)` – `randint` steht für »random integer«, zufällige ganze Zahl. Im Kopf steht dazu `import urandom as random`: Bei Pybricks heißt das Zufallsmodul `urandom`, mit `as random` bekommt es im Programm den üblichen Namen.',
    example:() => prog(forever(waitUntil(B('pb_force_pressed', {PORT:'E'})), B('pb_display_number', null, {NUM:NB(0, B('math_random_int', null, {FROM:N(1), TO:N(6)}))}), wait(500)))
  },

  // ----- Listen -----
  lists_create_with: {
    title:'erzeuge Liste',
    text:'Eine Liste fasst mehrere Werte unter einem Namen zusammen – zum Beispiel alle Strecken einer Fahrt. Mit dem Zahnrad lässt sich einstellen, wie viele Einträge der Block hat. Die Liste wird am besten gleich in einer Variable gespeichert.',
    python:'`[100, 200, 300]` – eckige Klammern, die Werte durch Kommas getrennt. `[]` ist eine leere Liste.',
    example:() => listEx(say(getVar()))
  },
  lists_length: {
    title:'Länge von Liste',
    text:'Liefert, wie viele Einträge die Liste hat.',
    python:'`len(Strecken)` – `len` kommt von »length«, Länge.',
    example:() => listEx(showNum(B('lists_length', null, {VALUE:blk(getVar())})), wait(2000))
  },
  lists_isEmpty: {
    title:'Liste ist leer',
    text:'Wahr, wenn die Liste keinen Eintrag hat.',
    python:'`not len(Strecken)` – eine Länge von 0 zählt in Python als falsch, `not` dreht das um.',
    example:() => listEx(B('controls_if', null, {IF0:blk(B('lists_isEmpty', null, {VALUE:blk(getVar())})), DO0:S(icon('SAD')), ELSE:S(icon('HAPPY'))}, {hasElse:true}), wait(2000))
  },
  lists_getIndex: {
    title:'aus Liste nimm',
    text:'Liefert einen Eintrag der Liste: den soundsovielten von vorn oder hinten, den ersten, den letzten oder einen zufälligen. Auf Wunsch wird der Eintrag dabei aus der Liste entfernt.',
    fields:[['Nummer', 'Die Blöcke zählen ab 1: Nummer 1 ist der erste Eintrag.']],
    python:'`Strecken[1]` – die Nummer steht in eckigen Klammern. Python zählt ab 0: Der zweite Eintrag hat die Nummer 1. Blockwerk rechnet das um.',
    tips:['Eine Nummer, die es nicht gibt, bricht das Programm mit `IndexError` ab.'],
    example:() => listEx(say(B('lists_getIndex', {MODE:'GET', WHERE:'FROM_START'}, {VALUE:blk(getVar()), AT:N(2)})))
  },
  lists_setIndex: {
    title:'in Liste setze',
    text:'Ersetzt einen Eintrag der Liste durch einen neuen Wert – oder fügt an der Stelle einen zusätzlichen Eintrag ein.',
    fields:[['Nummer', 'Die Blöcke zählen ab 1.'], ['Wert', 'der neue Eintrag.']],
    python:'`Strecken[0] = 150` – links die Stelle, rechts der neue Wert.',
    example:() => listEx(B('lists_setIndex', {MODE:'SET', WHERE:'FROM_START'}, {LIST:blk(getVar()), AT:N(1), TO:N(150)}), say(getVar()))
  },
  controls_forEach: {
    title:'für jeden Wert aus der Liste',
    text:'Geht die Liste von vorn nach hinten durch und führt die Blöcke im Inneren für jeden Eintrag einmal aus. Die Variable im Block enthält dabei den aktuellen Eintrag.',
    python:'`for Strecke in Strecken:` – »für jede Strecke in Strecken«. In der Schleife steht `Strecke` für den Eintrag, der gerade dran ist.',
    example:() => ws_([at(seq(B('pb_start'), setup(), B('variables_set', {VAR}, {VALUE:blk(list3())}),
      B('controls_forEach', {VAR:{id:'doc_item'}}, {LIST:blk(getVar()), DO:S(B('pb_drive_straight', null, {DIST:NB(0, B('variables_get', {VAR:{id:'doc_item'}}))}), turn(90))})), 40, 40)],
      [{name:'Strecken', id:VAR.id}, {name:'Strecke', id:'doc_item'}])
  },

  // ----- SPIKE-Import -----
  pb_unsupported: {
    title:'⚠ nicht übersetzt',
    text:'Dieser graue Block steht für einen Block aus der SPIKE-App, den Blockwerk beim Öffnen des Projekts nicht übersetzen konnte – zum Beispiel Musik oder eigene Bilder für die Lichtmatrix. Er tut nichts. Im Block steht, was ursprünglich gemeint war.\n\nErsetzt ihn durch Blockwerk-Blöcke, die dasselbe tun, oder löscht ihn.',
    python:'`pass  # nicht übersetzt: …` – `pass` heißt »nichts tun«, dahinter steht als Kommentar, was fehlt.',
    example:() => prog(B('pb_unsupported', {WHAT:'sound: playUntilDone'}), icon('HAPPY'), wait(1000))
  },
  pb_unsupported_value: {
    title:'⚠ nicht übersetzt (Wert)',
    text:'Steht für einen Wert aus der SPIKE-App, den Blockwerk nicht übersetzen konnte – zum Beispiel den Neigungswinkel. Der Block liefert immer 0. Ersetzt ihn durch einen passenden Blockwerk-Block.',
    python:'An der Stelle steht einfach `0`.',
    example:() => prog(showNum(B('pb_unsupported_value', {WHAT:'sensors: orientationAxis'})), wait(1000))
  },

  // ----- Variablen -----
  variables_set: {
    title:'setze Variable auf',
    text:'Eine Variable ist ein Merkzettel mit einem Namen. Dieser Block schreibt einen Wert auf den Zettel; was vorher draufstand, ist weg.',
    python:'`Zaehler = 0` – links der Name, rechts der neue Wert. Das einfache Gleichheitszeichen heißt hier »bekommt den Wert«.',
    tips:['Umlaute im Namen schreibt Blockwerk für Python um: aus »Zähler« wird `Zaehler`.',
      'Jede Variable braucht einen Startwert, bevor sie benutzt wird.'],
    example:() => withVar('Tempo', setVar(150), B('pb_drive_drive', null, {SPEED:NB(0, getVar()), RATE:N(0)}), wait(2000))
  },
  variables_get: {
    title:'Variable',
    text:'Liefert den Wert, der gerade in der Variable steht. Der Block passt überall hin, wo eine Zahl oder ein Text erwartet wird.',
    python:'Einfach der Name der Variable: `Zaehler`.',
    example:() => withVar('Zähler', setVar(7), showNum(getVar()), wait(2000))
  },
  math_change: {
    title:'ändere Variable um',
    text:'Zählt zum aktuellen Wert der Variable etwas dazu. Mit 1 zählt sie hoch, mit −1 herunter.',
    python:'`Zaehler = Zaehler + 1` – erst wird rechts gerechnet (alter Wert plus 1), dann kommt das Ergebnis zurück in die Variable.',
    example:() => withVar('Zähler', setVar(0), forever(waitUntil(B('pb_force_pressed', {PORT:'E'})), B('math_change', {VAR}, {DELTA:N(1)}), showNum(getVar()),
      waitUntil(B('logic_negate', null, {BOOL:blk(B('pb_force_pressed', {PORT:'E'}))}))))
  },

  // ----- Meine Blöcke -----
  procedures_defnoreturn: {
    title:'Eigener Block (ohne Rückgabe)',
    text:'Fasst mehrere Blöcke unter einem eigenen Namen zusammen. Danach gibt es in »Meine Blöcke« einen neuen Block mit diesem Namen, der überall im Programm benutzt werden kann.\n\nÜber das Zahnrad bekommt der Block Eingaben (Parameter), zum Beispiel eine Streckenlänge.',
    python:'`def Ecke():` – `def` definiert eine Funktion. Die eingerückten Zeilen darunter laufen erst, wenn die Funktion mit `Ecke()` aufgerufen wird.',
    tips:['Der eigene Block steht frei auf der Fläche, nicht unter »wenn Programm startet«.',
      'Wiederholt sich im Programm eine Folge von Blöcken, lohnt sich ein eigener Block: Änderungen sind dann nur an einer Stelle nötig.'],
    example:() => ws_([at(B('procedures_defnoreturn', {NAME:'Ecke'}, {STACK:S(straight(200), turn(90))}), 40, 40),
      at(seq(B('pb_start'), setup(), B('controls_repeat_ext', null, {TIMES:N(4), DO:S(B('procedures_callnoreturn', null, null, {name:'Ecke'}))})), 40, 260)])
  },
  procedures_callnoreturn: {
    title:'Eigenen Block aufrufen',
    text:'Führt die Blöcke aus, die im eigenen Block zusammengefasst sind, und macht danach hier weiter.',
    python:'`Ecke()` – der Name mit Klammern ruft die Funktion auf. Hat sie Eingaben, stehen die Werte in der Klammer.',
    example:() => ws_([at(B('procedures_defnoreturn', {NAME:'Piep'}, {STACK:S(B('pb_beep', null, {FREQ:N(880), DUR:N(100)}), wait(100))}), 40, 40),
      at(seq(B('pb_start'), B('procedures_callnoreturn', null, null, {name:'Piep'}), B('procedures_callnoreturn', null, null, {name:'Piep'})), 40, 220)])
  },
  procedures_defreturn: {
    title:'Eigener Block (mit Rückgabe)',
    text:'Ein eigener Block, der am Ende ein Ergebnis zurückgibt – zum Beispiel einen berechneten Wert. Der passende Aufruf-Block ist rund und passt in Eingabefelder.',
    python:'`def Abweichung():` und am Ende `return …` – `return` gibt das Ergebnis an die Stelle zurück, an der die Funktion aufgerufen wurde.',
    example:() => ws_([at(B('procedures_defreturn', {NAME:'Abweichung'}, {RETURN:blk(B('math_arithmetic', {OP:'MINUS'}, {A:blk(refl()), B:N(50)}))}), 40, 40),
      at(seq(B('pb_start'), setup(), forever(B('pb_drive_drive', null, {SPEED:N(100), RATE:NB(0, B('procedures_callreturn', null, null, {name:'Abweichung'}))}))), 40, 220)])
  },
  procedures_callreturn: {
    title:'Eigenen Block mit Rückgabe aufrufen',
    text:'Ruft den eigenen Block auf und liefert dessen Ergebnis.',
    python:'`Abweichung()` steht dort, wo der Wert gebraucht wird, zum Beispiel `print(Abweichung())`.',
    example:() => ws_([at(B('procedures_defreturn', {NAME:'Abweichung'}, {RETURN:blk(B('math_arithmetic', {OP:'MINUS'}, {A:blk(refl()), B:N(50)}))}), 40, 40),
      at(seq(B('pb_start'), say(B('procedures_callreturn', null, null, {name:'Abweichung'}))), 40, 220)])
  },
  procedures_ifreturn: {
    title:'falls … gib zurück',
    text:'Funktioniert nur in einem eigenen Block. Ist die Bedingung wahr, endet der eigene Block sofort an dieser Stelle – bei einem Block mit Rückgabe mit dem angegebenen Wert.',
    python:'`if …:` und darunter `return …`.',
    example:() => ws_([at(B('procedures_defreturn', {NAME:'Linie'}, {STACK:S(B('procedures_ifreturn', null, {CONDITION:blk(cmp('LT', refl(), 30)), VALUE:blk(B('logic_boolean', {BOOL:'TRUE'}))})),
        RETURN:blk(B('logic_boolean', {BOOL:'FALSE'}))}), 40, 40),
      at(seq(B('pb_start'), setup(), B('pb_drive_drive', null, {SPEED:N(100), RATE:N(0)}), waitUntil(B('procedures_callreturn', null, null, {name:'Linie'})), B('pb_drive_stop', {MODE:'brake'})), 40, 260)])
  }
};
