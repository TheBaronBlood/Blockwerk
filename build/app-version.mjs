// Trägt die Versionsnummer aus package.json in das iOS-Projekt ein (Android liest sie beim
// Bauen selbst, siehe android/app/build.gradle). Läuft von allein bei `npm version …`;
// tests/tablet.test.ts schlägt fehl, wenn die Nummern auseinanderlaufen.
import { readFileSync, writeFileSync } from 'node:fs';

const PROJECT = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [major, minor, patch] = version.split(/[.-]/).map(Number);
// laufende Nummer, an der das System erkennt, welche Fassung neuer ist – wie bei Android
const build = major * 10000 + minor * 100 + patch;

const before = readFileSync(PROJECT, 'utf8');
const after = before
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
if (after !== before) writeFileSync(PROJECT, after);
console.log(`iOS-Projekt: Version ${version} (${build})${after === before ? ' – war schon eingetragen' : ''}`);
