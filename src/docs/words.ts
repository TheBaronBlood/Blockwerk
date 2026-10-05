// ---------------------------------------------------------------
// Wo ein Python-Wort vorkommt: Welche Blöcke erzeugen es, wie sieht die Zeile aus, in
// welchem Kapitel steht mehr dazu? Die Angaben entstehen aus den Beispielprogrammen der
// Blockhilfe und den Python-Kapiteln – sie müssen nicht von Hand gepflegt werden.
// Ohne DOM: Die Beispiele werden auf einer Arbeitsfläche ohne Oberfläche übersetzt.
// ---------------------------------------------------------------
import { BLOCK_DOCS } from './blocks';
import { runExample } from './example';
import { PY_CHAPTERS } from './python';

export interface WordUsage {
  /** Blöcke, deren eigene Zeilen das Wort enthalten, mit diesen Zeilen. */
  blocks: {type: string; lines: string[]}[];
  /** Eine Zeile aus dem Kopf eines Programms (Importe, Geräte), falls kein Block das Wort selbst erzeugt. */
  header: string[];
  /** Kapitel, deren Beispiel das Wort benutzt. */
  chapters: string[];
}

/** Die Wörter einer Codezeile, ohne Kommentare und Texte in Anführungszeichen. */
export const wordsOf = (line: string): string[] => line.replace(/#.*$/, '').replace(/'[^']*'|"[^"]*"/g, '').match(/[A-Za-z_]\w*/g) ?? [];

let index: Map<string, WordUsage> | null = null;

function build(){
  const map = new Map<string, WordUsage>();
  const entry = (word: string) => { let e = map.get(word); if (!e){ e = {blocks:[], header:[], chapters:[]}; map.set(word, e); } return e; };
  for (const [type, doc] of Object.entries(BLOCK_DOCS)){
    let ex;
    try { ex = runExample(doc.example(), type); } catch { continue; }
    let own = ex.lines.filter((_, i) => ex.focus.has(i)).map(l => l.text.trim());
    // Bei eigenen Blöcken gilt die ganze Funktion als »seine« Zeilen; erzeugt hat er davon nur die erste
    if (type.startsWith('procedures_def')) own = own.filter(l => l.startsWith('def '));
    for (const word of new Set(own.flatMap(wordsOf))){
      entry(word).blocks.push({type, lines:own.filter(l => wordsOf(l).includes(word)).slice(0, 2)});
    }
    // der Kopf (alles ohne Block) erklärt Wörter wie »import« oder »PrimeHub«
    for (const l of ex.lines){
      if (l.id || !l.text.trim() || l.text.trim().startsWith('#')) continue;
      for (const word of new Set(wordsOf(l.text))){ const e = entry(word); if (e.header.length < 2 && !e.header.includes(l.text)) e.header.push(l.text); }
    }
  }
  for (const c of PY_CHAPTERS){
    for (const word of new Set(c.code.split('\n').flatMap(wordsOf))) entry(word).chapters.push(c.id);
  }
  return map;
}

/** Fundstellen eines Worts. Das Verzeichnis entsteht beim ersten Aufruf. */
export function wordUsage(word: string): WordUsage {
  index ??= build();
  return index.get(word) ?? {blocks:[], header:[], chapters:[]};
}
