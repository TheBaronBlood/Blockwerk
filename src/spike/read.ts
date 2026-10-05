// ---------------------------------------------------------------
// SPIKE-Projektdatei lesen: .llsp3 / .llsp ist ein ZIP mit manifest.json und
// scratch.sb3; scratch.sb3 ist wieder ein ZIP mit project.json (Scratch 3).
// ---------------------------------------------------------------
import { strFromU8, unzipSync, type UnzipFileInfo } from 'fflate';
import { convertSpike, type ImportResult, type ScratchProject } from './convert';

export class SpikeFileError extends Error {}

/** ZIP-Dateien beginnen mit »PK«. */
export const isZip = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b;

export interface SpikeImport extends ImportResult { name: string }

// Obergrenzen für das, was ausgepackt wird. Ein ZIP kann aus wenigen Bytes Gigabytes machen
// (»Zip-Bombe«) – das fröre die Seite ein. Echte Projekte sind einige Kilobyte groß; Klänge und
// Bilder im Projekt packt Blockwerk gar nicht erst aus.
const MB = 1024 * 1024;
const LIMITS: Record<string, number> = {'manifest.json':MB, 'scratch.sb3':64 * MB, 'project.json':16 * MB};

/**
 * Packt nur die genannten Einträge aus; ist einer davon größer als erlaubt, gilt die Datei als zu
 * groß. Ausgepackt wird ausschließlich, wofür es eine Obergrenze gibt. `seen` nennt alle Einträge
 * des Archivs – um zu wissen, ob es einen gibt, muss man ihn nicht auspacken.
 */
function unzipOnly(bytes: Uint8Array, names: string[]): {files: Record<string, Uint8Array>; seen: Set<string>} {
  let tooBig = false;
  const seen = new Set<string>();
  const filter = (file: UnzipFileInfo) => {
    seen.add(file.name);
    const limit = Object.prototype.hasOwnProperty.call(LIMITS, file.name) ? LIMITS[file.name] : undefined;
    if (!names.includes(file.name) || limit === undefined) return false;
    if (file.originalSize > limit){ tooBig = true; return false; }
    return true;
  };
  const files = unzipSync(bytes, {filter});
  if (tooBig) throw new SpikeFileError('Das SPIKE-Projekt ist zu groß für Blockwerk.');
  return {files, seen};
}

export function importSpikeFile(bytes: Uint8Array): SpikeImport {
  let outer: Record<string, Uint8Array>, entries: Set<string>;
  try { ({files:outer, seen:entries} = unzipOnly(bytes, ['manifest.json', 'scratch.sb3'])); }
  catch (err){ throw err instanceof SpikeFileError ? err : new SpikeFileError('Die Datei ist kein SPIKE-Projekt.'); }
  if (!outer['scratch.sb3']){
    // (projectbody.json wird nur am Namen erkannt, nicht ausgepackt)
    if (entries.has('projectbody.json')) throw new SpikeFileError('Das ist ein Python-Projekt der SPIKE-App. Blockwerk öffnet nur Wortblock-Projekte.');
    throw new SpikeFileError('Die Datei ist kein SPIKE-Projekt mit Wortblöcken.');
  }
  let manifest: {name?: string; type?: string} = {};
  try { manifest = JSON.parse(strFromU8(outer['manifest.json'])); } catch { /* der Name ist nicht wichtig */ }
  if (manifest.type && manifest.type !== 'word-blocks') throw new SpikeFileError('Blockwerk öffnet nur Wortblock-Projekte, keine Symbolblöcke.');
  let project: ScratchProject;
  try { project = JSON.parse(strFromU8(unzipOnly(outer['scratch.sb3'], ['project.json']).files['project.json'])); }
  catch (err){ throw err instanceof SpikeFileError ? err : new SpikeFileError('Der Inhalt des SPIKE-Projekts lässt sich nicht lesen.'); }
  return {name: manifest.name ?? 'SPIKE-Projekt', ...convertSpike(project)};
}
