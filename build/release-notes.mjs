// Schreibt die Notizen für ein Release auf GitHub: oben der Abschnitt der Version aus
// CHANGELOG.md (für alle, die Blockwerk benutzen), darunter alle Commits seit dem vorigen
// Tag, nach ihrer Art sortiert (Conventional Commits: feat, fix, docs …).
//
// Aufruf:  node build/release-notes.mjs v0.20.0 [Ordner mit den Programmdateien] > notizen.md
// Benutzt vom Workflow »Programm bauen«; die Funktionen prüft tests/releaseNotes.test.ts.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Überschriften für die Arten von Commits, in der Reihenfolge der Ausgabe. */
const GROUPS = [
  { title: 'Neu', types: ['feat'] },
  { title: 'Behoben', types: ['fix'] },
  { title: 'Schneller', types: ['perf'] },
  { title: 'Dokumentation', types: ['docs'] },
  { title: 'Sonstiges', types: ['other'] },
  // Umbauten, Tests und Bau betreffen niemanden, der Blockwerk nur benutzt – eingeklappt
  { title: 'Unter der Haube', types: ['refactor', 'test', 'chore', 'ci', 'build', 'style', 'revert'], folded: true }
];

/** Welche Datei für welchen Rechner – nur Dateien, die es in diesem Release wirklich gibt. */
const FILES = [
  [/-Setup\.exe$/, 'Windows', 'Installation ohne Administratorrechte – der empfohlene Weg'],
  [/-win-.*\.zip$/, 'Windows', 'ohne Installation: entpacken und `Blockwerk.exe` starten'],
  [/-portable\.exe$/, 'Windows', 'eine einzelne Datei; startet langsamer, weil sie sich jedes Mal auspackt'],
  [/-arm64\.dmg$/, 'Mac mit Apple-Chip (M1 und neuer)', 'beim ersten Start: Systemeinstellungen → »Datenschutz & Sicherheit« → »Dennoch öffnen«'],
  [/-x64\.dmg$/, 'Mac mit Intel-Prozessor', 'nur für ältere Macs – auf einem Apple-Chip läuft diese Fassung zäh'],
  [/\.deb$/, 'Ubuntu / Linux', '`sudo apt install ./Blockwerk-….deb` – der empfohlene Weg, richtet auch das USB-Kabel ein'],
  [/\.AppImage$/, 'Ubuntu / Linux', 'ohne Installation: ausführbar machen und starten'],
  [/-android\.apk$/, 'Android-Tablet', 'Datei auf dem Tablet öffnen und die Installation erlauben. Bluetooth und USB-Kabel; noch nicht an echten Hubs erprobt']
];

/** Text des Abschnitts »## 0.20.0 – Datum« aus CHANGELOG.md, ohne die Überschrift; leer, wenn er fehlt. */
export function changelogSection(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith('## ') && l.slice(3).trim().split(/\s/)[0] === version);
  if (start < 0) return '';
  let end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}

/** Zerlegt »feat(ui): Text« in Art, Bereich und Text. Alles andere bekommt die Art »other«. */
export function parseCommit(subject) {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject.trim());
  const known = m && GROUPS.some(g => g.types.includes(m[1].toLowerCase()));
  if (!m || !known) return { type: 'other', scope: '', text: subject.trim(), breaking: false };
  return { type: m[1].toLowerCase(), scope: m[2] || '', text: m[4].trim(), breaking: !!m[3] };
}

/**
 * Sortiert Commits ({hash, subject}) nach ihrer Art. Zusammenführungen und der Commit, der
 * nur die Versionsnummer erhöht, sagen nichts über die Änderungen und fallen weg.
 */
export function groupCommits(commits) {
  const groups = GROUPS.map(g => ({ ...g, items: [] }));
  for (const c of commits) {
    if (/^Merge (branch|pull request|remote-tracking branch|tag) /.test(c.subject)) continue;
    const parsed = parseCommit(c.subject);
    if (parsed.type === 'chore' && parsed.scope === 'release') continue;
    groups.find(g => g.types.includes(parsed.type)).items.push({ ...parsed, hash: c.hash });
  }
  return groups.filter(g => g.items.length);
}

const commitLine = (c) => `- ${c.breaking ? '⚠️ ' : ''}${c.scope ? `**${c.scope}:** ` : ''}${c.text}${c.hash ? ` (${c.hash})` : ''}`;

/** Tabelle »Welche Datei für welchen Rechner«; leer, wenn keine bekannte Datei dabei ist. */
export function fileTable(files) {
  const rows = [];
  for (const [pattern, system, hint] of FILES)
    for (const name of files.filter(f => pattern.test(f)).sort()) rows.push(`| ${system} | \`${name}\` | ${hint} |`);
  return rows.length ? ['| Rechner | Datei | Hinweis |', '|---|---|---|', ...rows].join('\n') : '';
}

/** Setzt die Notizen zusammen. `previous` ist der vorige Tag (leer beim ersten Release), `repo` »Besitzer/Name«. */
export function renderNotes({ tag, previous = '', changelog = '', commits = [], files = [], repo = '' }) {
  const out = [];
  const section = changelogSection(changelog, tag.replace(/^v/, ''));
  if (section) out.push(section);
  const table = fileTable(files);
  if (table) out.push('## Welche Datei ist die richtige?', table);
  const groups = groupCommits(commits);
  if (groups.length) {
    out.push(previous ? `## Alle Änderungen seit ${previous}` : '## Alle Änderungen');
    for (const g of groups) {
      const list = g.items.map(commitLine).join('\n');
      out.push(g.folded ? `<details><summary>${g.title} (${g.items.length})</summary>\n\n${list}\n\n</details>` : `### ${g.title}\n\n${list}`);
    }
  }
  if (repo && previous) out.push(`Vollständiger Vergleich: https://github.com/${repo}/compare/${previous}...${tag}`);
  return out.join('\n\n') + '\n';
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function main() {
  const [tag, filesDir] = process.argv.slice(2);
  if (!tag) { console.error('Aufruf: node build/release-notes.mjs <Tag> [Ordner mit den Programmdateien]'); process.exit(2); }
  // der nächstältere Versions-Tag; beim allerersten Release gibt es keinen
  let previous = '';
  try { previous = git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`); } catch { /* erstes Release */ }
  const log = git('log', '--no-merges', '--format=%h%x09%s', previous ? `${previous}..${tag}` : tag);
  const commits = log ? log.split('\n').map(l => { const [hash, ...rest] = l.split('\t'); return { hash, subject: rest.join('\t') }; }) : [];
  process.stdout.write(renderNotes({
    tag, previous, commits,
    changelog: existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '',
    files: filesDir && existsSync(filesDir) ? readdirSync(filesDir) : [],
    repo: process.env.GITHUB_REPOSITORY || ''
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
