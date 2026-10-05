import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const { FOLDER, hasData, resolveDataDir, scheduleMove, targetFor, readPointer } = createRequire(import.meta.url)('../electron/dataDir.cjs');

/** Legt einen Ordner an, wie Electron ihn hinterlässt: Daten, Zwischenspeicher, Sperrdatei. */
function profile(dir: string, content: string){
  mkdirSync(join(dir, 'Local Storage', 'leveldb'), {recursive:true});
  writeFileSync(join(dir, 'Local Storage', 'leveldb', '000003.log'), content);
  mkdirSync(join(dir, 'Cache'), {recursive:true});
  writeFileSync(join(dir, 'Cache', 'gross'), 'x');
  writeFileSync(join(dir, 'lockfile'), '');
  return dir;
}
const stored = (dir: string) => readFileSync(join(dir, 'Local Storage', 'leveldb', '000003.log'), 'utf8');
function setup(){
  const root = mkdtempSync(join(tmpdir(), 'blockwerk-daten-'));
  return {root, defaultDir:profile(join(root, 'AppData', 'Blockwerk'), 'alt'), programDir:join(root, 'Programm')};
}

describe('Speicherort der Daten', () => {
  it('nimmt ohne weitere Angaben den Standardordner', () => {
    const {defaultDir, programDir} = setup();
    expect(resolveDataDir({defaultDir, programDir})).toEqual({dir:defaultDir, source:'default'});
  });

  it('zieht beim nächsten Start in den gewählten Ordner um – ohne Zwischenspeicher und Sperrdateien', () => {
    const {root, defaultDir, programDir} = setup();
    const target = targetFor(join(root, 'D', 'Schule'));
    expect(target).toBe(join(root, 'D', 'Schule', FOLDER));
    expect(targetFor(target)).toBe(target);   // den Datenordner selbst zu wählen legt keinen zweiten hinein

    scheduleMove({defaultDir, currentDir:defaultDir, target, adopt:false});
    expect(hasData(target)).toBe(false);      // noch nichts kopiert – erst beim Start
    expect(resolveDataDir({defaultDir, programDir})).toEqual({dir:target, source:'custom', problem:undefined});
    expect(stored(target)).toBe('alt');
    expect(existsSync(join(target, 'Cache'))).toBe(false);
    expect(existsSync(join(target, 'lockfile'))).toBe(false);
    expect(existsSync(join(target, 'speicherort.json'))).toBe(false);
    expect(stored(defaultDir)).toBe('alt');   // der alte Ordner bleibt unangetastet

    // beim zweiten Start wird nicht noch einmal kopiert
    writeFileSync(join(target, 'Local Storage', 'leveldb', '000003.log'), 'neu');
    expect(resolveDataDir({defaultDir, programDir}).dir).toBe(target);
    expect(stored(target)).toBe('neu');
    expect(readPointer(defaultDir)).toEqual({dataDir:target});
  });

  it('übernimmt vorhandene Daten im Ziel, wenn das gewünscht ist', () => {
    const {root, defaultDir, programDir} = setup();
    const target = profile(join(root, 'D', FOLDER), 'von früher');
    scheduleMove({defaultDir, currentDir:defaultDir, target, adopt:true});
    expect(resolveDataDir({defaultDir, programDir}).dir).toBe(target);
    expect(stored(target)).toBe('von früher');
  });

  it('kehrt zum Standardordner zurück und nimmt die aktuellen Daten mit', () => {
    const {root, defaultDir, programDir} = setup();
    const custom = profile(join(root, 'D', FOLDER), 'aktuell');
    scheduleMove({defaultDir, currentDir:defaultDir, target:custom, adopt:true});
    resolveDataDir({defaultDir, programDir});

    scheduleMove({defaultDir, currentDir:custom, target:defaultDir, adopt:false});
    expect(resolveDataDir({defaultDir, programDir})).toMatchObject({dir:defaultDir, source:'default'});
    expect(stored(defaultDir)).toBe('aktuell');
    expect(readPointer(defaultDir)).toEqual({});
  });

  it('weicht auf den Standardordner aus, wenn der gewählte nicht erreichbar ist', () => {
    const {root, defaultDir, programDir} = setup();
    const gone = join(root, 'Stick', FOLDER);
    writeFileSync(join(defaultDir, 'speicherort.json'), JSON.stringify({dataDir:gone}));
    expect(resolveDataDir({defaultDir, programDir})).toEqual({dir:defaultDir, source:'default', missing:gone, problem:undefined});
  });

  it('bevorzugt den Ordner neben dem Programm', () => {
    const {root, defaultDir, programDir} = setup();
    const beside = profile(join(programDir, FOLDER), 'auf dem Stick');
    writeFileSync(join(defaultDir, 'speicherort.json'), JSON.stringify({dataDir:join(root, 'woanders')}));
    expect(resolveDataDir({defaultDir, programDir})).toEqual({dir:beside, source:'program'});
    // ohne Programmordner (Entwicklung) gilt die Regel nicht
    expect(resolveDataDir({defaultDir:join(root, 'leer'), programDir:null}).source).toBe('default');
  });

  it('übersteht eine beschädigte Merkdatei', () => {
    const {defaultDir, programDir} = setup();
    writeFileSync(join(defaultDir, 'speicherort.json'), '{kaputt');
    expect(resolveDataDir({defaultDir, programDir})).toEqual({dir:defaultDir, source:'default'});
  });
});
