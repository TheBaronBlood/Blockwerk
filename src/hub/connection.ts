// ---------------------------------------------------------------
// Verbindung zum Hub über Web Bluetooth (nur Chromium-Browser)
// ---------------------------------------------------------------
import { Hub, HubConnectionError, isDom, sleep, type HubListener } from './hub';
import {
  DEVICE_INFO_SERVICE, FIRMWARE_REVISION_CHAR, SOFTWARE_REVISION_CHAR,
  PYBRICKS_COMMAND_EVENT_CHAR, PYBRICKS_HUB_CAPABILITIES_CHAR, PYBRICKS_SERVICE,
  parseCapabilities, versionAtLeast, type HubCapabilities
} from './protocol';

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
    if (!(await navigator.bluetooth.getAvailability())) throw new HubConnectionError('Bluetooth ist an diesem Gerät ausgeschaltet oder nicht vorhanden.');

    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters:[{services:[PYBRICKS_SERVICE]}], optionalServices:[PYBRICKS_SERVICE, DEVICE_INFO_SERVICE]
      });
    } catch (err){
      if (isDom(err, 'NotFoundError')) return null;  // Dialog abgebrochen
      throw err;
    }
    if (!device.gatt) throw new HubConnectionError('Mit diesem Gerät ist keine Verbindung möglich.');

    try {
      const server = await device.gatt.connect();
      await sleep(1000);  // dem Bluetooth-Stack des Betriebssystems Zeit geben

      const info = await server.getPrimaryService(DEVICE_INFO_SERVICE);
      const text = new TextDecoder();
      const firmware = text.decode(await (await info.getCharacteristic(FIRMWARE_REVISION_CHAR)).readValue());
      const protocol = text.decode(await (await info.getCharacteristic(SOFTWARE_REVISION_CHAR)).readValue());
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
      await char.stopNotifications();
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
      try { await this.char.writeValueWithResponse(msg as BufferSource); }
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
