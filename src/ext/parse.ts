// ---------------------------------------------------------------
// Erweiterungen: eigene Blöcke mit eigenem Python-Code.
// Eine Erweiterung ist eine Python-Datei; Kommentare der Form »# blockwerk: …« sagen,
// was die folgenden Zeilen sind. Dieses Modul liest so eine Datei (ohne DOM, ohne Blockly).
//
//   # blockwerk: erweiterung PID-Regler      Name – muss als Erstes stehen
//   # blockwerk: farbe #8C5FDD               Farbe der Blöcke
//   # blockwerk: beschreibung …              Text für die Übersicht bzw. den Tooltip eines Blocks
//   # blockwerk: kopf                        Code, der einmal vor dem Programm steht
//   # blockwerk: modul name                  eigene Python-Datei, die mit auf den Hub geladen wird
//   # blockwerk: block Text mit %1 und %2    ein Block; darunter sein Python-Code
//   # blockwerk: eingabe NAME Zahl 10        Eingabefeld (Zahl, Text, Wahrheit, beliebig) mit Vorgabe
//   # blockwerk: auswahl NAME Links=-1, Rechts=1
//   # blockwerk: motor NAME C                Anschluss wählen; auch farbsensor, abstandssensor, kraftsensor
//   # blockwerk: ausgabe Zahl                der Block liefert einen Wert
//   # blockwerk: benutzt fahrbasis           der Code verwendet »roboter«
//   # blockwerk: id name                     fester Name des Blocks (sonst aus dem Text gebildet)
//
// Im Code eines Blocks steht {NAME} für den Wert des Eingabefelds.
// ---------------------------------------------------------------

export type ValueCheck = 'Number' | 'String' | 'Boolean' | null;
export type DeviceKind = 'motor' | 'color' | 'ultra' | 'force';

export type ExtInput =
  | {name: string; kind: 'value'; check: ValueCheck; def: string}
  | {name: string; kind: 'choice'; options: [string, string][]}
  | {name: string; kind: 'device'; device: DeviceKind; def: string};

export interface ExtBlock {
  /** Name innerhalb der Erweiterung; zusammen mit ihrer id der Blocktyp. */
  id: string;
  /** Text des Blocks mit %1, %2 … für die Eingaben. */
  message: string;
  inputs: ExtInput[];
  /** null: Anweisung; sonst liefert der Block einen Wert dieser Art. */
  output: {check: ValueCheck} | null;
  code: string[];
  tooltip: string;
  usesDrive: boolean;
}
export interface ExtModule { name: string; source: string }
export interface Extension {
  id: string; name: string; colour: string; description: string;
  /** Code vor dem Programm, ohne die Importzeilen. */
  head: string[];
  /** »from x import a, b« aus dem Kopf: Modul → Namen. */
  fromImports: [string, string[]][];
  /** »import x« aus dem Kopf. */
  plainImports: string[];
  /** Namen, die der Kopf anlegt (Funktionen, Klassen, Variablen). */
  defines: string[];
  modules: ExtModule[];
  blocks: ExtBlock[];
  source: string;
}
export interface ExtError { line: number; text: string }
export interface ParseResult { ext: Extension | null; errors: ExtError[] }

export const DEFAULT_COLOUR = '#5C7CFA';
const CHECKS: Record<string, {check: ValueCheck; def: string}> = {
  zahl:{check:'Number', def:'0'}, text:{check:'String', def:''}, wahrheit:{check:'Boolean', def:'falsch'}, beliebig:{check:null, def:''}
};
const DEVICES: Record<string, DeviceKind> = {motor:'motor', farbsensor:'color', abstandssensor:'ultra', kraftsensor:'force'};
const UMLAUT: Record<string, string> = {'ä':'ae','ö':'oe','ü':'ue','ß':'ss'};

/** Macht aus einem Namen einen Bezeichner aus Kleinbuchstaben, Ziffern und Unterstrichen. */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[äöüß]/g, c => UMLAUT[c]).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
const unquote = (s: string) => s.trim().replace(/^(["'»])(.*)(["'«])$/, '$2');
// Leerzeilen am Rand weg – und Kommentare am Ende eines Abschnitts: Die erklären den
// nächsten Abschnitt der Datei und gehören nicht ins erzeugte Programm.
const trimBlank = (lines: string[]) => {
  const out = [...lines];
  while (out.length && !out[0].trim()) out.shift();
  while (out.length && (!out[out.length - 1].trim() || out[out.length - 1].startsWith('#'))) out.pop();
  return out;
};

export function parseExtension(source: string): ParseResult {
  const errors: ExtError[] = [];
  const err = (line: number, text: string) => { errors.push({line, text}); };
  const ext: Extension = {id:'', name:'', colour:DEFAULT_COLOUR, description:'', head:[], fromImports:[], plainImports:[], defines:[], modules:[], blocks:[], source};

  type Section = {kind:'none'} | {kind:'head'; lines: string[]} | {kind:'module'; name: string; lines: string[]} | {kind:'block'; block: ExtBlock; line: number};
  let section: Section = {kind:'none'};
  const headLines: string[] = [];
  const close = () => {
    if (section.kind === 'head') headLines.push(...trimBlank(section.lines), '');
    else if (section.kind === 'module') ext.modules.push({name:section.name, source:trimBlank(section.lines).join('\n') + '\n'});
    else if (section.kind === 'block') finishBlock(section.block, section.line);
  };
  const finishBlock = (b: ExtBlock, line: number) => {
    b.code = trimBlank(b.code);
    if (!b.code.length) err(line, `Der Block »${b.message}« hat keinen Python-Code.`);
    if (b.output && b.code.length > 1) err(line, `Der Block »${b.message}« liefert einen Wert; sein Code darf nur aus einer Zeile bestehen.`);
    // gemeinsame Einrückung entfernen, damit der Code an jeder Stelle des Programms passt
    const indent = Math.min(...b.code.filter(l => l.trim()).map(l => l.length - l.trimStart().length), 99);
    b.code = b.code.map(l => l.slice(Math.min(indent, l.length - l.trimStart().length)));
    // Eingaben, die im Text fehlen, hinten anhängen; Verweise auf nicht vorhandene melden
    const used = [...b.message.matchAll(/%(\d+)/g)].map(m => Number(m[1]));
    for (const n of used) if (n < 1 || n > b.inputs.length) err(line, `Im Text von »${b.message}« steht %${n}, es gibt aber nur ${b.inputs.length} Eingabe(n).`);
    b.inputs.forEach((_, i) => { if (!used.includes(i + 1)) b.message += ` %${i + 1}`; });
    const names = new Set(b.inputs.map(i => i.name));
    for (const l of b.code) for (const m of l.matchAll(/\{([A-Z][A-Z0-9_]*)\}/g)){
      if (!names.has(m[1])) err(line, `Im Code von »${b.message}« steht {${m[1]}}, aber es gibt keine Eingabe mit diesem Namen.`);
    }
    if (!b.id) b.id = slug(b.message.replace(/%\d+/g, ' ')) || `block${ext.blocks.length + 1}`;
    if (ext.blocks.some(o => o.id === b.id)) err(line, `Zwei Blöcke heißen »${b.id}«. Gib einem mit »# blockwerk: id …« einen eigenen Namen.`);
    ext.blocks.push(b);
  };

  source.replace(/\r\n?/g, '\n').split('\n').forEach((raw, idx) => {
    const line = idx + 1;
    const dm = raw.match(/^\s*#\s*blockwerk:\s*([\wäöüß]+)\s*(.*)$/i);
    if (!dm){
      if (section.kind === 'head' || section.kind === 'module') section.lines.push(raw);
      else if (section.kind === 'block') section.block.code.push(raw);
      else if (raw.trim() && !raw.trim().startsWith('#')) err(line, 'Diese Zeile gehört zu keinem Abschnitt. Davor fehlt »# blockwerk: kopf« oder »# blockwerk: block …«.');
      return;
    }
    const key = dm[1].toLowerCase(), rest = dm[2].trim();
    const block = section.kind === 'block' ? section.block : null;
    const input = (make: (name: string, args: string) => ExtInput | string) => {
      if (!block){ err(line, `»${key}« gehört unter einen Block.`); return; }
      const m = rest.match(/^([A-Za-z][A-Za-z0-9_]*)\s*(.*)$/);
      if (!m){ err(line, `Nach »${key}« fehlt der Name der Eingabe, zum Beispiel »${key} WERT«.`); return; }
      const name = m[1].toUpperCase();
      if (block.inputs.some(i => i.name === name)){ err(line, `Die Eingabe ${name} gibt es in diesem Block schon.`); return; }
      const made = make(name, m[2].trim());
      if (typeof made === 'string') err(line, made); else block.inputs.push(made);
    };

    if (key === 'erweiterung'){
      ext.name = unquote(rest); ext.id = slug(ext.name);
      if (!ext.id) err(line, 'Die Erweiterung braucht einen Namen aus Buchstaben oder Ziffern.');
    } else if (key === 'farbe'){
      if (/^#[0-9a-f]{6}$/i.test(rest)) ext.colour = rest.toUpperCase();
      else err(line, 'Die Farbe muss so aussehen: #8C5FDD (Raute und sechs Zeichen aus 0–9 und A–F).');
    } else if (key === 'beschreibung'){
      if (block) block.tooltip = rest; else ext.description = rest;
    } else if (key === 'kopf'){
      close(); section = {kind:'head', lines:[]};
    } else if (key === 'modul'){
      close();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(rest)){ err(line, 'Ein Modul braucht einen Namen wie in Python, zum Beispiel »# blockwerk: modul pid«.'); section = {kind:'none'}; }
      else if (rest === '__main__' || ext.modules.some(m => m.name === rest)){ err(line, `Den Modulnamen »${rest}« gibt es schon.`); section = {kind:'none'}; }
      else section = {kind:'module', name:rest, lines:[]};
    } else if (key === 'block'){
      close();
      const message = unquote(rest);
      if (!message) err(line, 'Nach »block« fehlt der Text, der auf dem Block steht.');
      section = {kind:'block', line, block:{id:'', message:message || 'Block', inputs:[], output:null, code:[], tooltip:'', usesDrive:false}};
    } else if (key === 'id'){
      if (!block) err(line, '»id« gehört unter einen Block.');
      else if (!slug(rest)) err(line, 'Nach »id« fehlt der Name.');
      else block.id = slug(rest);
    } else if (key === 'eingabe'){
      input((name, args) => {
        const m = args.match(/^(\S+)\s*(.*)$/);
        const type = CHECKS[(m ? m[1] : 'zahl').toLowerCase()];
        if (!type) return `Die Art »${m![1]}« gibt es nicht. Möglich sind Zahl, Text, Wahrheit und beliebig.`;
        const def = m && m[2] ? unquote(m[2]) : type.def;
        if (type.check === 'Number' && !/^-?\d+(\.\d+)?$/.test(def)) return `Die Vorgabe »${def}« ist keine Zahl.`;
        return {name, kind:'value', check:type.check, def};
      });
    } else if (key === 'auswahl'){
      input((name, args) => {
        const options = args.split(',').map(o => o.trim()).filter(Boolean).map((o): [string, string] => {
          const eq = o.indexOf('=');
          return eq < 0 ? [o, o] : [o.slice(0, eq).trim(), o.slice(eq + 1).trim()];
        });
        if (!options.length || options.some(([label, value]) => !label || !value)) return 'Die Auswahl braucht Einträge wie »Links=-1, Rechts=1«.';
        return {name, kind:'choice', options};
      });
    } else if (DEVICES[key]){
      input((name, args) => {
        const port = (args || 'A').toUpperCase();
        if (!/^[A-F]$/.test(port)) return 'Der Anschluss muss ein Buchstabe von A bis F sein.';
        return {name, kind:'device', device:DEVICES[key], def:port};
      });
    } else if (key === 'ausgabe'){
      const type = CHECKS[(rest || 'beliebig').toLowerCase()];
      if (!block) err(line, '»ausgabe« gehört unter einen Block.');
      else if (!type) err(line, `Die Art »${rest}« gibt es nicht. Möglich sind Zahl, Text, Wahrheit und beliebig.`);
      else block.output = {check:type.check};
    } else if (key === 'benutzt'){
      if (!block) err(line, '»benutzt« gehört unter einen Block.');
      else if (rest.toLowerCase() === 'fahrbasis') block.usesDrive = true;
      else err(line, 'Bekannt ist nur »benutzt fahrbasis«.');
    } else err(line, `Das Wort »${dm[1]}« kennt Blockwerk nicht.`);
  });
  close();

  if (!ext.name) err(1, 'Die erste Zeile muss den Namen nennen: »# blockwerk: erweiterung Mein Name«.');
  if (!ext.blocks.length) err(1, 'Die Erweiterung enthält noch keinen Block (»# blockwerk: block …«).');

  // Importe aus dem Kopf herauslösen; Blockwerk führt sie mit den übrigen Importen zusammen
  for (const l of trimBlank(headLines)){
    const from = l.match(/^from\s+([\w.]+)\s+import\s+([\w\s,]+?)\s*(#.*)?$/);
    const plain = l.match(/^import\s+[\w.]+(\s+as\s+\w+)?\s*$/);
    if (from) ext.fromImports.push([from[1], from[2].split(',').map(n => n.trim()).filter(Boolean)]);
    else if (plain) ext.plainImports.push(l.trim().replace(/\s+/g, ' '));
    else ext.head.push(l);
    const def = l.match(/^(?:def|class)\s+(\w+)/) || l.match(/^(\w+)\s*=[^=]/);
    if (def && !ext.defines.includes(def[1])) ext.defines.push(def[1]);
  }
  ext.head = trimBlank(ext.head);
  return {ext: ext.name ? ext : null, errors};
}

/** Schreibt die Farbe in den Quelltext – ändert die vorhandene Zeile oder fügt eine ein. */
export function setColour(source: string, colour: string): string {
  const re = /^(\s*#\s*blockwerk:\s*farbe)\b.*$/im;
  if (re.test(source)) return source.replace(re, `$1 ${colour.toUpperCase()}`);
  const lines = source.split('\n');
  const at = lines.findIndex(l => /^\s*#\s*blockwerk:\s*erweiterung\b/i.test(l));
  lines.splice(at + 1, 0, `# blockwerk: farbe ${colour.toUpperCase()}`);
  return lines.join('\n');
}
