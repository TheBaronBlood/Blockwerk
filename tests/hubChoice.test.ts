import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const { createHubChoice } = createRequire(import.meta.url)('../electron/hubChoice.cjs');

/** Eine Suche von Chromium: merkt sich, was ihr geantwortet wurde. */
const search = () => { const s = {answers:[] as string[], callback:(id: string) => { s.answers.push(id); }}; return s; };

describe('Auswahl des Hubs im Programm', () => {
  it('reicht die Wahl der Seite an die Suche weiter', () => {
    const choice = createHubChoice(), s = search();
    choice.searchStarted();
    expect(choice.bluetoothFound(s.callback)).toBe(true);
    expect(choice.waiting).toBe(true);
    expect(choice.chosen('hub-1')).toBe(true);
    expect(s.answers).toEqual(['hub-1']);
    expect(choice.waiting).toBe(false);
  });

  it('meldet sich die Suche mehrmals, zählt die letzte Meldung – beantwortet wird nur einmal', () => {
    const choice = createHubChoice(), s = search();
    choice.searchStarted();
    choice.bluetoothFound(s.callback); choice.bluetoothFound(s.callback); choice.bluetoothFound(s.callback);
    choice.chosen('hub-1');
    expect(s.answers).toEqual(['hub-1']);
  });

  it('»Abbrechen« vor der ersten Meldung beendet genau diese Suche', () => {
    const choice = createHubChoice(), s = search();
    choice.searchStarted();
    expect(choice.chosen('')).toBe(false);          // noch nichts offen – vorgemerkt
    expect(choice.bluetoothFound(s.callback)).toBe(false);
    expect(s.answers).toEqual(['']);
    expect(choice.waiting).toBe(false);
  });

  // Der Fehler aus 0.25.0 und davor: Nach jeder Verbindung schickt die Seite zum Aufräumen ein
  // »Abbrechen«. Das blieb vorgemerkt, und die nächste Bluetooth-Suche brach sofort ab – das
  // Fenster mit der Liste verschwand, ohne dass man den Hub wählen konnte.
  it('ein »Abbrechen« nach einer fertigen Verbindung trifft die nächste Suche nicht', () => {
    const choice = createHubChoice();
    for (let round = 0; round < 3; round++){
      const s = search();
      choice.searchStarted();
      expect(choice.bluetoothFound(s.callback), `Runde ${round}`).toBe(true);
      choice.chosen('hub-1');
      expect(s.answers).toEqual(['hub-1']);
      choice.chosen('');                            // Aufräumen der Seite nach dem Verbinden
    }
  });

  it('erst das Kabel, dann Bluetooth: Die Suche läuft normal', () => {
    const choice = createHubChoice(), s = search();
    // am Kabel hing genau ein Hub: Das Programm hat ihn ohne Nachfrage genommen, es gab nichts zu beantworten
    choice.searchStarted();
    choice.chosen('');                              // Aufräumen der Seite
    expect(choice.cancelPending).toBe(true);
    choice.searchStarted();                         // neue Suche über Bluetooth
    expect(choice.cancelPending).toBe(false);
    expect(choice.bluetoothFound(s.callback)).toBe(true);
    choice.chosen('hub-1');
    expect(s.answers).toEqual(['hub-1']);
  });

  it('am Kabel mit mehreren Schnittstellen: Wahl und Abbrechen kommen an', () => {
    const choice = createHubChoice(), a = search(), b = search();
    choice.searchStarted(); choice.serialOffered(a.callback); choice.chosen('port-2');
    choice.searchStarted(); choice.serialOffered(b.callback); choice.chosen('');
    expect([a.answers, b.answers]).toEqual([['port-2'], ['']]);
    // ein vorgemerktes Abbrechen betrifft das Kabel nicht
    const c = search();
    choice.searchStarted(); choice.chosen(''); choice.serialOffered(c.callback); choice.chosen('port-1');
    expect(c.answers).toEqual(['port-1']);
  });

  it('antwortet auf Unsinn von der Seite mit »abbrechen«', () => {
    const choice = createHubChoice(), s = search();
    choice.searchStarted(); choice.bluetoothFound(s.callback);
    choice.chosen(undefined);
    expect(s.answers).toEqual(['']);
  });
});
