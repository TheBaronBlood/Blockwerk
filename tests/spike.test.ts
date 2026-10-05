import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { importSpikeFile, isZip, SpikeFileError } from '../src/spike/read';
import { convertSpike } from '../src/spike/convert';

const ROOT = join(__dirname, '..', 'referenz', 'spike-dateien', 'beispiele');
const files = (readdirSync(ROOT, {recursive:true}) as string[]).filter(f => f.endsWith('.llsp3')).map(f => join(ROOT, f)).sort();
// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2 und kennt kein async
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);
const tmp = mkdtempSync(join(tmpdir(), 'blockwerk-spike-'));
afterAll(() => rmSync(tmp, {recursive:true, force:true}));

function translate(path: string){
  const imp = importSpikeFile(new Uint8Array(readFileSync(path)));
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(imp.state, ws);
    const res = generate(ws);
    return {...imp, warnings:res.warnings, code:res.lines.map(l => l.text).join('\n') + '\n'};
  } finally { ws.dispose(); }
}
const find = (part: string) => files.find(f => basename(f).includes(part))!;
const readZip = (source: string | Uint8Array) => unzipSync(typeof source === 'string' ? new Uint8Array(readFileSync(source)) : source);

describe('SPIKE-Import: Projekte der AG', () => {
  it('findet die Referenzdateien', () => { expect(files.length).toBeGreaterThanOrEqual(23); });

  // Die SPIKE-App legt jedem Projekt einen Klang und ein gezeichnetes Vorschaubild bei. Beides gehört
  // LEGO und darf nicht mit Blockwerk ausgeliefert werden – die Kursdateien wandern in das Programm.
  it('enthalten nur das Programm: keine Klänge, kein Vorschaubild der SPIKE-App', () => {
    for (const path of files){
      const outer = readZip(path), inner = readZip(outer['scratch.sb3']);
      const media = Object.entries(inner).filter(([name, data]) => name !== 'project.json' && data.length > 0).map(([name]) => name);
      expect(media, basename(path)).toEqual([]);
      expect(Object.keys(outer).sort(), basename(path)).toEqual(['icon.svg', 'manifest.json', 'scratch.sb3']);
      expect(outer['icon.svg'].length, basename(path)).toBeLessThan(1024);
    }
  });

  for (const path of files){
    const name = basename(path, '.llsp3');
    it(`${name}: vollständig übersetzt, gültiges Python`, () => {
      const res = translate(path);
      expect(res.report.unsupported).toEqual([]);
      expect(res.warnings).toEqual([]);
      expect(res.code).not.toContain('Zieh den Block');
      expect(res.code).toMatchSnapshot();
      if (python){
        const file = join(tmp, name.replace(/[^A-Za-z0-9]+/g, '_') + '.py');
        writeFileSync(file, res.code, 'utf8');
        const r = spawnSync(python, ['-m', 'py_compile', file], {encoding:'utf8'});
        expect(r.stderr).toBe('');
      }
    });
  }

  it('rechnet cm in mm und Raddrehung in Roboterwinkel um', () => {
    const {code, report} = translate(find('M2 Loesung'));
    expect(code).toContain('for count in range(4):\n    roboter.straight(200)\n    roboter.turn(90)\n');
    expect(report.notes.join(' ')).toMatch(/180 Grad am Rad sind 90 Grad Drehung/);
  });

  it('rechnet Radumdrehungen in Strecke um', () => {
    expect(translate(find('M1 Demo')).code).toContain('roboter.straight(176)');
  });

  it('setzt das eingestellte Tempo in »fahre los« ein und rechnet Abstände um', () => {
    const {code} = translate(find('M3 Loesung'));
    expect(code).toContain('roboter.settings(straight_speed=145, turn_rate=150)');
    expect(code).toContain('while not kraft_E.pressed():');
    expect(code).toContain('roboter.drive(145, 0)');
    expect(code).toContain('while not (abstand_D.distance() < 100):');
    expect(code).toContain('roboter.brake()');
  });

  it('übernimmt Variablen und erkennt Schwarz', () => {
    const {code} = translate(find('M5 Loesung'));
    expect(code).toContain('Linien = 0');
    expect(code).toContain('Linien = Linien + 1');
    expect(code).toContain('Color.BLACK');
    expect(code).toContain('hub.display.text(str(Linien))');
  });

  it('übernimmt eigene Blöcke mit Parametern', () => {
    const {code} = translate(find('M7 Loesung - Eigener Block drehe'));
    expect(code).toContain('def drehe(Winkel):');
    expect(code).toContain('while not (abs(hub.imu.heading()) > Winkel - 2):');
    expect(code).toContain('    drehe(90)');
  });

  it('übersetzt den Proportionalregler mit Lenkwert als Formel', () => {
    const {code} = translate(find('Proportionalregler'));
    expect(code).toMatch(/roboter\.drive\(120, \(\(farbe_C\.reflection\(\) - 50\) \* 0\.8\) \* 1\.25\)/);
  });

  it('übersetzt eine echte Datei aus der SPIKE-App', () => {
    const {code, name} = translate(find('Project_1-original'));
    expect(name).toBe('Project 1');
    expect(code).toContain('roboter.straight(1759)');
  });
});

describe('SPIKE-Import: Sonderfälle', () => {
  const block = (opcode: string, extra: object = {}) => ({opcode, next:null, parent:null, inputs:{}, fields:{}, topLevel:false, shadow:false, ...extra});
  const project = (blocks: Record<string, object>) => ({targets:[{isStage:true, variables:{}, blocks:{}}, {isStage:false, variables:{}, blocks}]});

  it('setzt Platzhalter für unbekannte Blöcke, statt sie wegzulassen', () => {
    const {state, report} = convertSpike(project({
      a: block('flipperevents_whenProgramStarts', {next:'b', topLevel:true, x:0, y:0}),
      b: block('flippermusic_playDrumForBeats', {parent:'a', next:'c'}),
      c: block('flipperlight_lightDisplayOff', {parent:'b'})
    }) as never);
    expect(report.unsupported).toEqual(['music: playDrumForBeats']);
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    const res = generate(ws);
    ws.dispose();
    const code = res.lines.map(l => l.text).join('\n');
    expect(code).toContain('pass  # nicht übersetzt: music: playDrumForBeats\nhub.display.off()');
    expect(res.warnings).toEqual(['Ein SPIKE-Block wurde nicht übersetzt: music: playDrumForBeats']);
  });

  it('lässt Stapel unter fremden Ereignissen lose liegen', () => {
    const {state, report} = convertSpike(project({
      a: block('flipperevents_whenButton', {next:'b', topLevel:true, x:0, y:0}),
      b: block('flipperlight_lightDisplayOff', {parent:'a'})
    }) as never);
    expect(report.unsupported).toEqual(['events: whenButton']);
    expect((state.blocks as {blocks: {type: string}[]}).blocks[0].type).toBe('pb_unsupported');
  });

  it('erkennt ZIP-Dateien und weist anderes verständlich zurück', () => {
    expect(isZip(new Uint8Array(readFileSync(files[0])))).toBe(true);
    expect(isZip(new TextEncoder().encode('{"blocks":{}}'))).toBe(false);
    expect(() => importSpikeFile(new TextEncoder().encode('PK kaputt'))).toThrow(SpikeFileError);
  });

  // Ein ZIP macht aus einem Kilobyte beliebig viele Megabyte – das darf die Seite nicht einfrieren
  describe('zu große Inhalte', () => {
    const manifest = strToU8('{"type":"word-blocks","name":"x"}');
    const project = readZip(readZip(files[0])['scratch.sb3'])['project.json'];

    // macht die gepackten Daten eines Eintrags unlesbar: Wer ihn auspackt, scheitert daran
    function corrupt(zip: Uint8Array, name: string): Uint8Array {
      const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
      for (let at = 0; view.getUint32(at, true) === 0x04034b50;){
        const packed = view.getUint32(at + 18, true), nameLength = view.getUint16(at + 26, true), data = at + 30 + nameLength + view.getUint16(at + 28, true);
        if (new TextDecoder().decode(zip.subarray(at + 30, at + 30 + nameLength)) === name){ zip.fill(0xff, data, data + packed); return zip; }
        at = data + packed;
      }
      throw new Error(`Eintrag fehlt: ${name}`);
    }

    it('lehnt ein aufgeblähtes project.json ab', () => {
      const bomb = zipSync({'manifest.json':manifest, 'scratch.sb3':zipSync({'project.json':new Uint8Array(40 * 1024 * 1024)})});
      expect(bomb.length).toBeLessThan(200 * 1024);
      expect(() => importSpikeFile(bomb)).toThrow('zu groß');
    });
    it('lehnt ein aufgeblähtes scratch.sb3 ab', () => {
      const bomb = zipSync({'manifest.json':manifest, 'scratch.sb3':new Uint8Array(80 * 1024 * 1024)});
      expect(() => importSpikeFile(bomb)).toThrow('zu groß');
    });
    // Python-Projekte der SPIKE-App erkennt Blockwerk am Namen des Eintrags – ausgepackt wird er nicht,
    // sonst gälte für ihn keine Obergrenze
    it('erkennt ein Python-Projekt, ohne dessen Inhalt auszupacken', () => {
      const python = corrupt(zipSync({'manifest.json':manifest, 'projectbody.json':new Uint8Array(4096)}), 'projectbody.json');
      expect(() => unzipSync(python)).toThrow();   // die Gegenprobe: Auspacken scheitert wirklich
      expect(() => importSpikeFile(python)).toThrow('Python-Projekt');
      const bomb = zipSync({'manifest.json':manifest, 'projectbody.json':new Uint8Array(80 * 1024 * 1024)});
      expect(bomb.length).toBeLessThan(200 * 1024);
      expect(() => importSpikeFile(bomb)).toThrow('Python-Projekt');
    });
    it('packt Klänge und Bilder im Projekt gar nicht erst aus', () => {
      const sb3 = corrupt(zipSync({'project.json':project, 'klang.wav':new Uint8Array(4096)}), 'klang.wav');
      expect(() => unzipSync(sb3)).toThrow();   // die Gegenprobe: Auspacken scheitert wirklich
      const file = corrupt(zipSync({'manifest.json':manifest, 'icon.svg':new Uint8Array(4096), 'scratch.sb3':[sb3, {level:0}]}), 'icon.svg');
      expect(importSpikeFile(file).report.converted).toBeGreaterThan(0);
    });
  });
});
