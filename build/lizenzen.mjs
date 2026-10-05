// Sammelt die Lizenztexte der Software, die in Blockwerk steckt, in eine Datei (lizenzen.txt).
// MIT, Apache-2.0 und die Schriftlizenz OFL verlangen, dass ihr Text mit ausgeliefert wird.
// Welche Pakete im Skript der Seite stecken, liest das Vite-Plugin aus dem fertigen Bündel –
// die Liste kann also nicht veralten. Dazu kommen die Hüllen (Electron, Capacitor), die nicht
// im Skript stecken, aber mit dem Programm und den Apps ausgeliefert werden.
// Benutzt von vite.config.ts; die Funktionen prüft tests/lizenzen.test.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Hüllen und native Teile: nicht im Skript der Seite, aber in Programm und Apps. */
export const SHELLS = ['electron', '@capacitor/android', '@capacitor/ios'];

/** Paketname aus dem Pfad eines Moduls; null für eigenen Code. */
export function packageOf(id) {
  const path = id.replace(/\\/g, '/').replace(/^\0/, '').split('?')[0];
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const parts = path.slice(at + '/node_modules/'.length).split('/');
  if (!parts[0]) return null;
  return parts[0].startsWith('@') ? (parts[1] ? `${parts[0]}/${parts[1]}` : null) : parts[0];
}

/** Name, Fassung, Lizenz und Lizenztext eines installierten Pakets. Ohne Lizenzdatei ein Fehler. */
export function packageLicense(root, name) {
  const dir = join(root, 'node_modules', name);
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`Paket nicht installiert: ${name}`);
  const info = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find((f) => /^(licen[sc]e|copying)(\.|-|$)/i.test(f));
  if (!file) throw new Error(`Paket ohne Lizenzdatei: ${name} – so darf es nicht ausgeliefert werden.`);
  return {
    name,
    version: String(info.version ?? ''),
    license: typeof info.license === 'string' ? info.license : '',
    text: readFileSync(join(dir, file), 'utf8').replace(/\r\n?/g, '\n').trim()
  };
}

// kurz genug, dass die Linie im Fenster »Über Blockwerk« nicht umbricht
const RULE = '-'.repeat(56);
const entry = (title, text) => `${RULE}\n${title}\n${RULE}\n\n${text}\n`;

// usb-serial-for-android kommt über Gradle, nicht über npm – sein Text steht deshalb hier
// (Quelle: LICENSE.txt des Projekts, https://github.com/mik3y/usb-serial-for-android).
const USB_SERIAL = `MIT License

Copyright (c) 2011-2013 Google Inc.
Copyright (c) 2013 Mike Wakerly

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

// Absätze ohne feste Zeilenumbrüche – das Fenster bricht selbst um
const PLATFORMS = [
  'Programm für den Computer: Electron bringt Chromium und weitere Bibliotheken mit. Deren Lizenztexte liegen dem Programm in der Datei LICENSES.chromium.html bei – unter Windows und Linux im Programmordner, unter macOS im Programmpaket (Contents/Resources).',
  'App für Android: enthält außerdem die AndroidX-Bibliotheken und die Kotlin-Laufzeit (Apache License 2.0 – der Text steht oben bei Blockly) sowie die Dateisystem-Bibliothek von Ionic (MIT).',
  'App für iPadOS: enthält außerdem die Dateisystem-Bibliothek von Ionic (MIT).',
  'LEGO und SPIKE sind Marken der LEGO Gruppe. Blockwerk ist kein Produkt von LEGO oder Pybricks und wird von beiden weder unterstützt noch geprüft.'
].join('\n\n');

/** Blockwerks eigene Lizenz: die Datei LICENSE im Projekt. */
export function ownLicense(root) {
  const info = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  return { name: 'Blockwerk', version: String(info.version), license: String(info.license ?? ''), text: readFileSync(join(root, 'LICENSE'), 'utf8').replace(/\r\n?/g, '\n').trim() };
}

/** Der Inhalt von lizenzen.txt für die genannten Pakete (dazu kommen immer die Hüllen). */
export function licenseText(root, names) {
  const own = ownLicense(root);
  const all = [...new Set([...names, ...SHELLS])].sort((a, b) => a.replace(/^@/, '').localeCompare(b.replace(/^@/, '')));
  const parts = all.map((name) => {
    const p = packageLicense(root, name);
    return entry(`${p.name} ${p.version}${p.license ? ` – ${p.license}` : ''}`, p.text);
  });
  return [
    'Blockwerk – Lizenzen\n',
    'Blockwerk ist freie Software. Zuerst steht hier seine eigene Lizenz, danach folgen die Lizenzen der Software anderer, die in Blockwerk steckt – sie verlangen, dass ihre Texte mit ausgeliefert werden.\n',
    entry(`${own.name} ${own.version} – ${own.license}`, own.text),
    ...parts,
    entry('usb-serial-for-android – MIT (nur in der App für Android)', USB_SERIAL),
    entry('Weitere Bestandteile der Plattformen', PLATFORMS)
  ].join('\n');
}

/** Vite-Plugin: schreibt lizenzen.txt neben die Seite. */
export function licenses(root) {
  return {
    name: 'blockwerk-lizenzen',
    apply: 'build',
    generateBundle(_options, bundle) {
      const names = new Set();
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of chunk.moduleIds) { const name = packageOf(id); if (name) names.add(name); }
      }
      this.emitFile({ type: 'asset', fileName: 'lizenzen.txt', source: licenseText(root, [...names]) });
    }
  };
}
