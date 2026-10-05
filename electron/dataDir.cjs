// ---------------------------------------------------------------
// Speicherort der Daten (gespeichertes Programm, Erweiterungen, Einstellungen).
// Reihenfolge beim Start:
//   1. Ordner »Blockwerk-Daten« neben dem Programm – dann wandert alles mit, zum Beispiel
//      auf einem USB-Stick.
//   2. Ein in den Einstellungen gewählter Ordner; vermerkt in »speicherort.json« im
//      Standardordner.
//   3. Der Standardordner des Betriebssystems.
// Ein Umzug wird nur vorgemerkt und beim nächsten Start ausgeführt: Erst dann greift das
// Programm nicht mehr auf die alten Dateien zu.
// Ohne Electron – so lässt sich das Modul testen.
// ---------------------------------------------------------------
const fs = require('node:fs');
const path = require('node:path');

const FOLDER = 'Blockwerk-Daten';
const POINTER = 'speicherort.json';
// Sperrdateien und Zwischenspeicher ziehen nicht mit um; sie entstehen von selbst neu
const SKIP = /^(lockfile|LOCK|Singleton\w+|Cache|Code Cache|GPUCache|Dawn\w*Cache|Crashpad|blob_storage|speicherort\.json)$/;

const pointerFile = (defaultDir) => path.join(defaultDir, POINTER);
/** Ob in dem Ordner schon Daten von Blockwerk liegen. */
const hasData = (dir) => fs.existsSync(path.join(dir, 'Local Storage'));

function readPointer(defaultDir){
  try { const p = JSON.parse(fs.readFileSync(pointerFile(defaultDir), 'utf8')); return p && typeof p === 'object' ? p : {}; }
  catch { return {}; }
}
function writePointer(defaultDir, data){
  if (!data){ fs.rmSync(pointerFile(defaultDir), {force:true}); return; }
  fs.mkdirSync(defaultDir, {recursive:true});
  fs.writeFileSync(pointerFile(defaultDir), JSON.stringify(data, null, 1));
}
function copyData(from, to){
  fs.mkdirSync(to, {recursive:true});
  fs.cpSync(from, to, {recursive:true, force:true, filter:(src) => src === from || !SKIP.test(path.basename(src))});
}

/**
 * Bestimmt beim Start den Ordner und führt einen vorgemerkten Umzug aus.
 * @returns {{dir: string, source: 'program'|'custom'|'default', missing?: string, problem?: string}}
 */
function resolveDataDir({defaultDir, programDir}){
  const beside = programDir ? path.join(programDir, FOLDER) : null;
  if (beside && fs.existsSync(beside)) return {dir:beside, source:'program'};

  const pointer = readPointer(defaultDir);
  if (typeof pointer.dataDir !== 'string') return {dir:defaultDir, source:'default'};
  let problem;
  if (typeof pointer.copyFrom === 'string'){
    try { if (fs.existsSync(pointer.copyFrom) && pointer.copyFrom !== pointer.dataDir) copyData(pointer.copyFrom, pointer.dataDir); }
    catch (err){ problem = String(err && err.message || err); }
    // der Umzug ist erledigt (oder gescheitert) – nicht bei jedem Start wiederholen
    try { writePointer(defaultDir, pointer.dataDir === defaultDir ? null : {dataDir:pointer.dataDir}); } catch { /* dann eben beim nächsten Mal */ }
  }
  if (pointer.dataDir === defaultDir){
    try { writePointer(defaultDir, null); } catch { /* stört nicht */ }
    return {dir:defaultDir, source:'default', problem};
  }
  // zum Beispiel ein Laufwerk, das gerade nicht angeschlossen ist
  if (!fs.existsSync(pointer.dataDir)) return {dir:defaultDir, source:'default', missing:pointer.dataDir, problem};
  return {dir:pointer.dataDir, source:'custom', problem};
}

/** Der Ordner, der entsteht, wenn jemand `chosen` auswählt: immer ein eigener Unterordner. */
const targetFor = (chosen) => path.basename(chosen) === FOLDER ? chosen : path.join(chosen, FOLDER);

/**
 * Merkt einen Umzug vor. `adopt`: Im Ziel liegen schon Daten, und die sollen gelten –
 * dann wird nichts kopiert.
 */
function scheduleMove({defaultDir, currentDir, target, adopt}){
  fs.mkdirSync(target, {recursive:true});
  fs.accessSync(target, fs.constants.W_OK);
  writePointer(defaultDir, adopt ? {dataDir:target} : {dataDir:target, copyFrom:currentDir});
}

module.exports = {FOLDER, hasData, resolveDataDir, scheduleMove, targetFor, readPointer};
