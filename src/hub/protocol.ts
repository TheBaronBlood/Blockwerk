// ---------------------------------------------------------------
// Pybricks-BLE-Profil (v1.2 bis v1.5): Befehle, Ereignisse, Programmformat
// Quelle: pybricks-code, src/ble-pybricks-service/protocol.ts (MIT)
// Dieses Modul kommt ohne Browser-APIs aus und ist vollständig testbar.
// ---------------------------------------------------------------
export const PYBRICKS_SERVICE = 'c5f50001-8280-46da-89f4-6d8051e4aeef';
export const PYBRICKS_COMMAND_EVENT_CHAR = 'c5f50002-8280-46da-89f4-6d8051e4aeef';
export const PYBRICKS_HUB_CAPABILITIES_CHAR = 'c5f50003-8280-46da-89f4-6d8051e4aeef';
export const DEVICE_INFO_SERVICE = 0x180a;
export const FIRMWARE_REVISION_CHAR = 0x2a26;
export const SOFTWARE_REVISION_CHAR = 0x2a28;

export const Command = {StopUserProgram:0, StartUserProgram:1, WriteUserProgramMeta:3, WriteUserRam:4, WriteStdin:6} as const;
export const HubEvent = {StatusReport:0, WriteStdout:1} as const;
/** Bit in den Statusflags: Benutzerprogramm läuft. */
const STATUS_USER_PROGRAM_RUNNING = 1 << 6;
/** Bit in den Fähigkeiten: Hub versteht das Multi-MPY-Format (MPY v6). */
const CAPABILITY_MULTI_MPY6 = 1 << 1;

/** Name des Hauptmoduls; der Dateiname erscheint so auch in Fehlermeldungen des Hubs. */
export const MAIN_MODULE = '__main__';
export const MAIN_FILE = MAIN_MODULE + '.py';

export interface HubCapabilities { maxWriteSize: number; multiMpy6: boolean; maxUserProgramSize: number }
export interface HubStatus { running: boolean; selectedSlot: number }

/** Vergleicht zwei Versionen der Form »1.4.0«; liefert true, wenn version >= min. */
export function versionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map(n => parseInt(n, 10) || 0), b = min.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++){ if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0); }
  return true;
}

export const stopUserProgram = () => new Uint8Array([Command.StopUserProgram]);
/** Ab Profil v1.4 gehört die Nummer des Programmplatzes dazu, davor besteht der Befehl aus einem Byte. */
export function startUserProgram(protocol: string, slot = 0){
  return versionAtLeast(protocol, '1.4.0') ? new Uint8Array([Command.StartUserProgram, slot]) : new Uint8Array([Command.StartUserProgram]);
}
export function writeUserProgramMeta(size: number){
  const msg = new Uint8Array(5); const view = new DataView(msg.buffer);
  view.setUint8(0, Command.WriteUserProgramMeta); view.setUint32(1, size, true);
  return msg;
}
export function writeUserRam(offset: number, payload: Uint8Array){
  const msg = new Uint8Array(5 + payload.length); const view = new DataView(msg.buffer);
  view.setUint8(0, Command.WriteUserRam); view.setUint32(1, offset, true); msg.set(payload, 5);
  return msg;
}
export function writeStdin(payload: Uint8Array){
  const msg = new Uint8Array(1 + payload.length);
  msg[0] = Command.WriteStdin; msg.set(payload, 1);
  return msg;
}

export function parseCapabilities(v: DataView): HubCapabilities {
  return {maxWriteSize:v.getUint16(0, true), multiMpy6:(v.getUint32(2, true) & CAPABILITY_MULTI_MPY6) !== 0, maxUserProgramSize:v.getUint32(6, true)};
}
export function parseStatus(v: DataView): HubStatus {
  return {running:(v.getUint32(1, true) & STATUS_USER_PROGRAM_RUNNING) !== 0, selectedSlot:v.byteLength > 6 ? v.getUint8(6) : 0};
}

/** Verpackt ein kompiliertes Modul im Multi-MPY-Format: Größe (uint32 LE), Modulname mit Nullbyte, MPY-Daten. */
export function encodeProgram(mpy: Uint8Array, moduleName = MAIN_MODULE): Uint8Array {
  const name = new TextEncoder().encode(moduleName + '\x00');
  const out = new Uint8Array(4 + name.length + mpy.length);
  new DataView(out.buffer).setUint32(0, mpy.length, true);
  out.set(name, 4); out.set(mpy, 4 + name.length);
  return out;
}

/** Mehrere Module hintereinander; der Hub startet das erste, die übrigen lassen sich importieren. */
export function encodeModules(modules: {name: string; mpy: Uint8Array}[]): Uint8Array {
  const parts = modules.map(m => encodeProgram(m.mpy, m.name));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts){ out.set(p, at); at += p.length; }
  return out;
}

export class ProgramTooLargeError extends Error {
  constructor(public actual: number, public max: number){ super(`Programm zu groß: ${actual} von ${max} Bytes`); }
}

/**
 * Überträgt ein Programm in den Speicher des Hubs.
 * Ablauf wie in Pybricks Code: Größe 0 schreiben (altes Programm ungültig machen),
 * Daten blockweise ins RAM, zum Schluss die echte Größe.
 */
export async function uploadProgram(write: (msg: Uint8Array) => Promise<void>, program: Uint8Array, caps: HubCapabilities,
                                    onProgress: (fraction: number) => void = () => {}){
  if (program.length > caps.maxUserProgramSize) throw new ProgramTooLargeError(program.length, caps.maxUserProgramSize);
  const chunkSize = caps.maxWriteSize - 5;
  if (chunkSize < 1) throw new Error('Der Hub meldet eine ungültige Paketgröße.');
  await write(writeUserProgramMeta(0));
  for (let i = 0; i < program.length; i += chunkSize){
    onProgress(i / program.length);
    await write(writeUserRam(i, program.subarray(i, i + chunkSize)));
  }
  onProgress(1);
  await write(writeUserProgramMeta(program.length));
}
