// ---------------------------------------------------------------
// Verbindung zum Hub über Web Bluetooth: Chromium-Browser, am iPad eigene Browser wie Bluefy.
// Die sind strenger und können weniger – deshalb nur Kennungen in langer Schreibweise, und nichts
// voraussetzen, was es erst in neueren Fassungen von Web Bluetooth gibt.
// ---------------------------------------------------------------
import { Hub, HubConnectionError, isDom, sleep, type HubListener } from './hub';
import {
  DEVICE_INFO_SERVICE, FIRMWARE_REVISION_CHAR, SOFTWARE_REVISION_CHAR,
  PYBRICKS_COMMAND_EVENT_CHAR, PYBRICKS_HUB_CAPABILITIES_CHAR, PYBRICKS_SERVICE,
  parseCapabilities, uuid16, versionAtLeast, type HubCapabilities
} from './protocol';

const INFO = uuid16(DEVICE_INFO_SERVICE), FIRMWARE = uuid16(FIRMWARE_REVISION_CHAR), SOFTWARE = uuid16(SOFTWARE_REVISION_CHAR);

export class HubConnection extends Hub {
  static supported(){ return typeof navigator !== 'undefined' && !!navigator.bluetooth; }

  readonly via = 'Bluetooth';
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(private device: BluetoothDevice, private char: BluetoothRemoteGATTCharacteristic,
                      caps: HubCapabilities, protocol: string, firmware: string, listener: HubListener){
    super(caps, protocol, firmware, listener);
  }

  get name(){ return this.device.name || 'Pybricks Hub'; }

  /** Öffnet den Auswahldialog des Browsers. Liefert null, wenn dort abgebrochen wurde. */
  static async connect(listener: HubListener): Promise<HubConnection | null> {
    if (!HubConnection.supported()) throw new HubConnectionError('Dieser Browser kann kein Bluetooth. Nimm Chrome oder Edge.');
    if (navigator.bluetooth.getAvailability && !(await navigator.bluetooth.getAvailability())) throw new HubConnectionError('Bluetooth ist an diesem Gerät ausgeschaltet oder nicht vorhanden.');

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters:[{services:[PYBRICKS_SERVICE]}], optionalServices:[PYBRICKS_SERVICE, INFO]
      });
    } catch (err){
      if (isDom(err, 'NotFoundError')) return null;  // Dialog abgebrochen
      throw err;
    }
    if (!device.gatt) throw new HubConnectionError('Mit diesem Gerät ist keine Verbindung möglich.');

    try {
      const server = await device.gatt.connect();
      await sleep(1000);  // dem Bluetooth-Stack des Betriebssystems Zeit geben

      const info = await server.getPrimaryService(INFO);
      const text = new TextDecoder();
      const firmware = text.decode(await (await info.getCharacteristic(FIRMWARE)).readValue());
      const protocol = text.decode(await (await info.getCharacteristic(SOFTWARE)).readValue());
      // Fähigkeiten gibt es ab Profil v1.2, Terminalausgabe über diesen Kanal ab v1.3
      if (!versionAtLeast(protocol, '1.3.0')) throw new HubConnectionError(`Die Pybricks-Firmware auf dem Hub ist zu alt (${firmware}). Bitte in Pybricks Code aktualisieren.`);

      const service = await server.getPrimaryService(PYBRICKS_SERVICE);
      const char = await service.getCharacteristic(PYBRICKS_COMMAND_EVENT_CHAR);
      const caps = parseCapabilities(await (await service.getCharacteristic(PYBRICKS_HUB_CAPABILITIES_CHAR)).readValue());
      if (!caps.multiMpy6) throw new HubConnectionError('Dieser Hub versteht das Programmformat von Blockwerk nicht.');

      const hub = new HubConnection(device, char, caps, protocol, firmware, listener);
      char.addEventListener('characteristicvaluechanged', () => { if (char.value) hub.handleEvent(char.value); });
      device.addEventListener('gattserverdisconnected', () => listener.onDisconnect());
      // Ohne das vorherige Stoppen kommen nach erneutem Verbinden mitunter keine Meldungen an
      // (manche Browser melden dabei einen Fehler, wenn noch nichts lief – der ist ohne Belang)
      await char.stopNotifications().catch(() => {});
      await char.startNotifications();
      return hub;
    } catch (err){
      device.gatt.disconnect();
      if (err instanceof HubConnectionError) throw err;
      if (isDom(err, 'NotFoundError')) throw new HubConnectionError('Auf diesem Hub läuft keine passende Pybricks-Firmware.');
      throw new HubConnectionError('Die Verbindung zum Hub hat nicht geklappt. Ist er eingeschaltet und in der Nähe?');
    }
  }

  /** GATT erlaubt nur einen Vorgang zur selben Zeit – alle Schreibzugriffe laufen nacheinander. */
  protected write(msg: Uint8Array): Promise<void> {
    const next = this.queue.then(async () => {
      try {
        // »writeValueWithResponse« kennen ältere Fassungen von Web Bluetooth nicht; »writeValue« wartet dort ebenso auf die Antwort
        if (this.char.writeValueWithResponse) await this.char.writeValueWithResponse(msg as BufferSource);
        else await this.char.writeValue(msg as BufferSource);
      }
      catch (err){
        if (isDom(err, 'NetworkError')) throw new HubConnectionError('Die Verbindung zum Hub ist abgebrochen.');
        throw err;
      }
    });
    this.queue = next.catch(() => {});
    return next;
  }

  disconnect(){ this.device.gatt?.disconnect(); }
}
