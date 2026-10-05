// ---------------------------------------------------------------
// Kurs der Robotik-AG: die Module 0 bis 8 aus dem Leitfaden »Programmieren lernen mit
// LEGO SPIKE Prime«, für die Teilnehmenden aufbereitet und auf Blockwerk übertragen.
//
// Grundsätze aus dem Leitfaden, die hier gelten:
//   - Stolpersteine werden nicht vorab verraten. Sie stehen unter `leader` und erscheinen
//     nur, wenn in den Einstellungen »Kursleitung« eingeschaltet ist – ebenso die Lösungen.
//   - Hilfekarten sind gestuft: Denkfrage, Blockkategorie, Teilstück. Nie die ganze Lösung.
//   - Das Quiz fragt ab, was man nach dem Modul verstanden haben sollte.
// Text in `Backticks` wird als Code dargestellt. Programme sind die Dateien aus
// referenz/spike-dateien/beispiele (ohne Endung); sie werden beim Laden übersetzt.
// ---------------------------------------------------------------

export interface QuizQuestion {
  question: string;
  /** Antworten; die richtige steht an der Stelle `correct`. */
  answers: string[];
  correct: number;
  /** Erklärung, die nach dem Antworten erscheint. */
  why: string;
}
export interface CourseModule {
  /** Nummer des Moduls, 0 bis 8. */
  nr: number;
  title: string;
  /** Das eine neue Konzept des Moduls. */
  concept: string;
  needs: string;
  /** Eine Frage oder Aktion, die das Thema aufwirft. */
  intro: string;
  /** Programm zum Vorhersagen: erst sagen, was passieren wird, dann starten. */
  demo?: {file: string; text: string};
  task: string;
  challenge: string;
  pro?: string;
  /** Drei gestufte Hilfekarten: Denkfrage, Blockkategorie, Teilstück. */
  hints: [string, string, string];
  /** Blöcke, die Karte 3 als Bild zeigt. */
  hintBlocks: string[];
  /** Programm mit eingebautem Fehler. */
  bug?: {file: string; text: string};
  quiz: QuizQuestion[];
  /** Nur für die Kursleitung. */
  leader: {pitfalls: string[]; solutions: string[]};
}

/** Wie in der AG gearbeitet wird – der Werkzeugkasten aus dem Leitfaden, für die Teilnehmenden. */
export const METHODS: {title: string; text: string; list?: string[]}[] = [
  {title:'Erst vorhersagen, dann starten', text:'Bevor ihr auf Start drückt, sagt ihr laut, was der Roboter gleich tun wird. Eine falsche Vorhersage ist kein Fehler, sondern der spannendste Moment der Stunde: Jetzt wisst ihr, wo ihr genauer hinschauen müsst.', list:[
    'Vorhersagen – Was wird der Roboter tun?',
    'Ausführen – Programm starten und genau beobachten.',
    'Untersuchen – Wo weicht es von der Vorhersage ab, und warum?',
    'Verändern – Eine Zahl oder einen Block gezielt ändern.',
    'Erschaffen – Ein eigenes Programm für eine neue Aufgabe bauen.'
  ]},
  {title:'Die drei Fragen bei einem Fehler', text:'Ein Fehler ist der Moment, in dem das Programm verrät, was ihr noch nicht verstanden habt. Stellt euch immer diese drei Fragen. Hilft auch: Erklärt das Programm jemandem Block für Block – oft fällt der Fehler dabei von selbst auf.', list:[
    'Was sollte passieren?',
    'Was ist tatsächlich passiert?',
    'An welcher Stelle genau weicht es ab?'
  ]},
  {title:'Hilfekarten', text:'Zu jeder Aufgabe gibt es drei Karten. Karte 1 stellt eine Denkfrage, Karte 2 nennt die passende Blockkategorie, Karte 3 zeigt ein Teilstück – nie die ganze Lösung. Eine Karte deckt ihr erst auf, wenn ihr mindestens fünf Minuten selbst probiert habt.'},
  {title:'Erst drei, dann ich', text:'Bevor ihr die Kursleitung fragt: Fragt drei andere aus der Gruppe oder probiert drei Änderungen aus.'},
  {title:'Rollen im Team', text:'Etwa alle 20 Minuten wird gewechselt. Niemand schaut nur zu.', list:[
    'Pilot – bedient den Computer.',
    'Navigator – liest mit, schlägt vor, denkt voraus.',
    'Tester – misst, schreibt auf, setzt den Roboter zurück.'
  ]},
  {title:'Logbuch und Showcase', text:'Jedes Team schreibt pro Versuch vier Dinge auf. Am Ende der Stunde zeigt jedes Team seine Lösung – und vor allem einen Fehler, den es behoben hat. Der lehrreichste wird Bug der Woche.', list:[
    'Ziel – Was soll der Roboter können?',
    'Idee – Wie wollen wir das erreichen?',
    'Ergebnis – Was ist passiert?',
    'Nächste Änderung – Was probieren wir als Nächstes?'
  ]}
];

const BUG = 'Dieses Programm hat einen eingebauten Fehler. Sagt erst vorher, was es tun sollte, startet es und sucht dann mit den drei Fragen nach der Stelle, an der es abweicht.';

export const MODULES: CourseModule[] = [
  {
    nr:0, title:'Erster Kontakt', concept:'Ein Programm ist eine genaue Folge von Anweisungen.',
    needs:'Einen Hub – noch keinen Roboter.',
    intro:'Menschlicher Roboter: Eine Person führt nur wörtlich aus, was die Gruppe ansagt, zum Beispiel »Geh zur Tür und öffne sie«. Was fällt euch auf?',
    task:'Schaltet den Hub ein und verbindet ihn mit Blockwerk. Euer erstes Programm: Beim Start erscheint ein Bild auf der Lichtmatrix, ein Ton erklingt, danach läuft euer Name als Text durch.',
    challenge:'Baut eine Licht-und-Ton-Show von zehn Sekunden zum Thema »leuchtende Lebewesen«.',
    hints:[
      'Was soll der Hub zuerst tun, was danach? Sagt die Reihenfolge laut, bevor ihr Blöcke zieht.',
      'Alles, was ihr braucht, liegt in »Licht und Ton«. Für Pausen gibt es in »Steuerung« den Block »warte«.',
      'Diese Blöcke gehören dazu – in welcher Reihenfolge, entscheidet ihr:'
    ],
    hintBlocks:['pb_display_icon', 'pb_beep', 'pb_display_text'],
    bug:{file:'M0 Bug-Jagd - Das Herz bleibt unsichtbar', text:BUG},
    quiz:[
      {question:'Was macht ein Computer mit einer ungenauen Anweisung?', answers:['Er errät, was gemeint ist.', 'Er tut genau das, was dasteht.', 'Er fragt nach.'], correct:1,
        why:'Ein Computer tut, was dasteht – nicht, was gemeint ist. Deshalb müssen Anweisungen genau sein.'},
      {question:'In welcher Reihenfolge führt der Hub die Blöcke unter dem Startblock aus?', answers:['Alle gleichzeitig.', 'Von oben nach unten, einen nach dem anderen.', 'In zufälliger Reihenfolge.'], correct:1,
        why:'Das Programm läuft von oben nach unten. Die Reihenfolge der Blöcke ist die Reihenfolge der Handlungen.'},
      {question:'Ein Block liegt lose auf der Fläche und hängt an keinem Startblock. Was passiert mit ihm?', answers:['Er wird als Erstes ausgeführt.', 'Er wird grau und nicht ausgeführt.', 'Das Programm startet nicht.'], correct:1,
        why:'Nur was am Startblock hängt, gehört zum Programm. Lose Blöcke werden grau und übersprungen.'}
    ],
    leader:{pitfalls:['Bluetooth-Verbindung', 'leerer Akku', 'falscher Programmplatz am Hub'], solutions:['M0 Loesung - Begruessung']}
  },
  {
    nr:1, title:'Sequenz: Fahren nach Plan', concept:'Reihenfolge, Eingaben und Einheiten.',
    needs:'Die Fahrbasis mit zwei Motoren, Maßband und Klebeband.',
    intro:'Schätzfrage: Wie weit fährt der Roboter bei genau einer Radumdrehung? Erst schätzen, dann mit dem Maßband messen.',
    demo:{file:'M1 Demo - Eine Radumdrehung', text:'Sagt vorher, wie weit der Roboter fahren wird. Startet dann und messt nach.'},
    task:'Der Roboter fährt exakt 50 cm, hält an und gibt einen Ton aus.',
    challenge:'Fahrt zu einer Klebebandmarkierung, wendet und kehrt in den Startbereich zurück. Bestenliste: Wer landet am genauesten wieder am Start?',
    pro:'Bestimmt die Strecke durch Rechnen statt durch Ausprobieren: Das Rad hat 5,6 cm Durchmesser. Wie weit rollt es bei einer Umdrehung, und wie viele Umdrehungen sind 50 cm? Prüft damit, ob in »Fahrbasis einrichten« der richtige Raddurchmesser steht.',
    hints:[
      'Wie viele Millimeter sind 50 cm? Und woher weiß der Roboter, wie groß seine Räder sind?',
      'Schaut in »Fahren«: Dort wird die Fahrbasis eingerichtet, und dort liegen die Blöcke zum Fahren und Drehen.',
      'Diese beiden Blöcke kommen hinter »Fahrbasis einrichten«:'
    ],
    hintBlocks:['pb_drive_straight', 'pb_beep'],
    bug:{file:'M1 Bug-Jagd - Der Roboter will nicht anhalten', text:BUG},
    quiz:[
      {question:'Der Block »fahre geradeaus« rechnet in Millimetern. Was tragt ihr für 50 cm ein?', answers:['50', '500', '5000'], correct:1,
        why:'1 cm sind 10 mm, 50 cm also 500 mm.'},
      {question:'Ein Rad hat 5,6 cm Durchmesser. Wie weit rollt es ungefähr bei einer Umdrehung?', answers:['5,6 cm', '11,2 cm', '17,6 cm'], correct:2,
        why:'Der Umfang ist Durchmesser mal 3,14 – also etwa 17,6 cm.'},
      {question:'Was bedeutet »drehe auf der Stelle um 90 Grad« in Blockwerk?', answers:['Jedes Rad dreht sich um 90 Grad.', 'Der ganze Roboter dreht sich um eine Vierteldrehung.', 'Der Roboter fährt 90 mm im Bogen.'], correct:1,
        why:'Blockwerk meint den Winkel des ganzen Roboters. Damit das stimmt, müssen Raddurchmesser und Spurbreite richtig eingetragen sein.'},
      {question:'Auf »fahre geradeaus 500 mm« folgt ein »Piepton«. Wann piept es?', answers:['Sofort beim Losfahren.', 'Wenn der Roboter angekommen ist.', 'Nach der Hälfte der Strecke.'], correct:1,
        why:'»fahre geradeaus« ist erst fertig, wenn die Strecke gefahren ist. Erst dann kommt der nächste Block an die Reihe.'}
    ],
    leader:{pitfalls:['Motoren den falschen Anschlüssen zugeordnet', 'die Annahme, »90 Grad« im Drehblock der SPIKE-App bedeute eine Vierteldrehung des ganzen Roboters (in Blockwerk ist es tatsächlich der Winkel des Roboters)'], solutions:['M1 Loesung - Exakt 50 cm']}
  },
  {
    nr:2, title:'Schleifen', concept:'Wiederholen statt Kopieren.',
    needs:'Die Fahrbasis.',
    intro:'Schaut euch ein Quadrat-Programm aus acht einzelnen Blöcken an. Was fällt euch auf?',
    demo:{file:'M2 Demo - Quadrat ohne Schleife', text:'Sagt vorher, welche Figur der Roboter fährt. Und: Was müsstet ihr alles ändern, wenn das Quadrat doppelt so groß sein soll?'},
    task:'Baut das Quadrat mit einem einzigen Block »wiederhole 4 mal«.',
    challenge:'Dreieck, Sechseck, Stern – und dann: Findet die allgemeine Regel für den Drehwinkel eines beliebigen Vielecks.',
    pro:'Befestigt einen Stift am Roboter und lasst ihn die Figur wirklich auf Papier zeichnen.',
    hints:[
      'Welche Blöcke kommen im Demo-Programm immer wieder in derselben Reihenfolge vor?',
      'In »Steuerung« gibt es Blöcke mit einer Klammer. Was in der Klammer liegt, wird wiederholt.',
      'Dieser Block umschließt alles, was mehrmals passieren soll:'
    ],
    hintBlocks:['controls_repeat_ext'],
    bug:{file:'M2 Bug-Jagd - Aus dem Quadrat wird ein Strich', text:BUG},
    quiz:[
      {question:'In »wiederhole 4 mal« liegen »fahre geradeaus« und »drehe«. Wie oft fährt der Roboter geradeaus?', answers:['Einmal', 'Viermal', 'Achtmal'], correct:1,
        why:'Alles in der Klammer läuft bei jedem Durchgang einmal – bei vier Durchgängen also viermal.'},
      {question:'Ein »Piepton« hängt unter der Klammer von »wiederhole 4 mal«, nicht darin. Wie oft piept es?', answers:['Einmal, am Ende.', 'Viermal.', 'Gar nicht.'], correct:0,
        why:'Was unter der Klammer hängt, kommt erst dran, wenn alle Wiederholungen fertig sind.'},
      {question:'Um wie viel Grad muss der Roboter an jeder Ecke eines Fünfecks drehen?', answers:['60 Grad', '72 Grad', '108 Grad'], correct:1,
        why:'Einmal ganz herum sind 360 Grad. Bei fünf Ecken dreht er an jeder Ecke 360 : 5 = 72 Grad.'},
      {question:'Was ist der Vorteil der Schleife gegenüber acht einzelnen Blöcken?', answers:['Der Roboter fährt schneller.', 'Das Programm ist kürzer, und eine Änderung muss nur an einer Stelle gemacht werden.', 'Die Ecken werden genauer.'], correct:1,
        why:'Der Roboter tut dasselbe. Aber wer die Seitenlänge ändern will, ändert jetzt eine Zahl statt vier.'}
    ],
    leader:{pitfalls:['Die Figuren schließen sich nicht sauber, weil Drehungen ungenau sind. Diese Ungenauigkeit bewusst als offene Frage stehen lassen – Modul 6 beantwortet sie.'], solutions:['M2 Loesung - Quadrat mit Schleife']}
  },
  {
    nr:3, title:'Sensoren und Warten', concept:'Auf Ereignisse reagieren: »warte bis«.',
    needs:'Die Fahrbasis mit Kraftsensor und Abstandssensor.',
    intro:'Der Roboter fährt ungebremst gegen die Wand. Woher soll er wissen, dass dort eine Wand ist?',
    demo:{file:'M3 Demo - Was sieht der Sensor', text:'Sagt vorher, was auf der Lichtmatrix erscheint, wenn ihr die Hand langsam auf den Sensor zubewegt.'},
    task:'Der Roboter startet erst nach einem Druck auf den Kraftsensor, fährt, bis der Abstandssensor weniger als 10 cm meldet, und hält an.',
    challenge:'Einparken: so nah wie möglich an die Wand, ohne sie zu berühren – und zwar von wechselnden Startpositionen aus.',
    pro:'Der Roboter weicht einem Hindernis selbstständig aus und setzt die Fahrt fort.',
    hints:[
      'Was misst der Abstandssensor gerade in dem Moment, in dem der Roboter stoppen soll?',
      '»Steuerung« hat den Block »warte bis«. Was hineingehört, findet ihr in »Sensoren« und »Operatoren«.',
      'Mit diesen Blöcken fährt der Roboter los, ohne zu warten, und ihr könnt auf den Sensor warten:'
    ],
    hintBlocks:['pb_drive_drive', 'pb_wait_until', 'pb_distance'],
    bug:{file:'M3 Bug-Jagd - Der Roboter ignoriert die Wand', text:BUG},
    quiz:[
      {question:'Was ist der Unterschied zwischen »fahre geradeaus 200 mm« und »fahre los mit 150 mm/s«?', answers:['Es gibt keinen.', '»fahre los« wartet nicht: Der Roboter fährt, und das Programm läuft sofort weiter.', '»fahre los« fährt immer rückwärts.'], correct:1,
        why:'»fahre geradeaus« ist erst fertig, wenn die Strecke gefahren ist. »fahre los« schaltet nur das Fahren ein – anhalten muss das Programm später selbst.'},
      {question:'Was tut »warte bis Abstand < 100«?', answers:['Es prüft einmal und geht dann weiter.', 'Es prüft immer wieder und geht erst weiter, wenn der Abstand kleiner als 100 mm ist.', 'Es wartet 100 Millisekunden.'], correct:1,
        why:'»warte bis« hält das Programm an dieser Stelle fest und schaut immer wieder nach, bis die Bedingung stimmt.'},
      {question:'Warum reicht beim Einparken von wechselnden Startpositionen keine fest eingestellte Strecke?', answers:['Weil die Motoren zu ungenau sind.', 'Weil die richtige Strecke jedes Mal eine andere ist – nur der Sensor weiß, wie weit die Wand weg ist.', 'Weil der Akku leer wird.'], correct:1,
        why:'Eine feste Strecke passt nur für einen Startpunkt. Der Sensor misst, was wirklich da ist.'},
      {question:'Der Abstandssensor sieht kein Hindernis. Welchen Wert meldet er bei Pybricks?', answers:['0', '2000', 'eine Fehlermeldung'], correct:1,
        why:'Ohne Hindernis meldet der Sensor 2000 mm – also »weiter weg, als ich messen kann«.'}
    ],
    leader:{pitfalls:['Schräge oder weiche Flächen liefern unzuverlässige Abstandswerte', 'der Unterschied zwischen »warte bis« und einer einmaligen Abfrage'], solutions:['M3 Loesung - Halt vor der Wand']}
  },
  {
    nr:4, title:'Bedingungen', concept:'Entscheiden: falls – dann – sonst.',
    needs:'Die Fahrbasis mit einem Farbsensor, der nach unten schaut, und farbige Felder.',
    intro:'Bringt Regeln aus dem Alltag in die Form »falls … dann … sonst …«. Zum Beispiel: Falls es regnet, nehme ich den Schirm, sonst die Sonnenbrille.',
    task:'Ampel-Roboter: Der Farbsensor schaut nach unten. Auf Rot hält der Roboter an, auf Grün fährt er weiter.',
    challenge:'Farbparcours als Rätsel: Jedes Team legt selbst fest, was der Roboter bei welcher Farbe tut. Ein anderes Team schaut nur zu und muss die Regeln erraten.',
    pro:'Verknüpft Bedingungen mit »und« und »oder«.',
    hints:[
      'Wie oft muss der Roboter nachschauen, welche Farbe unter ihm liegt?',
      '»Steuerung« hat »falls … sonst«, »Sensoren« hat »Farbsensor sieht …«.',
      'Diese Blöcke braucht ihr – überlegt, welcher in welchen gehört:'
    ],
    hintBlocks:['pb_forever', 'controls_if', 'pb_color_is'],
    bug:{file:'M4 Bug-Jagd - Der Roboter faehrt einfach los', text:BUG},
    quiz:[
      {question:'Wann läuft der Teil hinter »sonst«?', answers:['Immer.', 'Wenn die Bedingung bei »falls« nicht stimmt.', 'Wenn die Bedingung stimmt.'], correct:1,
        why:'»falls« prüft die Bedingung. Stimmt sie, läuft der erste Teil, sonst der zweite – nie beide.'},
      {question:'Wann ist »A und B« wahr?', answers:['Wenn mindestens eins von beiden wahr ist.', 'Nur wenn beide wahr sind.', 'Wenn keins wahr ist.'], correct:1,
        why:'»und« verlangt beides. Reicht eins von beiden, nimmt man »oder«.'},
      {question:'Ein »falls … sonst« soll während der ganzen Fahrt auf Farben reagieren. Was braucht es dafür?', answers:['Einen zweiten Farbsensor.', 'Eine Schleife darum, damit immer wieder geprüft wird.', 'Einen »warte«-Block davor.'], correct:1,
        why:'Ein »falls« prüft genau einmal – in dem Moment, in dem das Programm dort ankommt. Erst in einer Schleife wird daraus ständiges Nachschauen.'}
    ],
    leader:{pitfalls:['Die Bedingung wird nur ein einziges Mal geprüft, weil die umschließende Endlosschleife fehlt', 'Umgebungslicht und Sensorhöhe verfälschen die Farberkennung'], solutions:['M4 Loesung - Ampel-Roboter']}
  },
  {
    nr:5, title:'Variablen', concept:'Etwas merken und zählen.',
    needs:'Die Fahrbasis mit Farbsensor nach unten und schwarze Querstreifen auf hellem Grund.',
    intro:'Wie merkt sich der Roboter etwas? Denkt an den Punktestand in einem Spiel, der sich ständig ändert.',
    task:'Der Roboter überfährt schwarze Querstreifen und zeigt ihre Anzahl auf der Lichtmatrix an.',
    challenge:'Vor dem Start stellt ihr mit den Tasten am Hub eine Zahl n ein. Der Roboter hält genau an der n-ten Linie.',
    pro:'Zeichnet eine Spirale, deren Seitenlänge mit jeder Runde wächst – die Fortsetzung von Modul 2.',
    hints:[
      'Was muss sich der Roboter merken, und in welchem Moment ändert sich dieser Wert?',
      'In »Variablen« legt ihr eine Variable an. Danach gibt es dort »setze … auf« und »ändere … um«.',
      'Das Teilstück: Am Anfang »setze Linien auf 0«. Immer wenn eine Linie kommt: »ändere Linien um 1« und »zeige Zahl Linien«.'
    ],
    hintBlocks:['pb_display_number', 'pb_reflection'],
    bug:{file:'M5 Bug-Jagd - Der Zaehler spinnt', text:BUG},
    quiz:[
      {question:'Wofür braucht ein Programm eine Variable?', answers:['Damit es schneller läuft.', 'Um sich einen Wert zu merken, der sich im Lauf des Programms ändert.', 'Um Blöcke zu wiederholen.'], correct:1,
        why:'Eine Variable ist ein Merkzettel mit Namen: Man kann etwas draufschreiben, nachlesen und ändern.'},
      {question:'»setze Linien auf 0«, danach dreimal »ändere Linien um 1«. Welchen Wert hat Linien?', answers:['1', '3', '0'], correct:1,
        why:'0 + 1 + 1 + 1 = 3. »ändere um« zählt zum alten Wert dazu.'},
      {question:'Im Python-Code steht `Linien = Linien + 1`. Was bedeutet das?', answers:['Eine Gleichung, die nie stimmen kann.', 'Der neue Wert von Linien ist der alte plus 1.', 'Linien wird auf 1 gesetzt.'], correct:1,
        why:'Das Gleichheitszeichen heißt in Python »wird zu«: Erst wird rechts gerechnet, dann das Ergebnis links gespeichert.'},
      {question:'Was meldet »Reflexion an Farbsensor«, wenn der Sensor über einer schwarzen Linie steht?', answers:['Einen hohen Wert, nahe 100.', 'Einen niedrigen Wert.', 'Immer genau 50.'], correct:1,
        why:'Schwarz wirft wenig Licht zurück: niedriger Wert. Weiß wirft viel zurück: hoher Wert.'}
    ],
    leader:{pitfalls:['Eine einzige Linie wird mehrfach gezählt, weil der Sensor sie über mehrere Messzyklen hinweg sieht. Ein Paradebeispiel für einen Fehler, den die Teams selbst finden sollten.'], solutions:['M5 Loesung - Linienzaehler']}
  },
  {
    nr:6, title:'Regelung: Linienfolger und Gyrosensor', concept:'Ständig messen und nachkorrigieren.',
    needs:'Die Fahrbasis mit Farbsensor nach unten, eine Linienstrecke und den Gyrosensor im Hub.',
    intro:'Wie hält man ein Fahrrad auf einer geraden Linie?',
    task:'A – Linienfolger mit zwei Zuständen: Sieht der Sensor Schwarz, lenkt der Roboter leicht zur einen Seite, sieht er Weiß, zur anderen. So tastet er sich an der Kante entlang.\n\nB – Eine genaue 90-Grad-Drehung mit dem Gyrosensor: Winkel zurücksetzen und drehen, bis der Wert 90 erreicht ist. Damit löst sich die offene Frage aus Modul 2.',
    challenge:'Durchfahrt eine geschlossene Linienstrecke möglichst schnell, ohne die Linie zu verlieren. Bestenliste nach Rundenzeit.',
    pro:'Proportionalregler: Die Lenkung wird umso stärker, je weiter der Roboter von der Kante weg ist. Lenkung = k × (gemessene Reflexion − Sollwert).',
    hints:[
      'Was soll der Roboter tun, wenn er Schwarz sieht – und was, wenn er Weiß sieht?',
      'Ihr braucht »wiederhole fortlaufend« und »falls … sonst« aus »Steuerung«, »Reflexion an Farbsensor« aus »Sensoren« und »fahre los mit … Drehrate« aus »Fahren«.',
      'Mit diesen Blöcken misst und lenkt der Roboter. Für Aufgabe B gibt es in »Sensoren« die »Ausrichtung des Hubs«:'
    ],
    hintBlocks:['pb_reflection', 'pb_drive_drive', 'pb_heading'],
    bug:{file:'M6 Bug-Jagd - Nur die erste Drehung klappt', text:BUG},
    quiz:[
      {question:'Was bedeutet Regelung?', answers:['Einmal genau einstellen und dann laufen lassen.', 'Ständig messen und immer wieder ein bisschen nachkorrigieren.', 'Möglichst schnell fahren.'], correct:1,
        why:'Wie beim Fahrradfahren: Man lenkt nicht einmal richtig, sondern korrigiert dauernd kleine Abweichungen.'},
      {question:'Beim Proportionalregler ist die Abweichung vom Sollwert doppelt so groß. Was passiert mit der Lenkung?', answers:['Sie bleibt gleich.', 'Sie wird doppelt so stark.', 'Sie wird halb so stark.'], correct:1,
        why:'Lenkung = k × Abweichung. Doppelte Abweichung, doppelte Lenkung.'},
      {question:'Der Linienfolger schwingt heftig hin und her. Was hilft?', answers:['k größer machen.', 'k kleiner machen oder langsamer fahren.', 'Den Sollwert auf 100 stellen.'], correct:1,
        why:'Ein zu großes k lenkt zu stark und schießt über das Ziel hinaus. Kleineres k oder weniger Tempo beruhigt die Fahrt.'},
      {question:'Der Sollwert für die Reflexion ist 50. Wo steht der Sensor dann?', answers:['Mitten auf der schwarzen Linie.', 'Auf der Kante: halb über Schwarz, halb über Weiß.', 'Ganz auf dem weißen Grund.'], correct:1,
        why:'An der Kante sieht der Sensor von beidem etwas – der Wert liegt zwischen Schwarz und Weiß.'}
    ],
    leader:{pitfalls:['Der Gyrosensor driftet und muss vor jeder Fahrt zurückgesetzt werden', 'bei hoher Geschwindigkeit schwingt der Roboter über'],
      solutions:['M6 Loesung - Linienfolger mit zwei Zustaenden', 'M6 Loesung - 90-Grad-Drehung mit dem Gyrosensor', 'M6 Loesung - Proportionalregler']}
  },
  {
    nr:7, title:'Eigene Blöcke', concept:'Etwas einmal bauen und immer wieder benutzen.',
    needs:'Alles aus den Modulen davor.',
    intro:'Schaut euch ein langes Programm an, in dem dieselbe Drehung dreimal gebaut ist. Wo würdet ihr hier einen Fehler suchen?',
    task:'Legt unter »Meine Blöcke« einen eigenen Block »drehe um (Winkel)« mit dem Gyrosensor an, dazu einen Block »fahre bis Linie«.',
    challenge:'Jedes Team baut eine kleine Bibliothek aus drei eigenen Blöcken und tauscht sie mit einem anderen Team. Kann das andere Team eure Blöcke ohne Erklärung benutzen?',
    hints:[
      'Welche Blöcke gehören zusammen und könnten einen gemeinsamen Namen bekommen?',
      'In »Meine Blöcke« liegt oben der Block zum Anlegen. Über das Zahnrad an diesem Block bekommt er Eingaben.',
      'Das Teilstück: Im eigenen Block steht »setze Ausrichtung des Hubs auf 0 Grad«, dann »fahre los« mit einer Drehrate, dann »warte bis« die »Ausrichtung des Hubs« größer als die Eingabe ist, dann »Fahrbasis bremsen«.'
    ],
    hintBlocks:['pb_reset_heading', 'pb_heading'],
    bug:{file:'M7 Bug-Jagd - Der Block dreht immer gleich weit', text:BUG},
    quiz:[
      {question:'Dieselbe Drehung kommt im Programm dreimal vor. Was ist der Vorteil eines eigenen Blocks dafür?', answers:['Der Roboter dreht genauer.', 'Ein Fehler muss nur an einer Stelle behoben werden.', 'Das Programm braucht weniger Strom.'], correct:1,
        why:'Der eigene Block ist die eine Stelle, an der die Drehung gebaut ist. Wer sie dort verbessert, verbessert sie überall.'},
      {question:'Wie heißt ein eigener Block in Python?', answers:['Schleife', 'Funktion – sie beginnt mit `def`', 'Variable'], correct:1,
        why:'`def drehe(Winkel):` legt eine Funktion an. Aufgerufen wird sie mit ihrem Namen und Klammern: `drehe(90)`.'},
      {question:'Was ist eine Eingabe (ein Parameter) eines eigenen Blocks?', answers:['Ein Wert, den man beim Benutzen des Blocks mitgibt.', 'Der Name des Blocks.', 'Die Farbe des Blocks.'], correct:0,
        why:'Mit einer Eingabe kann derselbe Block jedes Mal etwas anderes tun – zum Beispiel um 90 oder um 45 Grad drehen.'},
      {question:'Welcher Name hilft einem anderen Team am meisten?', answers:['»Block1«', '»fahre bis Linie«', '»test neu final«'], correct:1,
        why:'Ein guter Name sagt, was der Block tut. Dann braucht er keine Erklärung.'}
    ],
    leader:{pitfalls:['Feste Werte im Inneren des Blocks statt Parameter – der Block funktioniert dann nur für einen einzigen Fall.'],
      solutions:['M7 Loesung - Eigener Block drehe', 'M7 Loesung - Eigener Block fahre bis Linie']}
  },
  {
    nr:8, title:'Mini-Robot-Game', concept:'Strategie, Teamarbeit und Verbessern in vielen kleinen Schritten.',
    needs:'Alles, dazu ein Spielfeld mit zwei bis drei Missionen und eine Stoppuhr.',
    intro:'Ein Lauf dauert 2:30 Minuten. Welche Missionen schafft ihr in dieser Zeit sicher – und welche nur vielleicht?',
    task:'Strategie (15 Minuten): Wählt in Teams von drei bis vier Personen die Missionen und ihre Reihenfolge, verteilt die Rollen und schreibt den Plan ins Logbuch.',
    challenge:'Bauen, Programmieren, Testen: Arbeitet in kleinen Schritten und haltet jede wichtige Änderung im Logbuch fest. Danach der Wettkampf: mehrere Läufe pro Team, der beste zählt. Start aus dem markierten Startbereich, Eingriffe am Roboter nur dort.',
    pro:'Ideenmarkt zur Halbzeit: Jedes Team schickt einen Botschafter zu einem anderen Team, der eine Idee mitbringt.',
    hints:[
      'Welche Mission bringt für wenig Aufwand viele Punkte – und welche könnt ihr zuverlässig wiederholen?',
      'Eure eigenen Blöcke aus Modul 7 sind jetzt Gold wert: »drehe um«, »fahre bis Linie«.',
      'Das Teilstück: Baut für jede Mission einen eigenen Block. Das Hauptprogramm besteht dann nur noch aus diesen Blöcken in der Reihenfolge eurer Strategie.'
    ],
    hintBlocks:[],
    quiz:[
      {question:'Wie lange dauert ein Lauf im Robot Game?', answers:['1 Minute', '2:30 Minuten', '5 Minuten'], correct:1,
        why:'Zweieinhalb Minuten – deshalb lohnt es sich, vorher zu überlegen, welche Missionen sich lohnen.'},
      {question:'Wo dürft ihr während eines Laufs am Roboter eingreifen?', answers:['Überall auf dem Feld.', 'Nur im Startbereich.', 'Gar nicht.'], correct:1,
        why:'Angefasst wird der Roboter nur im Startbereich. Auf dem Feld muss er allein zurechtkommen.'},
      {question:'Warum schreibt ihr jede wichtige Änderung ins Logbuch?', answers:['Damit das Heft voll wird.', 'Damit ihr wisst, was ihr schon probiert habt und was es gebracht hat.', 'Weil der Roboter es braucht.'], correct:1,
        why:'Wer aufschreibt, was er geändert hat und was dann passiert ist, probiert nichts doppelt und findet schneller, was wirklich hilft.'}
    ],
    leader:{pitfalls:[], solutions:[]}
  }
];

/** Alle Programmdateien, die der Kurs nennt (ohne Endung). */
export const courseFiles = (): string[] => MODULES.flatMap(m => [m.demo?.file, m.bug?.file, ...m.leader.solutions].filter((f): f is string => !!f));

// ----- Fortschritt im Quiz -----
const STORE_KEY = 'blockwerk-kurs-v1';
export interface QuizResult { right: number; total: number }
type Progress = Record<string, QuizResult>;
function read(): Progress { try { const p = JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); return p && typeof p === 'object' ? p : {}; } catch { return {}; } }
/** Bestes Ergebnis eines Moduls, falls das Quiz schon einmal beendet wurde. */
export const quizResult = (nr: number): QuizResult | undefined => read()['m' + nr];
/** Merkt sich ein Ergebnis, wenn es besser ist als das bisherige. */
export function saveQuizResult(nr: number, result: QuizResult){
  const all = read(), old = all['m' + nr];
  if (old && old.right >= result.right) return;
  all['m' + nr] = result;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* ohne Speicher gilt es bis zum Neuladen nicht */ }
}
