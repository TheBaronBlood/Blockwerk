// ---------------------------------------------------------------
// Python → MPY (MicroPython-Bytecode v6) mit mpy-cross als WebAssembly
// ---------------------------------------------------------------
import { compile } from '@pybricks/mpy-cross-v6';
import { MAIN_FILE } from './protocol';

export type CompileResult = {ok: true; mpy: Uint8Array} | {ok: false; errors: string[]};

/**
 * @param wasmPath Adresse von `mpy-cross-v6.wasm`; im Browser nötig. Ohne Angabe sucht
 *                 das Paket die Datei neben seinem eigenen Skript.
 * @param fileName Dateiname, der in Fehlermeldungen erscheint.
 */
export async function compileProgram(code: string, wasmPath?: string, fileName = MAIN_FILE): Promise<CompileResult> {
  const res = await compile(fileName, code, undefined, wasmPath);
  if (res.status === 0 && res.mpy) return {ok:true, mpy:res.mpy};
  return {ok:false, errors:res.err.length ? res.err : ['Unbekannter Fehler beim Kompilieren.']};
}
