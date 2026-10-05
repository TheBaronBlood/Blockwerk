// ---------------------------------------------------------------
// Test-Hub (Entwickleroption): verhält sich nach außen wie ein Hub, ohne dass ein Gerät
// angeschlossen ist. Er nimmt das Programm entgegen, prüft die Übertragung und meldet im
// Terminal, was angekommen ist. Das Programm selbst führt er nicht aus – mit einer Ausnahme:
// Kommt das Anzeige-Programm der Hub-Ansicht an, spielt er dessen Meldungen nach (ein Motor,
// der sich dreht, ein Farbsensor, ein Abstands- und ein Kraftsensor), damit sich die Ansicht
// ohne Gerät ansehen lässt.
// ---------------------------------------------------------------
import { Hub, type HubListener } from './hub';
import { MONITOR_MARK, MONITOR_VERSION } from './monitor';
import { Command, HubEvent } from './protocol';

const RUN_MS = 1500;

export class TestHub extends Hub {
  readonly via = 'Test';
  readonly name = 'Test-Hub';
  private received = new Uint8Array(0);
  private announced = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private closed = false;
  /** läuft gerade die nachgespielte Hub-Ansicht */
  private monitor: ReturnType<typeof setInterval> | undefined;

  private constructor(listener: HubListener){
    super({maxWriteSize:158, multiMpy6:true, maxUserProgramSize:261120}, '1.7.0', 'Test', listener);
  }
  static async connect(listener: HubListener): Promise<TestHub> { return new TestHub(listener); }

  private status(running: boolean){ this.handleEvent(new DataView(new Uint8Array([HubEvent.StatusReport, running ? 0x40 : 0, 0, 0, 0, 0, 0]).buffer)); }
  private print(text: string){
    const bytes = new TextEncoder().encode(text);
    const msg = new Uint8Array(1 + bytes.length); msg[0] = HubEvent.WriteStdout; msg.set(bytes, 1);
    this.handleEvent(new DataView(msg.buffer));
  }
  /** Namen der Module im Multi-MPY-Format: Größe, Name mit Nullbyte, Daten. */
  private modules(): string[] {
    const names: string[] = [], view = new DataView(this.received.buffer);
    for (let at = 0; at + 4 < this.received.length;){
      const size = view.getUint32(at, true), end = this.received.indexOf(0, at + 4);
      if (end < 0) break;
      names.push(`${new TextDecoder().decode(this.received.subarray(at + 4, end))} (${size} Bytes)`);
      at = end + 1 + size;
    }
    return names;
  }

  /** Die Texte eines übersetzten Programms stehen lesbar in den Bytes – daran ist das Anzeige-Programm zu erkennen. */
  private isMonitor(){ return new TextDecoder().decode(this.received).includes(MONITOR_MARK + 'V '); }
  private playMonitor(){
    const M = MONITOR_MARK, colors = [[350, 90, 80, 40, 'RED'], [55, 85, 95, 78, 'YELLOW'], [130, 70, 60, 33, 'GREEN'], [215, 90, 70, 21, 'BLUE'], [0, 0, 100, 96, 'WHITE']];
    let n = 0;
    this.print(`${M}V ${MONITOR_VERSION}\r\n${M}P B -\r\n${M}P F -\r\n`);
    // im Takt des echten Programms: der Motor in jeder Runde, die Sensoren in jeder dritten, der Hub seltener
    const tick = () => {
      const s = Math.floor(n / 3);
      const c = colors[Math.floor(s / 12) % colors.length], distance = 120 + Math.round(90 * Math.sin(s / 9)), force = Math.max(0, Math.round(50 * Math.sin(s / 14)));
      const lines = [`P A m 48 ${n * 2 - 180} ${s % 30 < 20 ? 50 : 0}`];
      if (n % 3 === 0) lines.push(`P C c 61 ${c.join(' ')}`, `P D u 62 ${s % 80 > 60 ? 2000 : distance}`, `P E f 63 ${force} ${force > 30 ? 1 : 0}`);
      if (n % 12 === 0) lines.push(`H ${7850 - (s % 5) * 50} 140 0 0 ${Math.round(4 * Math.sin(s / 20))} -2 ${s % 360}`);
      this.print(lines.map(l => M + l + '\r\n').join(''));
      n++;
    };
    tick();
    this.monitor = setInterval(tick, 50);
  }
  private stopMonitor(){ clearInterval(this.monitor); this.monitor = undefined; }

  protected async write(msg: Uint8Array): Promise<void> {
    if (this.closed) throw new Error('Der Test-Hub ist getrennt.');
    const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
    switch (msg[0]){
      case Command.WriteUserProgramMeta:
        this.announced = view.getUint32(1, true);
        if (this.announced === 0) this.received = new Uint8Array(0);
        break;
      case Command.WriteUserRam: {
        const offset = view.getUint32(1, true), data = msg.subarray(5);
        const grown = new Uint8Array(Math.max(this.received.length, offset + data.length));
        grown.set(this.received); grown.set(data, offset);
        this.received = grown;
        break;
      }
      case Command.StartUserProgram:
        this.status(true);
        this.stopMonitor();
        if (this.received.length === this.announced && this.isMonitor()){ this.playMonitor(); break; }
        this.print(this.received.length === this.announced
          ? `[Test-Hub] Programm vollständig angekommen: ${this.modules().join(', ')}\n[Test-Hub] Ein echter Hub würde es jetzt ausführen.\n`
          : `[Test-Hub] Fehler: ${this.received.length} Bytes angekommen, ${this.announced} angekündigt.\n`);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.status(false), RUN_MS);
        break;
      case Command.StopUserProgram:
        clearTimeout(this.timer); this.stopMonitor();
        this.status(false);
        break;
      case Command.WriteStdin:
        // das Lebenszeichen der Hub-Ansicht kommt alle anderthalb Sekunden – nicht jedes Mal melden
        if (!this.monitor) this.print(`[Test-Hub] Eingabe: ${[...msg.subarray(1)].join(' ')}\n`);
        break;
    }
  }

  disconnect(){
    if (this.closed) return;
    this.closed = true; clearTimeout(this.timer); this.stopMonitor();
    this.listener.onDisconnect();
  }
}
