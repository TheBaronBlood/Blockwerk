// Texte aus einer fremden Projektdatei dürfen im erzeugten Python nie zu eigenem Code werden.
import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { generate } from '../src/generator';

const EVIL = 'los\nimport os  # eingeschleust';
const code = (blocks: object[]) => {
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load({blocks:{blocks}}, ws);
  return generate(ws).lines.map(l => l.text);
};
/**
 * Zeilen, in denen der eingeschleuste Befehl als eigener Code stünde. Endet die Zeile davor mit »\«,
 * setzt sie einen Text fort – das ist erlaubt und bleibt Text.
 */
const injected = (lines: string[]) => lines.filter((l, i) => /^\s*import os/.test(l) && !lines[i - 1]?.endsWith('\\'));

describe('Texte aus Projektdateien', () => {
  it('Name einer Nachricht, die niemand sendet, bleibt im Kommentar', () => {
    const lines = code([{type:'pb_start', x:0, y:0}, {type:'pb_when_message', x:0, y:100, fields:{NAME:EVIL}, next:{block:{type:'pb_display_off'}}}]);
    expect(injected(lines)).toEqual([]);
    expect(lines).toContain("# Die Nachricht 'los import os  # eingeschleust' sendet kein anderer Programmteil.");
  });
  it('ein nicht übersetzter SPIKE-Block bleibt im Kommentar', () => {
    const lines = code([{type:'pb_start', x:0, y:0, next:{block:{type:'pb_unsupported', fields:{WHAT:EVIL}}}}]);
    expect(injected(lines)).toEqual([]);
    expect(lines.filter(l => l.includes('eingeschleust'))).toEqual(['pass  # nicht übersetzt: los import os  # eingeschleust']);
  });
  it('Name einer gesendeten und empfangenen Nachricht bleibt im Text', () => {
    expect(injected(code([
      {type:'pb_start', x:0, y:0, next:{block:{type:'pb_send_message', fields:{NAME:EVIL}}}},
      {type:'pb_when_message', x:0, y:100, fields:{NAME:EVIL}, next:{block:{type:'pb_display_off'}}}]))).toEqual([]);
  });
  it('Anzeigetext bleibt im Text', () => {
    expect(injected(code([{type:'pb_start', x:0, y:0, next:{block:{type:'pb_display_text', inputs:{TEXT:{shadow:{type:'text', fields:{TEXT:EVIL}}}}}}}]))).toEqual([]);
  });
  it('Zahlenfelder und Auswahllisten nehmen keinen Text an', () => {
    const lines = code([{type:'pb_start', x:0, y:0, next:{block:{type:'pb_drive_setup',
      fields:{LEFT_PORT:'A)\nimport os\n(', WHEEL:'56)\nimport os\n(', AXLE:'1\nimport os', GYRO:'x'}}}}]);
    expect(lines.join('\n')).not.toContain('import os');
  });
});
