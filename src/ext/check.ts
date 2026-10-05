// ---------------------------------------------------------------
// Prüfprogramm für eine Erweiterung: Kopf und jeder Block einmal mit seinen Vorgabewerten.
// Lässt es sich übersetzen, ist der Python-Code der Erweiterung zumindest frei von Tippfehlern.
// ---------------------------------------------------------------
import type { ExtInput, Extension } from './parse';

const PREFIX: Record<string, string> = {motor:'motor', color:'farbe', ultra:'abstand', force:'kraft'};

function sample(input: ExtInput): string {
  if (input.kind === 'choice') return input.options[0][1];
  if (input.kind === 'device') return `${PREFIX[input.device]}_${input.def}`;
  if (input.check === 'String') return JSON.stringify(input.def);
  if (input.check === 'Boolean') return /^(wahr|true|ja)$/i.test(input.def) ? 'True' : 'False';
  return input.def || '0';
}

export function testProgram(ext: Extension): string {
  const out: string[] = [];
  for (const [mod, names] of ext.fromImports) out.push(`from ${mod} import ${names.join(', ')}`);
  out.push(...ext.plainImports, ...ext.head);
  for (const block of ext.blocks){
    const values = new Map(block.inputs.map(i => [i.name, sample(i)]));
    const lines = block.code.map(l => l.replace(/\{([A-Z][A-Z0-9_]*)\}/g, (all, name: string) => values.get(name) ?? all));
    out.push('', `# Block: ${block.message}`);
    if (block.output) out.push(`_ = (${lines[0]})`); else out.push(...lines);
  }
  return out.join('\n') + '\n';
}
