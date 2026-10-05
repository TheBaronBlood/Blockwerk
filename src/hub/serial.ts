// ---------------------------------------------------------------
// Verbindung zum Hub über das USB-Kabel (Web Serial, nur Chromium-Browser am Computer).
// Braucht eine Pybricks-Firmware, die USB kann – siehe ROADMAP.md, Meilenstein 8.
// ---------------------------------------------------------------
import { Hub, HubConnectionError, isDom, type HubListener } from './hub';
import { parseCapabilities, versionAtLeast, type HubCapabilities } from './protocol';
import {
  DEVICE_NAME_ID, FIRMWARE_REVISION_ID, FrameReader, HUB_CAPABILITIES_ID, InMsg, LEGO_USB_VENDOR, MAX_COMMAND_SIZE, ReadService,
  SOFTWARE_REVISION_ID, commandFrame, parseReadReply, parseResponse, pieces, readFrame, subscribeFrame, type SerialMessage
} from './serialProtocol';

const READ_TIMEOUT_MS = 1000;
const COMMAND_TIMEOUT_MS = 3000;
const LOST = 'Die Verbindung zum Hub ist abgebrochen.';
/** Pause zwischen zwei Stücken, damit der Treiber sie nicht zu einer Übertragung zusammenlegt. */
const PIECE_GAP_MS = 12;
const NO_PYBRICKS = 'Der Hub antwortet nicht. Zieh das Kabel einmal ab und steck es wieder ein, dann noch einmal verbinden. ' +
  'Über das Kabel geht es nur mit einer Pybricks-Firmware, die USB kann (derzeit die Beta 4.1) – sonst bitte Bluetooth nehmen.';
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Die Schnittstelle, wie sie hier gebraucht wird – so lässt sie sich im Test nachstellen. */
export type SerialPortLike = Pick<SerialPort, 'open' | 'close' | 'readable' | 'writable' | 'setSignals'>;

interface Response { tag: number; status: number }
interface ReadReply { service: number; id: number; value: Uint8Array }
interface Waiting { accept(msg: SerialMessage): boolean }

/** Rahmen senden und empfangen; immer nur eine Anfrage zur selben Zeit, wie der Hub es erwartet. */
class Link {
  onEvent: (event: DataView) => void = () => {};
  /** Kabel gezogen oder Hub ausgeschaltet – nicht nach close(). */
  onLost: () => void = () => {};

  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private queue: Promise<unknown> = Promise.resolve();
  private waiting: Waiting | null = null;
  private closed = false;
  private tag = 0;

  constructor(private port: SerialPortLike){
    this.reader = port.readable!.getReader();
    this.writer = port.writable!.getWriter();
    this.readLoop();
  }

  private async readLoop(){
    const frames = new FrameReader();
    try {
      for (;;){
        const {value, done} = await this.reader.read();
        if (done) break;
        if (value) for (const msg of frames.push(value)) this.handle(msg);
      }
    } catch (err){ if (!this.closed) console.error(err); }
    if (!this.closed){ await this.close(); this.onLost(); }
  }

  private handle(msg: SerialMessage){
    if (msg.type === InMsg.Event){
      if (msg.payload.length) this.onEvent(new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength));
    } else this.waiting?.accept(msg);
  }

  /** Schickt einen Rahmen und wartet auf die Antwort, die `pick` erkennt. */
  private exchange<T>(frame: Uint8Array, pick: (msg: SerialMessage) => T | null, timeout: number, late: string): Promise<T> {
    const next = this.queue.then(() => new Promise<T>((resolve, reject) => {
      if (this.closed){ reject(new HubConnectionError(LOST)); return; }
      const finish = () => { clearTimeout(timer); this.waiting = null; };
      const timer = setTimeout(() => { finish(); reject(new HubConnectionError(late)); }, timeout);
      this.waiting = {accept:(msg) => {
        const value = pick(msg);
        if (value === null) return false;
        finish(); resolve(value); return true;
      }};
      this.send(frame).catch(() => { finish(); reject(new HubConnectionError(LOST)); });
    }));
    this.queue = next.catch(() => {});
    return next;
  }

  /**
   * Schreibt einen Rahmen so, dass nie eine USB-Übertragung entsteht, deren Länge ein Vielfaches
   * der Paketgröße ist (siehe `USB_PACKET_SIZE`): in Stücken unter einer Paketlänge, mit einer
   * kurzen Pause dazwischen. Die üblichen Rahmen sind ohnehin kürzer als ein Paket.
   */
  private async send(frame: Uint8Array){
    const parts = pieces(frame);
    for (let i = 0; i < parts.length; i++){
      if (i) await pause(PIECE_GAP_MS);
      await this.writer.write(parts[i]);
    }
  }

  /** Fragt den Hub nach einem Wert, zum Beispiel der Firmwareversion. */
  async read(service: number, id: number): Promise<Uint8Array> {
    const reply = await this.exchange<ReadReply>(readFrame(service, id), (msg) => {
      const r = msg.type === InMsg.ReadReply ? parseReadReply(msg.payload) : null;
      return r && r.service === service && r.id === id ? r : null;
    }, READ_TIMEOUT_MS, NO_PYBRICKS);
    return reply.value;
  }

  /** Schickt einen Pybricks-Befehl; die Marke ordnet die Antwort des Hubs dem Befehl zu. */
  async command(command: Uint8Array): Promise<void> {
    const tag = this.tag = this.tag % 255 + 1;
    const {status} = await this.exchange<Response>(commandFrame(tag, command), (msg) => {
      const r = msg.type === InMsg.Response ? parseResponse(msg.payload) : null;
      return r && r.tag === tag ? r : null;
    }, COMMAND_TIMEOUT_MS, 'Der Hub antwortet nicht mehr.');
    if (status !== 0) throw new HubConnectionError(`Der Hub hat den Befehl abgelehnt (Fehler ${status}).`);
  }

  /**
   * Ereignisse (Status, Terminalausgabe) abonnieren oder abbestellen. Darauf antwortet der Hub
   * nicht – die Pause danach hält den nächsten Rahmen auf Abstand.
   */
  subscribe(on: boolean){
    const next = this.queue.then(() => this.closed ? undefined : this.send(subscribeFrame(on))).then(() => pause(PIECE_GAP_MS));
    this.queue = next.catch(() => {});
    return next;
  }

  /** Jeder Schritt darf scheitern – zum Beispiel, wenn das Kabel schon gezogen ist. */
  async close(){
    this.closed = true;
    await this.reader.cancel().catch(() => {});
    try { this.reader.releaseLock(); } catch { /* schon freigegeben */ }
    try { this.writer.releaseLock(); } catch { /* schon freigegeben */ }
    await this.port.close().catch(() => {});
  }
}

export class SerialHub extends Hub {
  static supported(){ return typeof navigator !== 'undefined' && !!navigator.serial; }

  readonly via = 'USB';
  private closed = false;

  private constructor(private link: Link, readonly name: string, caps: HubCapabilities, protocol: string, firmware: string,
                      listener: HubListener){
    super(caps, protocol, firmware, listener);
    link.onEvent = (event) => this.handleEvent(event);
    link.onLost = () => { if (!this.closed){ this.closed = true; listener.onDisconnect(); } };
  }

  /**
   * Nimmt den einzigen angeschlossenen und schon freigegebenen Hub; sonst öffnet sich die
   * Auswahl des Browsers. Liefert null, wenn dort abgebrochen oder nichts gefunden wurde.
   */
  static async connect(listener: HubListener): Promise<SerialHub | null> {
    if (!SerialHub.supported()) throw new HubConnectionError('Dieser Browser kann den Hub nicht über das Kabel ansprechen. Nimm Chrome oder Edge am Computer.');
    const known = (await navigator.serial.getPorts()).filter(p => p.getInfo().usbVendorId === LEGO_USB_VENDOR);
    let port: SerialPort;
    if (known.length === 1) port = known[0];
    else {
      try { port = await navigator.serial.requestPort({filters:[{usbVendorId:LEGO_USB_VENDOR}]}); }
      catch (err){
        if (isDom(err, 'NotFoundError')) return null;  // Auswahl abgebrochen oder kein Hub am Kabel
        throw err;
      }
    }
    return SerialHub.open(port, listener);
  }

  /** Öffnet die Schnittstelle, fragt den Hub nach Namen, Firmware und Fähigkeiten und abonniert seine Meldungen. */
  static async open(port: SerialPortLike, listener: HubListener): Promise<SerialHub> {
    try {
      await port.open({baudRate:115200, bufferSize:4096});
      // Am DTR-Signal erkennt der Hub, dass ein Programm die Schnittstelle geöffnet hat
      await port.setSignals({dataTerminalReady:true});
    } catch (err){
      await port.close().catch(() => {});
      if (err instanceof HubConnectionError) throw err;   // die App auf dem Tablet meldet es schon verständlich
      console.error(err);
      throw new HubConnectionError('Die USB-Schnittstelle des Hubs lässt sich nicht öffnen. Ist er noch mit einem anderen Programm verbunden (Pybricks Code, SPIKE-App)? Unter Linux fehlt vielleicht die Freigabe – siehe README.');
    }
    const link = new Link(port);
    try {
      const text = new TextDecoder();
      const gatt = (id: number) => link.read(ReadService.Gatt, id);
      // Zwei Versuche: Kurz nach dem Öffnen kann der Hub verwerfen, was gerade ankommt
      const protocol = text.decode(await gatt(SOFTWARE_REVISION_ID).catch(() => gatt(SOFTWARE_REVISION_ID)));
      const firmware = text.decode(await gatt(FIRMWARE_REVISION_ID));
      if (!versionAtLeast(protocol, '1.6.0')) throw new HubConnectionError(`Die Pybricks-Firmware auf dem Hub ist für das Kabel zu alt (${firmware}).`);
      const value = await link.read(ReadService.Pybricks, HUB_CAPABILITIES_ID);
      const caps = value.length >= 10 ? parseCapabilities(new DataView(value.buffer, value.byteOffset, value.byteLength)) : null;
      if (!caps?.multiMpy6) throw new HubConnectionError('Dieser Hub versteht das Programmformat von Blockwerk nicht.');
      const name = text.decode(await gatt(DEVICE_NAME_ID)) || 'Pybricks Hub';

      // Programmteile so klein, dass jeder Befehl in ein einzelnes kurzes USB-Paket passt
      const hub = new SerialHub(link, name, {...caps, maxWriteSize:Math.min(caps.maxWriteSize, MAX_COMMAND_SIZE)}, protocol, firmware, listener);
      await link.subscribe(true);
      return hub;
    } catch (err){
      await link.close();
      throw err;
    }
  }

  protected write(msg: Uint8Array){ return this.link.command(msg); }

  disconnect(){
    if (this.closed) return;
    this.closed = true;
    this.link.subscribe(false).catch(() => {})
      .then(() => this.link.close())
      .then(() => this.listener.onDisconnect());
  }
}
