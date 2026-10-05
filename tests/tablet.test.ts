// App auf dem Tablet (iPadOS, Android): Bluetooth und USB-Kabel laufen dort über Plugins.
// Hier werden die Plugins nachgestellt – geprüft wird alles, was Blockwerk selbst dazu tut.
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HubConnectionError } from '../src/hub/hub';
import { PYBRICKS_COMMAND_EVENT_CHAR, PYBRICKS_HUB_CAPABILITIES_CHAR, PYBRICKS_SERVICE, writeUserProgramMeta } from '../src/hub/protocol';
import { LEGO_USB_VENDOR } from '../src/hub/serialProtocol';
import { NativeSerialPort, connectNativeSerial, fromBase64, toBase64, type HubSerialPlugin } from '../src/hub/nativeSerial';
import { fakeHub } from './helpers/fakeSerialHub';

// ---------------------------------------------------------------
// Nachgestelltes Bluetooth-Plugin
// ---------------------------------------------------------------
const ble = vi.hoisted(() => {
  const state = {
    enabled:true, initFails:false, requestError:null as string | null, protocol:'1.5.0', firmware:'4.0.1',
    calls:[] as string[], writes:[] as {service: string; char: string; bytes: number[]}[], busy:0, overlap:false,
    notify:null as ((value: DataView) => void) | null, onDisconnect:null as ((id: string) => void) | null,
    scanFails:false, scanning:false,
    scan:null as ((result: {device: {deviceId: string; name?: string}; localName?: string; rssi?: number}) => void) | null
  };
  const uuid = (n: number) => `0000${n.toString(16).padStart(4, '0')}-0000-1000-8000-00805f9b34fb`;
  const text = (s: string) => new DataView(new TextEncoder().encode(s).buffer);
  const BleClient = {
    initialize:async (options: unknown) => { state.calls.push('initialize ' + JSON.stringify(options)); if (state.initFails) throw new Error('denied'); },
    isEnabled:async () => state.enabled,
    requestDevice:async (options: {services: string[]}) => {
      state.calls.push('requestDevice ' + options.services.join(','));
      if (state.requestError) throw new Error(state.requestError);
      return {deviceId:'AA:BB', name:'robot'};
    },
    requestLEScan:async (options: {services: string[]}, callback: NonNullable<typeof state.scan>) => {
      state.calls.push('requestLEScan ' + options.services.join(','));
      if (state.scanFails) throw new Error('scan failed');
      state.scan = callback; state.scanning = true;
    },
    stopLEScan:async () => { state.calls.push('stopLEScan'); state.scanning = false; state.scan = null; },
    connect:async (id: string, onDisconnect: (id: string) => void) => { state.calls.push('connect ' + id); state.onDisconnect = onDisconnect; },
    disconnect:async (id: string) => { state.calls.push('disconnect ' + id); },
    read:async (_id: string, service: string, char: string) => {
      if (char === uuid(0x2a26)) return text(state.firmware);
      if (char === uuid(0x2a28)) return text(state.protocol);
      // Fähigkeiten: 25 Bytes je Schreibzugriff, Multi-MPY6, Programm bis 1000 Bytes
      const caps = new DataView(new ArrayBuffer(11));
      caps.setUint16(0, 25, true); caps.setUint32(2, 0b10, true); caps.setUint32(6, 1000, true);
      return caps;
    },
    write:async (_id: string, service: string, char: string, value: DataView) => {
      if (state.busy++) state.overlap = true;          // zwei Schreibzugriffe zur selben Zeit darf es nicht geben
      await new Promise(r => setTimeout(r, 1));
      state.writes.push({service, char, bytes:[...new Uint8Array(value.buffer, value.byteOffset, value.byteLength)]});
      state.busy--;
    },
    startNotifications:async (_id: string, service: string, char: string, callback: (value: DataView) => void) => {
      state.calls.push(`startNotifications ${service === char ? '' : char}`); state.notify = callback;
    }
  };
  return {state, BleClient, uuid};
});
vi.mock('@capacitor-community/bluetooth-le', () => ({BleClient:ble.BleClient, numberToUUID:ble.uuid}));
vi.mock('@capacitor/core', () => ({registerPlugin:() => { throw new Error('im Test wird das Plugin übergeben'); }}));

import { NativeBleHub } from '../src/hub/nativeBle';

function listen(){
  const log: string[] = [];
  return {log, listener:{
    onStatus:(running: boolean) => { log.push(running ? 'läuft' : 'beendet'); },
    onStdout:(out: string) => { log.push('aus:' + out); },
    onDisconnect:() => { log.push('getrennt'); }
  }};
}
const settle = () => new Promise(r => setTimeout(r, 20));
const event = (...b: number[]) => new DataView(Uint8Array.from(b).buffer);

describe('Bluetooth in der App (nachgestelltes Plugin)', () => {
  beforeEach(() => {
    Object.assign(ble.state, {enabled:true, initFails:false, requestError:null, protocol:'1.5.0', firmware:'4.0.1',
      calls:[], writes:[], busy:0, overlap:false, notify:null, onDisconnect:null, scanFails:false, scanning:false, scan:null});
  });

  it('verbindet, lädt ein Programm in Stücken und startet es', async () => {
    const {log, listener} = listen();
    const hub = (await NativeBleHub.connect(listener))!;
    expect([hub.name, hub.firmware, hub.protocol, hub.via]).toEqual(['robot', '4.0.1', '1.5.0', 'Bluetooth']);
    expect(ble.state.calls).toEqual([
      'initialize {"androidNeverForLocation":true}', `requestDevice ${PYBRICKS_SERVICE}`, 'connect AA:BB',
      `startNotifications ${PYBRICKS_COMMAND_EVENT_CHAR}`
    ]);

    const program = Uint8Array.from({length:50}, (_, i) => i);
    await hub.run(program);
    const writes = ble.state.writes;
    expect(ble.state.overlap).toBe(false);
    expect(writes.every(w => w.service === PYBRICKS_SERVICE && w.char === PYBRICKS_COMMAND_EVENT_CHAR)).toBe(true);
    expect(writes[0].bytes).toEqual([...writeUserProgramMeta(0)]);
    // 25 Bytes je Zugriff, davon 5 für Befehl und Stelle: 50 Bytes brauchen drei Stücke
    const chunks = writes.filter(w => w.bytes[0] === 4);
    expect(chunks.map(w => w.bytes.length)).toEqual([25, 25, 15]);
    expect(chunks.flatMap(w => w.bytes.slice(5))).toEqual([...program]);
    expect(writes[writes.length - 2].bytes).toEqual([...writeUserProgramMeta(50)]);
    expect(writes[writes.length - 1].bytes).toEqual([1, 0]);   // starten, Programmplatz 0

    // Meldungen des Hubs: Status »läuft«, Ausgabe, Status »beendet«
    ble.state.notify!(event(0, 0x40, 0, 0, 0, 0, 0));
    ble.state.notify!(event(1, 72, 105, 10));
    ble.state.notify!(event(0, 0, 0, 0, 0, 0, 0));
    expect(log).toEqual(['läuft', 'aus:Hi\n', 'beendet']);
  });

  it('meldet den Abbruch der Verbindung genau einmal', async () => {
    const lost = listen();
    const hub = (await NativeBleHub.connect(lost.listener))!;
    ble.state.onDisconnect!('AA:BB'); ble.state.onDisconnect!('AA:BB');
    hub.disconnect();
    await settle();
    expect(lost.log).toEqual(['getrennt']);
    await expect(hub.stop()).rejects.toThrow(HubConnectionError);

    const manual = listen();
    (await NativeBleHub.connect(manual.listener))!.disconnect();
    await settle();
    ble.state.onDisconnect!('AA:BB');
    expect(manual.log).toEqual(['getrennt']);
    expect(ble.state.calls).toContain('disconnect AA:BB');
  });

  it('sucht für die eigene Liste selbst, zeigt Funde laufend und verbindet mit dem gewählten Hub', async () => {
    const {listener} = listen();
    const shown: string[] = [];
    const hub = (await NativeBleHub.connect(listener, async (subscribe) => {
      subscribe((hubs) => shown.push(hubs.map(h => `${h.name}@${h.rssi}`).join(' ')));
      // zwei Hubs melden sich nacheinander; der zweite später noch einmal mit Namen
      ble.state.scan!({device:{deviceId:'11:22'}, localName:'Hub Anna', rssi:-48});
      ble.state.scan!({device:{deviceId:'AA:BB'}, rssi:-71});
      ble.state.scan!({device:{deviceId:'AA:BB', name:'robot'}, rssi:-69});
      await settle();
      expect(ble.state.scanning).toBe(true);
      return 'AA:BB';
    }))!;
    expect(shown).toEqual(['', 'Hub Anna@-48', 'Hub Anna@-48 @-71', 'Hub Anna@-48 robot@-69']);
    expect(hub.name).toBe('robot');
    // erst suchen, nach der Wahl die Suche beenden, dann verbinden – die Auswahl des Systems erscheint nicht
    expect(ble.state.calls).toEqual([
      'initialize {"androidNeverForLocation":true}', `requestLEScan ${PYBRICKS_SERVICE}`, 'stopLEScan', 'connect AA:BB',
      `startNotifications ${PYBRICKS_COMMAND_EVENT_CHAR}`
    ]);
    expect(ble.state.scanning).toBe(false);
  });

  it('eigene Liste: Abbrechen beendet die Suche, eine gescheiterte Suche wird verständlich gemeldet', async () => {
    const {listener} = listen();
    expect(await NativeBleHub.connect(listener, async () => null)).toBeNull();
    expect(ble.state.calls).toEqual(['initialize {"androidNeverForLocation":true}', `requestLEScan ${PYBRICKS_SERVICE}`, 'stopLEScan']);

    ble.state.scanFails = true;
    let asked = false;
    await expect(NativeBleHub.connect(listener, async () => { asked = true; return 'AA:BB'; })).rejects.toThrow(/Suche nach Hubs hat nicht geklappt/);
    expect(asked).toBe(false);   // ohne Suche erscheint die Liste gar nicht erst
  });

  it('unterscheidet Abbrechen, ausgeschaltetes Bluetooth, fehlende Erlaubnis und alte Firmware', async () => {
    const {listener} = listen();
    ble.state.requestError = 'requestDevice cancelled.';
    expect(await NativeBleHub.connect(listener)).toBeNull();

    ble.state.requestError = null; ble.state.enabled = false;
    await expect(NativeBleHub.connect(listener)).rejects.toThrow(/ausgeschaltet/);

    ble.state.enabled = true; ble.state.initFails = true;
    await expect(NativeBleHub.connect(listener)).rejects.toThrow(/darf Bluetooth nicht benutzen/);

    ble.state.initFails = false; ble.state.protocol = '1.2.0'; ble.state.firmware = '3.2.0'; ble.state.calls = [];
    await expect(NativeBleHub.connect(listener)).rejects.toThrow(/zu alt \(3\.2\.0\)/);
    expect(ble.state.calls).toContain('disconnect AA:BB');   // nichts bleibt halb verbunden
  });

  it('fragt die Fähigkeiten an der richtigen Stelle ab', () => {
    // (die nachgestellte Antwort hängt nicht an der Adresse – deshalb hier ausdrücklich)
    expect(PYBRICKS_HUB_CAPABILITIES_CHAR).toBe('c5f50003-8280-46da-89f4-6d8051e4aeef');
  });
});

// ---------------------------------------------------------------
// Nachgestelltes USB-Plugin: reicht die Bytes an den nachgestellten Hub aus dem Kabel-Test weiter
// ---------------------------------------------------------------
function fakePlugin(opts: {devices?: number; openError?: {code: string}} = {}){
  const hubSide = fakeHub();
  const writer = hubSide.port.writable!.getWriter();
  const listeners = {data:new Set<(e: {data: string}) => void>(), closed:new Set<() => void>()};
  const state = {opened:null as {id: number; baudRate: number} | null, closed:false, dtr:false, removed:0};
  const add = (set: Set<never>, handler: never) => { set.add(handler); return Promise.resolve({remove:async () => { set.delete(handler); state.removed++; }}); };
  const plugin = {
    list:async () => ({devices:Array.from({length:opts.devices ?? 1}, (_, i) => ({id:1002 + i, name:'robot (SPIKE Prime)'}))}),
    open:async (options: {id: number; baudRate: number}) => {
      if (opts.openError) throw Object.assign(new Error('nein'), opts.openError);
      state.opened = options;
      // was der Hub schickt, kommt als Ereignis »data« bei der Seite an
      const reader = hubSide.port.readable!.getReader();
      (async () => {
        try { for (;;){ const {value, done} = await reader.read(); if (done) break; listeners.data.forEach(l => l({data:toBase64(value)})); } }
        catch { listeners.closed.forEach(l => l()); }
      })();
    },
    setSignals:async (options: {dtr: boolean}) => { state.dtr = options.dtr; },
    write:async (options: {data: string}) => { await writer.write(fromBase64(options.data)); },
    close:async () => { state.closed = true; },
    addListener:(name: 'data' | 'closed', handler: never) => add(listeners[name] as Set<never>, handler)
  } as unknown as HubSerialPlugin;
  return {plugin, state, hubSide};
}

describe('USB-Kabel in der Android-App (nachgestelltes Plugin)', () => {
  it('verpackt Bytes verlustfrei für die Brücke', () => {
    const all = Uint8Array.from({length:256}, (_, i) => i);
    expect(fromBase64(toBase64(all))).toEqual(all);
    expect(toBase64(new Uint8Array(0))).toBe('');
  });

  it('verbindet, lädt, startet und bemerkt das gezogene Kabel', async () => {
    const fake = fakePlugin(), {log, listener} = listen();
    const hub = (await connectNativeSerial(listener, fake.plugin))!;
    expect([hub.name, hub.firmware, hub.protocol, hub.via]).toEqual(['robot', '4.1.0b5', '1.7.0', 'USB']);
    expect(fake.state.opened).toEqual({id:1002, baudRate:115200});
    expect(fake.state.dtr).toBe(true);                       // ohne DTR redet der Hub nicht
    expect(fake.hubSide.state.subscribed).toBe(true);

    await hub.run(Uint8Array.from({length:60}, (_, i) => i % 5));
    await settle();
    const sent = fake.hubSide.state.commands;
    expect(sent[0]).toEqual(writeUserProgramMeta(0));
    expect(sent[sent.length - 2]).toEqual(writeUserProgramMeta(60));
    expect(log).toEqual(['läuft', 'aus:Hallo\n']);

    fake.hubSide.unplug();
    await settle();
    expect(log[log.length - 1]).toBe('getrennt');
    expect(fake.state.closed).toBe(true);
    expect(fake.state.removed).toBe(2);                      // beide Zuhörer wieder abgemeldet
  });

  it('trennt sauber auf Wunsch', async () => {
    const fake = fakePlugin(), {log, listener} = listen();
    const hub = (await connectNativeSerial(listener, fake.plugin))!;
    hub.disconnect();
    await settle();
    expect(log).toEqual(['getrennt']);
    expect(fake.state.closed).toBe(true);
    expect(fake.hubSide.state.subscribed).toBe(false);
  });

  it('erklärt, wenn kein Hub steckt oder die Erlaubnis fehlt', async () => {
    const {listener} = listen();
    await expect(connectNativeSerial(listener, fakePlugin({devices:0}).plugin)).rejects.toThrow(/Kein Hub am Kabel/);
    const denied = fakePlugin({openError:{code:'DENIED'}});
    await expect(connectNativeSerial(listener, denied.plugin)).rejects.toThrow(/Erlaubnis für das USB-Gerät/);
    expect(denied.state.removed).toBe(2);
    await expect(new NativeSerialPort(fakePlugin({openError:{code:'OPEN_FAILED'}}).plugin, 1).open({baudRate:115200})).rejects.toThrow(/lässt sich nicht öffnen/);
  });
});

// ---------------------------------------------------------------
// Die nativen Projekte müssen zur Seite passen
// ---------------------------------------------------------------
describe('Projekte für iPadOS und Android', () => {
  const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const version: string = JSON.parse(read('package.json')).version;

  it('tragen dieselbe Versionsnummer wie package.json', () => {
    const ios = [...read('ios/App/App.xcodeproj/project.pbxproj').matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(m => m[1]);
    expect(ios.length).toBeGreaterThan(0);
    expect(new Set(ios)).toEqual(new Set([version]));        // sonst: node build/app-version.mjs
    expect(read('android/app/build.gradle')).toContain("file('../../package.json')");
  });

  it('melden das USB-Plugin unter dem Namen an, den die Seite benutzt', () => {
    expect(read('android/app/src/main/java/de/blockwerk/app/HubSerialPlugin.java')).toContain('@CapacitorPlugin(name = "HubSerial")');
    expect(read('android/app/src/main/java/de/blockwerk/app/MainActivity.java')).toContain('registerPlugin(HubSerialPlugin.class)');
    expect(read('src/hub/nativeSerial.ts')).toContain("registerPlugin<HubSerialPlugin>('HubSerial')");
  });

  it('erklären dem System, wofür Bluetooth und USB gebraucht werden', () => {
    expect(read('ios/App/App/Info.plist')).toContain('NSBluetoothAlwaysUsageDescription');
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    expect(manifest).toMatch(/BLUETOOTH_SCAN"\s+android:usesPermissionFlags="neverForLocation"/);
    expect(manifest).toContain('android.hardware.usb.action.USB_DEVICE_ATTACHED');
    expect(read('android/app/src/main/res/xml/usb_device_filter.xml')).toContain(`vendor-id="${LEGO_USB_VENDOR}"`);
    expect(read('android/app/src/main/java/de/blockwerk/app/HubSerialPlugin.java')).toContain('LEGO_VENDOR = 0x0694');
  });
});
