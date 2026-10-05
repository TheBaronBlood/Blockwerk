// ---------------------------------------------------------------
// Übersicht der Hilfe: Blöcke in der Reihenfolge des Werkzeugkastens
// ---------------------------------------------------------------
import { toolbox } from '../toolbox';

export interface HelpCategory { name: string; types: string[] }

interface ToolboxItem { kind: string; name?: string; type?: string; contents?: ToolboxItem[] }

/** Kategorien, deren Inhalt Blockly erst zur Laufzeit zusammenstellt. */
const DYNAMIC: Record<string, string[]> = {
  'Variablen': ['variables_set', 'math_change', 'variables_get'],
  'Meine Blöcke': ['procedures_defnoreturn', 'procedures_callnoreturn', 'procedures_defreturn', 'procedures_callreturn', 'procedures_ifreturn']
};

export const HELP_CATEGORIES: HelpCategory[] = (toolbox as unknown as {contents: ToolboxItem[]}).contents
  .filter(c => c.kind === 'category')
  .map(c => ({
    name: c.name!,
    types: DYNAMIC[c.name!] ?? [...new Set((c.contents ?? []).filter(i => i.kind === 'block').map(i => i.type!))]
  }))
  // Platzhalter stehen nicht im Werkzeugkasten; sie entstehen nur beim Öffnen von SPIKE-Projekten
  .concat([{name:'SPIKE-Import', types:['pb_unsupported', 'pb_unsupported_value']}]);
