// ---------------------------------------------------------------
// »Erste Schritte«: ein geführter Weg durch Blockwerk, Lektion für Lektion.
// Jede Lektion hat ein Ziel, nummerierte Schritte, das fertige Programm zum Laden und
// Aufgaben zum Weiterprobieren. Text in `Backticks` wird als Code dargestellt.
// ---------------------------------------------------------------
import { N } from '../toolbox';
import { at, B, EXAMPLES, seq, setup, ws_, type WorkspaceState } from '../examples';

export interface Lesson {
  id: string;
  title: string;
  /** Was am Ende klappt – ein Satz. */
  goal: string;
  /** Was man dafür aufgebaut haben muss. */
  needs: string;
  steps: string[];
  /** Woran man erkennt, dass es geklappt hat. */
  result: string;
  /** Aufgaben zum Weiterprobieren. */
  tryIt: string[];
  /** Das fertige Programm. */
  example: () => WorkspaceState;
  /** Blöcke, die in der Lektion neu vorkommen (Verweise auf ihre Hilfeseiten). */
  blocks: string[];
  /** Passendes Python-Kapitel. */
  chapter?: string;
}

const prog = (...blocks: ReturnType<typeof B>[]) => ws_([at(seq(B('pb_start'), ...blocks), 40, 40)]);

export const LESSONS: Lesson[] = [
  {
    id:'start', title:'Das erste Programm',
    goal:'Der Hub zeigt einen Smiley und piept.',
    needs:'Einen Hub mit Pybricks-Firmware – sonst nichts.',
    steps:[
      'Klicke oben auf »Neu«. Auf der Fläche liegt jetzt nur der gelbe Block »wenn Programm startet«. Dort beginnt jedes Programm.',
      'Öffne links »Licht und Ton« und zieh »zeige Bild« unter den Startblock, bis er einrastet.',
      'Zieh aus derselben Kategorie »Piepton« darunter.',
      'Öffne »Steuerung« und häng »warte … ms« an. Trag `2000` ein – das sind zwei Sekunden.',
      'Schalte den Hub ein und klicke unten rechts auf den grünen Startknopf. Wähle »Bluetooth« und dann deinen Hub.'
    ],
    result:'Der Hub zeigt den Smiley, piept und ist nach zwei Sekunden fertig. Rechts steht dasselbe Programm in Python.',
    tryIt:[
      'Wähle im Block »zeige Bild« ein anderes Bild.',
      'Häng zwei Pieptöne mit verschiedenen Tonhöhen hintereinander.',
      'Nimm »zeige Muster« und male ein eigenes Bild.'
    ],
    example:() => prog(B('pb_display_icon', {ICON:'HAPPY'}), B('pb_beep', null, {FREQ:N(440), DUR:N(200)}), B('pb_wait', null, {MS:N(2000)})),
    blocks:['pb_start', 'pb_display_icon', 'pb_beep', 'pb_wait'], chapter:'aufbau'
  },
  {
    id:'fahren', title:'Geradeaus und drehen',
    goal:'Der Roboter fährt 20 cm und dreht sich nach rechts.',
    needs:'Einen Roboter mit zwei Antriebsmotoren, zum Beispiel an den Anschlüssen A und B.',
    steps:[
      'Öffne »Fahren« und zieh »Fahrbasis einrichten« unter den Startblock.',
      'Wähle die Anschlüsse, an denen der linke und der rechte Motor stecken.',
      'Miss den Durchmesser eines Rads und den Abstand zwischen den Radmitten (die Spurbreite) in Millimetern und trag beides ein.',
      'Häng »fahre geradeaus 200 mm« an.',
      'Häng »drehe auf der Stelle um 90 Grad« an und starte das Programm.'
    ],
    result:'Der Roboter fährt 20 cm vor und dreht sich eine Vierteldrehung nach rechts.',
    tryIt:[
      'Fährt er rückwärts oder dreht er sich im Kreis? Dann stell bei einem Motor die Drehrichtung von »normal« auf »umgekehrt«.',
      'Lass ihn 400 mm fahren und miss nach. Stimmt die Strecke nicht, ist der Raddurchmesser falsch eingetragen.',
      'Probier negative Werte: `-200` fährt rückwärts, `-90` dreht nach links.',
      'Der Pfeil vorn am Block »Fahrbasis einrichten« klappt ihn zusammen, wenn alles stimmt.'
    ],
    example:() => prog(setup(), B('pb_drive_straight', null, {DIST:N(200)}), B('pb_drive_turn', null, {ANGLE:N(90)})),
    blocks:['pb_drive_setup', 'pb_drive_straight', 'pb_drive_turn']
  },
  {
    id:'wiederholen', title:'Wiederholen: ein Quadrat',
    goal:'Der Roboter fährt ein Quadrat – mit nur zwei Fahrblöcken.',
    needs:'Den Roboter und das Programm aus »Geradeaus und drehen«.',
    steps:[
      'Öffne »Steuerung« und zieh »wiederhole 4 mal« unter »Fahrbasis einrichten«.',
      'Zieh »fahre geradeaus« und »drehe auf der Stelle« in die Klammer des Wiederhole-Blocks.',
      'Häng unter die Klammer einen »Piepton« – er ertönt, wenn das Quadrat fertig ist.',
      'Starte das Programm.'
    ],
    result:'Viermal geradeaus und drehen: Der Roboter steht wieder am Anfang und piept.',
    tryIt:[
      'Ein Dreieck: 3 mal wiederholen und um 120 Grad drehen.',
      'Kommt er nicht genau am Start an? Dann stimmt die Spurbreite in »Fahrbasis einrichten« noch nicht.',
      'Schau rechts in den Python-Code: Aus dem Block ist `for count in range(4):` geworden, und die beiden Zeilen darunter sind eingerückt.'
    ],
    example:EXAMPLES.quadrat,
    blocks:['controls_repeat_ext', 'pb_forever'], chapter:'schleifen'
  },
  {
    id:'sensoren', title:'Sensoren: Halt vor der Wand',
    goal:'Der Roboter wartet auf einen Tastendruck, fährt los und hält 10 cm vor einem Hindernis.',
    needs:'Einen Abstandssensor an Anschluss D, der nach vorn schaut, und einen Kraftsensor an E.',
    steps:[
      'Beginne mit Startblock und »Fahrbasis einrichten«.',
      'Häng »warte bis« an (Steuerung). In sein sechseckiges Feld gehört »Kraftsensor E gedrückt« aus »Sensoren«.',
      'Häng »fahre los mit 150 mm/s« an (Fahren). Anders als »fahre geradeaus« wartet dieser Block nicht – der Roboter fährt, und das Programm läuft weiter.',
      'Noch ein »warte bis«. Diesmal kommt ein Vergleich aus »Operatoren« hinein: »Abstand an Sensor D« kleiner als `100`.',
      'Häng »Fahrbasis bremsen« an und starte das Programm.'
    ],
    result:'Nach dem Druck auf den Kraftsensor fährt der Roboter los und bremst etwa 10 cm vor der Wand.',
    tryIt:[
      'Ändere die 100 in 200 – er hält früher.',
      'Zeig vor dem Losfahren einen Pfeil und nach dem Halt einen Smiley auf der Lichtmatrix.',
      'Kein Kraftsensor zur Hand? »Hub-Taste … gedrückt« aus »Sensoren« nimmt eine Taste am Hub.'
    ],
    example:EXAMPLES.wand,
    blocks:['pb_wait_until', 'pb_force_pressed', 'pb_drive_drive', 'pb_distance', 'logic_compare', 'pb_drive_stop'], chapter:'bedingungen'
  },
  {
    id:'linie', title:'Einer Linie folgen',
    goal:'Der Roboter fährt an der Kante einer schwarzen Linie entlang.',
    needs:'Einen Farbsensor an Anschluss C, der knapp über dem Boden nach unten schaut, und eine schwarze Linie auf hellem Grund.',
    steps:[
      'Beginne mit Startblock und »Fahrbasis einrichten«. Häng »wiederhole fortlaufend« an (Steuerung).',
      'Zieh »fahre los mit … mm/s und Drehrate … Grad/s« in die Schleife. Trag als Tempo `120` ein.',
      'In das Feld der Drehrate kommt eine Rechnung aus »Operatoren«: erst ein Mal-Block, in dessen linkes Feld ein Minus-Block.',
      'Der Minus-Block rechnet »Reflexion an Farbsensor C« (aus »Sensoren«) minus `50`. Der Mal-Block nimmt das Ergebnis mal `1.2`.',
      'Stell den Roboter so hin, dass der Sensor halb auf der linken Kante der Linie steht, und starte.'
    ],
    result:'An der Kante meldet der Sensor etwa 50 % Reflexion. Wird es heller, ist er nach links vom Weg abgekommen und dreht nach rechts zurück; wird es dunkler, dreht er nach links. So bleibt er an der Kante.',
    tryIt:[
      'Zappelt er hin und her? Mach die 1.2 kleiner. Verliert er die Linie in Kurven? Mach sie größer.',
      'Läuft er von der Linie weg statt zu ihr hin? Dann folgt er der anderen Kante – nimm `-1.2`.',
      'Miss die Reflexion auf Schwarz und auf Weiß (»zeige Zahl«) und nimm statt 50 die Mitte dazwischen.',
      'Erhöhe das Tempo, bis er die Kurven nicht mehr schafft.'
    ],
    example:EXAMPLES.linie,
    blocks:['pb_forever', 'pb_drive_drive', 'pb_reflection', 'math_arithmetic']
  },
  {
    id:'eigene', title:'Eigene Blöcke',
    goal:'Ein eigener Block »Ecke« macht das Programm kürzer und leichter zu lesen.',
    needs:'Den Roboter aus »Geradeaus und drehen«.',
    steps:[
      'Öffne »Meine Blöcke« und zieh den obersten Block auf eine freie Stelle der Fläche. Gib ihm den Namen `Ecke`.',
      'Zieh »fahre geradeaus 200 mm« und »drehe auf der Stelle um 90 Grad« hinein.',
      'In »Meine Blöcke« gibt es jetzt einen Block »Ecke«. Er führt alles aus, was du eben hineingelegt hast.',
      'Bau das Hauptprogramm: Startblock, »Fahrbasis einrichten«, »wiederhole 4 mal« – und in die Schleife den Block »Ecke«.'
    ],
    result:'Der Roboter fährt dasselbe Quadrat wie vorher. Im Python-Code steht oben `def Ecke():` – so heißen eigene Blöcke in Python: Funktionen.',
    tryIt:[
      'Ändere die Strecke im Block »Ecke« – alle vier Seiten ändern sich mit.',
      'Bau einen zweiten eigenen Block »Quadrat«, der viermal »Ecke« aufruft.'
    ],
    example:EXAMPLES.funktion,
    blocks:['procedures_defnoreturn', 'procedures_callnoreturn'], chapter:'funktionen'
  },
  {
    id:'python', title:'Von Blöcken zu Python',
    goal:'Du liest im Python-Code mit und findest jede Zeile im Blockprogramm wieder.',
    needs:'Irgendein Programm auf der Fläche – zum Beispiel das Quadrat.',
    steps:[
      'Klicke rechts im Python-Bereich auf eine Zeile. Der Block, aus dem sie stammt, wird markiert.',
      'Klicke umgekehrt einen Block an: Seine Zeilen leuchten im Code auf.',
      'Ändere eine Zahl in einem Block und beobachte, welche Stelle im Code sich ändert.',
      'Klicke im Code auf ein Wort wie `for` oder `roboter`. Die Hilfe erklärt, was es bedeutet.',
      'Mit »Kopieren« nimmst du den Code mit – zum Beispiel nach Pybricks Code, um dort in Python weiterzuschreiben.'
    ],
    result:'Der obere Teil des Codes (Importe, Geräte, Fahrbasis) ist der Kopf: Er entsteht aus »Fahrbasis einrichten« und den Anschlüssen in deinen Blöcken. Darunter steht dein Programm, Block für Block.',
    tryIt:[
      'Lies das Kapitel »Wie ein Pybricks-Programm aufgebaut ist«.',
      'Such im Code die Zeile, die zu »wiederhole 4 mal« gehört. Was ist an den Zeilen darunter anders?'
    ],
    example:EXAMPLES.quadrat,
    blocks:[], chapter:'aufbau'
  }
];
