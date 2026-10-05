// ---------------------------------------------------------------
// Syntaxhervorhebung
// ---------------------------------------------------------------
const KW = new Set('from import def async await return while for in if elif else not and or True False None global pass break continue is lambda as class try except finally raise with yield del assert'.split(' '));
const CLS = new Set('PrimeHub Motor ColorSensor UltrasonicSensor ForceSensor DriveBase Port Direction Stop Color Button Icon StopWatch XboxController Remote'.split(' '));
const BI = new Set('range print abs str int float round min max len chr self bool list dict sum'.split(' '));
/** Ordnet ein Wort ein – für die Hilfe, die damit sagt, woher es kommt. */
export function wordKind(word: string): 'keyword' | 'class' | 'builtin' | 'name' {
  return KW.has(word) ? 'keyword' : CLS.has(word) ? 'class' : BI.has(word) ? 'builtin' : 'name';
}
/** @param hasDoc Wörter, für die es eine Erklärung gibt, werden anklickbar (Klasse `tk-doc`). */
export function highlight(line: string, el: HTMLElement, hasDoc?: (word: string) => boolean){
  const re = /(#.*$)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_]\w*)|(\s+)|([^\sA-Za-z_\d"'#]+)/g;
  let mm;
  while ((mm = re.exec(line))){
    let cls = null;
    const t = mm[0];
    if (mm[1]) cls = 'tk-com'; else if (mm[2]) cls = 'tk-str'; else if (mm[3]) cls = 'tk-num';
    else if (mm[4]){
      if (KW.has(t)) cls = 'tk-kw';
      else if (CLS.has(t)) cls = 'tk-cls';
      else if (BI.has(t)) cls = 'tk-bi';
      else if (line[re.lastIndex] === '(') cls = 'tk-fn';
    }
    const doc = !!mm[4] && !!hasDoc && hasDoc(t);
    if (cls || doc){
      const s = document.createElement('span'); s.className = [cls, doc ? 'tk-doc' : ''].filter(Boolean).join(' '); s.textContent = t;
      if (doc) s.dataset.word = t;
      el.appendChild(s);
    }
    else el.appendChild(document.createTextNode(t));
  }
}

const span = (el: HTMLElement, cls: string, text: string) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; el.appendChild(s); return s; };
const INPUT_WORDS = new Set(['eingabe', 'auswahl', 'motor', 'farbsensor', 'abstandssensor', 'kraftsensor']);
// Hervorhebung für den Quelltext einer Erweiterung: Python wie gewohnt, dazu die Zeilen
// »# blockwerk: …« (Schlüsselwort, Namen, %1) und die Platzhalter {NAME} im Code.
export function highlightExtension(line: string, el: HTMLElement){
  const dir = line.match(/^(\s*#\s*blockwerk:)(\s*)([\wäöüß]*)(.*)$/i);
  if (!dir){
    // Platzhalter herauslösen, den Rest wie Python färben
    let at = 0;
    for (const m of line.matchAll(/\{[A-Z][A-Z0-9_]*\}/g)){
      highlight(line.slice(at, m.index), el);
      span(el, 'tk-ph', m[0]);
      at = m.index! + m[0].length;
    }
    highlight(line.slice(at), el);
    return;
  }
  span(el, 'tk-dir-mark', dir[1]); el.appendChild(document.createTextNode(dir[2])); span(el, 'tk-dir', dir[3]);
  let rest = dir[4];
  // nach »eingabe«, »auswahl«, »motor« … folgt der Name, der im Code als {NAME} steht
  const name = INPUT_WORDS.has(dir[3].toLowerCase()) ? rest.match(/^(\s*)([A-Za-z]\w*)/) : null;
  if (name){ el.appendChild(document.createTextNode(name[1])); span(el, 'tk-ph', name[2]); rest = rest.slice(name[0].length); }
  for (const part of rest.split(/(%\d+|#[0-9a-fA-F]{6}\b)/)){
    if (!part) continue;
    if (/^%\d+$/.test(part)) span(el, 'tk-ph', part);
    else if (/^#[0-9a-fA-F]{6}$/.test(part)) span(el, 'tk-colour', part).style.setProperty('--swatch', part);
    else span(el, 'tk-dir-arg', part);
  }
}
