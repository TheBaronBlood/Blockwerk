import { describe, expect, it } from 'vitest';
import { SerialHub } from '../src/hub/serial';
import { HubConnectionError } from '../src/hub/hub';
import { fakeHub } from './helpers/fakeSerialHub';
import { writeUserProgramMeta } from '../src/hub/protocol';
import {
  FrameReader, InMsg, MAX_COMMAND_SIZE, MAX_PIECE_SIZE, OutMsg, ReadService, commandFrame, decodeFrame, encodeFrame, parseReadReply,
  parseResponse, pieces, readFrame, subscribeFrame
} from '../src/hub/serialProtocol';

const bytes = (...b: number[]) => new Uint8Array(b);
const body = (frame: Uint8Array) => frame.subarray(0, frame.length - 1);

describe('Rahmen für die serielle Verbindung', () => {
  it('verpackt eine Leseanfrage wie die Firmware (von Hand nachgerechnet)', () => {
    // Nachricht 3, 1, 0x26, 0x2a → Codewörter 88 und 5, alles mit 3 verknüpft, Endezeichen 2
    expect(readFrame(ReadService.Gatt, 0x2a26)).toEqual(bytes(0x5b, 0x00, 0x06, 0x25, 0x29, 0x02));
    expect(subscribeFrame(true)).toEqual(encodeFrame(OutMsg.Subscribe, bytes(1)));
    expect(decodeFrame(body(commandFrame(7, bytes(1, 0))))).toEqual({type:OutMsg.Command, payload:bytes(7, 1, 0)});
  });

  it('enthält außer dem Endezeichen nie die Werte 1, 2 und 3', () => {
    const payload = Uint8Array.from({length:600}, (_, i) => i % 7 === 0 ? i % 3 : (i * 37) & 0xff);
    const frame = encodeFrame(2, payload);
    expect(frame[frame.length - 1]).toBe(2);
    expect([...body(frame)].filter(b => b >= 1 && b <= 3)).toEqual([]);
  });

  it('packt wieder aus, was verpackt wurde – auch lange Blöcke und Grenzfälle', () => {
    const cases = [
      bytes(), bytes(0), bytes(0, 0, 1, 2, 2), bytes(255, 254, 3, 4),
      new Uint8Array(83).fill(9), new Uint8Array(84).fill(9), new Uint8Array(85).fill(9), new Uint8Array(300).fill(200),
      Uint8Array.from({length:83}, () => 5).fill(0, 82),   // voller Block, der an einer 0 endet
      Uint8Array.from({length:1000}, (_, i) => (i * 131 + (i >> 3)) & 0xff)
    ];
    for (const payload of cases){
      for (const type of [1, 2, 3, 200]){
        expect(decodeFrame(body(encodeFrame(type, payload)))).toEqual({type, payload});
      }
    }
  });

  it('setzt Nachrichten aus beliebig zerteilten Stücken zusammen', () => {
    const stream = [...encodeFrame(InMsg.Event, bytes(1, 72, 105)), ...encodeFrame(InMsg.Response, bytes(4, 0, 0, 0, 0)), 0x02, ...encodeFrame(InMsg.Event, bytes(0, 0, 0, 0, 0))];
    const reader = new FrameReader();
    const msgs = [];
    for (let i = 0; i < stream.length; i += 3) msgs.push(...reader.push(Uint8Array.from(stream.slice(i, i + 3))));
    expect(msgs.map(m => m.type)).toEqual([InMsg.Event, InMsg.Response, InMsg.Event]);
    expect(parseResponse(msgs[1].payload)).toEqual({tag:4, status:0});
    expect(parseReadReply(bytes(1, 0x26, 0x2a, 52, 46))).toEqual({service:1, id:0x2a26, value:bytes(52, 46)});
  });
});

function listen(){
  const log: string[] = [];
  return {log, listener:{
    onStatus:(running: boolean) => { log.push(running ? 'läuft' : 'beendet'); },
    onStdout:(out: string) => { log.push('aus:' + out); },
    onDisconnect:() => { log.push('getrennt'); }
  }};
}
const settle = () => new Promise(r => setTimeout(r, 20));

describe('Hub am USB-Kabel (nachgestellt)', () => {
  it('verbindet, lädt ein Programm, startet, stoppt und trennt', async () => {
    const fake = fakeHub(), {log, listener} = listen();
    const hub = await SerialHub.open(fake.port, listener);
    expect([hub.name, hub.firmware, hub.protocol, hub.via]).toEqual(['robot', '4.1.0b5', '1.7.0', 'USB']);
    expect(fake.state).toMatchObject({opened:true, dtr:true, subscribed:true});

    const program = Uint8Array.from({length:60}, (_, i) => i % 5);   // enthält 0, 1 und 2
    const progress: number[] = [];
    await hub.run(program, f => progress.push(f));
    await settle();

    const sent = fake.state.commands;
    expect(sent[0]).toEqual(writeUserProgramMeta(0));
    expect(sent[sent.length - 2]).toEqual(writeUserProgramMeta(60));
    expect(sent[sent.length - 1]).toEqual(bytes(1, 2));   // Start auf dem Programmplatz aus der Statusmeldung
    const back = new Uint8Array(60);
    for (const c of sent.slice(1, -2)){
      expect(c[0]).toBe(4);
      back.set(c.slice(5), new DataView(c.buffer).getUint32(1, true));
    }
    expect(back).toEqual(program);
    expect(progress[progress.length - 1]).toBe(1);
    expect(hub.isRunning).toBe(true);
    expect(log).toEqual(['läuft', 'aus:Hallo\n']);

    await hub.sendBytes(bytes(150));
    expect(sent[sent.length - 1]).toEqual(bytes(6, 150));
    await hub.stop();
    await settle();
    expect(hub.isRunning).toBe(false);

    hub.disconnect();
    await settle();
    expect(log).toEqual(['läuft', 'aus:Hallo\n', 'beendet', 'getrennt']);
    expect(fake.state).toMatchObject({subscribed:false, closed:true});
    await expect(hub.stop()).rejects.toBeInstanceOf(HubConnectionError);
  });

  // Am echten Hub gemessen (Firmware 4.1.0b5, macOS): Eine Übertragung von 64, 128, 192 … Bytes
  // legt den Empfang des Hubs lahm, bis das Kabel neu gesteckt wird.
  it('schickt nie eine Übertragung, deren Länge ein Vielfaches der USB-Paketgröße ist', async () => {
    const fake = fakeHub({maxWriteSize:512, maxProgramSize:100000}), {listener} = listen();
    const hub = await SerialHub.open(fake.port, listener);
    // jede Programmgröße rund um die kritischen Längen, mit allen Bytewerten
    for (const size of [1, 53, 54, 55, 59, 60, 63, 64, 65, 127, 128, 500, 4096]){
      const program = Uint8Array.from({length:size}, (_, i) => (i * 7 + size) & 0xff);
      fake.state.commands.length = 0;
      await hub.run(program);
      const back = new Uint8Array(size);
      for (const c of fake.state.commands.filter(c => c[0] === 4)) back.set(c.slice(5), new DataView(c.buffer, c.byteOffset).getUint32(1, true));
      expect(back).toEqual(program);
    }
    // ein langer Befehl (viele Zeichen für die Eingabe des Programms) geht in Stücken hinaus
    const long = Uint8Array.from({length:200}, (_, i) => 65 + i % 26);
    await hub.sendBytes(long);
    expect(fake.state.commands[fake.state.commands.length - 1]).toEqual(Uint8Array.from([6, ...long]));
    expect(fake.state.jammed).toBe(false);
    expect(Math.max(...fake.state.writes)).toBeLessThanOrEqual(MAX_PIECE_SIZE);
    expect(fake.state.writes.filter(n => n % 64 === 0)).toEqual([]);
    hub.disconnect();
    await settle();
  });

  it('zerlegt Bytes in Stücke unter einer Paketlänge', () => {
    for (const n of [0, 1, 62, 63, 64, 65, 126, 127, 128, 1000]){
      const data = Uint8Array.from({length:n}, (_, i) => i & 0xff), parts = pieces(data);
      expect(parts.every(p => p.length >= 1 && p.length <= MAX_PIECE_SIZE)).toBe(true);
      expect(Uint8Array.from(parts.flatMap(p => [...p]))).toEqual(data);
    }
    // der längste Befehl, der noch in ein einzelnes Stück passt – auch mit lauter Sonderwerten
    for (const fill of [0, 1, 2, 200]){
      expect(commandFrame(7, new Uint8Array(MAX_COMMAND_SIZE).fill(fill)).length).toBeLessThanOrEqual(MAX_PIECE_SIZE);
    }
  });

  it('meldet verständlich, wenn der Hub nicht antwortet, und gibt die Schnittstelle wieder frei', async () => {
    const fake = fakeHub({silent:true}), {log, listener} = listen();
    await expect(SerialHub.open(fake.port, listener)).rejects.toThrow(/Pybricks-Firmware, die USB kann/);
    expect(fake.state.closed).toBe(true);
    expect(log).toEqual([]);
  });

  it('lehnt eine zu alte Firmware ab', async () => {
    const fake = fakeHub({protocol:'1.5.0'});
    await expect(SerialHub.open(fake.port, listen().listener)).rejects.toThrow(/zu alt/);
    expect(fake.state.closed).toBe(true);
  });

  it('gibt eine Ablehnung des Hubs als Fehler weiter', async () => {
    const fake = fakeHub({rejectCommand:0});
    const hub = await SerialHub.open(fake.port, listen().listener);
    await expect(hub.stop()).rejects.toThrow(/abgelehnt \(Fehler 9\)/);
    hub.disconnect();
  });

  it('bemerkt ein gezogenes Kabel', async () => {
    const fake = fakeHub(), {log, listener} = listen();
    await SerialHub.open(fake.port, listener);
    fake.unplug();
    await settle();
    expect(log).toEqual(['getrennt']);
    expect(fake.state.closed).toBe(true);
  });
});
