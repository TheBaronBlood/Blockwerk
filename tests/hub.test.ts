import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { EXAMPLES } from '../src/examples';
import { compileProgram } from '../src/hub/compile';
import {
  encodeProgram, parseCapabilities, parseStatus, ProgramTooLargeError, startUserProgram, stopUserProgram,
  uploadProgram, versionAtLeast, writeStdin, writeUserProgramMeta, writeUserRam
} from '../src/hub/protocol';
import { TracebackParser, type HubError } from '../src/hub/traceback';
import {
  decodeByte, encodeAxis, encodeButton, PAD_BUTTONS, PAD_HEARTBEAT, PAD_HELPER, PAD_STICKS, padHelper, padSize, quantize, stickAxes
} from '../src/hub/padProtocol';

// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2 und kennt kein async
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);

const bytes = (...b: number[]) => new Uint8Array(b);
const view = (...b: number[]) => new DataView(bytes(...b).buffer);

describe('Pybricks-Protokoll', () => {
  it('baut die Befehle byteweise richtig', () => {
    expect(stopUserProgram()).toEqual(bytes(0));
    expect(writeUserProgramMeta(0x01020304)).toEqual(bytes(3, 4, 3, 2, 1));
    expect(writeUserRam(258, bytes(9, 8))).toEqual(bytes(4, 2, 1, 0, 0, 9, 8));
    expect(writeStdin(bytes(65))).toEqual(bytes(6, 65));
  });

  it('startet je nach Profilversion mit oder ohne Programmplatz', () => {
    expect(startUserProgram('1.3.0')).toEqual(bytes(1));
    expect(startUserProgram('1.4.0')).toEqual(bytes(1, 0));
    expect(startUserProgram('1.5.0', 2)).toEqual(bytes(1, 2));
  });

  it('vergleicht Versionen', () => {
    expect(versionAtLeast('1.10.0', '1.3.0')).toBe(true);
    expect(versionAtLeast('1.2.9', '1.3.0')).toBe(false);
    expect(versionAtLeast('1.3.0', '1.3.0')).toBe(true);
  });

  it('liest Fähigkeiten und Status des Hubs', () => {
    // maxWriteSize 158, Flags 0b111, maxUserProgramSize 261120
    expect(parseCapabilities(view(158, 0, 7, 0, 0, 0, 0, 0xfc, 3, 0, 5)))
      .toEqual({maxWriteSize:158, multiMpy6:true, maxUserProgramSize:261120});
    expect(parseStatus(view(0, 0x40, 0, 0, 0, 0, 3))).toEqual({running:true, selectedSlot:3});
    expect(parseStatus(view(0, 0x08, 0, 0, 0))).toEqual({running:false, selectedSlot:0});
  });

  it('verpackt das Programm im Multi-MPY-Format', () => {
    const blob = encodeProgram(bytes(77, 6, 0));
    expect([...blob.slice(0, 4)]).toEqual([3, 0, 0, 0]);
    expect(new TextDecoder().decode(blob.slice(4, 13))).toBe('__main__\x00');
    expect([...blob.slice(13)]).toEqual([77, 6, 0]);
  });

  it('überträgt in der richtigen Reihenfolge und vollständig', async () => {
    const program = Uint8Array.from({length:250}, (_, i) => i);
    const sent: Uint8Array[] = [], progress: number[] = [];
    await uploadProgram(async (m) => { sent.push(m.slice()); }, program, {maxWriteSize:105, multiMpy6:true, maxUserProgramSize:1000}, f => progress.push(f));

    expect(sent[0]).toEqual(writeUserProgramMeta(0));
    expect(sent[sent.length - 1]).toEqual(writeUserProgramMeta(250));
    const chunks = sent.slice(1, -1);
    expect(chunks.map(c => c.length)).toEqual([105, 105, 55]);
    const back = new Uint8Array(250);
    for (const c of chunks){
      expect(c[0]).toBe(4);
      back.set(c.slice(5), new DataView(c.buffer).getUint32(1, true));
    }
    expect(back).toEqual(program);
    expect(progress).toEqual([0, 0.4, 0.8, 1]);
  });

  it('lehnt zu große Programme ab, bevor etwas gesendet wird', async () => {
    let writes = 0;
    await expect(uploadProgram(async () => { writes++; }, new Uint8Array(11), {maxWriteSize:100, multiMpy6:true, maxUserProgramSize:10}))
      .rejects.toBeInstanceOf(ProgramTooLargeError);
    expect(writes).toBe(0);
  });
});

describe('Kompilieren', () => {
  // Das Paket lädt die WASM-Datei per fetch(); unter Node ist das ein Dateipfad, den fetch nicht kennt
  beforeAll(() => {
    vi.stubGlobal('fetch', async (path: string) => new Response(readFileSync(path), {headers:{'Content-Type':'application/wasm'}}));
  });
  afterAll(() => vi.unstubAllGlobals());

  for (const [name, make] of Object.entries(EXAMPLES)){
    it(`${name}: mpy-cross erzeugt MPY v6`, async () => {
      const ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(make(), ws);
      const code = generate(ws).lines.map(l => l.text).join('\n') + '\n';
      ws.dispose();
      const res = await compileProgram(code);
      expect(res.ok).toBe(true);
      if (res.ok){ expect(res.mpy[0]).toBe(0x4d); expect(res.mpy[1]).toBe(6); }
    });
  }

  it('meldet Syntaxfehler mit Datei und Zeile', async () => {
    const res = await compileProgram('x = 1\nwhile True\n    pass\n');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errors.join('\n')).toMatch(/File "__main__\.py", line \d+\nSyntaxError/);
  });
});

describe('Steuerfeld', () => {
  it('kodiert Joystick und Tasten als einzelne Bytes', () => {
    expect(quantize(-4)).toBe(0);
    expect(Object.is(quantize(-4), -0)).toBe(false);
    expect(quantize(137)).toBe(100);
    expect(encodeAxis('x', -100)).toBe(150);
    expect(encodeAxis('x', 100)).toBe(170);
    expect(encodeAxis('y', 0)).toBe(190);
    expect(encodeButton('A', true)).toBe(65);
    expect(encodeButton('D', false)).toBe(100);
    expect(encodeButton('J', true)).toBe(74);
    expect(encodeButton('J', false)).toBe(106);
  });

  it('weitere Joysticks und Tasten belegen eigene Bereiche – ohne Steuerzeichen und ohne Überschneidung', () => {
    const used = new Map<number, string>();
    const claim = (byte: number, what: string) => {
      expect(byte, what).toBeGreaterThanOrEqual(32);   // Strg+C (3) bräche auf dem Hub das Programm ab
      expect(byte, what).toBeLessThan(PAD_HEARTBEAT);
      expect(used.get(byte), `${what} trifft ${used.get(byte)}`).toBeUndefined();
      used.set(byte, what);
    };
    for (let s = 1; s <= PAD_STICKS; s++) for (const a of stickAxes(s)) for (let v = -100; v <= 100; v += 10) claim(encodeAxis(a, v), `${a} ${v}`);
    for (const b of PAD_BUTTONS) for (const down of [true, false]) claim(encodeButton(b, down), `${b} ${down}`);
    // und der Browser liest jedes Byte so, wie der Hub es tut
    for (const [byte, what] of used){
      const [name, value] = what.split(' ');
      expect(decodeByte(byte)).toEqual({name, value:value === 'true' ? true : value === 'false' ? false : Number(value)});
    }
    expect(decodeByte(PAD_HEARTBEAT)).toBeNull();
    expect(decodeByte(75)).toBeNull();   // eine Taste K gibt es nicht
  });

  it('das Gegenstück auf dem Hub kennt nur, was das Programm braucht', () => {
    expect(padHelper()).toEqual(PAD_HELPER);
    expect(PAD_HELPER.join('\n')).not.toMatch(/x2|'E'/);
    expect(padSize(['x', 'A'])).toEqual([1, 4]);
    expect(padSize(['y3', 'F'])).toEqual([3, 6]);
    const big = padHelper(3, 10).join('\n');
    expect(big).toMatch(/'x3': 0, 'y3': 0, 'A': False/);
    expect(big).toMatch(/'J': False\}/);
    expect(big).toMatch(/steuerfeld\.update\(x=0, y=0, x2=0, y2=0, x3=0, y3=0, A=False/);
  });

  it.skipIf(!python)('das Python-Gegenstück versteht auch Joystick 2 und 3 und die Tasten bis J', () => {
    const input = [encodeAxis('x2', 40), encodeAxis('y3', -100), encodeAxis('x', 20), encodeButton('J', true), encodeButton('E', true), encodeButton('E', false)];
    const script = [
      `eingabe = ${JSON.stringify(input)}`,
      'zeit = 0',
      'class StopWatch:',
      '    def reset(self):',
      '        global zeit',
      '        zeit = 0',
      '    def time(self):',
      '        return zeit',
      'def read_input_byte():',
      '    return eingabe.pop(0) if eingabe else None',
      ...padHelper(3, 10),
      "assert steuerung('x2') == 40 and steuerung('y2') == 0, steuerfeld",
      "assert steuerung('y3') == -100 and steuerung('x') == 20, steuerfeld",
      "assert steuerung('J') is True and steuerung('E') is False, steuerfeld",
      'zeit = 1001',
      "assert steuerung('x2') == 0 and steuerung('y3') == 0 and steuerung('J') is False, steuerfeld",
      "print('ok')"
    ].join('\n');
    const r = spawnSync(python!, ['-c', script], {encoding:'utf8'});
    expect(r.stderr).toBe('');
    expect(r.stdout.trim()).toBe('ok');
  });

  it.skipIf(!python)('das Python-Gegenstück versteht genau diese Bytes', () => {
    const input = [encodeAxis('x', 70), encodeAxis('y', -100), encodeButton('B', true), encodeButton('C', true), encodeButton('C', false), 7, encodeAxis('x', -30)];
    const script = [
      `eingabe = ${JSON.stringify(input)}`,
      'zeit = 0',
      'class StopWatch:',
      '    def reset(self):',
      '        global zeit',
      '        zeit = 0',
      '    def time(self):',
      '        return zeit',
      'def read_input_byte():',
      '    return eingabe.pop(0) if eingabe else None',
      ...PAD_HELPER,
      "assert steuerung('x') == -30, steuerfeld",
      "assert steuerung('y') == -100, steuerfeld",
      "assert steuerung('A') is False and steuerung('B') is True and steuerung('C') is False, steuerfeld",
      '# Funkstille: nach mehr als 1000 ms ohne Lebenszeichen ist alles losgelassen',
      'zeit = 1001',
      "assert steuerung('x') == 0 and steuerung('y') == 0 and steuerung('B') is False, steuerfeld",
      '# ein Lebenszeichen genügt, damit neue Eingaben wieder gelten',
      `eingabe.extend([${PAD_HEARTBEAT}, ${encodeAxis('y', 50)}])`,
      "assert steuerung('y') == 50 and zeit == 0, steuerfeld",
      "print('ok')"
    ].join('\n');
    const r = spawnSync(python!, ['-c', script], {encoding:'utf8'});
    expect(r.stderr).toBe('');
    expect(r.stdout.trim()).toBe('ok');
  });
});

describe('Traceback', () => {
  const collect = () => { const errors: HubError[] = []; return {errors, parser:new TracebackParser(e => errors.push(e))}; };

  it('findet Zeile und Meldung, auch wenn die Ausgabe zerstückelt ankommt', () => {
    const {errors, parser} = collect();
    const text = 'Hallo\r\nTraceback (most recent call last):\r\n  File "__main__.py", line 14, in <module>\r\n  File "__main__.py", line 9, in Ecke\r\nOSError: [Errno 19] ENODEV: \r\n';
    for (let i = 0; i < text.length; i += 7) parser.feed(text.slice(i, i + 7));
    expect(errors).toHaveLength(1);
    expect(errors[0].line).toBe(9);
    expect(errors[0].message).toBe('OSError: [Errno 19] ENODEV:');
    expect(errors[0].hint).toContain('Anschluss');
  });

  it('wertet das Stoppen des Programms nicht als Fehler', () => {
    const {errors, parser} = collect();
    parser.feed('Traceback (most recent call last):\n  File "__main__.py", line 3, in <module>\nSystemExit: \n');
    expect(errors).toEqual([]);
  });
});
