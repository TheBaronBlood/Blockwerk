# Blockwerk – Versionen

Die Versionsnummer hat drei Stellen: `0.11.0`.

- **Mittlere Stelle** (0.**11**.0): etwas Neues, das man benutzen kann – ein Meilenstein,
  neue Blöcke, eine neue Funktion.
- **Letzte Stelle** (0.11.**1**): nur Fehlerbehebungen und Kleinigkeiten.
- **Erste Stelle**: bleibt `0`, solange Blockwerk nicht an echten Hubs erprobt ist.
  `1.0.0` wird die erste Version, die in der AG mit echten Hubs zuverlässig läuft.

Öffentlich ist Blockwerk seit Version 0.25.0; der Verlauf des Repositorys beginnt dort. Die
Einträge davor beschreiben, wie Blockwerk bis dahin entstanden ist.

Nicht jede Version gibt es als Programm zum Herunterladen: Kleine Schritte gehen zuerst nur in
die Fassung im Netz, die deshalb immer die neueste Nummer zeigt. Ein Release mit den fertigen
Programmen (und einem Git-Tag wie `v0.26.0`) fasst dann zusammen, was seit dem vorigen dazukam.

## 0.28.0 – 8. Oktober 2026

- Neu: **Eine eigene Ansicht für das Handy** – nach einem Entwurf des Autors. Blockwerk richtet sich
  nach dem Format des Fensters; ein schmal gezogenes Browserfenster am Computer bekommt dieselbe
  Ansicht.
  - **Hochkant** liegen die Kategorien als Leiste am unteren Rand, zum Wischen. Ein Tipp auf eine
    Kategorie klappt die Blöcke darunter auf (die Leiste rückt nach oben), ein zweiter Tipp klappt
    sie wieder zu. Start und Stopp sitzen oben rechts, die Kopfleiste hat zwei Zeilen.
  - **Quer** bleiben die Kategorien links, die Kopfleiste ist flach.
  - In beiden sitzt **Verbinden in der Kopfleiste**. Wer einen Block aus der Liste nimmt, hat die
    Arbeitsfläche wieder frei – die Liste schließt sich. Gelöscht wird, indem man einen Block auf
    die Kategorien zieht.
  - **Python-Code, Hilfe, Einstellungen, »Hub verbinden« und die Hub-Ansicht füllen den
    Bildschirm.** Den Code öffnet der Griff am rechten Rand; zurück geht es mit »‹ Blöcke«.
  - Wird das Handy gedreht, zieht der Werkzeugkasten um, ohne dass die Verbindung zum Hub abreißt.
  - Die **Controller-Ansicht liegt immer quer**: Wer das Handy hochkant hält, bekommt sie um eine
    Vierteldrehung gedreht und dreht einfach das Handy – auch wenn die Anzeige nicht mitdreht.
  - **Erweiterungen sind auf dem Handy gesperrt** (der Editor braucht mehr Platz); auf Tablets und
    am Computer bleibt alles wie bisher.
- Neu: **Klänge für die Bedienung** – ein Ton für Knöpfe, einer für die Kategorien der Blockliste, je
  einer für »Hub verbunden« und »Hub getrennt«; dazu ein neuer Klang beim Zusammenstecken. Alles
  hängt an der Einstellung »Klang«; welcher Anlass welchen Klang bekommt, steht in
  `public/klang/klang.json`.
- Geändert: Mit dem Finger wählt erst das Antippen eine Kategorie – nicht mehr schon das Aufsetzen.
  So lassen sich die Kategorien rollen, ohne dass dabei eine aufgeht (auch auf Tablets).
- Geändert: Die Blockliste liegt über den Rollbalken der Arbeitsfläche; vorher schien der
  waagerechte Balken durch sie hindurch.
- Geprüft mit Fenstern im Handy-Format und den Berührungsereignissen des Browsers (wie in dessen
  Geräte-Ansicht); an echten Handys noch nicht erprobt.
## 0.27.1 – 7. Oktober 2026

- Behoben: Die Zoom-Anzeige an der Arbeitsfläche änderte ihre Breite, wenn aus zwei Ziffern drei
  wurden; Plus und Minus der Lupen saßen nicht in der Mitte. Die Anzeige ist jetzt fest breit, die
  Lupen sind gezeichnet statt geschrieben.

## 0.27.0 – 7. Oktober 2026

- Neu: **Die Oberfläche ist aufgeräumt** – nach einem Entwurf des Autors. Start und Stopp gibt
  es nur noch einmal, als runde Knöpfe unten rechts an der Arbeitsfläche; die zweite Knopfleiste
  über dem Python-Code ist weg.
- Neu: **Verbinden ist ein eigener Knopf** oben rechts an der Arbeitsfläche. Er zeigt, ob ein
  Hub verbunden ist: graue Wellen ohne Hub, grüne mit Hub. Ohne Hub öffnet er »Hub verbinden«,
  mit Hub die Hub-Ansicht mit den Anschlüssen. Daneben steht, was der Hub gerade tut.
- Neu: **»Hub trennen« steht in der Hub-Ansicht.** Vorher legt Blockwerk dein Programm zurück
  auf den Hub – das Anzeige-Programm der Hub-Ansicht bleibt nie als letztes dort liegen. Das
  gilt jetzt auch, wenn du noch gar nichts gestartet hattest: Dann kommt das Programm der
  Arbeitsfläche auf den Hub, und die Taste am Hub startet es. Läuft ein Programm, fragt der
  Verbinden-Knopf, ob es für die Hub-Ansicht anhalten oder der Hub getrennt werden soll.
- Geändert: Der Werkzeugkasten zeigt jede Kategorie mit einem Balken und der Schrift in ihrer
  Farbe; die gewählte ist ganz ausgefüllt. Die Knöpfe der Kopfleiste haben farbige Zeichen,
  die Liste der Beispiele füllt die Mitte, der Python-Bereich klappt über einen Griff auf
  halber Höhe ein und aus.
- Geändert: »Erweiterungen« ist kein beschrifteter Knopf mehr, sondern ein kleines Zeichen
  (Innensechskantschlüssel), das am Zahnrad hängt, sobald Erweiterungen eingeschaltet sind.
- Neu: Neben »Kopieren« stehen **Minus und Plus für die Schrift im Code** – dieselbe Einstellung
  wie »Schriftgröße im Code«, nur ohne Umweg über die Einstellungen.
- Neu: Im **Fenster »Erweiterungen«** lassen sich die Liste links und die Vorschau rechts durch
  Ziehen breiter und schmaler machen (Doppelklick: Standard), und ein Knopf oben rechts schaltet
  auf Vollbild. Beides merkt sich Blockwerk.
- Neu: **Der Code zeigt den ganzen Abschnitt eines Blocks.** Wer eine Schleife oder Bedingung
  anklickt, sieht im Python-Code die Form des Blocks: Kopfzeile, links ein Steg, unten ein Balken. Das gilt
  auch für eigene Blöcke (`def …`) und Ereignisse mit eigener Zeile. Ein Klick auf einen
  **Parameter** – eine Zahl, eine Variable, einen Sensor, eine Rechnung – hebt nur diesen Ausdruck
  hervor, nicht die ganze Zeile.
- Neu: **Zu lange Zeilen brechen in der Anzeige um**, statt aus dem Bild zu laufen: Die Folgezeilen
  stehen hinter der öffnenden Klammer, wie man es von Hand einrücken würde. Das Programm selbst und
  die Zeilennummern bleiben dabei, wie sie sind.
- Neu: **Blöcke lassen sich aus der Hilfe ziehen.** Das Bild eines Blocks auf seiner Hilfeseite
  ist anfassbar: herausziehen, und er liegt auf der Arbeitsfläche – ohne Suchen in der Blockliste.
  Solange gezogen wird, scheint die Hilfe durch.
- Neu: **Die Hilfe hat ein Nachschlagewerk der Klassen von Pybricks**, aufgebaut wie eine
  Python-Dokumentation: zu jeder Klasse (`PrimeHub`, `DriveBase`, `Motor`, die Sensoren,
  `StopWatch`, `XboxController`, `Remote`) der Import, das Anlegen des Objekts und alle
  Funktionen. Jede Funktion hat eine eigene Seite mit Eingaben, Beispielzeilen und den Blöcken,
  die sie benutzen. Ein Klick auf `Motor` oder `straight` im Code führt direkt dorthin.
- Neu: Der Code zeigt **Hilfslinien für die Einrückung** – je Stufe ein feiner senkrechter Strich.
- Geändert: Nach jedem eingerückten Abschnitt (Schleife, Bedingung) lässt der erzeugte Code eine
  **Zeile frei**, damit man sieht, wo er endet.
- Neu: Beim **Löschen eines Blocks** ist ein kurzes Wischen zu hören (abschaltbar mit »Klang« in den
  Einstellungen).
- Geändert: Welcher Anlass welchen Klang bekommt, steht jetzt in `public/klang/klang.json` –
  Datei in den Ordner legen, Namen eintragen, neu laden. Vorbereitet sind auch Knöpfe, Kategorien,
  Start, Stopp, »verbunden«, »getrennt« und Fehler; sie sind von Haus aus stumm.
- Behoben: Der Klang beim Zusammenstecken blieb in manchen Browsern (Edge) stumm, obwohl er
  eingeschaltet war. Die Klänge laufen jetzt über einen anderen Weg des Browsers.
- Neu: Zwischen den Lupen der Arbeitsfläche steht der **Zoom in Prozent**; ein Klick darauf setzt
  ihn auf 100 % zurück.
- Geändert: Der Controller-Knopf über dem Startknopf blendet das Steuerfeld unter dem Code ein
  und aus (mit dem Finger oder bei eingeklapptem Code öffnet er weiter die große Ansicht).
- Am Test-Hub geprüft; am echten Hub ist »Hub trennen« mit dem Zurücklegen noch nicht erprobt.

## 0.26.4 – 7. Oktober 2026

- Neu: In »Über Blockwerk« steht ein **Dank an Pybricks** – mit Links zum Projekt und dazu, wie
  man die Arbeit daran unterstützen kann. Blockwerk baut auf Pybricks auf und ersetzt es nicht.

## 0.26.3 – 7. Oktober 2026

- Neu: Scheitert ein Programm, weil ein Gerät am falschen Anschluss steckt, **sieht Blockwerk von
  selbst nach, wo es wirklich ist**, und schreibt es ins Terminal: »Das Programm erwartet einen
  Kraftsensor an F; dort steckt nichts. Ein Kraftsensor steckt an E.« Die Blockliste zeigt
  danach wieder die richtigen Anschlüsse, und der Block, der das Gerät benutzt, ist markiert
  (bisher nur bei den Motoren der Fahrbasis). Blöcke auf der Arbeitsfläche ändert Blockwerk
  nicht von selbst. Gehört zu »Anschlüsse erkennen« in den Einstellungen. Am echten Hub geprüft
  (Kabel).
- Geändert: Die Hinweise zu einem Fehler stehen im Terminal jetzt hinter der Erklärung des Hubs
  und nicht mehr mitten darin.

## 0.26.2 – 7. Oktober 2026

- Neu: **Blockwerk erkennt, was am Hub steckt.** Nach »Hub verbinden« sieht es kurz nach – am
  Kabel rund eine Sekunde, über Bluetooth etwas länger – und stellt die Buchstaben in der
  Blockliste darauf ein: Steckt der Kraftsensor an F, zeigt sein Block gleich »F«. Zwei Motoren
  gelten als Fahrbasis, ein dritter ist der Motor für alles andere. Blöcke, die schon auf der
  Arbeitsfläche liegen, bleiben, wie sie sind; ohne Hub gelten die üblichen Vorgaben. Im
  Terminal steht, was erkannt wurde. Wer mit »Starten« verbindet, wird nicht aufgehalten – dann
  sieht Blockwerk nicht nach.
  Pybricks meldet von sich aus nicht, was angeschlossen ist. Deshalb läuft dafür einen Moment
  lang das kleine Programm der Hub-Ansicht auf dem Hub, und **es ersetzt, was dort gespeichert
  war**. Wer das nicht will, schaltet »Anschlüsse erkennen« in den Einstellungen ab. Am echten
  Hub geprüft, über Kabel und Bluetooth (zwei Motoren, zwei Farbsensoren, ein Kraftsensor).
- Geändert: Die **Blockliste zoomt nicht mehr mit** der Arbeitsfläche. Wer nah heranzoomte – am
  Tablet schnell passiert –, hatte riesige Blöcke in der Liste. Sie bleibt jetzt so groß wie
  beim Start; ein Block nimmt die Größe der Arbeitsfläche an, sobald man ihn herauszieht.
- Geprüft: Die Bluetooth-Verbindung aus 0.26.1 läuft auch vom Computer aus (Programm am Mac,
  echter Hub: verbinden, laden, starten, Ausgabe lesen).

## 0.26.1 – 6. Oktober 2026

- Behoben: »Hub verbinden« scheiterte in Browsern, die dem iPad Bluetooth beibringen (Bluefy),
  noch bevor die Liste der Hubs erschien. Blockwerk nannte dem Browser einen Dienst des Hubs als
  Zahl – Chrome und Edge nehmen das an, Bluefy nicht. Am iPad in Bluefy erprobt: verbinden und
  ein Programm mit dem Steuerfeld. Safari und Chrome können am iPad weiterhin kein Bluetooth; für
  die Programme am Computer ändert sich nichts.

## 0.26.0 – 6. Oktober 2026

Die erste Version mit fertigen Programmen zum Herunterladen. Was Blockwerk kann, steht im
README; wie es bis hierhin entstanden ist, in `CHANGELOG.md`.

- Neu: Blockwerk lässt sich **im Netz bereitstellen** – als Link für die ganze AG, ohne
  Installation. Die Anleitung für Cloudflare Pages steht im README (»Im Netz bereitstellen«);
  die Regeln, die nur Skripte der Seite selbst zulassen, gelten dort wie im Programm.
- Neu: Blöcke **klicken leise**, wenn sie zusammengesteckt werden. Wen das stört – etwa in
  einem Raum mit vielen Rechnern –, schaltet es in den Einstellungen unter »Klang« ab.

## 0.25.0 – 6. Oktober 2026

Durchsicht vor der Veröffentlichung: Sicherheit, Datenschutz und Lizenzen. Blockwerk steht
jetzt unter der MIT-Lizenz – frei zu benutzen, zu verändern und weiterzugeben.

- Neu: die **Hub-Ansicht** (Knopf »Hub-Ansicht« neben »Steuerfeld«, oder ein Klick auf den
  Namen des Hubs). Sie zeigt den Hub von oben und für jeden Anschluss, was dort steckt und
  was es gerade misst: bei Motoren den Winkel mit einem Zeiger, der sich mitdreht, beim
  Farbsensor Farbe oder Reflexion, dazu Abstand und Kraft; außerdem Akku, Ladezustand und
  Neigung des Hubs. Solange das Fenster offen ist, läuft dafür auf dem Hub ein kleines
  Anzeige-Programm, das nichts bewegt. Beim Schließen legt Blockwerk wieder auf den Hub, was
  es zuletzt selbst geladen hatte. Während ein eigenes Programm läuft, gibt es die Ansicht
  nicht – Pybricks schickt diese Daten nicht von selbst. Am echten Hub geprüft (Bluetooth und
  Kabel, zwei Motoren, zwei Farbsensoren, ein Kraftsensor in Ruhe); der Abstandssensor und ein
  gedrückter Kraftsensor nur mit nachgestellten Werten.
- Behoben (Programm am Computer): Nach der ersten Verbindung – gleich ob über Bluetooth oder
  Kabel – ließ sich kein Hub mehr über Bluetooth auswählen: Das Fenster mit der Liste
  verschwand sofort wieder. Verbinden, Trennen und wieder Verbinden geht jetzt beliebig oft,
  ohne Blockwerk neu zu starten.
- Projekt öffnen: Bringt eine Projektdatei Erweiterungen mit, fragt Blockwerk jetzt nach,
  bevor es sie hinzufügt – ihr Python läuft später auf dem Hub. »Ohne Erweiterungen öffnen«
  lädt das Programm ohne ihre Blöcke. Würde eine mitgebrachte Erweiterung eine eigene mit
  demselben Namen ersetzen, steht das in der Rückfrage. Bisher wurden Erweiterungen aus
  Projektdateien ohne Nachfrage installiert.
- Behoben: Eine Datei mit einem Block, den Blockwerk nicht kennt (etwa aus einer neueren
  Fassung), leerte die Arbeitsfläche und überschrieb das gespeicherte Programm. Jetzt bleibt
  das Programm stehen, und eine Meldung sagt, woran es liegt.
- Behoben: Blockwerk holte bei jedem Start ein Symbolbild und beim Ziehen von Blöcken die
  Mauszeiger von einem Server von Google (static.blockly.com). Diese Dateien liegen jetzt
  bei. Von sich aus lädt Blockwerk nichts mehr aus dem Netz; ins Internet geht nur noch die
  Frage nach neuer Firmware, und nur auf Knopfdruck.
- SPIKE-Projekte: Blockwerk packt nur noch das Programm aus der Datei aus, mit einer
  Obergrenze für die Größe. Eine präparierte Datei kann die Seite nicht mehr einfrieren.
- Kleinigkeiten: Lässt sich ein Programm aus dem Kurs nicht laden, bleibt die Fehlermeldung
  stehen (bisher überdeckte sie die Erfolgsmeldung). »Leeren« am Terminal geht auch in
  Browsern, die sich nicht mit dem Hub verbinden können.
- »Über Blockwerk« zeigt die Lizenztexte der eingebauten Software (»Lizenzen anzeigen«). Sie
  liegen jedem Programm und jeder App als `lizenzen.txt` bei.
- Programm am Computer: Die Seite läuft mit einer Inhaltsrichtlinie (nur eigene Skripte).
  Anfragen nach Kamera, Mikrofon, Standort oder Benachrichtigungen lehnt das Programm ab.
  Die Rechtschreibprüfung ist aus – sie hätte Wörterbücher aus dem Netz geladen.
- Die Kursprogramme enthalten den Klang nicht mehr, den die SPIKE-App jedem Projekt
  mitgibt; die Bildschirmfotos der SPIKE-App liegen nicht mehr im Repository.
- Geprüft im Programm am Mac (auch im gepackten Programm), unter Windows 11 (Tests,
  Selbsttest, Bau von Installer und Zip-Fassung), im Android-Emulator und im iPad-Simulator.
- Am echten Hub (SPIKE Prime, Pybricks 4.1.0b5, über Bluetooth und über das Kabel): Bild, Ton
  und Ausgabe; die Fehleranzeige mit markiertem Block; zwei Ereignisse mit einer Nachricht und
  »Stopp«; eine Erweiterung mit eigenem Modul. Die letzten drei liefen damit zum ersten Mal
  an einem Gerät. Programme, die Motoren bewegen, weiterhin nicht.
- Für alle, die Blockwerk selbst bauen: `npm ci` läuft jetzt auch mit npm 11.19 – in der
  Lock-Datei fehlten Einträge.
- iPad: zurückgestellt. Blockwerk gibt es vorerst für Windows, macOS, Linux und Android.
- Android: Der Bau kann die App mit einem festen Schlüssel signieren (README,
  »Android-Schlüssel«). Sobald er hinterlegt ist, lassen sich neue Fassungen über die
  vorhandene App installieren.

## 0.24.1 – 5. Oktober 2026

- App für Handy und Tablet: Die Suche nach Hubs über Bluetooth erscheint jetzt im Fenster
  von Blockwerk – wie im Programm am Computer – statt in der schlichten Auswahl des
  Systems. Die Liste zeigt die Empfangsstärke und stellt den nächsten Hub nach oben.
- Im Android-Emulator geprüft, dass die Suche startet; die Liste mit echten Hubs noch nicht.

## 0.24.0 – 5. Oktober 2026

- Ein Controller, der mit dem Handy, Tablet oder Computer verbunden ist (Xbox, PlayStation
  und andere), bedient jetzt das Steuerfeld: linker Stick oder Steuerkreuz für den Joystick,
  die vier Tasten rechts für A bis D. Blockwerk zeigt an, dass es ihn erkannt hat – im
  Steuerfeld und in der Controller-Ansicht. Dazu einmal eine Taste am Controller drücken.
- Xbox-Blöcke (der Hub verbindet sich selbst mit dem Controller): Neben dem Namen des Hubs
  steht jetzt »sucht Xbox-Controller …« und danach »Xbox-Controller verbunden«; dieselben
  Meldungen erscheinen im Terminal. Für die LEGO-Fernbedienung gilt dasselbe.
- Hängt der Controller am Gerät und das Programm benutzt die Xbox-Blöcke, erklärt
  Blockwerk beim Start, warum der Hub ihn so nicht findet.
- Der Fehlerhinweis bei nicht gefundenem Controller nennt jetzt die häufigste Ursache.
- Am echten Controller noch nicht erprobt: geprüft mit einem nachgestellten Gamepad und
  nachgestellten Meldungen des Hubs.

## 0.23.3 – 5. Oktober 2026

- Linux, AppImage: Liegt neben der AppImage-Datei ein Ordner `Blockwerk-Daten`, legt
  Blockwerk seine Daten dort ab – wie bisher schon neben `Blockwerk.exe` unter Windows.
- README: wie Blockwerk auf Linux-PCs ohne Installationsrechte läuft (Schul-PC, USB-Stick).

## 0.23.2 – 5. Oktober 2026

Erster Lauf am echten Hub über das USB-Kabel (SPIKE Prime, Pybricks 4.1.0b5, Mac).

- Behoben: Über das Kabel antwortete der Hub nicht, oder er verstummte beim Laden eines
  Programms. Ursache ist ein Fehler der Beta-Firmware: Nach einer USB-Übertragung mit
  einer Länge von 64, 128, 192 … Bytes nimmt der Hub nichts mehr an, bis das Kabel neu
  gesteckt wird. Blockwerk schickt jetzt alles in kleineren Stücken.
- Am echten Hub geprüft: verbinden, Programm laden und starten, Ausgabe im Terminal,
  Steuerfeld, Stopp, trennen – über das Kabel und (ohne Steuerfeld und Stopp) über Bluetooth.
- Antwortet der Hub am Kabel nicht, rät die Meldung jetzt, das Kabel einmal neu zu stecken.
- Entwickleroption: `blockwerk.runPython('…')` in der Konsole führt eigenes Python auf dem
  verbundenen Hub aus.
- Noch nicht geprüft: das Kabel unter Windows und Linux und mit der Android-App.

## 0.23.1 – 5. Oktober 2026

Nach dem ersten Versuch am Handy und mit einem echten Hub (Bluetooth läuft).

- Handy im Hochformat: Der Knopf zum Verkleinern verschwand halb unter dem Werkzeugkasten.
  Die Lupen fallen dort weg – gezoomt wird mit zwei Fingern –, »Aufräumen« bleibt.
- Meldungen erscheinen auf schmalen Bildschirmen oben statt über Start und Stopp und
  nutzen die ganze Breite, statt in drei Zeilen umzubrechen.
- Werkzeugkasten: schmaler auf dem Handy, höhere Zeilen für den Finger und wieder in der
  Schrift der Oberfläche (die Regel dafür griff seit dem Wechsel auf Blockly 13 nicht mehr).
- Die helle Linie um die Arbeitsfläche im dunklen Design ist weg.
- Hub am Kabel nicht gefunden: Blockwerk nennt jetzt den häufigsten Grund – die stabile
  Pybricks-Firmware 4.0 kann kein USB – und, wenn bekannt, die Firmware des zuletzt
  verbundenen Hubs. Im Browser steht der Hinweis im Terminal.
- Meldungen sprechen vom »Gerät« statt vom »Tablet«.

## 0.23.0 – 5. Oktober 2026

- Steuerfeld als Controller: füllt den ganzen Bildschirm, Joystick links und vier farbige
  Tasten rechts – groß genug für die Daumen, mit mehreren Fingern zugleich bedienbar.
- »Anordnen«: Joystick und Tasten liegen in einem Raster und lassen sich dort verschieben.
  Antippen wählt ein Teil aus, − und + ändern seine Größe; »Zurücksetzen« stellt die
  Ausgangslage wieder her. Blockwerk merkt sich die Anordnung – je eine für das Tablet im
  Querformat, für das Hochformat und für flache Bildschirme (Handy quer).
- Auf Tablets und Touch-Bildschirmen öffnet »Steuerfeld« gleich diese Ansicht, ebenso der
  Start eines Programms, das das Steuerfeld abfragt. Am Computer führt der Knopf
  »Controller-Ansicht« im Steuerfeld dorthin.
- Neuer runder Controller-Knopf an der Arbeitsfläche, sobald das Programm das Steuerfeld
  benutzt. Starten und Stopp gibt es auch in der Controller-Ansicht.
- Android: Die Zurück-Taste schließt die Controller-Ansicht, statt Blockwerk zu verlassen.
- Behoben: Im Steuerfeld ließ eine Taste sofort wieder los, wenn vorher der Joystick
  angeklickt worden war.
- Im Android-Emulator mit Berührungen geprüft; an einem echten Tablet und mit einem Hub
  noch nicht erprobt.

## 0.22.1 – 5. Oktober 2026

Durchsicht: Blöcke, die sich stecken lassen, aber kein lauffähiges Python ergaben.

- Behoben: Hing unter einem Ereignis, in einer Schleife oder in »falls« nur »Fahrbasis
  einrichten«, blieb der Rumpf in Python leer – das Programm ließ sich nicht starten.
  Dort steht jetzt `pass`.
- Behoben: Variablen beginnen wie in der SPIKE-App bei 0 statt bei `None`. Vorher
  scheiterte »ändere um 1« oder ein Vergleich, wenn die Variable nie gesetzt wurde.
- Behoben: »abbrechen« und »weiter« gelten jetzt auch in »wiederhole fortlaufend«.
- Behoben (gleichzeitige Ereignisse): fehlender Import von `wait`, wenn eine Nachricht
  gesendet, aber nirgends empfangen wird; eine Schleife, die nur aus »warte bis« besteht,
  konnte die anderen Programmteile aussperren.
- Neues Beispiel »Mehreres gleichzeitig«.
- Neuer Test: 400 zufällig gesteckte Programme aus allen Blöcken des Werkzeugkastens, deren
  Python geprüft wird (Syntax, unbekannte Namen, `await`, `global`).

## 0.22.0 – 5. Oktober 2026

- Mehrere Ereignisse laufen gleichzeitig, wie in der SPIKE-App: neuer Block »wenn …« (mit
  jeder Bedingung – Taste, Farbe, Abstand, Kraftsensor liegen fertig im Werkzeugkasten),
  dazu »wenn ich … empfange« und »sende …« für Nachrichten zwischen den Programmteilen.
- Mehrere Blöcke »wenn Programm startet« laufen jetzt gleichzeitig statt nacheinander.
- Ab zwei Ereignissen entsteht ein Programm mit `async def`, `await` und
  `run_task(multitask(...))`. Mit nur einem Ereignis bleibt das Python so einfach wie bisher.
- Hilfe: Seiten zu den neuen Blöcken, Erklärungen zu `async`, `await`, `multitask` und
  `run_task`, neues Kapitel »Mehreres gleichzeitig«.
- Noch nicht an echten Hubs erprobt. Ereignisse aus SPIKE-Projekten übernimmt der Import
  noch nicht; Blöcke aus Erweiterungen sind für gleichzeitige Ereignisse nicht eingerichtet.

## 0.21.0 – 5. Oktober 2026

- Blockwerk als App für Tablets: Projekte für iPadOS und Android (Capacitor) mit eigenem
  Symbol und Startbild.
- In der App läuft Bluetooth über das Gerät selbst, weil die Browser der Tablets kein
  Web Bluetooth können. Auf Android geht zusätzlich das USB-Kabel (mit Pybricks-Beta 4.1);
  am iPad lässt Apple das nicht zu.
- Bedienung mit dem Finger: größere Knöpfe, breitere Trennleisten, größeres Steuerfeld,
  Auswahllisten in der Höhe der Knöpfe. Gilt auch im Browser auf Touch-Bildschirmen.
- Speichern in der App: Android öffnet »Speichern unter«, das iPad das Fenster »Teilen«.
- Der Workflow »Programm bauen« baut die Android-App mit und hängt sie ans Release.
- Behoben: Auf schmalen Bildschirmen lag »Aufräumen« über der Anzeige »kein Hub«; ein
  kleines Programm wurde dort übergroß dargestellt.
- Noch nicht an echten Tablets und Hubs erprobt; das iPad-Projekt ist noch nicht gebaut.

## 0.20.0 – 5. Oktober 2026

- Releases: Bei einem Versions-Tag legt GitHub von selbst ein Release an – mit den Programmen
  für Windows, macOS und Linux, einer Tabelle »Welche Datei ist die richtige?« und den
  Änderungen seit der vorigen Version.
- Terminal: Gibt ein Programm in einer Schleife sehr viel aus, bremst das die Oberfläche
  nicht mehr.
- Trennleisten zwischen den Bereichen laufen beim Ziehen flüssiger. Wird das Fenster
  schmaler und wieder breiter, bekommt der Python-Bereich seine alte Breite zurück.
- Der Python-Bereich wird nur noch neu aufgebaut, wenn sich der Code ändert – nicht mehr bei
  jedem Verschieben eines Blocks.
- Auf dem Mac nennen die Hinweise die Befehlstaste (⌘Z) statt Strg+Z.
- Behoben: Brach die Verbindung zum Hub ab, während das Programm übersetzt wurde, erschien
  eine unverständliche Fehlermeldung.
- Behoben: »Über Blockwerk« ordnet Freigabekandidaten der Firmware (z. B. 3.3.0c1) jetzt
  richtig als Vorabfassung ein.

## 0.19.0 – 5. Oktober 2026

- Neues Fenster »Über Blockwerk« (Klick auf die Versionsnummer oder Menü Hilfe): zeigt die
  Version von Blockwerk, gegen welche Pybricks-Fassung die Blöcke geprüft sind, die
  Firmware des verbundenen Hubs und die eingebauten Bausteine (Blockly, Python-Übersetzer,
  Electron). »Angaben kopieren« für Fehlermeldungen.
- »Nach neuer Pybricks-Firmware suchen« fragt bei Pybricks nach der aktuellen Fassung,
  vergleicht sie mit dem Hub und führt zum Aktualisieren nach Pybricks Code. Ins Internet
  geht Blockwerk dafür nur auf Knopfdruck.
- macOS: Das Programm ist jetzt gültig signiert (ohne Apple-Beglaubigung). Vorher meldete
  macOS die heruntergeladene Fassung für Apple-Chips als »beschädigt«.

## 0.18.1 – 5. Oktober 2026

- Behoben: Der Ladebildschirm blieb in unsichtbaren Fenstern stehen. Dadurch scheiterte
  der Selbsttest beim Bauen des Linux-Programms.

## 0.18.0 – 5. Oktober 2026

- Kurs der Robotik-AG in der Hilfe: die Module 0 bis 8 mit Einstieg, Grundaufgabe,
  Challenge und Profi-Aufgabe, dazu die Seite »So arbeiten wir«.
- Je Modul drei Hilfekarten zum Aufdecken (Denkfrage, Blockkategorie, Teilstück), die
  Demo- und Bug-Jagd-Programme der AG zum Laden und ein Quiz mit Erklärungen. Das beste
  Quiz-Ergebnis wird gemerkt.
- Einstellung »Kursleitung«: zeigt im Kurs zusätzlich Stolpersteine und Lösungen.

## 0.17.0 – 5. Oktober 2026

- Hilfe zu Python-Wörtern ausgebaut: Ein Klick auf ein Wort im Code zeigt jetzt die
  Erklärung, die angeklickte Zeile, weitere Beispielzeilen, die Blöcke, die das Wort
  erzeugen (mit Bild), und die passenden Python-Kapitel.

## 0.16.0 – 5. Oktober 2026

- Hilfe neu aufgebaut: Startseite mit »Erste Schritte« – sieben Lektionen mit Ziel,
  nummerierten Schritten, fertigem Programm und Aufgaben zum Weiterprobieren.
- Blöcke nach Kategorie mit Kurzbeschreibung; jede Blockseite zeigt den Block als Bild und
  ist gleich gegliedert (Was der Block macht, Eingaben, Python, Beispiel, Gut zu wissen).
- Pfad oben auf jeder Seite, »Zurück / Weiter« zur vorigen und nächsten Seite, Suche über
  Lektionen, Blöcke, Kapitel und Python-Wörter.

## 0.15.0 – 5. Oktober 2026

- Neuer Block »zeige Muster«: eigenes Bild für die Lichtmatrix. Ein Klick auf das Muster
  öffnet einen Editor mit 5 × 5 Punkten, der Helligkeit rechts und Vorlagen darunter.
- SPIKE-Projekte: eigene Lichtmatrix-Bilder werden jetzt übernommen (bisher Platzhalter).
- Installer: Die Seite »Zielordner« hängt den Ordner »Blockwerk« sichtbar an den gewählten
  Pfad an und öffnet die heutige Ordnerauswahl von Windows.

## 0.14.0 – 5. Oktober 2026

- Installer für Windows fragt nach dem Installationsordner und richtet die Deinstallation
  ein; sie räumt auch den Standard-Datenordner auf.
- Speicherort der Daten wählbar (Einstellungen → Speicherort); ein Ordner
  `Blockwerk-Daten` neben dem Programm hat Vorrang, zum Beispiel auf einem USB-Stick.
- Editor für Erweiterungen: farbige Hervorhebung für Python und die Zeilen
  `# blockwerk: …`, Zeilennummern mit markierten Fehlerzeilen, Reiter »Anleitung«.
  Die Anleitung steht auch in `docs/ERWEITERUNGEN.md`.
- Einstellungen zeigen die auf dem Computer installierten Schriften an.
- Schmalere Rollbalken ohne Pfeile; mehr Abstand zwischen Rollbalken und Knöpfen.
- Behoben: »Aufräumen« wirkte nur beim ersten Mal. Der Knopf ordnet die Blöcke jetzt und
  holt sie in die Mitte zurück.

## 0.13.0 – 5. Oktober 2026

- Einstellungen (Zahnrad oben rechts): Design hell, dunkel oder wie das System; Größe der
  Oberfläche; Schriftgröße und Schrift des Codes; Schrift der Oberfläche.
- Der Knopf »Erweiterungen« wird jetzt in den Einstellungen eingeschaltet.
- Entwickleroptionen: Test-Hub ohne Gerät, Protokoll im Terminal, Entwicklerwerkzeuge.
- Start und Stopp als runde Knöpfe direkt an der Arbeitsfläche; der Python-Bereich lässt
  sich einklappen.
- Der Block »Fahrbasis einrichten« lässt sich über den Pfeil einklappen.
- Menü des Programms: Datei (Neu, Öffnen, Speichern, Einstellungen), Hub (Starten mit F5,
  Stoppen), Ansicht, Hilfe.
- Dunkles Design und Farben des Codes angelehnt an »Julia (Monokai Vibrant)«.
- Windows: Installer und Zip-Fassung, die in etwa einer Sekunde starten. Die einzelne
  portable Exe packt sich bei jedem Start aus und braucht dafür rund zehn Sekunden.

## 0.12.1 – 5. Oktober 2026

- Neues Logo: in der Kopfleiste, auf dem Ladebildschirm, als Symbol im Browser-Tab und
  als Symbol der Programmdatei.

## 0.12.0 – 5. Oktober 2026

- Erweiterungen: eigene Blöcke mit eigenem Python-Code. Editor mit Vorschau, Farbe und
  Kurzanleitung; Vorlage »PID-Regler«; Erweiterungen als Datei speichern und laden;
  Bibliotheken als mitgeladene Module.
- Neues Fenster »Hub verbinden« mit Bluetooth, USB-Kabel und Hub-Liste in einem.
- Behoben: »Abbrechen« während der Bluetooth-Suche im Programm ließ die Suche weiterlaufen.

## 0.11.0 – 5. Oktober 2026

- Ladebildschirm mit Logo, bis die Arbeitsfläche aufgebaut ist.
- Blockfarben etwas dunkler, damit die weiße Schrift besser lesbar ist.
- Herausgeberangaben (Name, Copyright) in der Programmdatei.
- Versionsnummer wird in der Kopfleiste angezeigt; dieses Versionsprotokoll.

## 0.10.0 – 5. Oktober 2026

- Hub am USB-Kabel (Web Serial), zusätzlich zu Bluetooth. Braucht die Pybricks-Beta 4.1.
- Auswahl »Bluetooth oder USB-Kabel« beim Verbinden.
- udev-Regel für Linux, im `.deb` mitgeliefert.

## 0.9.0 – 4. Oktober 2026

- Blockwerk als eigenständiges Programm (Electron) für Windows, Linux und macOS.
- Eigene Hub-Auswahl im Programm, Schriften im Paket (läuft ohne Internet).
- GitHub-Workflow »Programm bauen« für alle drei Betriebssysteme.

Die Programmdateien dieser und der beiden folgenden Stände hießen noch
`Blockwerk-0.3.0-…`, weil die Nummer damals nicht mitgezählt wurde.

## 0.8.0 – 4. Oktober 2026

- Breite des Codebereichs und Höhe des Terminals verstellbar, Terminal ein- und ausklappbar.
- Erster Stand auf GitHub (privates Repository), README.

## 0.7.0 – nachträglich vergeben

- SPIKE-Projekte (`.llsp3`, `.llsp`) öffnen und in Blockwerk-Blöcke übersetzen, mit
  Bericht im Terminal und Platzhaltern für nicht übersetzbare Blöcke.

## 0.6.0 – nachträglich vergeben

- Neue Blöcke: Zufallszahl, Farbe Schwarz am Farbsensor, Listen.
- Erzeugter Code besser lesbar: keine überlangen Zeilen, Überschrift für Variablen,
  geklammerte Vergleiche.

## 0.5.0 – nachträglich vergeben

- Fernsteuerung: Steuerfeld in Blockwerk (Joystick und Tasten), Xbox-Controller,
  LEGO-Fernbedienung – jeweils mit Blöcken und Hilfeseiten.

## 0.4.0 – nachträglich vergeben

- Eingebaute Hilfe: eine Seite je Block mit Python-Beispiel, Erklärungen zu den
  Python-Wörtern im Code, Kapitel zum Umstieg auf Python.

## 0.3.0 – nachträglich vergeben

- Programm per Bluetooth direkt auf den Hub laden, starten und stoppen.
- Terminal für die Ausgaben des Hubs; bei einem Fehler wird der Block markiert.

## 0.2.0 – nachträglich vergeben

- Umbau von der Einzeldatei zu einem Projekt mit Vite und TypeScript.
- Automatische Tests für den erzeugten Python-Code.
- Projekt als Datei speichern.

## 0.1.0 – nachträglich vergeben

- Ursprüngliche Version als einzelne HTML-Datei (`legacy/blockwerk-einzeldatei.html`):
  Blöcke im Stil der SPIKE-App, Python-Code für Pybricks, Beispiele.
