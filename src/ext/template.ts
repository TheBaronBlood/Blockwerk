// ---------------------------------------------------------------
// Vorlage für »Neue Erweiterung« – zugleich das Beispiel, an dem man das Format sieht.
// ---------------------------------------------------------------
export const TEMPLATE = `# blockwerk: erweiterung PID-Regler
# blockwerk: farbe #8C5FDD
# blockwerk: beschreibung Ein Regler, der aus einem Fehler eine Korrektur berechnet, zum Beispiel für die Linienverfolgung.

# Alles unter »kopf« steht einmal vor dem Programm. Importe sortiert Blockwerk selbst ein.
# blockwerk: kopf
from pybricks.tools import StopWatch

class PID:
    def __init__(self):
        self.kp = 1.0
        self.ki = 0.0
        self.kd = 0.0
        self.uhr = StopWatch()
        self.reset()

    def einstellen(self, kp, ki, kd):
        self.kp = kp
        self.ki = ki
        self.kd = kd

    def reset(self):
        self.summe = 0
        self.letzter = 0
        self.uhr.reset()

    def berechne(self, fehler):
        dt = max(self.uhr.time(), 1) / 1000
        self.uhr.reset()
        self.summe += fehler * dt
        steigung = (fehler - self.letzter) / dt
        self.letzter = fehler
        return self.kp * fehler + self.ki * self.summe + self.kd * steigung

pid = PID()

# Jeder Block: der Text mit %1, %2 … für die Eingaben, darunter der Python-Code.
# Im Code steht {NAME} für den Wert der Eingabe.
# blockwerk: block PID einstellen: P %1 I %2 D %3
# blockwerk: beschreibung Legt fest, wie stark der Regler reagiert.
# blockwerk: eingabe P Zahl 1.2
# blockwerk: eingabe I Zahl 0
# blockwerk: eingabe D Zahl 0.1
pid.einstellen({P}, {I}, {D})

# Ein Block mit »ausgabe« liefert einen Wert; sein Code ist genau eine Zeile.
# blockwerk: block PID-Korrektur für Fehler %1
# blockwerk: ausgabe Zahl
# blockwerk: eingabe FEHLER Zahl 0
pid.berechne({FEHLER})

# blockwerk: block PID zurücksetzen
pid.reset()

# »farbsensor« lässt den Anschluss wählen; »benutzt fahrbasis« sorgt dafür, dass es »roboter« gibt.
# blockwerk: block folge der Linie mit Farbsensor %1 Tempo %2 Sollwert %3
# blockwerk: beschreibung Gehört in eine Schleife »wiederhole fortlaufend«.
# blockwerk: farbsensor SENSOR C
# blockwerk: eingabe TEMPO Zahl 120
# blockwerk: eingabe SOLL Zahl 50
# blockwerk: benutzt fahrbasis
roboter.drive({TEMPO}, pid.berechne({SENSOR}.reflection() - {SOLL}))
`;

/** Kurzanleitung im Editor. */
export const CHEAT_SHEET: [string, string][] = [
  ['# blockwerk: erweiterung Name', 'Name der Erweiterung – steht ganz oben.'],
  ['# blockwerk: farbe #8C5FDD', 'Farbe der Blöcke.'],
  ['# blockwerk: kopf', 'Darunter: Code, der einmal vor dem Programm steht (Funktionen, Klassen, Importe).'],
  ['# blockwerk: block Text %1 %2', 'Ein neuer Block. Darunter sein Python-Code; {NAME} steht für eine Eingabe.'],
  ['# blockwerk: eingabe NAME Zahl 10', 'Eingabefeld mit Vorgabe. Arten: Zahl, Text, Wahrheit, beliebig.'],
  ['# blockwerk: auswahl NAME Links=-1, Rechts=1', 'Auswahlliste: Beschriftung = Wert im Code.'],
  ['# blockwerk: motor NAME C', 'Anschluss wählen; {NAME} wird zu motor_C. Auch: farbsensor, abstandssensor, kraftsensor.'],
  ['# blockwerk: ausgabe Zahl', 'Der Block liefert einen Wert (runder Block). Der Code ist dann eine Zeile.'],
  ['# blockwerk: benutzt fahrbasis', 'Der Code verwendet »roboter«.'],
  ['# blockwerk: beschreibung Text', 'Hinweis, der beim Zeigen auf den Block erscheint.'],
  ['# blockwerk: modul name', 'Darunter: eine eigene Python-Datei (Bibliothek), die mit auf den Hub geladen wird. Im Kopf mit »from name import …« einbinden.']
];
