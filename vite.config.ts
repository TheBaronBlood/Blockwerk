import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { licenses } from './build/lizenzen.mjs';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// Versionen der eingebauten Pakete, wie sie wirklich installiert sind – für das Fenster »Über Blockwerk«
const installed = (name: string): string =>
  JSON.parse(readFileSync(new URL(`./node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;

export default defineConfig({
  // Versionsnummer aus package.json für die Anzeige in der Kopfleiste
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __VERSIONS__: JSON.stringify({app:version, blockly:installed('blockly'), mpyCross:installed('@pybricks/mpy-cross-v6'), electron:installed('electron')})
  },
  // relative Pfade, damit der Build aus jedem Unterordner (z. B. Schulserver) läuft
  base: './',
  build: { chunkSizeWarningLimit: 1500 },
  // lizenzen.txt: die Lizenztexte aller Pakete, die im Build stecken (Fenster »Über Blockwerk«)
  plugins: [licenses(fileURLToPath(new URL('.', import.meta.url)))],
  // feste Ports, damit die Startkonfiguration in .vscode/launch.json die Seite findet
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] }
});
