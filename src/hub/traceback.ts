// ---------------------------------------------------------------
// Fehlermeldungen des Hubs (MicroPython-Traceback) aus der Terminalausgabe lesen
// ---------------------------------------------------------------
import { MAIN_MODULE } from './protocol';

export interface HubError {
  /** Zeile im erzeugten Programm (ab 1), in der der Fehler auftrat; null, wenn unbekannt. */
  line: number | null;
  /** Letzte Zeile des Tracebacks, z. B. »OSError: [Errno 19] ENODEV«. */
  message: string;
  /** Erklärung für Schülerinnen und Schüler, falls der Fehler bekannt ist. */
  hint: string | null;
}

const HINTS: [RegExp, string][] = [
  [/ENODEV/, 'An einem Anschluss steckt nicht das Gerät, das das Programm erwartet. Prüft Anschluss und Kabel.'],
  [/ETIMEDOUT/, 'Der Hub hat den Controller oder die Fernbedienung nicht gefunden. Ist das Gerät eingeschaltet und im Kopplungsmodus (Kopplungstaste halten, bis das Licht schnell blinkt)? Ein Xbox-Controller darf dabei nicht mit dem Handy oder Computer verbunden sein.'],
  [/EIO/, 'Ein Gerät wurde während des Programms abgezogen oder antwortet nicht mehr.'],
  [/EBUSY|EPERM/, 'Ein Gerät wird gerade von etwas anderem benutzt, zum Beispiel ein Motor der Fahrbasis.'],
  [/ZeroDivisionError/, 'Das Programm teilt durch 0.'],
  [/NameError/, 'Eine Variable wird benutzt, bevor sie einen Wert bekommen hat.'],
  [/MemoryError/, 'Der Speicher des Hubs ist voll.'],
  [/TypeError/, 'Ein Block bekommt einen Wert, mit dem er nichts anfangen kann, etwa Text statt einer Zahl.']
];
// Programmende durch Stopptaste oder Stopp-Knopf ist kein Fehler
const NO_ERROR = /^(SystemExit|KeyboardInterrupt)\b/;
const FRAME = new RegExp(`^\\s+File "${MAIN_MODULE}(?:\\.py)?", line (\\d+)`);

/** Nimmt die Terminalausgabe stückweise entgegen und meldet abgeschlossene Tracebacks. */
export class TracebackParser {
  private rest = '';
  private inTrace = false;
  private line: number | null = null;

  constructor(private onError: (e: HubError) => void){}

  feed(text: string){
    const parts = (this.rest + text).split(/\r?\n/);
    this.rest = parts.pop() ?? '';
    for (const l of parts) this.handle(l);
  }
  reset(){ this.rest = ''; this.inTrace = false; this.line = null; }

  private handle(l: string){
    if (l.startsWith('Traceback (most recent call last)')){ this.inTrace = true; this.line = null; return; }
    if (!this.inTrace) return;
    const frame = l.match(FRAME);
    if (frame){ this.line = parseInt(frame[1], 10); return; }  // der letzte Rahmen ist der innerste
    if (/^\s/.test(l)) return;                                 // Rahmen aus anderen Modulen
    this.inTrace = false;
    if (NO_ERROR.test(l)) return;
    const hint = HINTS.find(([re]) => re.test(l));
    this.onError({line:this.line, message:l.trim(), hint:hint ? hint[1] : null});
  }
}
