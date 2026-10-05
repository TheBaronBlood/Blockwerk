import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Blockly from 'blockly';
import '../src/blocks';
import { BLOCK_DOCS } from '../src/docs/blocks';
import { runExample } from '../src/docs/example';
import { PY_CHAPTERS, PY_DOCS } from '../src/docs/python';
import { HELP_CATEGORIES } from '../src/docs/index';
import { LESSONS } from '../src/docs/lessons';
import { METHODS, MODULES, courseFiles } from '../src/docs/kurs';
import { summary } from '../src/docs/summary';
import { wordUsage, wordsOf } from '../src/docs/words';

// Python 3 muss es sein: Auf manchen Rechnern ist »python« noch Python 2 und kennt kein async
const python = ['python3', 'python', 'py'].find(cmd => spawnSync(cmd, ['-c', 'import sys; sys.exit(sys.version_info[0] != 3)']).status === 0);
const tmp = mkdtempSync(join(tmpdir(), 'blockwerk-docs-'));
afterAll(() => rmSync(tmp, {recursive:true, force:true}));
function pyCompile(name: string, code: string){
  const file = join(tmp, name + '.py');
  writeFileSync(file, code, 'utf8');
  const r = spawnSync(python!, ['-m', 'py_compile', file], {encoding:'utf8'});
  expect(r.stderr).toBe('');
  expect(r.status).toBe(0);
}

describe('Blockhilfe', () => {
  it('hat einen Eintrag für jeden eigenen Block', () => {
    const own = Object.keys(Blockly.Blocks).filter(t => t.startsWith('pb_'));
    expect(own.length).toBeGreaterThan(30);
    expect(own.filter(t => !BLOCK_DOCS[t])).toEqual([]);
  });

  it('hat einen Eintrag für jeden Block im Werkzeugkasten und führt jeden Eintrag in der Übersicht', () => {
    const listed = HELP_CATEGORIES.flatMap(c => c.types);
    expect(listed.filter(t => !BLOCK_DOCS[t])).toEqual([]);
    expect(Object.keys(BLOCK_DOCS).filter(t => !listed.includes(t))).toEqual([]);
    expect(listed.filter(t => !Blockly.Blocks[t])).toEqual([]);
  });

  for (const [type, doc] of Object.entries(BLOCK_DOCS)){
    it(`${type}: Beispiel läuft ohne Warnung und zeigt den Block`, () => {
      const res = runExample(doc.example(), type);
      // die Platzhalter des SPIKE-Imports warnen absichtlich
      if (!type.startsWith('pb_unsupported')) expect(res.warnings).toEqual([]);
      const code = res.lines.map(l => l.text).join('\n') + '\n';
      expect(code).not.toContain('Zieh den Block');
      if (type !== 'pb_start') expect(res.focus.size).toBeGreaterThan(0);
      if (python) pyCompile(type, code);
    });
  }
});

describe('Erste Schritte', () => {
  it('jede Lektion hat Ziel, Schritte und Aufgaben und verweist nur auf vorhandene Seiten', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(5);
    expect(new Set(LESSONS.map(l => l.id)).size).toBe(LESSONS.length);
    for (const l of LESSONS){
      expect(l.goal.length, l.id).toBeGreaterThan(10);
      expect(l.needs.length, l.id).toBeGreaterThan(5);
      expect(l.steps.length, l.id).toBeGreaterThanOrEqual(3);
      expect(l.tryIt.length, l.id).toBeGreaterThanOrEqual(2);
      expect(l.blocks.filter(t => !BLOCK_DOCS[t]), l.id).toEqual([]);
      if (l.chapter) expect(PY_CHAPTERS.some(c => c.id === l.chapter), l.id).toBe(true);
    }
  });

  for (const l of LESSONS){
    it(`${l.id}: das fertige Programm läuft ohne Warnung und benutzt die genannten Blöcke`, () => {
      const state = l.example();
      const res = runExample(state, 'pb_start');
      expect(res.warnings).toEqual([]);
      const code = res.lines.map(x => x.text).join('\n') + '\n';
      expect(code).not.toContain('Zieh den Block');
      if (python) pyCompile('lektion_' + l.id, code);
      // die Blöcke, die die Lektion einführt, stecken auch im Programm (»wiederhole fortlaufend« ist nur ein Verweis)
      const used = JSON.stringify(state);
      for (const t of l.blocks.filter(t => !(l.id === 'wiederholen' && t === 'pb_forever'))) expect(used, `${l.id}: ${t}`).toContain(`"${t}"`);
    });
  }

  it('bildet aus einem Hilfetext die Kurzbeschreibung', () => {
    expect(summary('Fährt die Strecke. Negative Werte fahren rückwärts.')).toBe('Fährt die Strecke.');
    expect(summary('Zeigt z. B. `42` an\n\nMehr Text.')).toMatch(/^Zeigt z\./);
    expect(summary('Ohne Punkt')).toBe('Ohne Punkt');
  });
});

describe('Kurs der Robotik-AG', () => {
  const dir = join(__dirname, '..', 'referenz', 'spike-dateien', 'beispiele');

  it('hat die Module 0 bis 8 in der Reihenfolge des Leitfadens', () => {
    expect(MODULES.map(m => m.nr)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (const m of MODULES){
      for (const text of [m.title, m.concept, m.needs, m.intro, m.task, m.challenge]) expect(text.length, `Modul ${m.nr}`).toBeGreaterThan(5);
      expect(m.hints, `Modul ${m.nr}`).toHaveLength(3);
      expect(m.hintBlocks.filter(t => !BLOCK_DOCS[t]), `Modul ${m.nr}`).toEqual([]);
    }
    expect(METHODS.length).toBeGreaterThanOrEqual(5);
  });

  it('jede Quizfrage hat genau eine richtige unter mindestens drei Antworten und eine Erklärung', () => {
    for (const m of MODULES){
      expect(m.quiz.length, `Modul ${m.nr}`).toBeGreaterThanOrEqual(3);
      for (const q of m.quiz){
        expect(q.answers.length, q.question).toBeGreaterThanOrEqual(3);
        expect(new Set(q.answers).size, q.question).toBe(q.answers.length);
        expect(q.correct, q.question).toBeGreaterThanOrEqual(0);
        expect(q.correct, q.question).toBeLessThan(q.answers.length);
        expect(q.why.length, q.question).toBeGreaterThan(20);
      }
    }
    // die richtige Antwort steht nicht immer an derselben Stelle
    expect(new Set(MODULES.flatMap(m => m.quiz.map(q => q.correct))).size).toBeGreaterThan(1);
  });

  it('nennt nur Programme, die es im Ordner referenz gibt – Lösungen nur bei der Leitung', () => {
    const forAll = join(dir, 'Fuer die Teilnehmenden'), forLeader = join(dir, 'Nur fuer die Leitung');
    for (const m of MODULES){
      for (const f of [m.demo?.file, m.bug?.file]) if (f) expect(existsSync(join(forAll, f + '.llsp3')), f).toBe(true);
      for (const f of m.leader.solutions) expect(existsSync(join(forLeader, f + '.llsp3')), f).toBe(true);
    }
    expect(courseFiles().length).toBeGreaterThan(15);
    expect(new Set(courseFiles()).size).toBe(courseFiles().length);
  });

  it('verrät den Teilnehmenden keine Stolpersteine: Sie stehen nur im Teil für die Leitung', () => {
    for (const m of MODULES) expect(Object.keys(m.leader)).toEqual(['pitfalls', 'solutions']);
  });
});

describe('Fundstellen der Python-Wörter', () => {
  it('nennt die Blöcke, die ein Wort erzeugen, mit der passenden Zeile', () => {
    const straight = wordUsage('straight');
    expect(straight.blocks.map(b => b.type)).toContain('pb_drive_straight');
    expect(straight.blocks.find(b => b.type === 'pb_drive_straight')!.lines[0]).toMatch(/^roboter\.straight\(/);
    // der eigene Block enthält im Beispiel »straight«, erzeugt es aber nicht selbst
    expect(straight.blocks.map(b => b.type)).not.toContain('procedures_defnoreturn');
    expect(wordUsage('def').blocks.map(b => b.type)).toContain('procedures_defnoreturn');
    expect(wordUsage('wait').blocks.map(b => b.type)).toContain('pb_wait');
    expect(wordUsage('for').blocks.map(b => b.type)).toContain('controls_repeat_ext');
    expect(wordUsage('for').chapters).toContain('schleifen');
  });

  it('zeigt für Wörter aus dem Kopf eine Zeile von dort', () => {
    const usage = wordUsage('PrimeHub');
    expect(usage.header.some(l => l.includes('PrimeHub'))).toBe(true);
    expect(wordUsage('import').header[0]).toMatch(/^from pybricks/);
  });

  it('findet zu fast jedem erklärten Wort eine Stelle im Code', () => {
    const without = Object.keys(PY_DOCS).filter(w => { const u = wordUsage(w); return !u.blocks.length && !u.header.length && !u.chapters.length; });
    // einige Wörter erklärt die Hilfe, ohne dass ein Beispiel sie benutzt – es dürfen nur wenige sein
    expect(without.length, without.join(', ')).toBeLessThan(Object.keys(PY_DOCS).length / 4);
    expect(wordUsage('gibtesnicht')).toEqual({blocks:[], header:[], chapters:[]});
  });

  it('zerlegt eine Zeile ohne Kommentare und Texte', () => {
    expect(wordsOf("print('Hallo Welt', x)  # Ausgabe")).toEqual(['print', 'x']);
  });
});

describe('Python-Hilfe', () => {
  it.skipIf(!python)('Kapitelbeispiele sind gültiges Python', () => {
    for (const c of PY_CHAPTERS) pyCompile('kapitel_' + c.id, c.code);
  });

  it('erklärt die Wörter, die in den Blockbeispielen vorkommen', () => {
    const words = new Set<string>();
    for (const [type, doc] of Object.entries(BLOCK_DOCS)){
      for (const l of runExample(doc.example(), type).lines){
        const code = l.text.replace(/#.*$/, '').replace(/'[^']*'/g, '');
        for (const w of code.match(/[A-Za-z_]\w*/g) ?? []) words.add(w);
      }
    }
    // Namen, die keine Erklärung brauchen: Geräte, Variablen, Konstanten, benannte Parameter, Modulpfade
    const skip = /^(motor|farbe|abstand|kraft)_[A-F]$|^[A-F]$|^[A-Z_]{2,}$|^(count|pybricks|hubs|parameters|pupdevices|robotics|tools|iodevices|urandom|byte|name|Strecken|Strecke|update|x|y|straight_speed|turn_rate|wheel_diameter|axle_track|text|number|icon|on|off|Tempo|Zaehler|gefunden|Ecke|Piep|Abweichung|Linie|nachricht_los|stand)$/;
    expect([...words].filter(w => !PY_DOCS[w] && !skip.test(w)).sort()).toEqual([]);
  });
});
