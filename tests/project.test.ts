import { afterEach, describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { ws_ } from '../src/examples';
import { extensions, getExtension, installExtension, removeExtension } from '../src/ext/store';
import { checkState, installBrought, ProjectError, readProject, withoutExtensions } from '../src/project';

const ext = (name: string, text: string, code = 'print(1)') => `# blockwerk: erweiterung ${name}\n# blockwerk: block ${text}\n${code}\n`;
type Chain = {type: string; next?: {block: Chain}};
const chain = (types: string[]): Chain => ({type:types[0], ...(types.length > 1 ? {next:{block:chain(types.slice(1))}} : {})});
/** »wenn Programm startet« mit den genannten Blöcken darunter */
const program = (...types: string[]) => ws_([{...chain(['pb_start', ...types]), x:0, y:0}]);
const file = (workspace: unknown, sources?: unknown[]) => JSON.stringify({format:'blockwerk', version:1, workspace, ...(sources ? {extensions:sources} : {})});

afterEach(() => { for (const e of extensions()) removeExtension(e.id); });

describe('Projektdatei lesen', () => {
  it('liest das heutige Format und das ältere, das nur die Arbeitsfläche enthält', () => {
    const state = program('pb_display_off');
    expect(readProject(file(state))).toEqual({state, brought:[]});
    expect(readProject(JSON.stringify(state))).toEqual({state, brought:[]});
  });

  it('weist Unsinn mit einer verständlichen Meldung zurück', () => {
    for (const text of ['', 'kein JSON', '[1,2]', '"text"', '42', 'null', '{"workspace":7}'])
      expect(() => readProject(text), text).toThrow(ProjectError);
  });

  it('installiert beim Lesen nichts – es nennt nur, was das Projekt mitbringt', () => {
    const source = ext('Greifer', 'greife');
    const {brought} = readProject(file(program(), [source]));
    expect(brought.map(b => [b.ext.name, b.replaces])).toEqual([['Greifer', null]]);
    expect(extensions()).toEqual([]);
    expect(Blockly.Blocks['ext_greifer_greife']).toBeUndefined();
  });

  it('fragt nicht nach, wenn genau diese Erweiterung schon installiert ist', () => {
    const source = ext('Greifer', 'greife');
    installExtension(source, false);
    expect(readProject(file(program(), [source])).brought).toEqual([]);
  });

  it('meldet, wenn eine mitgebrachte Erweiterung die eigene gleichen Namens ersetzen würde', () => {
    installExtension(ext('Greifer', 'greife', 'print("meins")'), false);
    const {brought} = readProject(file(program(), [ext('Greifer', 'greife', 'print("fremd")')]));
    expect(brought).toHaveLength(1);
    expect(brought[0].replaces?.blocks[0].code).toEqual(['print("meins")']);
    // gelesen ist noch nichts verändert
    expect(getExtension('greifer')!.blocks[0].code).toEqual(['print("meins")']);
  });

  it('übergeht fehlerhafte, doppelte und fremdartige Einträge', () => {
    const good = ext('Greifer', 'greife');
    const {brought} = readProject(file(program(), [good, good, '# blockwerk: erweiterung Leer\n', 'print(1)', 7, null, {x:1}]));
    expect(brought.map(b => b.ext.id)).toEqual(['greifer']);
  });
});

describe('Erweiterungen eines Projekts installieren', () => {
  it('lässt sich vollständig zurücknehmen: Neues weg, Ersetztes wieder da', () => {
    installExtension(ext('Greifer', 'greife', 'print("meins")'), false);
    const {brought} = readProject(file(program(), [ext('Greifer', 'greife', 'print("fremd")'), ext('Sirene', 'heule')]));
    const undo = installBrought(brought);
    expect(getExtension('greifer')!.blocks[0].code).toEqual(['print("fremd")']);
    expect(Blockly.Blocks['ext_sirene_heule']).toBeDefined();
    undo();
    expect(getExtension('greifer')!.blocks[0].code).toEqual(['print("meins")']);
    expect(getExtension('sirene')).toBeUndefined();
    expect(Blockly.Blocks['ext_sirene_heule']).toBeUndefined();
  });
});

describe('Stand prüfen, bevor die Arbeitsfläche geleert wird', () => {
  it('lässt ladbare Stände durch und hinterlässt keine Arbeitsfläche', () => {
    const before = Blockly.Workspace.getAll().length;
    expect(() => checkState(program('pb_display_off', 'pb_drive_stop'))).not.toThrow();
    expect(Blockly.Workspace.getAll().length).toBe(before);
  });

  it('wirft bei einem unbekannten Block – und schaltet die Ereignisse wieder ein', () => {
    const before = Blockly.Workspace.getAll().length;
    expect(() => checkState(program('pb_display_off', 'ext_fehlt_block'))).toThrow(/ext_fehlt_block/);
    expect(Blockly.Workspace.getAll().length).toBe(before);
    expect(Blockly.Events.isEnabled()).toBe(true);
  });

  it('das jetzige Programm bleibt stehen, wenn die Datei nicht ladbar ist', () => {
    // so geht main.ts vor: prüfen, dann erst leeren und laden
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(program('pb_display_off', 'pb_drive_stop'), ws);
    const load = (state: ReturnType<typeof program>) => { checkState(state); ws.clear(); Blockly.serialization.workspaces.load(state, ws); };
    expect(() => load(program('pb_drive_stop', 'ext_fehlt_block'))).toThrow();
    expect(ws.getAllBlocks(false).map(b => b.type).sort()).toEqual(['pb_display_off', 'pb_drive_stop', 'pb_start']);
    ws.dispose();
  });

  it('»ohne Erweiterungen öffnen«: unbekannte Blöcke fallen heraus, der Rest bleibt verbunden', () => {
    const state = withoutExtensions(program('pb_display_off', 'ext_fehlt_block', 'pb_drive_stop'), []);
    expect(() => checkState(state)).not.toThrow();
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(state, ws);
    const start = ws.getBlocksByType('pb_start')[0];
    expect([start.getNextBlock()?.type, start.getNextBlock()?.getNextBlock()?.type]).toEqual(['pb_display_off', 'pb_drive_stop']);
    ws.dispose();
  });

  // Gibt es hier schon eine Erweiterung mit demselben Namen, heißen ihre Blöcke genauso wie die der
  // mitgebrachten – »ohne Erweiterungen« darf sie nicht stillschweigend mit dem alten Python laden.
  it('»ohne Erweiterungen öffnen« nimmt auch Blöcke heraus, deren Erweiterung hier in anderer Fassung installiert ist', () => {
    installExtension(ext('Greifer', 'greife', 'print("meins")'), false);
    expect(Blockly.Blocks['ext_greifer_greife']).toBeDefined();
    const {state, brought} = readProject(file(program('pb_display_off', 'ext_greifer_greife', 'pb_drive_stop'), [ext('Greifer', 'greife', 'print("fremd")')]));
    const stripped = withoutExtensions(state, brought);
    const ws = new Blockly.Workspace();
    Blockly.serialization.workspaces.load(stripped, ws);
    expect(ws.getAllBlocks(false).map(b => b.type).sort()).toEqual(['pb_display_off', 'pb_drive_stop', 'pb_start']);
    ws.dispose();
    // die eigene Erweiterung ist unberührt
    expect(getExtension('greifer')!.blocks[0].code).toEqual(['print("meins")']);
  });
});
