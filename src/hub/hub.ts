// ---------------------------------------------------------------
// Gemeinsamer Teil beider Verbindungsarten (Bluetooth und USB-Kabel):
// Ereignisse des Hubs auswerten, Programm laden, starten, stoppen.
// ---------------------------------------------------------------
import {
  HubEvent, parseStatus, startUserProgram, stopUserProgram, uploadProgram, writeStdin, type HubCapabilities
} from './protocol';

/** Fehler mit einer Meldung, die so in der Oberfläche gezeigt werden kann. */
export class HubConnectionError extends Error {}

export interface HubListener {
  onStatus(running: boolean): void;
  onStdout(text: string): void;
  onDisconnect(): void;
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const isDom = (err: unknown, name: string) => err instanceof DOMException && err.name === name;

export abstract class Hub {
  /** Entwickleroption: bekommt jede Nachricht zum Hub (»→«) und jedes Ereignis vom Hub (»←«). */
  static trace: ((direction: '→' | '←', bytes: Uint8Array) => void) | null = null;

  private slot = 0;
  private running = false;
  private decoder = new TextDecoder();

  protected constructor(protected caps: HubCapabilities, readonly protocol: string, readonly firmware: string,
                        protected listener: HubListener){}

  abstract readonly name: string;
  /** Verbindungsart für die Anzeige. */
  abstract readonly via: 'Bluetooth' | 'USB' | 'Test';
  /** Schickt einen Pybricks-Befehl und wartet, bis der Hub ihn bestätigt hat. */
  protected abstract write(msg: Uint8Array): Promise<void>;
  abstract disconnect(): void;

  get isRunning(){ return this.running; }

  /** Wertet ein Ereignis des Hubs aus (Statusmeldung oder Terminalausgabe). */
  protected handleEvent(v: DataView){
    Hub.trace?.('←', new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    const type = v.getUint8(0);
    if (type === HubEvent.StatusReport){
      const s = parseStatus(v);
      this.slot = s.selectedSlot;
      if (s.running !== this.running){ this.running = s.running; this.listener.onStatus(s.running); }
    } else if (type === HubEvent.WriteStdout){
      this.listener.onStdout(this.decoder.decode(new Uint8Array(v.buffer, v.byteOffset + 1, v.byteLength - 1), {stream:true}));
    }
  }

  /** Lädt ein Programm (Multi-MPY-Format) auf den Hub, ohne es zu starten – die mittlere Taste startet es dann. */
  async load(program: Uint8Array, onProgress?: (fraction: number) => void){
    // Solange ein Programm läuft, nimmt der Hub kein neues an
    await this.halt();
    await uploadProgram((msg) => this.command(msg), program, this.caps, onProgress);
  }
  /** Lädt ein Programm auf den Hub und startet es. */
  async run(program: Uint8Array, onProgress?: (fraction: number) => void){
    await this.load(program, onProgress);
    await this.command(startUserProgram(this.protocol, this.slot));
  }
  /** Stoppt das laufende Programm und wartet kurz, bis der Hub das meldet. */
  async halt(){
    if (!this.running) return;
    await this.stop();
    for (let i = 0; i < 40 && this.running; i++) await sleep(50);
  }
  private command(msg: Uint8Array){ Hub.trace?.('→', msg); return this.write(msg); }
  stop(){ return this.command(stopUserProgram()); }
  /** Schickt Zeichen an die Standardeingabe des laufenden Programms. */
  send(text: string){ return this.command(writeStdin(new TextEncoder().encode(text))); }
  /** Schickt rohe Bytes an die Standardeingabe, zum Beispiel vom Steuerfeld. */
  sendBytes(bytes: Uint8Array){ return this.command(writeStdin(bytes)); }
}
