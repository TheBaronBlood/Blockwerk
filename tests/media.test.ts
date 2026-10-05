import { describe, expect, it } from 'vitest';
import { globSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Blockly holt Mauszeiger und Symbole von static.blockly.com, wenn man ihm keinen eigenen Ordner
// nennt. Blockwerk liefert sie deshalb selbst mit (public/blockly-media) – diese Tests halten die
// Kopie aktuell und verhindern, dass eine Arbeitsfläche ohne den Ordner entsteht.
const ROOT = join(__dirname, '..');
const SOURCE = join(ROOT, 'node_modules', 'blockly', 'media'), COPY = join(ROOT, 'public', 'blockly-media');

describe('Blocklys Mediendateien', () => {
  it('liegen vollständig und unverändert neben der Seite (nach einem Blockly-Update neu kopieren)', () => {
    // Klänge braucht Blockwerk nicht (sounds:false)
    const wanted = readdirSync(SOURCE).filter(f => !f.endsWith('.mp3')).sort();
    expect(readdirSync(COPY).sort()).toEqual(wanted);
    for (const f of wanted) expect(readFileSync(join(COPY, f)).equals(readFileSync(join(SOURCE, f))), f).toBe(true);
  });

  it('jede Arbeitsfläche benutzt den eigenen Ordner', () => {
    const injects = globSync('src/**/*.ts', {cwd:ROOT}).flatMap((file) => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      return [...source.matchAll(/Blockly\.inject\([\s\S]*?\}\);/g)].map(m => ({file, call:m[0]}));
    });
    expect(injects.length).toBeGreaterThanOrEqual(3);
    for (const {file, call} of injects) expect(call, file).toContain('media:BLOCKLY_MEDIA');
  });
});
