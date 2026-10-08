# Blockwerk – Roadmap

Stand: 5. Oktober 2026. Die Reihenfolge ist die geplante Umsetzungsreihenfolge.
API-Angaben sind gegen das PyPI-Paket `pybricks` 4.0.0 geprüft, sofern nichts anderes
dabeisteht.

| Nr. | Meilenstein | Status |
|----:|-------------|--------|
| 0 | Projektbasis (Vite, TypeScript, Tests) | ✅ erledigt |
| 1 | Direkt auf den Hub laden (Web Bluetooth) | 🟢 läuft am echten Hub (verbinden, laden, starten, stoppen, Ausgabe, Fehleranzeige); Fahrprogramme noch nicht durchgespielt |
| 2 | Terminal: Ausgaben des Hubs anzeigen | 🟢 läuft am echten Hub: Ausgaben, Fehlermeldung mit Hinweis und markiertem Block |
| 3 | Eingebaute Dokumentation (Blöcke und Python) | ✅ erledigt (Texte noch nicht von der AG gegengelesen) |
| 4 | Fernsteuerung: Controller und Handy | 🟡 4a–4c umgesetzt, Test mit echten Geräten steht aus; 4d offen |
| 5 | Weitere Blöcke | 🟡 Zufall, Schwarz, Listen, gleichzeitige Ereignisse erledigt; Einbaulage offen |
| 6 | SPIKE-Projekte öffnen und umwandeln | ✅ für die Blöcke der AG erledigt; weitere SPIKE-Blöcke bei Bedarf |
| 7 | Sprachumschaltung Deutsch/Englisch | offen |
| 8 | Hub am USB-Kabel | 🟢 läuft am echten Hub unter macOS (Beta-Firmware 4.1.0b5); Windows, Linux und Android stehen aus |
| 9 | Erweiterungen: eigene Blöcke mit eigenem Python | 🟢 umgesetzt; ein Modul lief am echten Hub (Bluetooth und Kabel) |
| 10 | Simulation des Roboters | begonnen: Kern und erste Ansicht |
| 11 | App für Android (Tablets und Handys) | 🟡 umgesetzt; im Emulator geprüft, Bluetooth lief an einem echten Handy, das Kabel steht aus. iPad zurückgestellt |

---

## 0 · Projektbasis ✅

- Vite + npm + TypeScript, Blockly 13.3.0 als npm-Abhängigkeit, Code in Module aufgeteilt.
- Vitest: Snapshot und `python -m py_compile` für jedes Beispiel, Einzeltests für die
  Fallstricke des Generators.
- Projekt speichern als JSON-Download.

## 1 · Direkt auf den Hub laden

**Ziel:** Ein Knopf »Auf den Hub laden« – verbinden, übertragen, starten, stoppen. Kein
Umweg mehr über Kopieren und Pybricks Code.

- Code im Browser mit `@pybricks/mpy-cross-v6` (WebAssembly) zu `.mpy` kompilieren.
- Übertragung nach dem Pybricks-BLE-Profil (`pybricks-ble-profile.md` in
  github.com/pybricks/technical-info; Referenz: `src/ble-pybricks-service/protocol.ts`
  in pybricks-code).
- Oberfläche: Verbinden/Trennen, Hubname, Fortschritt, Start/Stopp, Fehlermeldungen in
  verständlichem Deutsch (Hub aus, falsche Firmware, Verbindung verloren).
- Kopieren und »Pybricks Code öffnen« bleiben als Ausweichweg erhalten.

**Fertig, wenn:** das Beispiel »Quadrat fahren« aus Blockwerk heraus auf einem echten
SPIKE-Prime-Hub startet und sich stoppen lässt.

**Stand:** Knöpfe »Hub verbinden«, »Starten«, »Stopp« sind eingebaut (`src/hub/`).
Automatisch geprüft: Befehlsbytes, Multi-MPY-Format, Reihenfolge und Vollständigkeit der
Übertragung, Kompilieren aller Beispiele – auch im Browser-Bundle.

Am echten Hub (5. Oktober 2026, SPIKE Prime mit Pybricks 4.1.0b5, Programm-Version am Mac):
suchen, verbinden, Programm übersetzen, laden und starten, Ausgabe im Terminal, trennen –
läuft. Der Nutzer hat Bluetooth außerdem mit der stabilen Firmware und mit der Android-App
ausprobiert.

Mit Version 0.25.0 (5. Oktober 2026, derselbe Hub, Bluetooth und Kabel): ein Programm mit
Bild, Ton und Ausgabe (auch Umlaute); ein Laufzeitfehler (Teilen durch null) – Meldung,
Hinweis »Das Programm teilt durch 0.« und der richtige Block markiert; zwei Ereignisse mit
einer Nachricht, danach »Stopp«; eine Erweiterung mit eigenem Modul. Noch nicht am Gerät
durchgespielt: Fahrprogramme und die Checkliste unten Punkt für Punkt.

**Hub-Ansicht (0.25.0):** zeigt, was an den Anschlüssen steckt, die Messwerte, Akku und
Neigung (`src/hub/monitor.ts`, `monitorView.ts`). Pybricks schickt solche Daten nicht von
selbst; Blockwerk lädt deshalb ein kleines Anzeige-Programm auf den Hub, das nur die offene
Pybricks-API benutzt, und liest dessen Zeilen. Am echten Hub gelaufen (Bluetooth und Kabel,
zwei große Motoren, zwei Farbsensoren): Werte nach rund zwei Sekunden über Bluetooth, nach
unter einer über das Kabel; nach dem Schließen liegt wieder das eigene Programm auf dem Hub.
Gemessen am Hub: Alle Geräte lesen kostet unter einer Millisekunde; eine Zeile alle 40 ms kommt
über Bluetooth gleichmäßig an (im Mittel alle 44 ms). Motoren werden deshalb 25-mal in der
Sekunde gemeldet, Sensoren gut achtmal; der Zeiger gleitet zwischen zwei Meldungen.
Grenzen: nicht während ein eigenes Programm läuft; kein Umgebungslicht; Geräte, die die
Ansicht nicht auslesen kann (BOOST-Sensoren, Lichter), erscheinen nur mit Namen; der
Abstandssensor, ein gedrückter Kraftsensor und das Ein- und Ausstecken im Betrieb sind nur mit
nachgestelltem Pybricks geprüft (ein Kraftsensor in Ruhe wurde am Hub erkannt und gelesen).
(Die Telemetrie der Firmware 4.1 könnte das auch während eines Programms, ist aber nicht frei
lizenziert und noch nicht endgültig – Blockwerk benutzt sie nicht.)

**Checkliste für den ersten Test am Hub** (Chrome oder Edge, `npm run dev`):
1. »Starten« → Hub im Browserfenster auswählen → Terminal meldet »Verbunden mit …«.
2. Beispiel »Greifarm mit Motor C« ohne angeschlossenen Motor starten → Terminal zeigt
   einen Fehler (ENODEV), der Block wird markiert.
3. Beispiel »Quadrat fahren« starten → Roboter fährt; Anzeige »Programm läuft«.
4. Während der Fahrt »Stopp« → Programm endet, keine Fehlermeldung.
5. Zweimal hintereinander »Starten«, auch während ein Programm läuft.
6. Hub ausschalten → Anzeige springt auf »nicht verbunden«.

**Einschränkungen:**
- Web Bluetooth gibt es nur in Chromium-Browsern (Chrome, Edge; auf Android Chrome).
  Firefox und Safari/iPad können es nicht – dort erscheint ein Hinweis statt des Knopfs.
- Die Seite muss über HTTPS oder `localhost` laufen.
- Die Pybricks-Firmware muss weiterhin einmalig über Pybricks Code installiert werden.
- Braucht einen echten Hub zum Testen; automatisch testbar ist nur das Kompilieren und
  das Zerlegen in Datenpakete.

## 2 · Terminal

**Ziel:** Was der Hub mit `print()` ausgibt, erscheint in Blockwerk – auch Fehlermeldungen.

- Bereich unter dem Python-Code, ein-/ausklappbar, mit »Leeren«.
- Python-Fehler des Hubs (Traceback) auswerten: Zeilennummer → zugehörigen Block
  markieren. Die Zuordnung Zeile ↔ Block gibt es bereits.
- Baut auf Meilenstein 1 auf (gleiche Bluetooth-Verbindung).

**Fertig, wenn:** der Block »gib … im Terminal aus« sichtbar ausgibt und ein
Laufzeitfehler den auslösenden Block markiert.

**Stand:** Terminal unter dem Code, Auswertung der Fehlermeldungen mit Blockmarkierung
und Erklärungen zu häufigen Fehlern sind eingebaut. Das Format der Fehlermeldungen ist
nur mit nachgestellten Texten getestet, nicht mit echter Hub-Ausgabe.

## 3 · Eingebaute Dokumentation

**Ziel:** Zu jedem Block gibt es eine Hilfeseite direkt im Editor, dazu eine kleine
Python-Einführung. Das unterstützt den Wechsel von Blöcken zu Python.

- **Blockhilfe:** Rechtsklick → »Hilfe« bzw. ein Fragezeichen öffnet eine Seitenleiste mit
  - Beschreibung in einfachen Worten,
  - Bedeutung jedes Eingabefelds mit Einheit (mm, Grad, Grad/s, ms),
  - dem Python-Code, den der Block erzeugt, mit Erklärung der Zeile,
  - einem kleinen vollständigen Beispielprogramm (als Blöcke ladbar),
  - typischen Stolpersteinen (z. B. Schwarz wird nicht als Farbe erkannt).
- **Python-Hilfe:** Klick auf ein Wort im erzeugten Code (`while`, `def`,
  `roboter.straight` …) erklärt es. Dazu kurze Kapitel: Variablen, Schleifen,
  Bedingungen, Funktionen, Importe, Einrückung.
- Inhalte liegen als Daten neben den Blockdefinitionen. Ein Test stellt sicher, dass
  jeder Block einen Hilfeeintrag hat und jedes Python-Beispiel `py_compile` besteht.
- Nachschlagebereich mit Suche über alle Blöcke.

**Fertig, wenn:** jeder Block einen Hilfeeintrag mit funktionierendem Python-Beispiel hat.

**Stand:** Hilfeseiten für alle 63 Blöcke, Erklärungen zu rund 80 Python-Wörtern und acht
Python-Kapitel. Aufruf über den Knopf »Hilfe«, Rechtsklick auf einen Block oder Klick auf
ein unterstrichenes Wort im Code. Die Python-Beispiele der Blockseiten erzeugt der echte
Generator aus Beispielblöcken – sie können nicht veralten. Tests erzwingen: kein Block
ohne Hilfeseite, jedes Beispiel ohne Warnung und gültiges Python.
Seit 0.16.0 ist die Hilfe wie eine Anleitung zum Durcharbeiten aufgebaut: »Erste
Schritte« mit sieben Lektionen (Ziel, Schritte, fertiges Programm, Aufgaben), Blöcke nach
Kategorie mit Bild des Blocks, Pfad und »Zurück / Weiter« auf jeder Seite.
Offen: Die Texte – vor allem die Lektionen – sollte jemand aus der AG gegenlesen und
einmal mit echtem Roboter durchspielen.

**Aufwand:** vor allem Schreibarbeit (derzeit rund 40 eigene Blöcke plus die
Standardblöcke). Kann parallel zu 1 und 2 wachsen und braucht keinen Hub.

## 4 · Fernsteuerung: Controller und Handy

Pybricks kann das – auf drei verschiedenen Wegen:

### 4a · Xbox-Controller (direkt am Hub)

- `XboxController` aus `pybricks.iodevices`: `joystick_left()`, `joystick_right()`,
  `triggers()`, `dpad()`, `buttons.pressed()`, `rumble()`.
- Blöcke: »Controller verbinden«, »linker/rechter Stick x/y«, »Taste … gedrückt«,
  »Trigger«, »vibriere«.
- Beispiel »Roboter mit Controller fahren«.
- Der Hub verbindet sich selbst mit dem Controller; läuft auch ohne Computer.
- Braucht einen Xbox-Controller mit Bluetooth (ab Modell 1708). PlayStation- und
  Switch-Controller unterstützt Pybricks nicht.

### 4b · LEGO-Fernbedienung (Powered Up, 88010)

- `Remote` aus `pybricks.pupdevices`: `buttons.pressed()`, Statuslicht.
- Blöcke: »Fernbedienung verbinden«, »Taste … gedrückt«.
- Günstigste Lösung, wenn solche Fernbedienungen vorhanden sind.

### 4c · Handy oder Computer als Live-Steuerung

- Eine eigene Handy-App von Pybricks gibt es nicht. Der Weg führt über Blockwerk selbst:
  Die Seite bleibt per Bluetooth mit dem Hub verbunden und schickt Steuerbefehle,
  während das Programm läuft.
- Im Editor: ein Steuerfeld mit Joystick und Tasten (Touch und Tastatur).
- Auf dem Hub: Blöcke »Joystick x/y vom Steuerfeld«, »Steuerfeld-Taste … gedrückt«.
- Technik: Zeichen über die Standardeingabe des Hubs (`read_input_byte()` aus
  `pybricks.tools`). Alternative `AppData` (`pybricks.messaging`) – vor der Entscheidung
  an echter Hardware ausprobieren.
- Baut auf Meilenstein 1 auf. Funktioniert auf Android in Chrome; auf dem iPhone nur
  mit einem Browser, der Web Bluetooth nachrüstet (z. B. Bluefy).

### 4d · Hub zu Hub (optional)

- `hub.ble.broadcast()` / `hub.ble.observe()`: zwei Hubs tauschen Werte aus, z. B. ein
  Hub als selbstgebaute Fernbedienung.

**Fertig, wenn:** ein Roboter sich mit Xbox-Controller und mit dem Steuerfeld im Browser
live fahren lässt.

**Stand:** Kategorie »Fernsteuerung« mit Blöcken für Steuerfeld (Joystick x/y, Tasten
A–D), Xbox-Controller (Sticks, Trigger, Tasten, Vibration) und LEGO-Fernbedienung
(Tasten, Licht), jeweils mit Hilfeseite. Das Steuerfeld sitzt über dem Terminal (Knopf
»Steuerfeld«; Maus, Touch, Tastatur) und öffnet sich von selbst, wenn ein Programm es
benutzt. Neues Beispiel »Fernsteuern mit dem Steuerfeld«.
Seit 0.23.0 gibt es das Steuerfeld auch als Controller-Ansicht über den ganzen Bildschirm
(`src/hub/padView.ts`): Joystick und Tasten liegen in einem Raster und lassen sich
verschieben und in der Größe ändern (`src/hub/padLayout.ts`), getrennt für Tablet quer,
Hochformat und flache Bildschirme. Auf Tablets ist das der übliche Weg. Im Android-Emulator
mit Berührungen geprüft, am echten Tablet noch nicht erprobt.
Seit 0.24.0 bedient ein Gamepad, das mit dem Gerät verbunden ist, das Steuerfeld
(`src/hub/gamepad.ts`, Gamepad-Schnittstelle des Browsers), und Blockwerk zeigt an, ob der
Hub den Xbox-Controller oder die Fernbedienung gefunden hat. Beides ist nur mit
nachgestellten Geräten geprüft.

Automatisch geprüft: erzeugter Code, Importe nur bei Bedarf, Kompilieren, und dass die
Python-Funktion auf dem Hub genau die Bytes versteht, die der Browser schickt (Test mit
echtem Python). Die Entscheidung fiel auf `read_input_byte()` statt `AppData`.

**Checkliste für den Test mit Geräten:**
1. Beispiel »Fernsteuern mit dem Steuerfeld« starten → Steuerfeld erscheint → Joystick
   bewegt den Roboter, loslassen hält ihn an, Taste A piept.
2. Prüfen, ob »y nach vorn« wirklich vorwärts fährt und die Reaktion flüssig ist.
3. Xbox-Controller: Hilfeseite »Controller: Stick« → Beispiel laden und starten.
   Prüfen, ob Stick nach vorn einen positiven y-Wert liefert (sonst Vorzeichen im
   Generator drehen).
4. LEGO-Fernbedienung: Hilfeseite »Fernbedienung: Taste gedrückt« → Beispiel starten.
5. Ohne eingeschaltetes Gerät starten → Terminal zeigt nach 10 s einen verständlichen
   Hinweis.

**Wächter:** Blockwerk schickt alle 250 ms ein Lebenszeichen. Bleibt es länger als eine
Sekunde aus (Verbindung weg, Fenster im Hintergrund), stellt das Programm auf dem Hub
Joystick und Tasten auf Ruhe. Mit echtem Python getestet, am Hub noch nicht.

## 5 · Weitere Blöcke

- Listen.
- Zufall (`urandom`).
- Multitasking (`multitask`, `run_task`) – mehrere Dinge gleichzeitig; Voraussetzung
  für flüssige Fernsteuerung mit parallelen Aktionen.
- `detectable_colors([...])`, damit der Farbsensor auch Schwarz erkennt.
- Hub-Einbaulage (`PrimeHub(top_side=…, front_side=…)`).

Jeder neue Block kommt mit Test und Hilfeeintrag (Meilenstein 3).

**Stand:**
- ✅ Zufall: Block »ganzzahlige Zufallszahl« (`import urandom as random`).
- ✅ Schwarz: Auswahl »Schwarz« im Block »Farbsensor sieht …«; die nötige Zeile
  `detectable_colors([...])` entsteht nur dann. Wie zuverlässig der Sensor Schwarz
  wirklich erkennt, muss am Gerät ausprobiert werden.
- ✅ Listen: Kategorie »Listen« mit erzeugen, Länge, ist leer, Eintrag lesen, Eintrag
  setzen und »für jeden Wert aus der Liste«.
- ⬜ Hub-Einbaulage: zurückgestellt. Dafür muss am echten Hub geprüft werden, welche
  Seite Pybricks als X-, Y- und Z-Achse zählt; geraten wäre der Block schlimmer als
  keiner.
- ✅ Mehrere Ereignisse gleichzeitig (0.22.0): Blöcke »wenn …«, »wenn ich … empfange« und
  »sende …«; mehrere Startblöcke laufen gleichzeitig. Ab zwei Ereignissen erzeugt der
  Generator Aufgaben mit `async def`, `await` und `run_task(multitask(...))`; mit einem
  einzigen Ereignis bleibt das Programm wie bisher. Welche Befehle `await` brauchen, ist
  gegen das Paket `pybricks` 4.0.0 geprüft. Am echten Hub lief ein Programm mit zwei
  Ereignissen und einer Nachricht (0.25.0); Sensoren und Motoren darin noch nicht.
  Offen: »sende und warte«, Ereignisse aus SPIKE-Projekten übernehmen (dafür fehlen echte
  Dateien mit diesen Blöcken), Blöcke aus Erweiterungen, die warten.

## 6 · SPIKE-Projekte öffnen und umwandeln

**Ziel:** Ein bestehendes Projekt aus der LEGO-SPIKE-App in Blockwerk öffnen und als
Pybricks-Programm weiterbenutzen.

- Dateiformat `.llsp3` (SPIKE 3) bzw. `.llsp` (SPIKE 2): ein ZIP mit `scratch.sb3`,
  darin `project.json` mit Scratch-Blöcken (Opcodes `flipper*`).
- Übersetzungstabelle SPIKE-Block → Blockwerk-Block; Vorlage ist das Projekt blocklypy.
- Einheiten umrechnen (SPIKE: cm, Umdrehungen, Prozent → Pybricks: mm, Grad, Grad/s).
- Blöcke ohne Entsprechung werden nicht stillschweigend weggelassen: Sie erscheinen als
  markierter Platzhalter mit Hinweis, was fehlt.
- Abschlussbericht nach dem Import: übernommen / angepasst / nicht übersetzbar.
- Nur Wortblock-Projekte. Icon-Blöcke und SPIKE-Python-Projekte sind nicht geplant.

**Fertig, wenn:** typische AG-Projekte (Fahren, Motoren, Sensoren, Schleifen, Variablen,
eigene Blöcke) ohne Nacharbeit laufen.

**Stand:** »Öffnen« nimmt `.llsp3` und `.llsp`. Alle 23 Referenzdateien werden vollständig
übersetzt (kein Platzhalter), ergeben gültiges Python und sind als Snapshot festgehalten.
Der Bericht erscheint im Terminal: was umgerechnet wurde, was nicht übersetzt ist.

Umrechnungen und Annahmen:
- Strecken cm → mm, Zeiten s → ms, Notennummer → Hz.
- Drehen: Die SPIKE-App zählt den Weg der Räder, Pybricks den Winkel des Roboters
  (180 Grad am Rad = 90 Grad Drehung bei Rad 56 mm, Spurbreite 112 mm).
- Tempo in Prozent → mm/s und Grad/s, mit der Annahme 100 % ≈ 1000 Grad/s am Rad.
  Das ist eine Näherung und sollte einmal am Roboter nachgemessen werden.
- »Starte Bewegung« und »Lenkung« bekommen das zuletzt eingestellte Tempo fest eingesetzt.
- Lichtmatrix-Bilder: Entspricht eines einem der sieben eingebauten Bilder, wird es
  »zeige Bild«; alle anderen werden »zeige Muster« mit denselben Punkten und Helligkeiten.

Noch nicht übersetzt (werden zu grauen Platzhaltern): einzelne Motoren (`flippermotor_*`),
Musik und Klänge außer Piepton, Neigung/Kippen, Nachrichten
und andere Ereignisse als »wenn Programm startet«, Listen. 22 der 23 Referenzdateien stammen
aus einem Generator-Skript; nur `Project_1-original.llsp3` kommt aus der echten SPIKE-App.
Mehr echte Projekte wären als Testfälle wertvoll.

**Testmaterial:** echte Projektdateien der AG liegen in `referenz/spike-dateien/beispiele/`
(Demos, Bug-Jagden, Lösungen zu M0–M7) und dienen als Testfälle für den Import.

## 7 · Sprachumschaltung Deutsch/Englisch

- Alle Blocktexte, Hinweise und Hilfeseiten über Sprachdateien statt fest im Code.
- Umschalter in der Kopfleiste; Wahl wird gespeichert.
- Variablennamen der Geräte im erzeugten Code (`motor_A`, `roboter`, …) je nach Sprache.
- Steht am Ende, weil die Hilfetexte aus Meilenstein 3 mit übersetzt werden müssen. Die
  Texte werden aber von Anfang an so abgelegt, dass die Übersetzung später ohne Umbau geht.

## 8 · Hub am USB-Kabel

**Ziel:** Programme auch ohne Bluetooth laden – für Rechner ohne Bluetooth-Adapter und
für Räume, in denen viele Hubs gleichzeitig funken.

**Stand:** »Hub verbinden« fragt, ob der Hub über Bluetooth oder das Kabel verbunden ist.
Am Kabel laufen dieselben Befehle wie über Bluetooth (laden, starten, stoppen, Terminal,
Steuerfeld). Code: `src/hub/serialProtocol.ts` (Rahmen), `src/hub/serial.ts` (Verbindung
über Web Serial), gemeinsame Basis `src/hub/hub.ts`.

Automatisch geprüft: das Rahmenformat (ein Beispiel von Hand nach dem Firmware-Quelltext
nachgerechnet) und der ganze Ablauf gegen einen nachgestellten Hub – verbinden, laden,
starten, Ausgabe, stoppen, trennen, Kabel ziehen, Hub ohne Antwort.

Am echten Hub (5. Oktober 2026, SPIKE Prime mit Pybricks 4.1.0b5, Programm-Version am Mac):
verbinden, laden, starten, Ausgabe, Steuerfeld-Taste, stoppen, trennen – läuft, auch
mehrmals hintereinander. Dabei kam ein Fehler der Firmware zutage, den Blockwerk seit
0.23.2 umgeht: Jede USB-Übertragung, deren Länge ein Vielfaches von 64 Bytes ist, legt den
Empfang des Hubs lahm, bis das Kabel neu gesteckt wird. Blockwerk schickt deshalb alles in
Stücken unter 64 Bytes (`MAX_PIECE_SIZE` in `serialProtocol.ts`); Programme gehen in Teilen
zu 54 Bytes auf den Hub. Werkzeuge für die Fehlersuche am Gerät: `tests/hardware/`.
Noch nicht geprüft: Windows, Linux, die Android-App am Kabel, Fahrprogramme, Kabel ziehen.

**Wichtige Einschränkung – die Firmware:**
- Die stabile Pybricks-Firmware (4.0.x) hat USB abgeschaltet (»unfinished USB support«,
  Changelog 4.0.0). Damit funktioniert das Kabel nicht, nur Bluetooth.
- USB gibt es derzeit nur in der Beta 4.1 (installierbar über beta.pybricks.com).
  Blockwerk spricht das Protokoll von 4.1.0b5 (Profil ab 1.6: serielle Schnittstelle,
  COBS-Rahmen). Ältere Betas benutzten ein anderes USB-Verfahren und werden nicht
  unterstützt.
- Solange das Beta ist, kann sich das Protokoll noch ändern. Nach einem Firmware-Update
  die Checkliste unten wiederholen.

**Checkliste für den ersten Test am Hub** (Hub mit Beta-Firmware 4.1, USB-Kabel):
1. »Hub verbinden« → »USB-Kabel« → Hub auswählen → Terminal meldet »Verbunden mit …
   über USB (Firmware 4.1…)«.
2. Beispiel »Quadrat fahren« starten → Roboter fährt; »Stopp« beendet das Programm.
3. Block »gib … im Terminal aus« → Text erscheint im Terminal.
4. Beispiel »Fernsteuern mit dem Steuerfeld« → Joystick wirkt, solange das Kabel steckt.
5. Kabel ziehen → Terminal meldet »Hub getrennt«; das Programm auf dem Hub läuft weiter.
6. Hub mit stabiler Firmware 4.0 anstecken → entweder erscheint er gar nicht in der
   Auswahl, oder es kommt die Meldung, dass die Firmware kein USB kann.
7. Ubuntu: nach Installation des `.deb` ohne weitere Einrichtung verbinden (udev-Regel).

**Betriebssysteme:**
- Windows und macOS: kein Treiber nötig.
- Linux: Die serielle Schnittstelle ist ohne Freigabe gesperrt. Das `.deb` installiert
  dafür `build/70-blockwerk-hub.rules`; beim AppImage oder im Browser muss die Datei von
  Hand nach `/etc/udev/rules.d/`. Ob electron-builder die Regel wirklich ins Paket legt,
  prüft der Workflow »Programm bauen«.
- Im Browser: nur Chrome und Edge am Computer (Web Serial), nicht auf Android oder iPad.

## 9 · Erweiterungen: eigene Blöcke mit eigenem Python

**Ziel:** Ohne Eingriff in Blockwerk neue Blöcke bauen – zum Beispiel einen PID-Regler –
und sie als Datei weitergeben.

**Stand:** Knopf »Erweiterungen« öffnet einen Editor: links die installierten
Erweiterungen, in der Mitte der Quelltext, rechts die Vorschau der Blöcke und eine
Kurzanleitung. Eine Erweiterung ist eine Python-Datei; Kommentare `# blockwerk: …`
markieren, was Kopf (einmal vor dem Programm), Block, Eingabe, Auswahl oder Modul ist.

- Eingaben: Zahl, Text, Wahrheit, beliebig, Auswahlliste, Anschluss für Motor oder Sensor.
- Blöcke als Anweisung oder als Wert (`ausgabe`), Farbe und Text frei.
- Importe aus dem Kopf werden mit den übrigen Importen zusammengeführt; der Kopf erscheint
  nur, wenn ein Block der Erweiterung im Programm steckt.
- Bibliotheken: `# blockwerk: modul name` legt eine eigene Python-Datei an, die mit auf den
  Hub geladen wird. Laden aus dem Internet gibt es bewusst nicht (Schule ohne Netz, und der
  Hub kennt kein `pip`).
- Vor dem Hinzufügen wird der Python-Code probeweise übersetzt; Fehler erscheinen im Editor.
- Jede Erweiterung wird zur eigenen Kategorie im Werkzeugkasten. Gespeicherte Projekte
  enthalten die benutzten Erweiterungen und lassen sich deshalb überall öffnen.
- »Neue Erweiterung« beginnt mit einem vollständigen Beispiel (PID-Regler mit
  Linienverfolgung).

Automatisch geprüft: Lesen des Formats samt Fehlermeldungen, erzeugter Code (Kopf einmal,
Importe, Klammern, Einrückung, Geräte, Fahrbasis), gültiges Python für die Vorlage, und im
Selbsttest des Programms der Editor selbst (`--smoke-ext`).

Am echten Hub (0.25.0, Bluetooth und Kabel): Eine Erweiterung mit eigenem Modul lief – das
Programm importiert aus der zweiten Datei und gibt deren Ergebnis aus.

**Offen:**
- Blöcke, die andere Blöcke umschließen (eigene Schleifen), gibt es noch nicht.
- Eigene Hilfeseiten: bisher nur der Hinweistext beim Zeigen auf den Block.
- Fehler im Kopf einer Erweiterung zeigen im Terminal die Zeile, markieren aber keinen Block.

## 10 · Simulation des Roboters (begonnen)

**Ziel:** Programme ohne Roboter ausprobieren – vor allem Linienverfolgung für RoboCup
Junior Rescue Line.

**Stand:** Der Kern steht in `src/sim/` (ohne DOM, geprüft in `tests/sim.test.ts`), dazu eine
erste Ansicht im Codebereich (Knopf »Simulator«).
- Der Roboter entsteht aus dem Programm (`robot.ts`): Fahrblöcke geben ihm Räder, jeder
  abgefragte Farbsensor sitzt vorn (höchstens vier), der Abstandssensor schaut nach vorn.
- Die Bahn ist ein Bild von oben (`world.ts`); Reflexion und Farbe liest der Sensor daraus.
  Hindernisse sind Rechtecke, der Abstandssensor sieht, was in seinem Kegel liegt.
- Ausgeführt werden die Blöcke selbst (`runner.ts`), in simulierter Zeit – nicht der erzeugte
  Python-Code. Das weicht vom Entwurf unten ab: Es braucht kein zusätzliches Paket, markiert
  den laufenden Block und verträgt sich mit der Content-Security-Policy. Der Preis: Was der
  Generator tut, muss dort nachgezogen werden, und Blöcke aus Erweiterungen laufen nicht mit.
- Größe des Roboters auf der Bahn einstellbar; Roboter und Hindernisse mit dem Zeiger
  verschieben, Hindernisse in der Größe ändern, eigenes Bild als Bahn laden.

- Ohne Fahrbasis sind zwei einzelne Motoren die Räder (der linke gespiegelt, wie üblich eingebaut).
- Der Hub liegt neben der Bahn: Lichtmatrix (Bild, Muster, Zahl, Text), Statuslicht und Tasten
  zum Drücken; die mittlere beendet das Programm.

**Offen:** Kraftsensor drücken, Ton, Steuerfeld, Rampen beim
Anfahren, Bahn und Hindernisse merken, eigenes einklappbares Fenster statt im Codebereich.

**Ursprünglicher Entwurf:**
- Echtes Python im Browser (MicroPython als WebAssembly) mit einem nachgebauten
  `pybricks`-Modul, das statt Motoren einen simulierten Roboter bewegt. So läuft derselbe
  Code wie auf dem Hub, auch handgeschriebener.
- 2D-Ansicht von oben. Farbe und Helligkeit werden aus einem Bild der Bahn gelesen, der
  Abstandssensor misst gegen Wände. Dafür braucht es eine Angabe, wo die Sensoren sitzen.
- Kein C++ nötig: Ein Roboter in 2D ist für den Browser keine Last.
- Als getrennter Teil (`src/sim/`), der nur Python-Code und Bahn bekommt – später ohne
  Umbau als eigene Seite herauslösbar.

**Stufen:** 1. fahren und Linie sehen · 2. Bahn-Editor mit Rescue-Line-Kacheln ·
3. Abstand und Hindernisse · 4. Rauschen und einstellbare Roboter.

**Grenzen:** Taugt für die Logik (Kreuzungen, grüne Marker, Lücken), nicht zum
Feinabstimmen eines Reglers; Rampen gehen in 2D nicht. Vor dem Start sollte Blockwerk
einmal an einem echten Hub gelaufen sein.

## 11 · App für Tablets (Android; iPad zurückgestellt)

**Ziel:** Blockwerk auf den Tablets der AG – mit Bluetooth und, wo es geht, mit Kabel.

**Stand:** Dieselbe Seite steckt mit Capacitor in einer nativen Hülle (`ios/`, `android/`).
- Bluetooth: Plugin `@capacitor-community/bluetooth-le` (CoreBluetooth bzw. Android),
  angebunden in `src/hub/nativeBle.ts` – dieselben Befehle wie über Web Bluetooth.
- USB-Kabel auf Android: eigenes Plugin `HubSerialPlugin.java` (USB-Host, CDC ACM über
  usb-serial-for-android), in `src/hub/nativeSerial.ts` so verpackt, dass `serial.ts` und
  `serialProtocol.ts` unverändert gelten. Der Aufbau der Schnittstelle (zwei
  Schnittstellen, DTR als Zeichen »Programm hat geöffnet«) ist am Firmware-Quelltext
  v4.1.0b5 geprüft (`lib/pbio/drv/usb/stm32_usbd/usbd_pybricks.c`).
- USB-Kabel am iPad: nicht möglich. iPadOS gibt Apps keinen Zugriff auf beliebige
  USB-Geräte (nur MFi-zertifiziertes Zubehör oder eine Sonderfreigabe von Apple).
- Speichern: Android über die Dateiauswahl des Systems (`SaveFilePlugin.java`), iPad über
  »Teilen«. Öffnen über die Dateiauswahl des Systems.
- Oberfläche: größere Trefferflächen bei Bedienung mit dem Finger (`@media (pointer:coarse)`),
  hochkant die Reiter »Blöcke | Python«, in der App kein Markieren von Knöpfen.

Automatisch geprüft: beide Verbindungswege gegen nachgestellte Plugins
(`tests/tablet.test.ts`), dazu dass Versionsnummer, Plugin-Namen und Berechtigungen der
App-Projekte zur Seite passen. Von Hand geprüft: die Android-App im Emulator (Start, alle
Plugins angemeldet, Suche nach Hubs, Meldung ohne Hub am Kabel, Speichern nach
»Downloads«) und die Tablet-Oberfläche in WebKit mit iPad-Maßen.

**Offen:**
- **iPad: zurückgestellt (5. Oktober 2026).** Blockwerk gibt es vorerst für Windows, macOS,
  Linux und Android. Stand beim Zurückstellen: im Simulator gebaut und gelaufen, auf einem
  iPad installiert (0.25.0), die Verbindung zum Hub dort nie ausprobiert. Das Projekt `ios/`
  bleibt liegen, wird aber nicht gepflegt.
- Echte Tablets mit echten Hubs: Bluetooth lief mit der Android-App auf einem Handy; mehr
  ist nicht erprobt.
- Android: Der Weg für einen festen Schlüssel ist eingebaut (0.25.0, mit einem Probe-Schlüssel
  geprüft); der Schlüssel selbst und die Secrets im Repository fehlen noch.
- Die Bildschirmtastatur beim Eintippen von Zahlen in Blöcke ist nicht angepasst.
- Handy als frei belegbarer Controller (Joysticks, Regler, Neigung) – eigene Ausbaustufe,
  braucht ein größeres Protokoll als das Ein-Byte-Protokoll des Steuerfelds.

**Checkliste für den ersten Test am Tablet:**
1. App starten → Arbeitsfläche mit dem Beispiel »Quadrat fahren« erscheint.
2. »Hub verbinden« → Bluetooth → Tablet fragt nach der Erlaubnis → Hub in der Liste wählen
   → Terminal meldet »Verbunden mit … über Bluetooth«.
3. »Starten« → Roboter fährt; »Stopp« beendet das Programm.
4. Beispiel »Fernsteuern mit dem Steuerfeld« → Joystick mit dem Finger bedienen.
5. Nur Android, Hub mit Beta-Firmware 4.1: Hub ans Tablet stecken → Android bietet
   Blockwerk an → »Hub verbinden« → USB-Kabel → »Verbunden mit … über USB«.
6. »Speichern« und »Öffnen« → Projekt kommt unverändert zurück.
7. Tablet drehen (hochkant/quer) → nichts überlappt, nichts ist abgeschnitten.

## Ideen ohne Meilenstein

- **Zuletzt geöffnete Projekte:** eine Liste im Menü »Datei«. Sie läge im Datenordner
  (siehe Einstellungen → Speicherort) und bekäme dort einen Schalter zum Abstellen und
  Leeren. Braucht im Programm echtes Öffnen und Speichern über Dateipfade statt über den
  Download-Weg des Browsers.

---

## Abhängigkeiten

```
1 Hub-Upload ──► 2 Terminal
      └────────► 4c Handy-Steuerung
5 Multitasking ─► 4 Fernsteuerung (parallele Aktionen)
3 Dokumentation ─► 7 Sprachumschaltung
```

3, 4a, 4b, 5 und 6 lassen sich ohne Bluetooth-Upload entwickeln und automatisch testen.
1, 2 und 4c brauchen einen echten Hub mit Pybricks-Firmware.
