import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubConnection } from '../src/hub/connection';
import { Command, PYBRICKS_COMMAND_EVENT_CHAR, PYBRICKS_HUB_CAPABILITIES_CHAR, PYBRICKS_SERVICE, uuid16 } from '../src/hub/protocol';

// Ein Browser, wie es sie am iPad gibt (Bluefy): Web Bluetooth ist dort nachgebaut, strenger als in
// Chrome und auf einem älteren Stand. Kennungen als Zahl weist er zurück, »writeValueWithResponse« und
// »getAvailability« fehlen, »stopNotifications« scheitert, solange nichts läuft.
function strictBrowser(){
  const calls: string[] = [], written: number[][] = [];
  const text = (t: string) => new DataView(new TextEncoder().encode(t).buffer);
  const need = (what: string, id: unknown) => {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new TypeError(`${what}: Request payload could not be parsed.`);
    calls.push(`${what} ${id}`);
    return id;
  };
  const caps = new DataView(new ArrayBuffer(10));
  caps.setUint16(0, 158, true); caps.setUint32(2, 0b10, true); caps.setUint32(6, 261_000, true);
  const values: Record<string, DataView> = {[uuid16(0x2a26)]:text('4.1.0b5'), [uuid16(0x2a28)]:text('1.7.0'), [PYBRICKS_HUB_CAPABILITIES_CHAR]:caps};
  const characteristic = (id: string) => ({
    value:null as DataView | null,
    readValue:async () => values[id],
    addEventListener(){},
    stopNotifications:async () => { throw new Error('Benachrichtigungen laufen nicht'); },
    startNotifications:async () => { calls.push('startNotifications'); },
    writeValue:async (data: Uint8Array) => { written.push([...data]); }
  });
  const service = () => ({getCharacteristic:async (id: unknown) => characteristic(need('getCharacteristic', id))});
  const device = {
    name:'Blockwerk-Hub', addEventListener(){},
    gatt:{connect:async () => ({getPrimaryService:async (id: unknown) => { need('getPrimaryService', id); return service(); }}), disconnect(){ calls.push('disconnect'); }}
  };
  const bluetooth = {
    requestDevice:async (options: {filters:{services:unknown[]}[]; optionalServices:unknown[]}) => {
      for (const id of [...options.filters.flatMap(f => f.services), ...options.optionalServices]) need('requestDevice', id);
      return device;
    }
  };
  return {bluetooth, calls, written};
}

describe('Verbindung über Web Bluetooth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('kommt auch mit einem strengen Browser zurecht (Bluefy am iPad)', async () => {
    const browser = strictBrowser();
    vi.stubGlobal('navigator', {bluetooth:browser.bluetooth});
    const hub = await HubConnection.connect({onStatus(){}, onStdout(){}, onDisconnect(){}} as never);

    expect(hub).not.toBeNull();
    expect(hub!.name).toBe('Blockwerk-Hub');
    expect(hub!.firmware).toBe('4.1.0b5');
    expect(browser.calls).not.toContain('disconnect');
    expect(browser.calls).toEqual(expect.arrayContaining([
      `requestDevice ${PYBRICKS_SERVICE}`, 'requestDevice 0000180a-0000-1000-8000-00805f9b34fb',
      'getPrimaryService 0000180a-0000-1000-8000-00805f9b34fb', `getCharacteristic ${PYBRICKS_COMMAND_EVENT_CHAR}`, 'startNotifications'
    ]));

    // schreiben geht dort nur über das ältere »writeValue«
    await hub!.stop();
    expect(browser.written).toEqual([[Command.StopUserProgram]]);
  });

  it('schreibt 16-Bit-Kennungen in der langen Form', () => {
    expect(uuid16(0x180a)).toBe('0000180a-0000-1000-8000-00805f9b34fb');
    expect(uuid16(0x2a26)).toBe('00002a26-0000-1000-8000-00805f9b34fb');
  });
});
