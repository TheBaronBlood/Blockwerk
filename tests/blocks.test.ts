import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';
import { DEFAULT_PATTERN, EMPTY, PRESETS, isPattern, setPixel, toRows } from '../src/matrix';

type Foldable = Blockly.Block & {setFolded(folded: boolean): void};
const setup = (extra: object = {}) => ({blocks:{blocks:[{type:'pb_start', x:0, y:0, next:{block:{
  type:'pb_drive_setup', fields:{LEFT_PORT:'C', LEFT_DIR:'COUNTERCLOCKWISE', RIGHT_PORT:'D', RIGHT_DIR:'CLOCKWISE', WHEEL:62, AXLE:120, GYRO:false}, ...extra,
  next:{block:{type:'pb_drive_straight', inputs:{DIST:{shadow:{type:'math_number', fields:{NUM:100}}}}}}}}}]}});

describe('Muster der Lichtmatrix', () => {
  const program = (pixels?: string) => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load({blocks:{blocks:[{type:'pb_start', x:0, y:0, next:{block:{type:'pb_display_pixels', ...(pixels ? {fields:{PIXELS:pixels}} : {})}}}]}}, ws);
    return {ws, block:ws.getBlocksByType('pb_display_pixels')[0]};
  };

  it('rechnet Ziffern in Helligkeit um und kennt die Vorlagen', () => {
    expect(toRows('9000050000000000000000001')).toEqual([[100, 0, 0, 0, 0], [56, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 11]]);
    expect(setPixel(EMPTY, 6, 7)).toBe('0000007' + '0'.repeat(18));
    expect(isPattern('9'.repeat(25))).toBe(true);
    expect(isPattern('9'.repeat(24))).toBe(false);
    expect(isPattern('x'.repeat(25))).toBe(false);
    expect(PRESETS.length).toBeGreaterThanOrEqual(10);
    for (const [label, pattern] of PRESETS){ expect(isPattern(pattern), label).toBe(true); expect(pattern, label).not.toBe(EMPTY); }
    // keine Vorlage doppelt
    expect(new Set(PRESETS.map(p => p[1])).size).toBe(PRESETS.length);
  });

  it('erzeugt eine Liste aus fünf Zeilen und speichert das Muster im Projekt', () => {
    const {ws, block} = program('0909090909000009000909990');
    expect(generate(ws).lines.map(l => l.text).slice(-7)).toEqual([
      'hub.display.icon([',
      '    [0, 100, 0, 100, 0],',
      '    [100, 0, 100, 0, 100],',
      '    [0, 0, 0, 0, 0],',
      '    [100, 0, 0, 0, 100],',
      '    [0, 100, 100, 100, 0],',
      '])'
    ]);
    // alle sieben Zeilen gehören zum Block
    expect(new Set(generate(ws).lines.slice(-7).map(l => l.id))).toEqual(new Set([block.id]));
    expect(Blockly.serialization.blocks.save(block)!.fields).toEqual({PIXELS:'0909090909000009000909990'});
    // kein zusätzlicher Import nötig
    expect(generate(ws).lines.map(l => l.text).filter(t => t.startsWith('from '))).toEqual(['from pybricks.hubs import PrimeHub']);
  });

  it('beginnt mit dem Smiley und lehnt ungültige Muster ab', () => {
    const {block} = program();
    expect(block.getFieldValue('PIXELS')).toBe(DEFAULT_PATTERN);
    block.setFieldValue('kaputt', 'PIXELS');
    expect(block.getFieldValue('PIXELS')).toBe(DEFAULT_PATTERN);
    block.setFieldValue(EMPTY, 'PIXELS');
    expect(block.getFieldValue('PIXELS')).toBe(EMPTY);
  });
});

describe('Fahrbasis einklappen', () => {
  it('merkt sich den Zustand im Projekt und zeigt eingeklappt die Motoren', () => {
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(setup(), ws);
    const block = ws.getBlocksByType('pb_drive_setup')[0] as Foldable;
    expect(Blockly.serialization.blocks.save(block)!.extraState).toBeUndefined();
    expect(block.inputList.slice(1).every(i => i.isVisible())).toBe(true);

    block.setFolded(true);
    expect(block.inputList.slice(1).some(i => i.isVisible())).toBe(false);
    expect(block.getFieldValue('FOLD_INFO')).toBe('Motoren C + D');
    expect(Blockly.serialization.blocks.save(block)!.extraState).toEqual({folded:true});

    block.setFolded(false);
    expect(block.inputList.every(i => i.isVisible())).toBe(true);
    expect(block.getFieldValue('FOLD_INFO')).toBe('');
  });

  it('erzeugt eingeklappt denselben Code', () => {
    const code = (state: object) => {
      const ws = new Blockly.Workspace();
      Blockly.serialization.workspaces.load(state, ws);
      return generate(ws).lines.map(l => l.text);
    };
    const folded = code(setup({extraState:{folded:true}}));
    expect(folded).toEqual(code(setup()));
    expect(folded).toContain('roboter = DriveBase(motor_C, motor_D, wheel_diameter=62, axle_track=120)');
  });
});
