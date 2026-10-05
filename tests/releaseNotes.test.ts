import { describe, expect, it } from 'vitest';
import { changelogSection, fileTable, groupCommits, parseCommit, renderNotes } from '../build/release-notes.mjs';

const CHANGELOG = `# Blockwerk – Versionen

Regeln …

## 0.20.0 – 5. Oktober 2026

- Releases entstehen automatisch.
- Zweiter Punkt.

## 0.2.0 – früher

- Alt.
`;

describe('Notizen für ein Release', () => {
  it('holt den Abschnitt der Version aus dem Versionsprotokoll', () => {
    expect(changelogSection(CHANGELOG, '0.20.0')).toBe('- Releases entstehen automatisch.\n- Zweiter Punkt.');
    // »0.2.0« darf nicht auf »0.20.0« passen
    expect(changelogSection(CHANGELOG, '0.2.0')).toBe('- Alt.');
    expect(changelogSection(CHANGELOG, '9.9.9')).toBe('');
  });

  it('liest Art, Bereich und Text aus der Commit-Nachricht', () => {
    expect(parseCommit('feat(ui): Fenster »Über Blockwerk«')).toEqual({type:'feat', scope:'ui', text:'Fenster »Über Blockwerk«', breaking:false});
    expect(parseCommit('fix: ohne Bereich')).toMatchObject({type:'fix', scope:'', text:'ohne Bereich'});
    expect(parseCommit('feat(hub)!: neues Protokoll')).toMatchObject({type:'feat', breaking:true});
    // was sich nicht an die Form hält, geht nicht verloren
    expect(parseCommit('Schnell was repariert')).toMatchObject({type:'other', text:'Schnell was repariert'});
    expect(parseCommit('Hinweis: kein bekannter Typ')).toMatchObject({type:'other'});
  });

  it('sortiert nach Art und lässt Zusammenführungen und den Versions-Commit weg', () => {
    const groups = groupCommits([
      {hash:'a1', subject:"Merge branch 'feat/x'"},
      {hash:'a2', subject:'chore(release): 0.20.0'},
      {hash:'a3', subject:'fix(hub): Verbindung bricht nicht mehr ab'},
      {hash:'a4', subject:'feat(ci): Releases mit Notizen'},
      {hash:'a5', subject:'test(app): Selbsttest'},
      {hash:'a6', subject:'chore: aufräumen'}
    ]);
    expect(groups.map(g => [g.title, g.items.map(i => i.hash)])).toEqual([
      ['Neu', ['a4']], ['Behoben', ['a3']], ['Unter der Haube', ['a5', 'a6']]
    ]);
  });

  it('nennt nur Dateien, die es gibt', () => {
    const table = fileTable(['Blockwerk-0.20.0-mac-arm64.dmg', 'Blockwerk-0.20.0-mac-x64.dmg', 'Blockwerk-0.20.0-win-x64-Setup.exe', 'latest.yml']);
    expect(table).toContain('| Windows | `Blockwerk-0.20.0-win-x64-Setup.exe` |');
    expect(table).toContain('| Mac mit Apple-Chip (M1 und neuer) | `Blockwerk-0.20.0-mac-arm64.dmg` |');
    expect(table).toContain('| Mac mit Intel-Prozessor | `Blockwerk-0.20.0-mac-x64.dmg` |');
    expect(table).not.toContain('Linux');
    expect(fileTable(['Blockwerk-0.21.0-android.apk'])).toContain('| Android-Tablet | `Blockwerk-0.21.0-android.apk` |');
    expect(table).not.toContain('latest.yml');
    expect(fileTable([])).toBe('');
  });

  it('setzt alles zu einem Text zusammen', () => {
    const notes = renderNotes({
      tag:'v0.20.0', previous:'v0.19.0', changelog:CHANGELOG, repo:'besitzer/blockwerk',
      files:['Blockwerk-0.20.0-linux-amd64.deb'],
      commits:[{hash:'abc1234', subject:'feat(ci): Releases mit Notizen'}, {hash:'def5678', subject:'ci: Signatur prüfen'}]
    });
    expect(notes).toMatchInlineSnapshot(`
      "- Releases entstehen automatisch.
      - Zweiter Punkt.

      ## Welche Datei ist die richtige?

      | Rechner | Datei | Hinweis |
      |---|---|---|
      | Ubuntu / Linux | \`Blockwerk-0.20.0-linux-amd64.deb\` | \`sudo apt install ./Blockwerk-….deb\` – der empfohlene Weg, richtet auch das USB-Kabel ein |

      ## Alle Änderungen seit v0.19.0

      ### Neu

      - **ci:** Releases mit Notizen (abc1234)

      <details><summary>Unter der Haube (1)</summary>

      - Signatur prüfen (def5678)

      </details>

      Vollständiger Vergleich: https://github.com/besitzer/blockwerk/compare/v0.19.0...v0.20.0
      "
    `);
    // ohne Abschnitt im Versionsprotokoll und ohne vorigen Tag bleibt die Liste der Commits
    expect(renderNotes({tag:'v9.9.9', commits:[{subject:'fix: etwas'}]})).toBe('## Alle Änderungen\n\n### Behoben\n\n- etwas\n');
  });
});
