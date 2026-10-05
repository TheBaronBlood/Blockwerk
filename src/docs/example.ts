// ---------------------------------------------------------------
// Beispielprogramm einer Hilfeseite mit dem echten Generator übersetzen
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { generate, type CodeLine } from '../generator';
import type { WorkspaceState } from '../examples';

export interface ExampleCode {
  lines: CodeLine[];
  /** Zeilennummern (ab 0), die aus dem erklärten Block entstehen. */
  focus: Set<number>;
  warnings: string[];
}

/** Übersetzt ein Beispiel und merkt sich, welche Zeilen zum Blocktyp `type` gehören. */
export function runExample(state: WorkspaceState, type: string): ExampleCode {
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, ws);
    const {lines, warnings} = generate(ws);
    const ids = new Set<string>();
    for (const b of ws.getBlocksByType(type)){
      // Werteblöcke erzeugen keine eigene Zeile – es zählt die Anweisung, in der sie stecken
      let stmt: Blockly.Block = b;
      while (stmt.outputConnection && stmt.getParent()) stmt = stmt.getParent()!;
      ids.add(stmt.id);
    }
    const focus = new Set<number>();
    lines.forEach((l, i) => { if (l.id && ids.has(l.id)) focus.add(i); });
    // Eigene Blöcke: die ganze Funktion von »def« bis zum Ende der Einrückung
    if (type === 'procedures_defnoreturn' || type === 'procedures_defreturn'){
      let inDef = false;
      lines.forEach((l, i) => {
        if (l.text.startsWith('def ')) inDef = true;
        else if (l.text.trim() && !/^\s/.test(l.text)) inDef = false;
        if (inDef && l.text.trim()) focus.add(i);
      });
    }
    return {lines, focus, warnings};
  } finally { ws.dispose(); }
}
