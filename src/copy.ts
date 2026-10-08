// ---------------------------------------------------------------
// Blöcke kopieren und ausschneiden.
// 1. Blockly blendet nach Strg+C und Strg+X sieben Sekunden lang einen Hinweis über der
//    Arbeitsfläche ein (»Copied. Press Control + V to paste.«). Er steht im Weg und sagt nichts,
//    was man nicht gerade selbst getan hat – Blockwerk zeigt ihn nicht.
// 2. Mehrere Blöcke auf einmal (Auswahl: multiselect.ts): Was zusammenhängt, bleibt beim
//    Einfügen zusammen, und getrennte Teile behalten ihren Abstand zueinander.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

/** Kennungen der Hinweise von Blockly, die Blockwerk nicht zeigt. */
const HIDDEN_HINTS = new Set(['copiedHint', 'cutHint']);

const show = Blockly.Toast.show;
Blockly.Toast.show = function(this: typeof Blockly.Toast, workspace, options){
  if (options.id && HIDDEN_HINTS.has(options.id)) return;
  show.call(this, workspace, options);
};

type State = Blockly.serialization.blocks.State;
/** Unter diesem Namen kennt Blocklys Zwischenablage mehrere Blöcke auf einmal. */
export const GROUP_PASTER = 'bw_group';
/** So weit rückt jedes weitere Einfügen nach rechts unten, damit die Kopie nicht genau auf dem Original liegt. */
const PASTE_STEP = 32;

/**
 * Mehrere Blöcke in der Zwischenablage: je Eintrag ein Block oder ein Stapel zusammenhängender Blöcke,
 * mit seinem Platz auf der Arbeitsfläche. `pasted` zählt, wie oft schon eingefügt wurde.
 */
export interface GroupCopyData extends Blockly.ICopyData { stacks: State[]; pasted: number }
export const isGroupCopy = (data: Blockly.ICopyData | null): data is GroupCopyData => data?.paster === GROUP_PASTER;

/** Ob `inner` in `outer` steckt: in einem seiner Eingänge – nicht bloß unter ihm im Stapel. */
function inside(inner: Blockly.Block, outer: Blockly.Block): boolean {
  for (let child = inner, parent = child.getParent(); parent; child = parent, parent = child.getParent()){
    if (parent === outer) return outer.getNextBlock() !== child;
  }
  return false;
}

/**
 * Die Blöcke einer Auswahl, auf die es ankommt: ohne Schattenblöcke und ohne die, die ohnehin in einem
 * anderen gewählten Block stecken (der nimmt sie beim Kopieren mit).
 */
export function topPicked<T extends Blockly.Block>(blocks: T[]): T[] {
  const real = blocks.filter(b => !b.isShadow());
  return real.filter(b => !real.some(other => other !== b && inside(b, other)));
}

/**
 * Macht aus einer Auswahl, was in die Zwischenablage kommt. Gewählte Blöcke, die direkt untereinander
 * hängen, bleiben ein Stapel; jeder Block bringt mit, was in ihm steckt. Was unter dem letzten gewählten
 * Block eines Stapels hängt, bleibt weg.
 */
export function groupStates(blocks: Blockly.Block[]): State[] {
  const tops = topPicked(blocks), chosen = new Set(tops);
  /** Der gewählte Block direkt darüber im selben Stapel. */
  const above = (b: Blockly.Block) => { const prev = b.getPreviousBlock(); return prev && chosen.has(prev) && prev.getNextBlock() === b ? prev : null; };
  const save = (b: Blockly.Block) => Blockly.serialization.blocks.save(b, {addCoordinates:false, addNextBlocks:false, saveIds:false});
  const stacks: State[] = [];
  for (const head of tops){
    if (above(head)) continue;
    const first = save(head);
    if (!first) continue;
    let last = first;
    for (let b = head.getNextBlock(); b && chosen.has(b); b = b.getNextBlock()){
      const state = save(b);
      if (!state) break;
      last.next = {block:state}; last = state;
    }
    const at = head.getRelativeToSurfaceXY();
    stacks.push({...first, x:at.x, y:at.y});
  }
  return stacks;
}

/**
 * Fügt die Blöcke aus der Zwischenablage ein – ein Stück neben den Originalen, in derselben Anordnung –
 * und liefert die neuen Blöcke (je Stapel alle, die untereinander hängen). Rückgängig macht es ein Schritt.
 */
export function pasteGroup(data: GroupCopyData, ws: Blockly.Workspace): Blockly.Block[] {
  const shift = PASTE_STEP * ++data.pasted, created: Blockly.Block[] = [];
  const grouped = !Blockly.Events.getGroup();
  if (grouped) Blockly.Events.setGroup(true);
  try {
    for (const stack of data.stacks){
      const head = Blockly.serialization.blocks.append({...stack, x:(stack.x ?? 0) + shift, y:(stack.y ?? 0) + shift}, ws, {recordUndo:true});
      for (let b: Blockly.Block | null = head; b; b = b.getNextBlock()) created.push(b);
    }
  } finally { if (grouped) Blockly.Events.setGroup(false); }
  return created;
}

/** Legt eine Auswahl in die Zwischenablage. Liefert false, wenn es nichts zu kopieren gab. */
export function copyGroup(ws: Blockly.WorkspaceSvg, blocks: Blockly.Block[]): boolean {
  const stacks = groupStates(blocks);
  if (!stacks.length) return false;
  const data: GroupCopyData = {paster:GROUP_PASTER, stacks, pasted:0};
  Blockly.clipboard.setLastCopiedData(data);
  Blockly.clipboard.setLastCopiedWorkspace(ws);
  Blockly.clipboard.setLastCopiedLocation(new Blockly.utils.Coordinate(Math.min(...stacks.map(s => s.x ?? 0)), Math.min(...stacks.map(s => s.y ?? 0))));
  return true;
}

/** Wird gerufen, nachdem mehrere Blöcke eingefügt wurden – auch wenn Blockly selbst einfügt (Menü). */
let pastedListener: ((blocks: Blockly.Block[]) => void) | null = null;
export function onGroupPasted(listener: (blocks: Blockly.Block[]) => void){ pastedListener = listener; }
/** Fügt ein und meldet es dem, der die neuen Blöcke markieren will. */
export function pasteGroupAndTell(data: GroupCopyData, ws: Blockly.Workspace): Blockly.Block[] {
  const blocks = pasteGroup(data, ws);
  pastedListener?.(blocks);
  return blocks;
}
// Fügt Blockly selbst ein (ein Menüpunkt »Einfügen«), landet es hier. Die Stelle, die Blockly dabei
// mitgibt, gilt für einen einzelnen Block – mehrere behalten ihre Anordnung neben den Originalen.
// (Blockly erwartet zurück, was eingefügt wurde: Das ist der erste der neuen Blöcke.)
Blockly.clipboard.registry.register<GroupCopyData, Blockly.ICopyable<GroupCopyData>>(GROUP_PASTER, {
  paste(data, ws){ return (pasteGroupAndTell(data, ws)[0] ?? null) as unknown as Blockly.ICopyable<GroupCopyData> | null; }
});
