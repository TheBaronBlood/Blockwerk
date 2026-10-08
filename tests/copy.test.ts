import { describe, expect, it } from 'vitest';
import * as Blockly from 'blockly';
import '../src/blocks';
import { GROUP_PASTER, groupStates, isGroupCopy, pasteGroup, topPicked, type GroupCopyData } from '../src/copy';
import { at, B, S, seq, ws_, type WorkspaceState } from '../src/examples';
import { N } from '../src/toolbox';

/** Lädt ein Programm und gibt die Arbeitsfläche samt einer Suche nach Blöcken zurück. */
function load(state: WorkspaceState){
  const ws = new Blockly.Workspace();
  Blockly.serialization.workspaces.load(state, ws);
  const id = (name: string) => { const b = ws.getBlockById(name); if (!b) throw new Error('kein Block ' + name); return b; };
  return {ws, pick:(...names: string[]) => names.map(id)};
}
const named = (name: string, block: ReturnType<typeof B>) => Object.assign(block, {id:name});
const wait = (name: string, ms: number) => named(name, B('pb_wait', null, {MS:N(ms)}));
/** Die Arten der Blöcke eines kopierten Stapels, von oben nach unten. */
const types = (state: Blockly.serialization.blocks.State): string[] => [state.type, ...(state.next?.block ? types(state.next.block) : [])];
const group = (stacks: Blockly.serialization.blocks.State[]): GroupCopyData => ({paster:GROUP_PASTER, stacks, pasted:0});

describe('mehrere Blöcke kopieren', () => {
  const program = () => ws_([
    at(seq(named('start', B('pb_start')), wait('a', 100), named('b', B('pb_display_off')), wait('c', 300), named('d', B('pb_drive_reset')), wait('e', 500)), 40, 60),
    at(seq(named('ereignis', B('pb_when')), named('piep', B('pb_beep', null, {FREQ:N(880), DUR:N(200)}))), 400, 90)]);

  it('was untereinander hängt, bleibt ein Stapel – getrennte Teile werden getrennte Stapel', () => {
    const {ws, pick} = load(program());
    const stacks = groupStates(pick('a', 'b', 'd'));
    expect(stacks.map(types)).toEqual([['pb_wait', 'pb_display_off'], ['pb_drive_reset']]);
    // die Reihenfolge des Anklickens spielt keine Rolle
    expect(groupStates(pick('b', 'a')).map(types)).toEqual([['pb_wait', 'pb_display_off']]);
    ws.dispose();
  });
  it('ein Block nimmt mit, was in ihm steckt – nicht, was unter ihm hängt', () => {
    const {ws, pick} = load(program());
    const [only] = groupStates(pick('a'));
    expect(types(only)).toEqual(['pb_wait']);
    expect(JSON.stringify(only)).toContain('"NUM":100');   // die Zahl im Block
    ws.dispose();
  });
  it('was in einem gewählten Block steckt, zählt nicht eigens', () => {
    const {ws, pick} = load(ws_([at(seq(named('start', B('pb_start')),
      named('schleife', B('controls_repeat_ext', null, {TIMES:N(3), DO:S(wait('innen', 100), wait('innen2', 200))})), wait('danach', 50)), 0, 0)]));
    expect(topPicked(pick('schleife', 'innen')).map(b => b.id)).toEqual(['schleife']);
    const [loop] = groupStates(pick('innen', 'schleife'));
    expect(types(loop)).toEqual(['controls_repeat_ext']);
    expect(JSON.stringify(loop.inputs?.DO)).toContain('"NUM":200');
    // nur der Inhalt gewählt: Er kommt ohne die Schleife mit
    expect(groupStates(pick('innen', 'innen2')).map(types)).toEqual([['pb_wait', 'pb_wait']]);
    // die Schleife und der Block unter ihr gehören zusammen, ihr Inhalt reist in ihr mit
    expect(groupStates(pick('danach', 'innen2', 'schleife')).map(types)).toEqual([['controls_repeat_ext', 'pb_wait']]);
    ws.dispose();
  });
  it('die Kopie bekommt eigene Kennungen, Variablen bleiben dieselben', () => {
    const {ws, pick} = load(ws_([at(seq(named('start', B('pb_start')), named('setze', B('variables_set', {VAR:{id:'var_z'}}, {VALUE:N(5)}))), 0, 0)], [{name:'Zähler', id:'var_z'}]));
    const text = JSON.stringify(groupStates(pick('setze')));
    expect(text).not.toContain('"id":"setze"');
    expect(text).toContain('"id":"var_z"');
    ws.dispose();
  });

  it('eingefügt wird daneben, in derselben Anordnung – jedes Mal ein Stück weiter', () => {
    const {ws, pick} = load(program());
    const data = group(groupStates(pick('start', 'a', 'ereignis', 'piep')));
    expect(isGroupCopy(data)).toBe(true);
    const before = ws.getAllBlocks(false).length;
    const first = pasteGroup(data, ws);
    expect(first.map(b => b.type)).toEqual(['pb_start', 'pb_wait', 'pb_when', 'pb_beep']);
    // die beiden Stapel behalten ihren Abstand zueinander (40|60 und 400|90), um 32 versetzt
    expect(first[0].getRelativeToSurfaceXY()).toMatchObject({x:72, y:92});
    expect(first[2].getRelativeToSurfaceXY()).toMatchObject({x:432, y:122});
    // was zusammenhing, hängt wieder zusammen – und darunter ist Schluss
    expect(first[0].getNextBlock()).toBe(first[1]); expect(first[1].getNextBlock()).toBeNull();
    expect(first[2].getNextBlock()).toBe(first[3]);
    expect(pasteGroup(data, ws)[0].getRelativeToSurfaceXY()).toMatchObject({x:104, y:124});
    // 4 Blöcke mit 3 Zahlen darin, zweimal
    expect(ws.getAllBlocks(false).length).toBe(before + 2 * 7);
    ws.dispose();
  });
  it('einfügen ist ein Schritt für »Rückgängig«', async () => {
    // Blockly verbucht Ereignisse erst einen Augenblick später
    const settled = () => new Promise(resolve => setTimeout(resolve, 30));
    const {ws, pick} = load(program());
    const before = ws.getAllBlocks(false).length;
    // (das Laden selbst soll nicht mit zurückgenommen werden)
    await settled(); ws.clearUndo();
    pasteGroup(group(groupStates(pick('a', 'b', 'piep'))), ws);
    expect(ws.getAllBlocks(false).length).toBeGreaterThan(before);
    await settled();
    ws.undo(false);
    expect(ws.getAllBlocks(false).length).toBe(before);
    ws.dispose();
  });
});
