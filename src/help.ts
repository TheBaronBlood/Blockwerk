// ---------------------------------------------------------------
// Hilfebereich. Aufbau wie eine Anleitung zum Durcharbeiten:
//   Startseite  →  »Erste Schritte« (Lektionen der Reihe nach)
//               →  Blöcke nach Kategorie  →  Seite je Block, immer gleich gegliedert
//               →  »Python verstehen« (Kapitel der Reihe nach)
// Oben steht, wo man gerade ist; unten geht es zur vorigen und zur nächsten Seite.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { BLOCK_DOCS } from './docs/blocks';
import { classByName, methodInLine, methodName, methodText, methodUsage, PY_CLASSES, type PyClass, type PyMethod } from './docs/classes';
import { runExample } from './docs/example';
import { HELP_CATEGORIES } from './docs/index';
import { METHODS, MODULES, quizResult, saveQuizResult } from './docs/kurs';
import { LESSONS } from './docs/lessons';
import { PY_CHAPTERS, PY_DOCS } from './docs/python';
import { summary } from './docs/summary';
import { wordUsage } from './docs/words';
import { highlight, wordKind } from './highlight';
import { BLOCKLY_MEDIA } from './theme';
import { toolbox } from './toolbox';
import type { CodeLine } from './generator';
import type { WorkspaceState } from './examples';

export interface Help {
  showIndex(): void;
  showBlock(type: string): void;
  /** @param context die Codezeile, in der das Wort angeklickt wurde */
  showWord(word: string, context?: string): void;
  hasBlock(type: string): boolean;
  hasWord(word: string): boolean;
}
export interface HelpHost {
  /** Lädt ein Beispiel auf die Arbeitsfläche. */
  loadExample(state: WorkspaceState): void;
  /** Blockly-Design für die Bilder der Blöcke. */
  theme(): Blockly.Theme;
  /** Lädt ein Programm des Kurses (Dateiname ohne Endung) auf die Arbeitsfläche. */
  loadProgram(file: string): void;
  /** Ob die Einstellung »Kursleitung« eingeschaltet ist. */
  leader(): boolean;
  /** Ein Block wird aus der Hilfe gezogen: auf der Arbeitsfläche unter dem Zeiger anlegen und weiterziehen. */
  dragBlock(state: Blockly.serialization.blocks.State, e: PointerEvent): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};
/** Setzt Text mit `Code` in Backticks in Elemente um. */
function rich(parent: HTMLElement, text: string){
  text.split('`').forEach((part, i) => { if (part) parent.appendChild(i % 2 ? el('code', undefined, part) : document.createTextNode(part)); });
  return parent;
}
const paragraphs = (parent: HTMLElement, text: string) => text.split('\n\n').forEach(p => rich(parent.appendChild(el('p')), p));
export const hasWord = (word: string) => Object.prototype.hasOwnProperty.call(PY_DOCS, word);

/** Farbe einer Kategorie des Werkzeugkastens, wie sie in der Blockly-Theme-Definition steht. */
interface ToolboxItem { kind: string; name?: string; type?: string; categorystyle?: string; contents?: ToolboxItem[] }
const TOOLBOX = (toolbox as unknown as {contents: ToolboxItem[]}).contents;
/** Der Eintrag eines Blocks im Werkzeugkasten – mit seinen Vorgabewerten, wie man ihn dort herauszieht. */
const toolboxEntry = (type: string) => TOOLBOX.flatMap(c => c.contents ?? []).find(i => i.kind === 'block' && i.type === type);

export function initHelp(host: HelpHost): Help {
  const panel = document.getElementById('help')!, body = document.getElementById('helpBody')!;
  const titleEl = document.getElementById('helpTitle')!, back = document.getElementById('helpBack')!;

  type Page = () => void;
  type Crumb = [string, Page];
  let history: Page[] = [];
  let picture: Blockly.WorkspaceSvg | null = null;

  /** Beginnt eine neue Seite: Titel, Pfad oben, leerer Inhalt. */
  function open(page: Page, title: string, crumbs?: Crumb[]){
    if (history[history.length - 1] !== page) history.push(page);
    panel.classList.remove('hidden');
    titleEl.textContent = title;
    back.classList.toggle('hidden', history.length < 2);
    picture?.dispose(); picture = null;
    body.textContent = '';
    body.scrollTop = 0;
    if (crumbs){
      const nav = body.appendChild(el('nav', 'help-crumbs'));
      nav.setAttribute('aria-label', 'Du bist hier');
      for (const [label, target] of [['Hilfe', showIndex] as Crumb, ...crumbs]){
        const b = nav.appendChild(el('button', undefined, label)); b.type = 'button';
        b.addEventListener('click', target);
      }
      nav.appendChild(el('span', undefined, title));
    }
  }
  function goBack(){
    history.pop();
    const previous = history.pop();
    (previous ?? showIndex)();
  }

  function codeBox(lines: CodeLine[], focus?: Set<number>){
    const box = el('div', 'help-code');
    lines.forEach((l, i) => {
      const row = box.appendChild(el('div', 'ln' + (focus?.has(i) ? ' sel' : '')));
      highlight(l.text, row.appendChild(el('span', 'tx')), hasWord);
    });
    return box;
  }
  const section = (heading: string) => { body.appendChild(el('h3', undefined, heading)); };
  /** Liste von Verweisen mit Kurzbeschreibung. */
  function entryList(items: {title: string; text?: string; badge?: string; colour?: string; go: Page}[], cls = 'help-entries'){
    const ul = el('ul', cls);
    for (const item of items){
      const b = ul.appendChild(el('li')).appendChild(el('button')); b.type = 'button';
      if (item.colour) b.style.setProperty('--help-colour', item.colour);
      if (item.badge) b.appendChild(el('span', 'help-badge', item.badge));
      const text = b.appendChild(el('span', 'help-entry-text'));
      text.appendChild(el('b', undefined, item.title));
      if (item.text) text.appendChild(el('span', undefined, item.text));
      b.addEventListener('click', item.go);
    }
    return ul;
  }
  /** »voriger / nächster« am Ende einer Seite. */
  function pager(previous: {title: string; go: Page} | undefined, next: {title: string; go: Page} | undefined){
    if (!previous && !next) return;
    const nav = body.appendChild(el('nav', 'help-pager'));
    for (const [item, cls, label] of [[previous, 'prev', '‹ Zurück'], [next, 'next', 'Weiter ›']] as const){
      if (!item){ nav.appendChild(el('span')); continue; }
      const b = nav.appendChild(el('button', cls)); b.type = 'button';
      b.appendChild(el('small', undefined, label)); b.appendChild(el('b', undefined, item.title));
      b.addEventListener('click', item.go);
    }
  }
  function loadButton(state: WorkspaceState, label = 'Als Blöcke auf die Arbeitsfläche laden'){
    const load = body.appendChild(el('button', 'btn help-load', label));
    load.type = 'button'; load.addEventListener('click', () => host.loadExample(state));
  }
  function callout(kind: 'goal' | 'tip' | 'need', heading: string, fill: (box: HTMLElement) => void){
    const box = body.appendChild(el('div', 'help-callout ' + kind));
    box.appendChild(el('b', undefined, heading));
    fill(box);
  }

  /** Zeichnet Blöcke so, wie sie im Werkzeugkasten liegen – mehrere untereinander. */
  function blockPicture(types: string[], parent: HTMLElement = body){
    const entries = types.map(toolboxEntry).filter((e): e is ToolboxItem => !!e);
    if (!entries.length) return;
    const holder = parent.appendChild(el('div', 'help-block'));
    try {
      picture = Blockly.inject(holder, {readOnly:true, renderer:'zelos', theme:host.theme(), media:BLOCKLY_MEDIA, sounds:false, trashcan:false, comments:false,
        zoom:{controls:false, wheel:false, startScale:0.8}, move:{scrollbars:false, drag:false, wheel:false}});
      let y = 12;
      for (const entry of entries){
        const {kind:_kind, ...state} = entry as ToolboxItem & Record<string, unknown>;
        const block = Blockly.serialization.blocks.append({...state, x:12, y} as Blockly.serialization.blocks.State, picture) as Blockly.BlockSvg;
        y += block.getHeightWidth().height + 14;
      }
      holder.style.height = Math.ceil((y - 14) * 0.8 + 22) + 'px';
      Blockly.svgResize(picture);
      // Die Blöcke lassen sich von hier auf die Arbeitsfläche ziehen – man muss sie nicht in der Blockliste suchen.
      // Erst nach ein paar Pixeln Bewegung: Ein bloßer Klick legt nichts an.
      const from = picture;
      holder.title = 'Zieh den Block von hier auf die Arbeitsfläche';
      holder.addEventListener('pointerdown', (down) => {
        const pressed = down.button === 0 ? from.getBlockById((down.target as Element).closest?.('g[data-id]')?.getAttribute('data-id') ?? '') : null;
        const state = pressed && Blockly.serialization.blocks.save(pressed.getRootBlock(), {addCoordinates:false});
        if (!state) return;
        // Das Bild selbst soll den Zeiger nicht für sich beanspruchen: Blockly verfolgt nur einen Zeiger zugleich,
        // und der gehört gleich dem Block auf der Arbeitsfläche.
        down.stopPropagation();
        const stop = () => { for (const type of ['pointermove', 'pointerup', 'pointercancel']) window.removeEventListener(type, watch, true); };
        const watch = (e: Event) => {
          const p = e as PointerEvent;
          if (p.type !== 'pointermove'){ stop(); return; }
          if (p.pointerId !== down.pointerId || Math.hypot(p.clientX - down.clientX, p.clientY - down.clientY) < 6) return;
          stop(); host.dragBlock(state, p);
        };
        for (const type of ['pointermove', 'pointerup', 'pointercancel']) window.addEventListener(type, watch, true);
      }, true);   // (vor Blockly, das den Druck auf einen Block sonst für sich behält)
    } catch (err){ console.error(err); holder.remove(); picture?.dispose(); picture = null; }
  }

  const categoryOf = (type: string) => HELP_CATEGORIES.find(c => c.types.includes(type));
  const categoryColour = (name: string) => {
    const style = TOOLBOX.find(c => c.name === name)?.categorystyle;
    return (style && (host.theme() as unknown as {categoryStyles: Record<string, {colour?: string}>}).categoryStyles[style]?.colour) || '#8A94A3';
  };

  // ----- Seiten -----
  function showBlock(type: string){
    const doc = BLOCK_DOCS[type]; if (!doc) return showIndex();
    const page = () => showBlock(type);
    const cat = categoryOf(type);
    open(page, doc.title, cat ? [['Blöcke', showIndex], [cat.name, () => showCategory(cat.name)]] : []);
    blockPicture([type]);
    section('Was der Block macht');
    paragraphs(body, doc.text);
    if (doc.fields){
      section('Eingaben');
      const dl = body.appendChild(el('dl', 'help-fields'));
      for (const [name, desc] of doc.fields){ dl.appendChild(el('dt', undefined, name)); rich(dl.appendChild(el('dd')), desc); }
    }
    section('So sieht das in Python aus');
    paragraphs(body, doc.python);
    section('Beispielprogramm');
    const state = doc.example();
    try {
      const ex = runExample(state, type);
      if (ex.focus.size) body.appendChild(el('p', 'help-note', 'Die markierten Zeilen stammen von diesem Block. Ein Klick auf ein Wort im Code erklärt es.'));
      body.appendChild(codeBox(ex.lines, ex.focus));
    } catch (err){ body.appendChild(el('p', 'help-note', 'Das Beispiel lässt sich gerade nicht anzeigen.')); }
    loadButton(state, 'Beispiel als Blöcke laden');
    if (doc.tips) callout('tip', 'Gut zu wissen', (box) => { const ul = box.appendChild(el('ul')); for (const t of doc.tips!) rich(ul.appendChild(el('li')), t); });
    if (cat){
      const i = cat.types.indexOf(type);
      const link = (t: string | undefined) => t ? {title:BLOCK_DOCS[t].title, go:() => showBlock(t)} : undefined;
      pager(link(cat.types[i - 1]), link(cat.types[i + 1]));
    }
  }

  function showCategory(name: string){
    const cat = HELP_CATEGORIES.find(c => c.name === name); if (!cat) return showIndex();
    const page = () => showCategory(name);
    open(page, name, [['Blöcke', showIndex]]);
    body.appendChild(el('p', 'help-note', `${cat.types.length} ${cat.types.length === 1 ? 'Block' : 'Blöcke'} – in der Reihenfolge des Werkzeugkastens.`));
    const colour = categoryColour(name);
    body.appendChild(entryList(cat.types.map(t => ({title:BLOCK_DOCS[t].title, text:summary(BLOCK_DOCS[t].text), colour, go:() => showBlock(t)})), 'help-entries blocks'));
    const i = HELP_CATEGORIES.indexOf(cat);
    const link = (c: typeof cat | undefined) => c ? {title:c.name, go:() => showCategory(c.name)} : undefined;
    pager(link(HELP_CATEGORIES[i - 1]), link(HELP_CATEGORIES[i + 1]));
  }

  function showLesson(id: string){
    const i = LESSONS.findIndex(l => l.id === id); if (i < 0) return showIndex();
    const lesson = LESSONS[i];
    const page = () => showLesson(id);
    open(page, lesson.title, [['Erste Schritte', showIndex]]);
    body.appendChild(el('p', 'help-step-of', `Lektion ${i + 1} von ${LESSONS.length}`));
    callout('goal', 'Ziel', (box) => rich(box.appendChild(el('p')), lesson.goal));
    callout('need', 'Du brauchst', (box) => rich(box.appendChild(el('p')), lesson.needs));
    section('Schritt für Schritt');
    const ol = body.appendChild(el('ol', 'help-steps'));
    for (const step of lesson.steps) rich(ol.appendChild(el('li')), step);
    section('Das passiert');
    rich(body.appendChild(el('p')), lesson.result);
    section('Das fertige Programm');
    const state = lesson.example();
    try { body.appendChild(codeBox(runExample(state, 'pb_start').lines)); }
    catch (err){ body.appendChild(el('p', 'help-note', 'Das Programm lässt sich gerade nicht anzeigen.')); }
    loadButton(state, 'Fertiges Programm laden');
    callout('tip', 'Probier aus', (box) => { const ul = box.appendChild(el('ul')); for (const t of lesson.tryIt) rich(ul.appendChild(el('li')), t); });
    const more: {title: string; text?: string; go: Page}[] = lesson.blocks.filter(t => BLOCK_DOCS[t]).map(t => ({title:BLOCK_DOCS[t].title, text:'Block', go:() => showBlock(t)}));
    const chapter = PY_CHAPTERS.find(c => c.id === lesson.chapter);
    if (chapter) more.push({title:chapter.title, text:'Python-Kapitel', go:() => showChapter(chapter.id)});
    if (more.length){ section('Mehr dazu'); body.appendChild(entryList(more, 'help-entries compact')); }
    const link = (l: typeof lesson | undefined) => l ? {title:l.title, go:() => showLesson(l.id)} : undefined;
    pager(link(LESSONS[i - 1]), link(LESSONS[i + 1]));
  }

  const KIND = {keyword:'Schlüsselwort von Python', class:'Klasse von Pybricks', builtin:'In Python eingebaut', name:'Name im Programm'};
  /** @param context die Zeile des eigenen Programms, in der das Wort angeklickt wurde */
  // ----- Kurs der Robotik-AG -----
  const courseCrumb: Crumb = ['Kurs der Robotik-AG', () => showCourse()];
  const moduleEntry = (m: (typeof MODULES)[number]) => {
    const r = quizResult(m.nr);
    return {title:m.title, text:m.concept + (r ? `  ·  Quiz ${r.right} von ${r.total}` : ''), badge:r && r.right === r.total ? '✓' : String(m.nr), go:() => showModule(m.nr)};
  };

  function showCourse(){
    open(showCourse, 'Kurs der Robotik-AG', []);
    paragraphs(body, 'Neun Module, jedes mit genau einem neuen Gedanken. Jedes Modul beginnt mit einer Frage, führt über eine Grundaufgabe zu einer offenen Challenge und endet mit einem Quiz.');
    body.appendChild(entryList([{title:'So arbeiten wir', text:'Vorhersagen, die drei Fragen bei einem Fehler, Hilfekarten, Rollen, Logbuch', badge:'i', go:showMethods}], 'help-entries numbered'));
    section('Die Module');
    body.appendChild(entryList(MODULES.map(moduleEntry), 'help-entries numbered'));
  }

  function showMethods(){
    open(showMethods, 'So arbeiten wir', [courseCrumb]);
    for (const m of METHODS){
      section(m.title);
      paragraphs(body, m.text);
      if (m.list){ const ol = body.appendChild(el('ol', 'help-steps')); for (const item of m.list) rich(ol.appendChild(el('li')), item); }
    }
    pager(undefined, {title:`Modul 0 · ${MODULES[0].title}`, go:() => showModule(0)});
  }

  /** Knopf, der ein Programm der AG auf die Arbeitsfläche holt. */
  function programButton(file: string, label: string){
    const b = body.appendChild(el('button', 'btn help-load', label)); b.type = 'button';
    b.addEventListener('click', () => host.loadProgram(file));
  }
  /** Drei Karten, die sich nur der Reihe nach aufdecken lassen. */
  function hintCards(m: (typeof MODULES)[number]){
    const names = ['Karte 1 · Denkfrage', 'Karte 2 · Wo suchen?', 'Karte 3 · Ein Teilstück'];
    const wrap = body.appendChild(el('div', 'help-cards'));
    const cards = m.hints.map((hint, i) => {
      const card = wrap.appendChild(el('div', 'help-card'));
      const button = card.appendChild(el('button', undefined, names[i] + ' aufdecken')); button.type = 'button';
      button.disabled = i > 0;
      button.addEventListener('click', () => {
        card.textContent = ''; card.classList.add('open');
        card.appendChild(el('b', undefined, names[i]));
        rich(card.appendChild(el('p')), hint);
        if (i === 2 && m.hintBlocks.length) blockPicture(m.hintBlocks, card);
        const next = cards[i + 1]?.querySelector('button'); if (next) next.disabled = false;
      });
      return card;
    });
  }
  /** Quiz: eine Antwort je Frage, danach die Erklärung; am Ende das Ergebnis. */
  function quiz(m: (typeof MODULES)[number]){
    const box = body.appendChild(el('div', 'help-quiz'));
    const score = el('p', 'help-quiz-score');
    let answered = 0, right = 0;
    m.quiz.forEach((q, qi) => {
      const item = box.appendChild(el('fieldset'));
      rich(item.appendChild(el('legend')), `${qi + 1}. ${q.question}`);
      const buttons = q.answers.map((answer, ai) => {
        const b = item.appendChild(el('button')); b.type = 'button';
        rich(b, answer);
        b.addEventListener('click', () => {
          buttons.forEach((other, oi) => { other.disabled = true; if (oi === q.correct) other.classList.add('right'); });
          if (ai === q.correct) right++; else b.classList.add('wrong');
          rich(item.appendChild(el('p', 'help-quiz-why')), (ai === q.correct ? 'Richtig. ' : 'Nicht ganz. ') + q.why);
          if (++answered === m.quiz.length){
            saveQuizResult(m.nr, {right, total:m.quiz.length});
            score.textContent = right === m.quiz.length ? `Alle ${right} richtig – stark!` : `${right} von ${m.quiz.length} richtig. Lies die Erklärungen und versuch es später noch einmal.`;
            const again = score.appendChild(el('button', 'btn', 'Noch einmal')); again.type = 'button';
            again.addEventListener('click', () => showModule(m.nr, true));
          }
        });
        return b;
      });
    });
    box.appendChild(score);
  }

  function showModule(nr: number, toQuiz = false){
    const i = MODULES.findIndex(m => m.nr === nr); if (i < 0) return showCourse();
    const m = MODULES[i];
    open(() => showModule(nr), m.title, [courseCrumb]);
    body.appendChild(el('p', 'help-step-of', `Modul ${m.nr} von ${MODULES[MODULES.length - 1].nr}`));
    callout('goal', 'Darum geht es', (box) => rich(box.appendChild(el('p')), m.concept));
    callout('need', 'Ihr braucht', (box) => rich(box.appendChild(el('p')), m.needs));

    section('Einstieg');
    paragraphs(body, m.intro);
    if (m.demo){
      section('Erst vorhersagen, dann starten');
      paragraphs(body, m.demo.text);
      programButton(m.demo.file, 'Demo-Programm laden');
    }
    section('Grundaufgabe');
    paragraphs(body, m.task);
    section('Challenge');
    paragraphs(body, m.challenge);
    if (m.pro) callout('tip', 'Für Profis', (box) => rich(box.appendChild(el('p')), m.pro!));

    section('Hilfekarten');
    body.appendChild(el('p', 'help-note', 'Erst nach mindestens fünf Minuten eigenem Probieren – und immer nur eine Karte nach der anderen.'));
    hintCards(m);

    if (m.bug){
      section('Bug-Jagd');
      paragraphs(body, m.bug.text);
      programButton(m.bug.file, 'Programm mit Fehler laden');
    }

    if (host.leader()){
      callout('need', 'Nur für die Kursleitung', (box) => {
        if (m.leader.pitfalls.length){
          box.appendChild(el('p', undefined, 'Stolpersteine – nicht vorab verraten, sie sollen entdeckt werden:'));
          const ul = box.appendChild(el('ul')); for (const p of m.leader.pitfalls) rich(ul.appendChild(el('li')), p);
        } else box.appendChild(el('p', undefined, 'Zu diesem Modul gibt es keine Stolpersteine und keine Musterlösung.'));
      });
      for (const s of m.leader.solutions) programButton(s, s.replace(/^M\d+ Loesung - /, 'Lösung laden: '));
    }

    const quizHeading = body.appendChild(el('h3', undefined, 'Quiz'));
    body.appendChild(el('p', 'help-note', 'Zum Schluss: Was habt ihr aus diesem Modul mitgenommen?'));
    quiz(m);
    const link = (mod: typeof m | undefined) => mod ? {title:`Modul ${mod.nr} · ${mod.title}`, go:() => showModule(mod.nr)} : undefined;
    pager(i === 0 ? {title:'So arbeiten wir', go:showMethods} : link(MODULES[i - 1]), link(MODULES[i + 1]));
    if (toQuiz) quizHeading.scrollIntoView();
  }

  // ----- Klassen von Pybricks: wie eine Python-Dokumentation – Klasse, ihre Funktionen, die Blöcke dazu -----
  const codeLine = (text: string) => ({text, id:null});
  const blockEntries = (types: string[]) => entryList(types.map(type => {
    const cat = categoryOf(type);
    return {title:BLOCK_DOCS[type].title, text:cat?.name, colour:cat ? categoryColour(cat.name) : undefined, go:() => showBlock(type)};
  }), 'help-entries blocks compact');

  function showClass(name: string){
    const i = PY_CLASSES.findIndex(c => c.name === name); if (i < 0) return showIndex();
    const c = PY_CLASSES[i];
    open(() => showClass(name), c.name, [['Klassen von Pybricks', showIndex]]);
    const head = body.appendChild(el('p', 'help-word'));
    head.appendChild(el('code', undefined, `class ${c.name}`));
    head.appendChild(el('span', 'help-kind', 'Klasse von Pybricks'));
    paragraphs(body, c.text);

    section('Import');
    body.appendChild(codeBox([codeLine(`from ${c.module} import ${c.name}`)]));
    rich(body.appendChild(el('p', 'help-note')), `Die Klasse kommt aus dem Modul \`${c.module}\`. Blockwerk schreibt diese Zeile selbst in den Kopf des Programms, sobald ein Block sie braucht.`);

    section('Objekt anlegen');
    body.appendChild(codeBox([codeLine(c.create)]));
    const space = c.variable.indexOf(' ');
    rich(body.appendChild(el('p', 'help-note')), `In Programmen von Blockwerk heißt das Objekt \`${space < 0 ? c.variable : c.variable.slice(0, space)}\`${space < 0 ? '' : c.variable.slice(space)}. Alle Funktionen der Klasse ruft man über diesen Namen auf.`);

    section(`Funktionen (${c.methods.length})`);
    body.appendChild(entryList(c.methods.map(m => ({title:m.call, text:summary(methodText(m)), go:() => showMethod(c.name, m.path)})), 'help-entries compact help-methods'));

    const types = [...new Set(c.methods.flatMap(m => methodUsage(c, m).map(b => b.type)))];
    if (types.length){
      section(`Blöcke, die diese Klasse benutzen (${types.length})`);
      body.appendChild(blockEntries(types));
    }
    const link = (cls: PyClass | undefined) => cls ? {title:cls.name, go:() => showClass(cls.name)} : undefined;
    pager(link(PY_CLASSES[i - 1]), link(PY_CLASSES[i + 1]));
  }

  function showMethod(className: string, path: string){
    const c = classByName(className), i = c ? c.methods.findIndex(m => m.path === path) : -1;
    if (!c || i < 0) return showIndex();
    const m = c.methods[i];
    open(() => showMethod(className, path), `${c.name}.${methodName(m)}`, [['Klassen von Pybricks', showIndex], [c.name, () => showClass(c.name)]]);
    const head = body.appendChild(el('p', 'help-word'));
    head.appendChild(el('code', undefined, m.call));
    head.appendChild(el('span', 'help-kind', `Funktion von ${c.name}`));

    section('Was sie macht');
    paragraphs(body, methodText(m));
    section('Eingaben und Ergebnis');
    rich(body.appendChild(el('p')), m.detail);

    const usage = methodUsage(c, m);
    const samples = [...new Set(usage.flatMap(b => b.lines))].sort((a, b) => a.length - b.length).slice(0, 3);
    if (samples.length){
      section('So sieht es im Code aus');
      body.appendChild(codeBox(samples.map(codeLine)));
    }
    if (usage.length){
      section(usage.length === 1 ? 'Dieser Block benutzt sie' : 'Diese Blöcke benutzen sie');
      body.appendChild(el('p', 'help-note', 'Die Blöcke lassen sich von hier auf die Arbeitsfläche ziehen.'));
      blockPicture(usage.slice(0, 3).map(b => b.type));
      body.appendChild(blockEntries(usage.slice(0, 8).map(b => b.type)));
      if (usage.length > 8) body.appendChild(el('p', 'help-note', `… und ${usage.length - 8} weitere.`));
    } else {
      body.appendChild(el('p', 'help-note', 'Dafür gibt es in Blockwerk keinen eigenen Block (oder nur als Auswahl in einem Block). In Python lässt sich die Funktion trotzdem aufrufen.'));
    }
    const link = (method: PyMethod | undefined) => method ? {title:method.call, go:() => showMethod(c.name, method.path)} : undefined;
    pager(link(c.methods[i - 1]), link(c.methods[i + 1]));
  }

  function showWord(word: string, context?: string){
    // Klassen und ihre Funktionen haben eigene Seiten; die Zeile sagt, zu welcher Klasse eine Funktion gehört
    if (classByName(word)) return showClass(word);
    const method = context ? methodInLine(word, context) : null;
    if (method) return showMethod(method.cls.name, method.method.path);
    if (!hasWord(word)) return showIndex();
    const doc = PY_DOCS[word];
    open(() => showWord(word, context), doc.title, [['Python-Wörter', showIndex]]);
    const usage = wordUsage(word);
    // die kürzesten Zeilen zuerst – an ihnen sieht man das Wort am deutlichsten
    const samples = [...new Set(usage.blocks.flatMap(b => b.lines))].sort((a, b) => a.length - b.length).slice(0, 3);
    const shown = samples.length ? samples : usage.header;
    // Steht das Wort hinter einem Punkt und vor einer Klammer, ist es eine Funktion eines Geräts
    const isMethod = wordKind(word) === 'name' && [...shown, context ?? ''].some(l => l.includes(`.${word}(`));
    const head = body.appendChild(el('p', 'help-word'));
    head.appendChild(el('code', undefined, word));
    head.appendChild(el('span', 'help-kind', isMethod ? 'Funktion von Pybricks' : KIND[wordKind(word)]));

    section('Was es bedeutet');
    paragraphs(body, doc.text);
    const line = (text: string) => ({text, id:null});
    if (context?.trim()){
      section('Die angeklickte Zeile');
      body.appendChild(codeBox([line(context.trim())]));
    }

    if (shown.length){
      section('So sieht es im Code aus');
      body.appendChild(codeBox(shown.map(line)));
    }
    if (usage.blocks.length){
      section(usage.blocks.length === 1 ? 'Dieser Block erzeugt es' : 'Diese Blöcke erzeugen es');
      const blocks = usage.blocks.slice(0, 8);
      blockPicture(blocks.slice(0, 3).map(b => b.type));
      body.appendChild(entryList(blocks.map(b => {
        const cat = categoryOf(b.type);
        return {title:BLOCK_DOCS[b.type].title, text:cat?.name, colour:cat ? categoryColour(cat.name) : undefined, go:() => showBlock(b.type)};
      }), 'help-entries blocks compact'));
      if (usage.blocks.length > blocks.length) body.appendChild(el('p', 'help-note', `… und ${usage.blocks.length - blocks.length} weitere.`));
    } else if (usage.header.length){
      body.appendChild(el('p', 'help-note', 'Das Wort steht im Kopf des Programms. Blockwerk schreibt ihn selbst – je nachdem, welche Blöcke und Anschlüsse du benutzt.'));
    }
    const chapters = PY_CHAPTERS.filter(c => usage.chapters.includes(c.id));
    if (chapters.length){
      section('Mehr dazu');
      body.appendChild(entryList(chapters.map(c => ({title:c.title, text:'Python-Kapitel', go:() => showChapter(c.id)})), 'help-entries compact'));
    }
    // andere Wörter mit derselben Erklärungsüberschrift gehören zusammen (»from« und »import«)
    const related = Object.entries(PY_DOCS).filter(([w, d]) => w !== word && d.title === doc.title).map(([w]) => w);
    if (related.length){
      section('Gehört zusammen mit');
      body.appendChild(entryList(related.map(w => ({title:w, text:summary(PY_DOCS[w].text), go:() => showWord(w)})), 'help-entries compact'));
    }
  }

  function showChapter(id: string){
    const i = PY_CHAPTERS.findIndex(ch => ch.id === id); if (i < 0) return showIndex();
    const c = PY_CHAPTERS[i];
    open(() => showChapter(id), c.title, [['Python verstehen', showIndex]]);
    body.appendChild(el('p', 'help-step-of', `Kapitel ${i + 1} von ${PY_CHAPTERS.length}`));
    paragraphs(body, c.text);
    section('Beispiel');
    body.appendChild(el('p', 'help-note', 'Ein Klick auf ein Wort im Code erklärt es.'));
    body.appendChild(codeBox(c.code.replace(/\n$/, '').split('\n').map(text => ({text, id:null}))));
    const link = (ch: typeof c | undefined) => ch ? {title:ch.title, go:() => showChapter(ch.id)} : undefined;
    pager(link(PY_CHAPTERS[i - 1]), link(PY_CHAPTERS[i + 1]));
  }

  function showIndex(){
    history = [];
    open(showIndex, 'Hilfe');
    const search = body.appendChild(el('input', 'help-search'));
    search.type = 'search'; search.placeholder = 'Hilfe durchsuchen …'; search.setAttribute('aria-label', 'Hilfe durchsuchen');
    const results = body.appendChild(el('div'));

    function home(){
      results.appendChild(el('h3', undefined, 'Erste Schritte'));
      results.appendChild(el('p', 'help-note', 'Sieben kurze Lektionen, der Reihe nach – vom ersten Piepton bis zum Lesen des Python-Codes.'));
      results.appendChild(entryList(LESSONS.map((l, i) => ({title:l.title, text:l.goal, badge:String(i + 1), go:() => showLesson(l.id)})), 'help-entries numbered'));

      results.appendChild(el('h3', undefined, 'Kurs der Robotik-AG'));
      results.appendChild(el('p', 'help-note', 'Die Module 0 bis 8 mit Aufgaben, Hilfekarten, Bug-Jagd und Quiz.'));
      const done = MODULES.filter(m => { const r = quizResult(m.nr); return r && r.right === r.total; }).length;
      results.appendChild(entryList([{title:'Zum Kurs', text:done ? `${done} von ${MODULES.length} Quiz geschafft` : 'Neun Module – vom ersten Kontakt bis zum Mini-Robot-Game', badge:'▶', go:showCourse}], 'help-entries numbered'));

      results.appendChild(el('h3', undefined, 'Blöcke nachschlagen'));
      results.appendChild(el('p', 'help-note', 'Schneller geht es mit einem Rechtsklick auf einen Block → »Hilfe zu diesem Block«.'));
      const tiles = results.appendChild(el('div', 'help-tiles'));
      for (const c of HELP_CATEGORIES){
        const b = tiles.appendChild(el('button')); b.type = 'button';
        b.style.setProperty('--help-colour', categoryColour(c.name));
        b.appendChild(el('b', undefined, c.name)); b.appendChild(el('span', undefined, `${c.types.length} ${c.types.length === 1 ? 'Block' : 'Blöcke'}`));
        b.addEventListener('click', () => showCategory(c.name));
      }

      results.appendChild(el('h3', undefined, 'Klassen von Pybricks'));
      results.appendChild(el('p', 'help-note', 'Zum Nachschlagen wie in einer Python-Dokumentation: Import, Anlegen, alle Funktionen – und welche Blöcke sie benutzen.'));
      results.appendChild(entryList(PY_CLASSES.map(c => ({title:c.name, text:summary(c.text), go:() => showClass(c.name)})), 'help-entries compact'));

      results.appendChild(el('h3', undefined, 'Python verstehen'));
      results.appendChild(el('p', 'help-note', 'Acht kurze Kapitel. Im Python-Code erklärt außerdem ein Klick auf ein Wort, was es bedeutet.'));
      results.appendChild(entryList(PY_CHAPTERS.map((c, i) => ({title:c.title, badge:String(i + 1), go:() => showChapter(c.id)})), 'help-entries numbered compact'));
    }
    function find(q: string){
      const hit = (...texts: string[]) => texts.some(t => t.toLowerCase().includes(q));
      const group = (heading: string, items: Parameters<typeof entryList>[0]) => {
        if (!items.length) return;
        results.appendChild(el('h3', undefined, `${heading} (${items.length})`)); results.appendChild(entryList(items, 'help-entries compact'));
      };
      group('Erste Schritte', LESSONS.filter(l => hit(l.title, l.goal, ...l.steps, ...l.tryIt)).map(l => ({title:l.title, text:l.goal, go:() => showLesson(l.id)})));
      group('Kurs der Robotik-AG', MODULES.filter(m => hit(m.title, m.concept, m.task, m.challenge)).map(m => ({title:`Modul ${m.nr} · ${m.title}`, text:m.concept, go:() => showModule(m.nr)})));
      group('Blöcke', HELP_CATEGORIES.flatMap(c => c.types.filter(t => hit(BLOCK_DOCS[t].title, BLOCK_DOCS[t].text, ...(BLOCK_DOCS[t].tips ?? []), c.name))
        .map(t => ({title:BLOCK_DOCS[t].title, text:c.name, colour:categoryColour(c.name), go:() => showBlock(t)}))));
      group('Python verstehen', PY_CHAPTERS.filter(c => hit(c.title, c.text)).map(c => ({title:c.title, go:() => showChapter(c.id)})));
      group('Klassen von Pybricks', PY_CLASSES.filter(c => hit(c.name, c.text)).map(c => ({title:c.name, text:summary(c.text), go:() => showClass(c.name)})));
      group('Funktionen der Klassen', PY_CLASSES.flatMap(c => c.methods.filter(m => hit(m.call, methodText(m), m.detail))
        .map(m => ({title:m.call, text:c.name, go:() => showMethod(c.name, m.path)}))));
      const seen = new Set<string>();
      group('Python-Wörter', Object.entries(PY_DOCS).filter(([w, d]) => hit(w, d.title, d.text) && !seen.has(d.title) && !!seen.add(d.title))
        .map(([w, d]) => ({title:d.title, go:() => showWord(w)})));
      if (!results.childNodes.length) results.appendChild(el('p', 'help-note', 'Nichts gefunden. Versuch es mit einem kürzeren Wort.'));
    }
    const fill = () => {
      const q = search.value.trim().toLowerCase();
      results.textContent = '';
      if (q) find(q); else home();
    };
    search.addEventListener('input', fill);
    fill();
  }

  back.addEventListener('click', goBack);
  document.getElementById('helpClose')!.addEventListener('click', () => panel.classList.add('hidden'));
  body.addEventListener('click', (e) => {
    const token = (e.target as HTMLElement).closest<HTMLElement>('.tk-doc');
    if (token?.dataset.word) showWord(token.dataset.word, token.closest('.ln')?.textContent ?? undefined);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.classList.contains('hidden')) panel.classList.add('hidden'); });

  return {showIndex, showBlock, showWord, hasWord, hasBlock:(type) => !!BLOCK_DOCS[type]};
}
