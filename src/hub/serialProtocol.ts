// ---------------------------------------------------------------
// Pybricks über das USB-Kabel (Profil ab v1.6): Der Hub meldet sich als serielle
// Schnittstelle. Darüber laufen dieselben Befehle und Ereignisse wie über Bluetooth,
// verpackt in Rahmen nach dem COBS-Verfahren der SPIKE-Hubs.
// Quelle: pybricks-micropython v4.1.0b5, lib/pbio/src/cobs.c, lib/pbio/src/serial.c,
// lib/pbio/include/pbio/protocol.h (MIT).
// Dieses Modul kommt ohne Browser-APIs aus und ist vollständig testbar.
// ---------------------------------------------------------------

/** USB-Herstellernummer von LEGO; damit werden die Schnittstellen in der Auswahl gefiltert. */
export const LEGO_USB_VENDOR = 0x0694;

/** Nachrichten vom Computer an den Hub (erstes Byte des Rahmens). */
export const OutMsg = {Subscribe:1, Command:2, Read:3} as const;
/** Nachrichten vom Hub an den Computer. */
export const InMsg = {Response:1, Event:2, ReadReply:3} as const;
/** Woher ein Wert gelesen wird: allgemeine Geräteangaben oder Pybricks-eigene Werte. */
export const ReadService = {Gatt:1, Pybricks:2} as const;
export const DEVICE_NAME_ID = 0x2a00;
export const FIRMWARE_REVISION_ID = 0x2a26;
export const SOFTWARE_REVISION_ID = 0x2a28;
export const HUB_CAPABILITIES_ID = 0x0003;

const DELIMITER = 0x02;       // Ende eines Rahmens
const HIGH_PRIORITY = 0x01;   // möglicher Anfang eines Rahmens; wird beim Lesen übergangen
const XOR = 0x03;
const MAX_DELIMITER = 0x02;   // die Werte 0, 1 und 2 kommen im Rahmen nicht roh vor
const CODE_OFFSET = 2;
const MAX_BLOCK = 84;
const NO_DELIMITER = 0xff;

/**
 * Größe eines USB-Datenpakets des Hubs. Die Firmware 4.1.0b5 verträgt keine Übertragung, deren
 * Länge ein Vielfaches davon ist: Der Rechner schließt sie mit einem leeren Paket ab, und danach
 * nimmt der Hub über das Kabel nichts mehr an, bis man es neu einsteckt (am echten Hub gemessen,
 * macOS; in `Pybricks_Itf_Receive` setzt ein leeres Paket den Empfang nicht wieder in Gang).
 * Deshalb geht alles in Stücken auf die Leitung, die kürzer als ein Paket sind.
 */
export const USB_PACKET_SIZE = 64;
/** Längstes Stück, das sicher ein einzelnes kurzes USB-Paket ergibt. */
export const MAX_PIECE_SIZE = USB_PACKET_SIZE - 1;
/** Längster Befehl, dessen Rahmen in ein solches Stück passt: Codewort, Art, Marke und Endezeichen kommen dazu. */
export const MAX_COMMAND_SIZE = MAX_PIECE_SIZE - 4;

/** Zerlegt Bytes in Stücke, die jeweils kürzer als ein USB-Paket sind. */
export function pieces(data: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += MAX_PIECE_SIZE) out.push(data.subarray(i, i + MAX_PIECE_SIZE));
  return out;
}

export interface SerialMessage { type: number; payload: Uint8Array }

/** Verpackt eine Nachricht (Art plus Inhalt) in einen Rahmen einschließlich Endezeichen. */
export function encodeFrame(type: number, payload: Uint8Array): Uint8Array {
  const out: number[] = [];
  let codeIdx = out.push(NO_DELIMITER) - 1, block = 1;
  for (let i = 0; i <= payload.length; i++){
    const byte = i === 0 ? type : payload[i - 1];
    if (byte > MAX_DELIMITER){ out.push(byte); block++; }
    if (byte <= MAX_DELIMITER || block > MAX_BLOCK){
      // Endet der Block an einem der Werte 0 bis 2, stecken Wert und Blocklänge im Codewort
      if (byte <= MAX_DELIMITER) out[codeIdx] = byte * MAX_BLOCK + block + CODE_OFFSET;
      codeIdx = out.push(NO_DELIMITER) - 1; block = 1;
    }
  }
  out[codeIdx] = block + CODE_OFFSET;
  const frame = new Uint8Array(out.length + 1);
  for (let i = 0; i < out.length; i++) frame[i] = out[i] ^ XOR;
  frame[out.length] = DELIMITER;
  return frame;
}

function unescape(code: number): {value: number | null; block: number} {
  if (code === NO_DELIMITER) return {value:null, block:MAX_BLOCK + 1};
  const offset = (code - CODE_OFFSET) & 0xff;
  let value = Math.floor(offset / MAX_BLOCK), block = offset % MAX_BLOCK;
  if (block === 0){ block = MAX_BLOCK; value -= 1; }
  return {value, block};
}

/** Packt einen Rahmen aus (ohne Endezeichen). Liefert null, wenn er leer oder beschädigt ist. */
export function decodeFrame(frame: Uint8Array): SerialMessage | null {
  let i = frame.length > 0 && frame[0] === HIGH_PRIORITY ? 1 : 0;
  if (i >= frame.length) return null;
  const out: number[] = [];
  let cur = unescape(frame[i++] ^ XOR);
  while (i < frame.length){
    const byte = frame[i++] ^ XOR;
    if (--cur.block > 0){ out.push(byte); continue; }
    if (cur.value !== null) out.push(cur.value);
    cur = unescape(byte);
  }
  if (!out.length) return null;
  return {type:out[0], payload:Uint8Array.from(out.slice(1))};
}

/** Setzt aus dem Bytestrom der Schnittstelle Nachrichten zusammen; die Stücke kommen beliebig zerteilt an. */
export class FrameReader {
  private buf: number[] = [];
  push(chunk: Uint8Array): SerialMessage[] {
    const msgs: SerialMessage[] = [];
    for (const byte of chunk){
      if (byte !== DELIMITER){ this.buf.push(byte); continue; }
      const msg = decodeFrame(Uint8Array.from(this.buf));
      this.buf = [];
      if (msg) msgs.push(msg);
    }
    return msgs;
  }
}

/** Ereignisse (Status, Terminalausgabe) abonnieren oder abbestellen. */
export const subscribeFrame = (on: boolean) => encodeFrame(OutMsg.Subscribe, new Uint8Array([on ? 1 : 0]));
/** Ein Pybricks-Befehl; die Marke schickt der Hub in seiner Antwort zurück. */
export function commandFrame(tag: number, command: Uint8Array){
  const payload = new Uint8Array(1 + command.length);
  payload[0] = tag; payload.set(command, 1);
  return encodeFrame(OutMsg.Command, payload);
}
/** Bittet den Hub um einen Wert, zum Beispiel die Firmwareversion. */
export const readFrame = (service: number, id: number) => encodeFrame(OutMsg.Read, new Uint8Array([service, id & 0xff, id >> 8]));

/** Antwort auf einen Befehl: Marke und Fehlernummer (0 = in Ordnung). */
export function parseResponse(payload: Uint8Array): {tag: number; status: number} | null {
  if (payload.length < 5) return null;
  return {tag:payload[0], status:new DataView(payload.buffer, payload.byteOffset).getUint32(1, true)};
}
/** Antwort auf eine Leseanfrage; ein leerer Wert heißt: Der Hub kennt diese Angabe nicht. */
export function parseReadReply(payload: Uint8Array): {service: number; id: number; value: Uint8Array} | null {
  if (payload.length < 3) return null;
  return {service:payload[0], id:payload[1] | (payload[2] << 8), value:payload.subarray(3)};
}
