// ---------------------------------------------------------------
// USB-Kabel in der Android-App: Die Schnittstelle kommt von einem eigenen kleinen Plugin
// (android/app/src/main/java/de/blockwerk/app/HubSerialPlugin.java, USB-Host von Android).
// Hier wird sie so verpackt, dass sie wie die Web-Serial-Schnittstelle des Browsers aussieht –
// dann gilt alles aus serial.ts und serialProtocol.ts unverändert.
// Am iPad gibt es das nicht: iPadOS lässt Apps nicht an beliebige USB-Geräte.
// Wird nur in der App geladen (dynamischer Import in main.ts).
// ---------------------------------------------------------------
import { usbHint } from '../versions';
import { lastFirmware } from './lastHub';
import { registerPlugin } from '@capacitor/core';
import { HubConnectionError, type HubListener } from './hub';
import { SerialHub, type SerialPortLike } from './serial';

interface ListenerHandle { remove(): Promise<void> }
/** Das Plugin auf der Android-Seite. Daten gehen als Base64 über die Brücke. */
export interface HubSerialPlugin {
  /** Angeschlossene LEGO-Hubs. */
  list(): Promise<{devices: {id: number; name: string}[]}>;
  /** Öffnet die Schnittstelle; fragt beim ersten Mal, ob Blockwerk das USB-Gerät benutzen darf. */
  open(options: {id: number; baudRate: number}): Promise<void>;
  setSignals(options: {dtr: boolean}): Promise<void>;
  write(options: {data: string}): Promise<void>;
  close(): Promise<void>;
  addListener(event: 'data', handler: (e: {data: string}) => void): Promise<ListenerHandle>;
  addListener(event: 'closed', handler: () => void): Promise<ListenerHandle>;
}

export const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (text: string) => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** Die Schnittstelle des Plugins in der Form, die serial.ts erwartet. */
export class NativeSerialPort implements SerialPortLike {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;
  private handles: ListenerHandle[] = [];

  constructor(private plugin: HubSerialPlugin, private id: number){}

  async open(options: {baudRate: number}){
    let toPage!: ReadableStreamDefaultController<Uint8Array>;
    let ended = false;
    this.readable = new ReadableStream<Uint8Array>({start:(c) => { toPage = c; }, cancel:() => { ended = true; }});
    this.writable = new WritableStream<Uint8Array>({write:(chunk) => this.plugin.write({data:toBase64(chunk)})});
    // erst zuhören, dann öffnen – sonst ginge verloren, was der Hub sofort schickt
    this.handles.push(await this.plugin.addListener('data', (e) => { if (!ended) toPage.enqueue(fromBase64(e.data)); }));
    this.handles.push(await this.plugin.addListener('closed', () => {
      if (!ended){ ended = true; toPage.error(new Error('Kabel gezogen')); }
    }));
    try { await this.plugin.open({id:this.id, baudRate:options.baudRate}); }
    catch (err){
      await this.forget();
      console.error(err);
      const denied = /DENIED/.test(String((err as {code?: string})?.code));
      throw new HubConnectionError(denied
        ? 'Ohne die Erlaubnis für das USB-Gerät geht es nicht. Bitte noch einmal verbinden und die Frage des Geräts mit »OK« beantworten.'
        : 'Die USB-Schnittstelle des Hubs lässt sich nicht öffnen. Kabel prüfen und den Hub neu einstecken.');
    }
  }
  async setSignals(signals?: {dataTerminalReady?: boolean}){ await this.plugin.setSignals({dtr:!!signals?.dataTerminalReady}); }
  async close(){ await this.forget(); await this.plugin.close(); }
  private async forget(){ for (const h of this.handles.splice(0)) await h.remove().catch(() => {}); }
}

/** Nimmt den Hub, der am Tablet steckt. */
export async function connectNativeSerial(listener: HubListener, plugin: HubSerialPlugin = registerPlugin<HubSerialPlugin>('HubSerial')): Promise<SerialHub | null> {
  let devices: {id: number; name: string}[];
  try { devices = (await plugin.list()).devices; }
  catch (err){ console.error(err); throw new HubConnectionError('Dieses Gerät kann keine USB-Geräte ansprechen.'); }
  if (!devices.length) throw new HubConnectionError(usbHint(lastFirmware()) + ' An Geräten ohne USB-C braucht es einen OTG-Adapter.');
  return SerialHub.open(new NativeSerialPort(plugin, devices[0].id), listener);
}
