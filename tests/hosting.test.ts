import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('Hosting (Cloudflare)', () => {
  it('setzt dieselbe Inhaltsrichtlinie wie das Programm am Computer', () => {
    const main = read('electron/main.cjs');
    const block = main.match(/const CSP = \[([\s\S]*?)\]\.join/)![1];
    const parts = [...block.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const header = read('public/_headers').match(/Content-Security-Policy: (.+)/)![1];
    expect(header).toBe(parts.join('; '));
  });

  it('lädt den fertigen Build hoch, unter dem Namen des Projekts', () => {
    // wrangler.jsonc darf Kommentare enthalten
    const config = JSON.parse(read('wrangler.jsonc').replace(/^\s*\/\/.*$/gm, ''));
    expect(config.assets.directory).toBe('./dist');
    expect(config.name).toBe(JSON.parse(read('package.json')).name);
    // nur Dateien: Ein eigenes Skript bräuchte die Inhaltsrichtlinie nicht mehr aus _headers
    expect(config.main).toBeUndefined();
  });

  it('erlaubt Bluetooth und Kabel für die Seite selbst', () => {
    const h = read('public/_headers');
    expect(h).toMatch(/Permissions-Policy:.*bluetooth=\(self\)/);
    expect(h).toMatch(/Permissions-Policy:.*serial=\(self\)/);
  });
});
