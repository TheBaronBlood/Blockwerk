// ---------------------------------------------------------------
// Bluetooth in der App (iPadOS, Android): Die eingebauten Browser der Tablets können kein
// Web Bluetooth, deshalb läuft die Verbindung über ein Plugin (CoreBluetooth bzw. das
// Bluetooth von Android). Befehle und Ereignisse sind dieselben wie in connection.ts.
// Wird nur in der App geladen (dynamischer Import in main.ts).
// ---------------------------------------------------------------
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { Hub, HubConnectionError, type HubListener } from './hub';
import {
  DEVICE_INFO_SERVICE, FIRMWARE_REVISION_CHAR, SOFTWARE_REVISION_CHAR,
  PYBRICKS_COMMAND_EVENT_CHAR, PYBRICKS_HUB_CAPABILITIES_CHAR, PYBRICKS_SERVICE,
  parseCapabilities, versionAtLeast, type HubCapabilities
} from './protocol';

const INFO = numberToUUID(DEVICE_INFO_SERVICE);
const FIRMWARE = numberToUUID(FIRMWARE_REVISION_CHAR), SOFTWARE = numberToUUID(SOFTWARE_REVISION_CHAR);
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

export interface FoundHub { id: string; name: string; rssi?: number }
/**
 * Eigene Auswahlliste statt der des Systems: bekommt über `subscribe` laufend die gefundenen
 * Hubs und liefert die Kennung des gewählten – oder null, wenn abgebrochen wurde.
 */
export type HubPicker = (subscribe: (found: (hubs: FoundHub[]) => void) => void) => Promise<string | null>;

export class NativeBleHub extends Hub {
  readonly via = 'Bluetooth';
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  private constructor(private id: string, readonly name: string, caps: HubCapabilities, protocol: string, firmware: string,
                      listener: HubListener){
    super(caps, protocol, firmware, listener);
  }

  /**
   * Sucht nach Hubs und verbindet mit dem gewählten. Mit `pick` erscheint die Liste von
   * Blockwerk, ohne die schlichte Auswahl des Systems. Liefert null, wenn abgebrochen wurde.
   */
  static async connect(listener: HubListener, pick?: HubPicker): Promise<NativeBleHub | null> {
    // Beim ersten Mal fragt das Tablet hier, ob Blockwerk Bluetooth benutzen darf
    try { await BleClient.initialize({androidNeverForLocation:true}); }
    catch (err){
      console.error(err);
      throw new HubConnectionError('Blockwerk darf Bluetooth nicht benutzen. Bitte in den Einstellungen des Geräts für Blockwerk erlauben.');
    }
    if (!(await BleClient.isEnabled())) throw new HubConnectionError('Bluetooth ist an diesem Gerät ausgeschaltet. Bitte einschalten und noch einmal verbinden.');

    const SEARCH_FAILED = 'Die Suche nach Hubs hat nicht geklappt. Ist Bluetooth eingeschaltet und für Blockwerk erlaubt?';
    let device: {deviceId: string; name?: string};
    if (pick){
      // selbst suchen: Jeder Hub mit Pybricks nennt in seiner Ankündigung den Pybricks-Dienst
      const hubs = new Map<string, FoundHub>();
      let show: (list: FoundHub[]) => void = () => {};
      try {
        await BleClient.requestLEScan({services:[PYBRICKS_SERVICE]}, (result) => {
          const id = result.device.deviceId;
          hubs.set(id, {id, name:result.localName || result.device.name || hubs.get(id)?.name || '', rssi:result.rssi});
          show([...hubs.values()]);
        });
      } catch (err){ console.error(err); throw new HubConnectionError(SEARCH_FAILED); }
      let id: string | null;
      try { id = await pick((found) => { show = found; found([...hubs.values()]); }); }
      finally { show = () => {}; await BleClient.stopLEScan().catch(() => {}); }
      if (!id) return null;
      device = {deviceId:id, name:hubs.get(id)?.name};
    } else {
      try { device = await BleClient.requestDevice({services:[PYBRICKS_SERVICE], optionalServices:[INFO]}); }
      catch (err){
        if (/cancel/i.test(err instanceof Error ? err.message : String(err))) return null;   // Auswahl abgebrochen
        console.error(err);
        throw new HubConnectionError(SEARCH_FAILED);
      }
    }

    const id = device.deviceId;
    let hub: NativeBleHub | null = null;
    try {
      // Bricht die Verbindung später ab, meldet das Plugin es hier
      await BleClient.connect(id, () => hub?.lost(), {timeout:10000});
      const text = new TextDecoder();
      const firmware = text.decode(await BleClient.read(id, INFO, FIRMWARE));
      const protocol = text.decode(await BleClient.read(id, INFO, SOFTWARE));
      // Fähigkeiten gibt es ab Profil v1.2, Terminalausgabe über diesen Kanal ab v1.3
      if (!versionAtLeast(protocol, '1.3.0')) throw new HubConnectionError(`Die Pybricks-Firmware auf dem Hub ist zu alt (${firmware}). Bitte in Pybricks Code aktualisieren.`);
      const caps = parseCapabilities(await BleClient.read(id, PYBRICKS_SERVICE, PYBRICKS_HUB_CAPABILITIES_CHAR));
      if (!caps.multiMpy6) throw new HubConnectionError('Dieser Hub versteht das Programmformat von Blockwerk nicht.');

      hub = new NativeBleHub(id, device.name || 'Pybricks Hub', caps, protocol, firmware, listener);
      const connected = hub;
      await BleClient.startNotifications(id, PYBRICKS_SERVICE, PYBRICKS_COMMAND_EVENT_CHAR, (value) => connected.handleEvent(value));
      return hub;
    } catch (err){
      hub = null;   // ein Abbruch während des Aufbaus soll nicht noch »getrennt« melden
      await BleClient.disconnect(id).catch(() => {});
      if (err instanceof HubConnectionError) throw err;
      console.error(err);
      throw new HubConnectionError('Die Verbindung zum Hub hat nicht geklappt. Ist er eingeschaltet, in der Nähe und mit Pybricks bespielt?');
    }
  }

  /** Bluetooth erlaubt nur einen Vorgang zur selben Zeit – alle Schreibzugriffe laufen nacheinander. */
  protected write(msg: Uint8Array): Promise<void> {
    const next = this.queue.then(async () => {
      if (this.closed) throw new HubConnectionError('Die Verbindung zum Hub ist abgebrochen.');
      try { await BleClient.write(this.id, PYBRICKS_SERVICE, PYBRICKS_COMMAND_EVENT_CHAR, view(msg)); }
      catch (err){
        if (this.closed) throw new HubConnectionError('Die Verbindung zum Hub ist abgebrochen.');
        throw err;
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }

  private lost(){
    if (this.closed) return;
    this.closed = true;
    this.listener.onDisconnect();
  }

  disconnect(){
    if (this.closed) return;
    this.closed = true;
    BleClient.disconnect(this.id).catch(() => {}).then(() => this.listener.onDisconnect());
  }
}
