import * as Blockly from 'blockly';
import { describe, expect, it } from 'vitest';
import '../src/blocks';
import { MonitorFeed, MONITOR_MARK } from '../src/hub/monitor';
import { allPortsSeen, describePorts, foundPorts, motorRoles, PORT_BLOCKS, samePorts, withFoundPorts, type FoundPorts } from '../src/ports';
import { toolbox, toolboxWith } from '../src/toolbox';

type Item = {kind: string; type?: string; name?: string; fields?: Record<string, string>; inputs?: Record<string, {block?: Item; shadow?: Item}>; contents?: Item[]};
const category = (box: unknown, name: string) => (box as {contents: Item[]}).contents.find(c => c.name === name)!;
const block = (box: unknown, cat: string, type: string) => category(box, cat).contents!.find(b => b.type === type)!;
/** Der Stand, wie ihn das Anzeige-Programm meldet. */
const state = (...lines: string[]) => {
  const feed = new MonitorFeed();
  feed.push(lines.map(l => MONITOR_MARK + l + '\r\n').join(''));
  return feed.state;
};
const none: FoundPorts = {motor:[], color:[], ultra:[], force:[]};

describe('Anschlüsse erkennen', () => {
  it('liest aus dem Stand des Hubs, wo welches Gerät steckt', () => {
    const s = state('V 1', 'P A m 48 0 0', 'P B m 48 10 0', 'P C -', 'P D f 63 0 0', 'P E c 61 0 0 0 5 NONE', 'P F u 62 2000');
    expect(allPortsSeen(s)).toBe(true);
    expect(foundPorts(s)).toEqual({motor:['A', 'B'], color:['E'], ultra:['F'], force:['D']});
  });

  it('wartet, bis jeder Anschluss angesehen ist, und übergeht Geräte ohne Blöcke', () => {
    const s = state('V 1', 'P A m 48 0 0', 'P B x 64');
    expect(allPortsSeen(s)).toBe(false);
    expect(foundPorts(s)).toEqual({...none, motor:['A']});
  });

  it('teilt die Motoren auf: die ersten beiden fahren, der dritte ist der einzelne', () => {
    expect(motorRoles([])).toEqual({drive:null, single:null});
    expect(motorRoles(['E'])).toEqual({drive:null, single:'E'});
    expect(motorRoles(['C', 'D'])).toEqual({drive:['C', 'D'], single:'C'});
    expect(motorRoles(['A', 'B', 'F'])).toEqual({drive:['A', 'B'], single:'F'});
  });

  it('stellt die Blockliste auf die erkannten Anschlüsse ein', () => {
    const box = withFoundPorts(toolbox, {motor:['C', 'D', 'E'], color:['A'], ultra:['B'], force:['F']});
    expect(block(box, 'Fahren', 'pb_drive_setup').fields).toMatchObject({LEFT_PORT:'C', RIGHT_PORT:'D', LEFT_DIR:'COUNTERCLOCKWISE'});
    expect(category(box, 'Motoren').contents!.map(b => b.fields!.PORT)).toEqual(Array(8).fill('E'));
    expect(block(box, 'Sensoren', 'pb_reflection').fields!.PORT).toBe('A');
    expect(block(box, 'Sensoren', 'pb_distance').fields!.PORT).toBe('B');
    expect(block(box, 'Sensoren', 'pb_force').fields!.PORT).toBe('F');
    // auch Blöcke, die in einem anderen stecken: »wenn Farbsensor …«, »wenn Abstand < 100«
    const events = category(box, 'Ereignisse').contents!;
    expect(events[2].inputs!.COND.block!.fields!.PORT).toBe('A');
    expect(events[3].inputs!.COND.block!.inputs!.A.block!.fields!.PORT).toBe('B');
    expect(events[4].inputs!.COND.block!.fields!.PORT).toBe('F');
  });

  it('lässt stehen, wozu nichts erkannt wurde, und ändert das Original nicht', () => {
    const before = JSON.stringify(toolbox);
    const box = withFoundPorts(toolbox, {...none, force:['A']});
    expect(JSON.stringify(toolbox)).toBe(before);
    expect(block(box, 'Sensoren', 'pb_force_pressed').fields!.PORT).toBe('A');
    expect(block(box, 'Sensoren', 'pb_distance').fields!.PORT).toBe('D');
    expect(block(box, 'Motoren', 'pb_motor_run').fields!.PORT).toBe('C');
    expect(block(box, 'Fahren', 'pb_drive_setup').fields).toMatchObject({LEFT_PORT:'A', RIGHT_PORT:'B'});
    // ein einzelner Motor reicht nicht für die Fahrbasis
    expect(block(withFoundPorts(toolbox, {...none, motor:['E']}), 'Fahren', 'pb_drive_setup').fields).toMatchObject({LEFT_PORT:'A', RIGHT_PORT:'B'});
    // ohne Hub: derselbe Werkzeugkasten
    expect(withFoundPorts(toolbox, null)).toBe(toolbox);
  });

  it('lässt Kategorien aus Erweiterungen in Ruhe', () => {
    const extra = {kind:'category', name:'Eigene', contents:[{kind:'block', type:'ext_x_y', fields:{PORT:'B'}}]};
    const box = withFoundPorts(toolboxWith([extra as never]), {...none, motor:['F']});
    expect(category(box, 'Eigene').contents![0].fields).toEqual({PORT:'B'});
    expect(block(box, 'Motoren', 'pb_motor_stop').fields!.PORT).toBe('F');
  });

  it('kennt jeden eingebauten Block mit einem Anschluss', () => {
    // ein neuer Block mit Feld »PORT« muss in PORT_BLOCKS stehen, sonst bleibt er in der Liste auf seiner alten Vorgabe
    const ws = new Blockly.Workspace();
    const withPort = Object.keys(Blockly.Blocks).filter(t => t.startsWith('pb_') && ws.newBlock(t).getField('PORT')).sort();
    ws.dispose();
    expect(Object.keys(PORT_BLOCKS).sort()).toEqual(withPort);
    // … und steht mit dieser Vorgabe im Werkzeugkasten
    const inBox = new Set(JSON.stringify(toolbox).match(/pb_[a-z_]+/g));
    for (const type of withPort) expect(inBox.has(type), type).toBe(true);
  });

  it('sagt im Terminal, was steckt', () => {
    expect(describePorts({motor:['A', 'B', 'E'], color:['C'], ultra:[], force:['D']}))
      .toBe('Am Hub erkannt: Motor an A, B und E, Farbsensor an C, Kraftsensor an D. Die Blockliste ist darauf eingestellt.');
    expect(describePorts({...none, motor:['A', 'B']})).toContain('Motor an A und B.');
    expect(describePorts(none)).toBe('An den Anschlüssen des Hubs steckt nichts, das Blockwerk kennt.');
    expect(samePorts(none, {...none})).toBe(true);
    expect(samePorts(none, null)).toBe(false);
  });
});
