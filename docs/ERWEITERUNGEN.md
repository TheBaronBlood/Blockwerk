# Erweiterungen schreiben

Mit einer Erweiterung baust du eigene Blöcke für Blockwerk – mit eigenem Python-Code
dahinter. Beispiele: ein PID-Regler für die Linienverfolgung, ein Block für euren Greifarm,
eine kleine Bibliothek, die mehrere Programme benutzen.

Dieselbe Anleitung steht im Programm: **Erweiterungen → Anleitung**.

## Einschalten und öffnen

1. Zahnrad oben rechts → **Erweiterungen** ankreuzen.
2. Knopf **Erweiterungen** in der Kopfleiste.
3. **＋ Neue Erweiterung** beginnt mit einem vollständigen Beispiel (PID-Regler).

Links steht der Quelltext, rechts die Vorschau der Blöcke. Fehler erscheinen unter dem Text
mit ihrer Zeile. **Hinzufügen** legt die Erweiterung als eigene Kategorie in den
Werkzeugkasten.

## Die Idee

Eine Erweiterung ist eine gewöhnliche Python-Datei. Kommentare, die mit `# blockwerk:`
beginnen, sagen Blockwerk, was die folgenden Zeilen sind.

```python
# blockwerk: erweiterung Mein Roboter
# blockwerk: farbe #0EAA7E

# blockwerk: block piepe %1 mal
# blockwerk: eingabe ANZAHL Zahl 3
for i in range({ANZAHL}):
    hub.speaker.beep(880, 100)
```

Das ergibt eine Kategorie »Mein Roboter« mit einem grünen Block »piepe (3) mal«.

## Alle Schlüsselwörter

| Zeile | Bedeutung |
|-------|-----------|
| `# blockwerk: erweiterung Name` | Name der Erweiterung und der Kategorie. Steht ganz oben. |
| `# blockwerk: farbe #8C5FDD` | Farbe der Blöcke. |
| `# blockwerk: beschreibung Text` | Hinweistext – oben für die Erweiterung, unter einem Block für diesen Block (erscheint beim Zeigen mit der Maus). |
| `# blockwerk: kopf` | Darunter: Code, der einmal vor dem Programm steht. |
| `# blockwerk: block Text %1 %2` | Ein neuer Block. Darunter sein Python-Code. |
| `# blockwerk: eingabe NAME Art Vorgabe` | Eingabefeld. Arten: `Zahl`, `Text`, `Wahrheit`, `beliebig`. |
| `# blockwerk: auswahl NAME A=1, B=2` | Auswahlliste: Beschriftung = Wert im Code. |
| `# blockwerk: motor NAME C` | Anschluss wählen; `{NAME}` wird zu `motor_C`. |
| `# blockwerk: farbsensor NAME C` | wie oben, wird zu `farbe_C`. |
| `# blockwerk: abstandssensor NAME D` | wird zu `abstand_D`. |
| `# blockwerk: kraftsensor NAME E` | wird zu `kraft_E`. |
| `# blockwerk: ausgabe Art` | Der Block liefert einen Wert. Sein Code ist dann genau eine Zeile. |
| `# blockwerk: benutzt fahrbasis` | Der Code verwendet `roboter`. |
| `# blockwerk: id name` | Fester innerer Name des Blocks. |
| `# blockwerk: modul name` | Darunter: eine eigene Python-Datei, die mit auf den Hub geladen wird. |

## Der Kopf

Alles unter `kopf` steht einmal vor dem Programm – aber nur, wenn mindestens ein Block der
Erweiterung benutzt wird.

```python
# blockwerk: kopf
from pybricks.parameters import Color
from pybricks.tools import wait

def blinke(anzahl):
    for i in range(anzahl):
        hub.light.on(Color.RED)
        wait(200)
        hub.light.off()
        wait(200)
```

- **Importe** schreibst du einfach hin. Blockwerk erkennt Zeilen der Form
  `from x import a, b` und `import x` und führt sie mit den übrigen Importen des Programms
  zusammen.
- **Namen aus dem Kopf sind vergeben.** Eine Variable im Programm kann nicht `blinke`
  heißen; Blockwerk benennt sie dann um.
- `hub` gibt es immer. Geräte (`motor_A`, `farbe_C` …) gibt es nur, wenn ein Block sie
  anlegt – siehe »Eingaben«.

## Blöcke

```python
# blockwerk: block drehe Motor %1 %2 um %3 Grad
# blockwerk: beschreibung Dreht den Arm um einen Winkel.
# blockwerk: motor ARM C
# blockwerk: auswahl RICHTUNG vorwärts=1, rückwärts=-1
# blockwerk: eingabe WINKEL Zahl 90
{ARM}.run_angle(500, {RICHTUNG} * {WINKEL})
```

- `%1`, `%2` … im Text sind die Stellen der Eingaben, in der Reihenfolge, in der sie
  darunter stehen. Fehlt eine Nummer im Text, hängt Blockwerk die Eingabe hinten an.
- Im Code steht `{NAME}` für den Wert der Eingabe. Blockwerk setzt Klammern, wo sie nötig
  sind: Steckt in der Eingabe `1 + 2` und im Code `{X} * 2`, entsteht `(1 + 2) * 2`.
- Der Code darf mehrere Zeilen haben und selbst Schleifen oder Bedingungen enthalten.
- Kommentare direkt vor dem nächsten `# blockwerk:` gehören zur Datei, nicht ins Programm.

### Blöcke, die einen Wert liefern

```python
# blockwerk: block Mittelwert von %1 und %2
# blockwerk: ausgabe Zahl
# blockwerk: eingabe A Zahl 0
# blockwerk: eingabe B Zahl 0
({A} + {B}) / 2
```

Der Block wird rund und passt in die Felder anderer Blöcke. Sein Code ist ein einzelner
Ausdruck.

### Fahrbasis

Verwendet der Code `roboter`, gehört `# blockwerk: benutzt fahrbasis` dazu. Dann legt
Blockwerk die Fahrbasis an, auch wenn sonst kein Fahr-Block im Programm ist.

## Bibliotheken

Der Hub hat kein Internet und kein `pip`. Eine Bibliothek muss deshalb als Python-Text in
der Erweiterung stehen:

```python
# blockwerk: kopf
from glaetten import Filter
filter_links = Filter(5)

# blockwerk: modul glaetten
class Filter:
    def __init__(self, laenge):
        self.werte = [0] * laenge

    def neu(self, wert):
        self.werte = self.werte[1:] + [wert]
        return sum(self.werte) / len(self.werte)
```

Das Modul wird zusammen mit dem Programm auf den Hub geladen. Es geht nur reines
MicroPython – nichts, was auf dem Computer extra installiert werden müsste.

Alternativ kannst du den Code der Bibliothek auch direkt in den Kopf schreiben. Ein Modul
lohnt sich, wenn du fremden Code unverändert übernehmen willst.

## Weitergeben

- **Als Datei speichern** schreibt die Erweiterung als `name.blockwerk.py`. Mit
  **Datei laden …** kommt sie auf einem anderen Rechner wieder hinein.
- Ein gespeichertes **Projekt** enthält die Erweiterungen, die es benutzt. Wer das Projekt
  öffnet, wird gefragt, ob sie hinzugefügt werden sollen – ihr Python läuft später auf dem
  Hub. »Ohne Erweiterungen öffnen« lädt das Programm ohne ihre Blöcke. Würde eine
  mitgebrachte Erweiterung eine eigene mit demselben Namen ersetzen, steht das in der
  Rückfrage.

## Was (noch) nicht geht

- Blöcke, die andere Blöcke umschließen (eigene Schleifen oder Bedingungen).
- Eigene Hilfeseiten – es gibt nur den Hinweistext aus `beschreibung`.
- Steckt ein Fehler im Kopf, nennt das Terminal die Zeile, markiert aber keinen Block.
- Beim Hinzufügen prüft Blockwerk nur, ob sich der Code übersetzen lässt. Ob er das
  Richtige tut, zeigt erst der Roboter.

## Tipps

- Ändere den Text eines Blocks erst, nachdem du ihm mit `id` einen festen Namen gegeben
  hast – sonst kennen gespeicherte Projekte ihn nicht mehr.
- Beschriftungen einer Auswahl sollten nicht alle gleich anfangen oder enden; Blockly
  zieht gemeinsame Wortteile sonst aus der Liste heraus.
- Halte Blöcke klein. Zwei einfache Blöcke sind für die AG verständlicher als einer mit
  sechs Eingaben.
