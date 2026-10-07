import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readSoundConfig, SOUND_EVENTS } from '../src/sound';

const dir = join(__dirname, '..', 'public', 'klang');

describe('Klänge', () => {
  it('liest je Anlass Datei und Lautstärke und lässt Unsinn weg', () => {
    expect(readSoundConfig({start:{datei:'plopp.wav', lautstaerke:0.3}, stopp:{datei:'', lautstaerke:0.2}, fehler:{datei:'x.ogg'}, unbekannt:{datei:'a.wav'}}))
      .toEqual({start:{file:'plopp.wav', volume:0.3}, fehler:{file:'x.ogg', volume:0.25}});
    // zu laut oder negativ wird begrenzt
    expect(readSoundConfig({start:{datei:'a.mp3', lautstaerke:7}, stopp:{datei:'b.mp3', lautstaerke:-1}})).toEqual({start:{file:'a.mp3', volume:1}, stopp:{file:'b.mp3', volume:0}});
    expect(readSoundConfig(null)).toEqual({});
  });
  it('nimmt nur Dateien aus dem Klang-Ordner', () => {
    for (const datei of ['../geheim.wav', 'ordner/a.wav', 'C:\\a.wav', 'https://example.com/a.mp3', 'a.exe', '.wav'])
      expect(readSoundConfig({start:{datei, lautstaerke:0.2}}), datei).toEqual({});
  });
  it('klang.json nennt alle Anlässe, und die eingetragenen Dateien liegen bei', () => {
    const raw = JSON.parse(readFileSync(join(dir, 'klang.json'), 'utf8'));
    for (const event of SOUND_EVENTS) expect(raw[event], event).toBeTypeOf('object');
    const config = readSoundConfig(raw);
    expect(Object.keys(config)).toEqual(expect.arrayContaining(['zusammenstecken', 'loeschen']));
    for (const choice of Object.values(config)) expect(existsSync(join(dir, choice.file)), choice.file).toBe(true);
  });
});
