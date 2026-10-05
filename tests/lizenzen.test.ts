import { describe, expect, it } from 'vitest';
import { globSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { licenseText, ownLicense, packageLicense, packageOf, SHELLS } from '../build/lizenzen.mjs';

const ROOT = join(__dirname, '..');

describe('Lizenzen der eingebauten Software', () => {
  it('erkennt das Paket am Pfad eines Moduls', () => {
    expect(packageOf('/x/blockwerk/node_modules/blockly/index.mjs')).toBe('blockly');
    expect(packageOf('/x/blockwerk/node_modules/@capacitor/core/dist/index.js')).toBe('@capacitor/core');
    expect(packageOf('C:\\x\\node_modules\\@pybricks\\mpy-cross-v6\\build\\mpy-cross-v6.wasm?url')).toBe('@pybricks/mpy-cross-v6');
    // ein Paket im Paket: das innere zählt
    expect(packageOf('/x/node_modules/a/node_modules/@b/c/index.js')).toBe('@b/c');
    expect(packageOf('\0/x/node_modules/fflate/esm/browser.js')).toBe('fflate');
    expect(packageOf('/x/blockwerk/src/main.ts')).toBeNull();
    expect(packageOf('\0vite/preload-helper.js')).toBeNull();
  });

  // Was die Seite zur Laufzeit einbindet, steht in package.json – jedes davon braucht einen Lizenztext
  const runtime = ['blockly', 'fflate', '@pybricks/mpy-cross-v6', '@fontsource/atkinson-hyperlegible', '@fontsource/jetbrains-mono',
    '@capacitor/core', '@capacitor-community/bluetooth-le', '@capacitor/filesystem', '@capacitor/share'];

  it('findet zu jedem eingebauten Paket und jeder Hülle einen Lizenztext', () => {
    for (const name of [...runtime, ...SHELLS]){
      const p = packageLicense(ROOT, name);
      expect(p.text.length, name).toBeGreaterThan(300);
      expect(p.version, name).toMatch(/^\d+\./);
    }
  });

  it('Blockwerk selbst steht unter der MIT-Lizenz – Datei und Paketangabe stimmen überein', () => {
    const own = ownLicense(ROOT);
    expect(own.license).toBe('MIT');
    expect(own.text.startsWith('MIT License')).toBe(true);
    expect(own.text).toMatch(/Copyright \(c\) \d{4} \S+/);
  });

  it('meldet ein Paket ohne Lizenzdatei, statt es stillschweigend wegzulassen', () => {
    expect(() => packageLicense(ROOT, 'gibt-es-nicht')).toThrow('nicht installiert');
  });

  it('schreibt alle Texte in eine Datei – die Hüllen sind immer dabei', () => {
    const text = licenseText(ROOT, ['blockly', 'fflate', 'blockly']);
    expect(text.startsWith('Blockwerk – Lizenzen')).toBe(true);
    // die eigene Lizenz steht vorn
    expect(text.indexOf('Blockwerk ' + ownLicense(ROOT).version + ' – MIT')).toBeGreaterThan(0);
    expect(text.indexOf('Blockwerk ' + ownLicense(ROOT).version)).toBeLessThan(text.indexOf('blockly '));
    for (const title of ['blockly ', 'fflate ', 'electron ', '@capacitor/android ', '@capacitor/ios ', 'usb-serial-for-android'])
      expect(text.split('\n').filter(l => l.startsWith(title)), title).toHaveLength(1);
    expect(text).toContain('Apache License');
    expect(text).toContain('Permission is hereby granted');
  });

  it('alle Pakete, die src/ von außen einbindet, sind in der Prüfliste', () => {
    // hält die Liste oben ehrlich: ein neues Laufzeitpaket fällt hier auf
    const used = new Set<string>();
    for (const file of globSync('src/**/*.ts', {cwd:ROOT})){
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const m of source.matchAll(/(?:from|import)\s*\(?\s*['"]((?:@[\w.-]+\/)?[\w.-]+)[^'"]*['"]/g)) if (!m[1].startsWith('.')) used.add(m[1]);
    }
    expect(used.has('blockly') && used.has('@capacitor/core') && used.has('fflate')).toBe(true);
    expect([...used].filter(name => !runtime.includes(name)).sort()).toEqual([]);
  });
});
