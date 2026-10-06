import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('Hosting (Cloudflare Pages)', () => {
  it('setzt dieselbe Inhaltsrichtlinie wie das Programm am Computer', () => {
    const main = read('electron/main.cjs');
    const block = main.match(/const CSP = \[([\s\S]*?)\]\.join/)![1];
    const parts = [...block.matchAll(/"([^"]+)"/g)].map(m => m[1]);
    const header = read('public/_headers').match(/Content-Security-Policy: (.+)/)![1];
    expect(header).toBe(parts.join('; '));
  });

  it('erlaubt Bluetooth und Kabel für die Seite selbst', () => {
    const h = read('public/_headers');
    expect(h).toMatch(/Permissions-Policy:.*bluetooth=\(self\)/);
    expect(h).toMatch(/Permissions-Policy:.*serial=\(self\)/);
  });
});
