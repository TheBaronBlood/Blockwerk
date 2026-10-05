// ---------------------------------------------------------------
// Erweiterungen bei Blockly anmelden: Blockdefinitionen, Python-Generator, Werkzeugkasten.
// Läuft ohne DOM – die Tests nutzen eine Arbeitsfläche ohne Oberfläche.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { pythonGenerator as py, Order } from 'blockly/python';
import { useDevice, useDrive, useHeaderPart, type HeaderPart } from '../generator';
import { N, T } from '../toolbox';
import type { ExtBlock, ExtInput, Extension } from './parse';

const PORTS = 'ABCDEF'.split('').map((p): [string, string] => [p, p]);
const EMPTY: Record<string, string> = {Number:'0', String:"''", Boolean:'False'};

/** Blocktyp eines Blocks; `prefix` trennt die Vorschau im Editor von den installierten Blöcken. */
export const blockType = (ext: Extension, block: ExtBlock, prefix = 'ext') => `${prefix}_${ext.id}_${block.id}`;
/** Erkennt Blöcke aus Erweiterungen am Typ. */
export const isExtensionType = (type: string, extId?: string) => type.startsWith(extId ? `ext_${extId}_` : 'ext_');

function blockJson(ext: Extension, block: ExtBlock){
  const args = block.inputs.map((input) =>
    input.kind === 'value' ? {type:'input_value', name:input.name, ...(input.check ? {check:input.check} : {})}
    : {type:'field_dropdown', name:input.name, options:input.kind === 'choice' ? input.options : PORTS});
  return {
    message0:block.message, args0:args, inputsInline:true, colour:ext.colour,
    tooltip:block.tooltip || `Erweiterung »${ext.name}«`,
    ...(block.output ? {output:block.output.check} : {previousStatement:null, nextStatement:null})
  };
}

// Ein Wert darf ohne Klammern eingesetzt werden, wenn er für sich steht (Name, Zahl, Text)
// oder die Stelle im Code ohnehin von Klammern oder Kommas begrenzt ist.
const ATOM = /^[\w.]+$|^'[^'\\]*'$|^"[^"\\]*"$/;
function insert(line: string, start: number, end: number, code: string): string {
  const before = line.slice(0, start).trimEnd().slice(-1), after = line.slice(end).trimStart().charAt(0);
  const enclosed = '([,'.includes(before) && before !== '' && '),]'.includes(after) && after !== '';
  return ATOM.test(code) || enclosed ? code : `(${code})`;
}
/** Ein einzelner Aufruf wie »regler.wert(x)« bindet fest; alles andere bekommt bei Bedarf Klammern. */
function isCall(code: string): boolean {
  const m = code.match(/^[\w.]+\(/);
  if (!m) return ATOM.test(code);
  let depth = 0;
  for (let i = m[0].length - 1; i < code.length; i++){
    if (code[i] === '(') depth++;
    else if (code[i] === ')' && --depth === 0) return i === code.length - 1;
  }
  return false;
}

function valueOf(b: Blockly.Block, input: ExtInput): string {
  if (input.kind === 'choice') return b.getFieldValue(input.name);
  if (input.kind === 'device') return useDevice(input.device, b.getFieldValue(input.name));
  return py.valueToCode(b, input.name, Order.NONE) || EMPTY[input.check || 'Number'];
}

function generatorFor(part: HeaderPart, block: ExtBlock){
  return (b: Blockly.Block) => {
    useHeaderPart(part);
    if (block.usesDrive) useDrive();
    const values = new Map(block.inputs.map(input => [input.name, valueOf(b, input)]));
    // Werte einer Auswahl hat die Erweiterung selbst festgelegt; sie stehen so im Code, wie sie dort stehen
    const literal = new Set(block.inputs.filter(input => input.kind === 'choice').map(input => input.name));
    const lines = block.code.map(line => line.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (all: string, name: string, at: number) => {
      const code = values.get(name);
      return code === undefined ? all : literal.has(name) ? code : insert(line, at, at + all.length, code);
    }));
    if (!block.output) return lines.join('\n') + '\n';
    return [lines[0], isCall(lines[0]) ? Order.FUNCTION_CALL : Order.NONE] as [string, Order];
  };
}

/** Meldet die Blöcke einer Erweiterung an und liefert ihre Typen. */
export function registerExtension(ext: Extension, prefix = 'ext'): string[] {
  const part: HeaderPart = {id:ext.id, title:ext.name, lines:ext.head, fromImports:ext.fromImports, plainImports:ext.plainImports, modules:ext.modules};
  // Namen aus dem Kopf sind vergeben – eine Variable der Schüler darf nicht genauso heißen
  if (prefix === 'ext' && ext.defines.length) py.addReservedWords(ext.defines.join(','));
  return ext.blocks.map((block) => {
    const type = blockType(ext, block, prefix), json = blockJson(ext, block);
    Blockly.Blocks[type] = {init(this: Blockly.Block){ this.jsonInit(json); }};
    py.forBlock[type] = generatorFor(part, block);
    return type;
  });
}
export function unregisterTypes(types: string[]){
  for (const type of types){ delete Blockly.Blocks[type]; delete py.forBlock[type]; }
}

/** Einträge für den Werkzeugkasten, mit den Vorgabewerten als Schattenblöcken. */
export function toolboxBlocks(ext: Extension, prefix = 'ext'){
  return ext.blocks.map((block) => {
    const inputs: Record<string, unknown> = {}, fields: Record<string, string> = {};
    for (const input of block.inputs){
      if (input.kind === 'device') fields[input.name] = input.def;
      else if (input.kind === 'value'){
        if (input.check === 'Number') inputs[input.name] = N(Number(input.def));
        else if (input.check === 'String') inputs[input.name] = T(input.def);
        else if (input.check === 'Boolean') inputs[input.name] = {shadow:{type:'logic_boolean', fields:{BOOL:/^(wahr|true|ja)$/i.test(input.def) ? 'TRUE' : 'FALSE'}}};
      }
    }
    return {kind:'block', type:blockType(ext, block, prefix), inputs, fields};
  });
}
export const toolboxCategory = (ext: Extension) => ({kind:'category', name:ext.name, colour:ext.colour, contents:toolboxBlocks(ext)});

/**
 * Entfernt aus einem gespeicherten Projekt alle Blöcke, auf die `drop` zutrifft. Eine
 * Anweisung wird durch ihren Nachfolger ersetzt, ein Wert verschwindet aus seinem Eingabefeld.
 */
export function stripBlocks<T>(state: T, drop: (type: string) => boolean): T {
  type B = {type: string; next?: {block?: B}; inputs?: Record<string, {block?: B; shadow?: B}>};
  const clean = (b: B | undefined): B | undefined => {
    while (b && drop(b.type)) b = b.next?.block;
    if (!b) return undefined;
    const out: B = {...b};
    if (b.next){ const next = clean(b.next.block); if (next) out.next = {...b.next, block:next}; else delete out.next; }
    if (b.inputs){
      out.inputs = {};
      for (const [name, input] of Object.entries(b.inputs)){
        const block = clean(input.block), copy = {...input};
        if (block) copy.block = block; else delete copy.block;
        if (copy.block || copy.shadow) out.inputs[name] = copy;
      }
    }
    return out;
  };
  const s = state as {blocks?: {blocks?: B[]}};
  if (!s.blocks?.blocks) return state;
  return {...s, blocks:{...s.blocks, blocks:s.blocks.blocks.map(clean).filter((b): b is B => !!b)}} as T;
}
