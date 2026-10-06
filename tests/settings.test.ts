import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULTS, sanitize } from '../src/settings';
import { Hub } from '../src/hub/hub';
import { TestHub } from '../src/hub/testHub';
import { encodeModules } from '../src/hub/protocol';

describe('Einstellungen', () => {
  it('nimmt gültige Werte und ersetzt alles andere durch die Vorgabe', () => {
    expect(sanitize(null)).toEqual(DEFAULTS);
    expect(sanitize('kaputt')).toEqual(DEFAULTS);
    expect(sanitize({theme:'dark', zoom:120, codeSize:16, uiFont:'system', codeFont:'system', sounds:false, extensions:true, dev:true, devTrace:true, devTestHub:true, leader:true}))
      .toEqual({theme:'dark', zoom:120, codeSize:16, uiFont:'system', codeFont:'system', sounds:false, extensions:true, dev:true, devTrace:true, devTestHub:true, leader:true});
    expect(sanitize({theme:'pink', zoom:900, codeSize:'groß', uiFont:42, extensions:'ja', fremd:1}))
      .toEqual(DEFAULTS);
    // installierte Schriften sind erlaubt – Namen, die in CSS Schaden anrichten könnten, nicht
    expect(sanitize({uiFont:'Segoe UI Variable', codeFont:'Cascadia Code'})).toMatchObject({uiFont:'Segoe UI Variable', codeFont:'Cascadia Code'});
    expect(sanitize({uiFont:'x";}body{display:none', codeFont:'a\\b'})).toMatchObject({uiFont:DEFAULTS.uiFont, codeFont:DEFAULTS.codeFont});
  });

  it('zeigt Erweiterungen und Entwickleroptionen erst nach dem Einschalten', () => {
    expect(DEFAULTS).toMatchObject({sounds:true, extensions:false, dev:false, devTrace:false, devTestHub:false, leader:false, theme:'system'});
  });
});

describe('Test-Hub', () => {
  afterEach(() => { Hub.trace = null; });

  it('nimmt ein Programm entgegen und meldet, was angekommen ist', async () => {
    const log: string[] = [], traced: string[] = [];
    Hub.trace = (direction, bytes) => traced.push(direction + bytes[0]);
    const hub = await TestHub.connect({
      onStatus:(running) => { log.push(running ? 'läuft' : 'beendet'); },
      onStdout:(text) => { log.push(text); },
      onDisconnect:() => { log.push('getrennt'); }
    });
    const program = encodeModules([{name:'__main__', mpy:new Uint8Array(300).fill(7)}, {name:'pid', mpy:new Uint8Array(20)}]);
    await hub.run(program);
    expect(hub.isRunning).toBe(true);
    expect(log[0]).toBe('läuft');
    expect(log[1]).toContain('vollständig angekommen: __main__ (300 Bytes), pid (20 Bytes)');

    await hub.stop();
    expect(hub.isRunning).toBe(false);
    hub.disconnect();
    expect(log.slice(2)).toEqual(['beendet', 'getrennt']);
    await expect(hub.stop()).rejects.toThrow();

    // das Protokoll zeigt Befehle (→) und Ereignisse (←): Größe 0, Daten, Größe, Start, Status, Ausgabe …
    expect(traced.slice(0, 2)).toEqual(['→3', '→4']);
    expect(traced).toContain('→1');
    expect(traced).toContain('←0');
    expect(traced).toContain('←1');
  });
});
