// ---------------------------------------------------------------
// Anleitung zum Schreiben von Erweiterungen – erscheint im Editor unter »Anleitung«.
// Dieselben Inhalte stehen ausführlicher in docs/ERWEITERUNGEN.md.
// ---------------------------------------------------------------
export interface GuideSection { title: string; text: string[]; code?: string }

export const GUIDE: GuideSection[] = [
  {title:'Die Idee', text:[
    'Eine Erweiterung ist eine ganz normale Python-Datei. Kommentare, die mit »# blockwerk:« beginnen, sagen Blockwerk, was die folgenden Zeilen sind: der Kopf, ein Block, eine Eingabe …',
    'Links schreibst du, rechts siehst du sofort, wie die Blöcke aussehen. Mit »Hinzufügen« landet die Erweiterung als eigene Kategorie im Werkzeugkasten.'
  ], code:`# blockwerk: erweiterung Mein Roboter
# blockwerk: farbe #0EAA7E

# blockwerk: block piepe %1 mal
# blockwerk: eingabe ANZAHL Zahl 3
for i in range({ANZAHL}):
    hub.speaker.beep(880, 100)`},

  {title:'Name und Farbe', text:[
    'Ganz oben steht der Name. Er wird der Name der Kategorie. Die Farbe gilt für alle Blöcke; du kannst sie auch mit dem Farbfeld über dem Text wählen.',
    '»beschreibung« ist ein kurzer Hinweis für die Übersicht.'
  ], code:`# blockwerk: erweiterung PID-Regler
# blockwerk: farbe #8C5FDD
# blockwerk: beschreibung Regler für die Linienverfolgung`},

  {title:'Der Kopf', text:[
    'Alles unter »kopf« steht einmal vor dem Programm: Funktionen, Klassen, Variablen. Er erscheint nur, wenn mindestens ein Block der Erweiterung im Programm steckt.',
    'Importe schreibst du einfach hin. Blockwerk erkennt sie und führt sie oben mit den anderen Importen zusammen – nichts steht doppelt.',
    'Namen aus dem Kopf sind danach vergeben: Eine Variable im Programm kann nicht genauso heißen.'
  ], code:`# blockwerk: kopf
from pybricks.parameters import Color
from pybricks.tools import wait

def blinke(anzahl):
    for i in range(anzahl):
        hub.light.on(Color.RED)
        wait(200)
        hub.light.off()
        wait(200)`},

  {title:'Ein Block', text:[
    'Nach »block« steht der Text des Blocks. %1, %2 … sind die Stellen für die Eingaben, in der Reihenfolge, in der du sie darunter nennst.',
    'Unter dem Block steht sein Python-Code – eine oder mehrere Zeilen. Im Code steht {NAME} für den Wert einer Eingabe.',
    'Der Code darf eingerückt sein und selbst Schleifen oder Bedingungen enthalten; Blockwerk rückt ihn passend ein.'
  ], code:`# blockwerk: block blinke %1 mal
# blockwerk: beschreibung Lässt das Licht am Hub rot blinken.
# blockwerk: eingabe ANZAHL Zahl 3
blinke({ANZAHL})`},

  {title:'Eingaben', text:[
    '»eingabe NAME Art Vorgabe« legt ein Feld an, in das auch andere Blöcke passen. Arten: Zahl, Text, Wahrheit, beliebig.',
    '»auswahl NAME« ist eine Liste zum Aufklappen: links die Beschriftung, rechts der Wert, der im Code landet.',
    '»motor NAME C« lässt einen Anschluss wählen. Im Code wird {NAME} zu motor_C, und Blockwerk legt den Motor oben im Programm an. Genauso: farbsensor (farbe_C), abstandssensor (abstand_C), kraftsensor (kraft_C).'
  ], code:`# blockwerk: block drehe Motor %1 %2 um %3 Grad
# blockwerk: motor ARM C
# blockwerk: auswahl RICHTUNG vorwärts=1, rückwärts=-1
# blockwerk: eingabe WINKEL Zahl 90
{ARM}.run_angle(500, {RICHTUNG} * {WINKEL})`},

  {title:'Blöcke, die einen Wert liefern', text:[
    'Mit »ausgabe« wird der Block rund und passt in die Felder anderer Blöcke. Sein Code ist dann genau eine Zeile: der Ausdruck, der den Wert ergibt.',
    'Arten wie bei den Eingaben: Zahl, Text, Wahrheit, beliebig.'
  ], code:`# blockwerk: block Mittelwert von %1 und %2
# blockwerk: ausgabe Zahl
# blockwerk: eingabe A Zahl 0
# blockwerk: eingabe B Zahl 0
({A} + {B}) / 2`},

  {title:'Fahrbasis benutzen', text:[
    'Verwendet dein Code »roboter«, schreib »benutzt fahrbasis« dazu. Dann legt Blockwerk die Fahrbasis an, auch wenn sonst kein Fahr-Block im Programm ist.',
    '»hub« gibt es immer.'
  ], code:`# blockwerk: block fahre %1 mm und piepe
# blockwerk: eingabe WEG Zahl 200
# blockwerk: benutzt fahrbasis
roboter.straight({WEG})
hub.speaker.beep()`},

  {title:'Bibliotheken mitnehmen', text:[
    'Der Hub hat kein Internet und kein pip. Eine Bibliothek muss deshalb als Python-Text in der Erweiterung stehen.',
    'Unter »modul name« steht eine eigene Python-Datei. Sie wird zusammen mit dem Programm auf den Hub geladen; im Kopf holst du sie mit »from name import …«.',
    'Es geht nur reines MicroPython – nichts, was auf dem Computer extra installiert werden müsste (kein numpy).'
  ], code:`# blockwerk: kopf
from glaetten import Filter
filter_links = Filter(5)

# blockwerk: modul glaetten
class Filter:
    def __init__(self, laenge):
        self.werte = [0] * laenge

    def neu(self, wert):
        self.werte = self.werte[1:] + [wert]
        return sum(self.werte) / len(self.werte)`},

  {title:'Fester Name für einen Block', text:[
    'Blockwerk bildet den inneren Namen eines Blocks aus seinem Text. Änderst du den Text später, kennt ein gespeichertes Projekt den Block nicht mehr.',
    'Mit »id« gibst du ihm einen festen Namen – dann darfst du den Text frei ändern.'
  ], code:`# blockwerk: block PID-Korrektur für Fehler %1
# blockwerk: id korrektur
# blockwerk: ausgabe Zahl
# blockwerk: eingabe FEHLER Zahl 0
pid.berechne({FEHLER})`},

  {title:'Fehler finden', text:[
    'Unter dem Text stehen Fehler mit ihrer Zeile; die Zeilennummer ist links rot markiert.',
    'Beim Hinzufügen übersetzt Blockwerk den Python-Code einmal zur Probe. Tippfehler wie eine fehlende Klammer fallen dabei auf. Ob der Code das Richtige tut, zeigt erst der Roboter.',
    'Tipp: Mit »Als Datei speichern« kannst du eine Erweiterung weitergeben. Projekte, die sie benutzen, enthalten sie von selbst.'
  ]}
];
