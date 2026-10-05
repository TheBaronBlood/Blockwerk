// Für tests/serial.test.ts und tests/tablet.test.ts.
import type { SerialPortLike } from '../../src/hub/serial';
import { FrameReader, InMsg, OutMsg, encodeFrame } from '../../src/hub/serialProtocol';

const bytes = (...b: number[]) => new Uint8Array(b);

// ---------------------------------------------------------------
// Nachgestellter Hub: versteht dieselben Rahmen wie die Firmware (lib/pbio/src/serial.c)
// ---------------------------------------------------------------
export interface FakeOptions { protocol?: string; silent?: boolean; rejectCommand?: number; maxWriteSize?: number; maxProgramSize?: number }

export function fakeHub(opts: FakeOptions = {}){
  const text = (s: string) => new TextEncoder().encode(s);
  const caps = new Uint8Array(11); const cv = new DataView(caps.buffer);
  cv.setUint16(0, opts.maxWriteSize ?? 30, true); cv.setUint32(2, 0b10, true); cv.setUint32(6, opts.maxProgramSize ?? 1000, true); caps[10] = 5;
  const values: Record<string, Uint8Array> = {
    '1:10752':text('robot'), '1:10790':text('4.1.0b5'), '1:10792':text(opts.protocol ?? '1.7.0'), '2:3':caps
  };
  const state = {commands:[] as Uint8Array[], subscribed:false, opened:false, closed:false, dtr:false, running:false,
    writes:[] as number[], jammed:false};
  const frames = new FrameReader();
  let toHost!: ReadableStreamDefaultController<Uint8Array>;
  const send = (type: number, payload: Uint8Array) => {
    // absichtlich in zwei Stücken, wie es am Kabel vorkommt
    const frame = encodeFrame(type, payload), cut = Math.ceil(frame.length / 2);
    toHost.enqueue(frame.slice(0, cut)); toHost.enqueue(frame.slice(cut));
  };
  const status = () => send(InMsg.Event, bytes(0, state.running ? 0x40 : 0, 0, 0, 0, 0, 2));

  const port: SerialPortLike = {
    readable:new ReadableStream<Uint8Array>({start(c){ toHost = c; }}),
    writable:new WritableStream<Uint8Array>({write(chunk){
      if (opts.silent) return;
      // Wie die Firmware 4.1.0b5 am echten Hub: Nach einer Übertragung, deren Länge ein Vielfaches
      // der USB-Paketgröße ist, nimmt der Hub nichts mehr an
      state.writes.push(chunk.length);
      if (chunk.length % 64 === 0) state.jammed = true;
      if (state.jammed) return;
      for (const msg of frames.push(chunk)){
        if (msg.type === OutMsg.Subscribe){ state.subscribed = msg.payload[0] === 1; if (state.subscribed) status(); }
        else if (msg.type === OutMsg.Read){
          const key = `${msg.payload[0]}:${msg.payload[1] | (msg.payload[2] << 8)}`;
          send(InMsg.ReadReply, Uint8Array.from([...msg.payload.subarray(0, 3), ...(values[key] ?? [])]));
        } else if (msg.type === OutMsg.Command){
          const command = msg.payload.slice(1);
          state.commands.push(command);
          const code = command[0] === opts.rejectCommand ? 9 : 0;
          send(InMsg.Response, bytes(msg.payload[0], code, 0, 0, 0));
          if (command[0] === 1 && !code){ state.running = true; status(); send(InMsg.Event, Uint8Array.from([1, ...text('Hallo\n')])); }
          if (command[0] === 0){ state.running = false; status(); }
        }
      }
    }}),
    open:async () => { state.opened = true; },
    close:async () => { state.closed = true; },
    setSignals:async (signals) => { state.dtr = !!signals?.dataTerminalReady; }
  };
  return {port, state, unplug:() => toHost.error(new Error('Kabel gezogen'))};
}
