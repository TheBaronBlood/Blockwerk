import { describe, expect, it } from 'vitest';
import { apiNote, BUILD, compareVersions, firmwareState, isPrerelease, parseVersion, pickLatest, PYBRICKS_API, usbHint } from '../src/versions';

// Ausschnitt aus der echten Antwort von GitHub (Oktober 2026), gekürzt auf die benutzten Felder
const RELEASES = [
  {tag_name:'v4.1.0b5', prerelease:true, published_at:'2026-10-02T10:00:00Z', html_url:'https://github.com/pybricks/pybricks-micropython/releases/tag/v4.1.0b5'},
  {tag_name:'v4.1.0b4', prerelease:true, published_at:'2026-09-21T10:00:00Z', html_url:'https://github.com/pybricks/pybricks-micropython/releases/tag/v4.1.0b4'},
  {tag_name:'v4.0.1', prerelease:false, published_at:'2026-06-24T10:00:00Z', html_url:'https://github.com/pybricks/pybricks-micropython/releases/tag/v4.0.1'},
  {tag_name:'v4.0.0', prerelease:false, published_at:'2026-06-08T10:00:00Z', html_url:'https://github.com/pybricks/pybricks-micropython/releases/tag/v4.0.0'},
  {tag_name:'v4.0.0b11', prerelease:true, published_at:'2026-05-30T10:00:00Z', html_url:'https://github.com/pybricks/pybricks-micropython/releases/tag/v4.0.0b11'}
];

describe('Versionen', () => {
  it('vergleicht Fassungen samt Vorabfassungen', () => {
    expect(parseVersion('v4.1.0b5')).toEqual([4, 1, 0, 1, 5]);
    expect(parseVersion('3.6')).toEqual([3, 6, 0, 3, 0]);
    expect(parseVersion('kaputt')).toBeNull();
    expect(compareVersions('4.0.1', '4.0.0')).toBeGreaterThan(0);
    expect(compareVersions('4.0.0', '4.0.0b11')).toBeGreaterThan(0);
    expect(compareVersions('4.1.0b5', '4.0.1')).toBeGreaterThan(0);
    expect(compareVersions('4.0.0b11', '4.0.0b2')).toBeGreaterThan(0);
    expect(compareVersions('4.0.0rc1', '4.0.0b11')).toBeGreaterThan(0);
    // Pybricks schreibt Freigabekandidaten als »c1«
    expect(parseVersion('3.3.0c1')).toEqual([3, 3, 0, 2, 1]);
    expect(compareVersions('3.3.0', '3.3.0c1')).toBeGreaterThan(0);
    expect(compareVersions('3.3.0c1', '3.3.0b9')).toBeGreaterThan(0);
    expect(isPrerelease('3.3.0c1')).toBe(true);
    expect(compareVersions('v4.0.1', '4.0.1')).toBe(0);
    expect(isPrerelease('4.1.0b5')).toBe(true);
    expect(isPrerelease('4.0.1')).toBe(false);
  });

  it('findet die neueste fertige Fassung und die neuere Beta', () => {
    const latest = pickLatest(RELEASES);
    expect(latest.stable).toMatchObject({version:'4.0.1', date:'2026-06-24'});
    expect(latest.beta?.version).toBe('4.1.0b5');
    // eine Beta, die älter ist als die fertige Fassung, wird nicht angeboten
    expect(pickLatest(RELEASES.slice(2)).beta).toBeNull();
    // Unsinn von außen führt zu »nichts gefunden«, nicht zu einem Absturz
    expect(pickLatest({message:'rate limit'})).toEqual({stable:null, beta:null});
    expect(pickLatest([null, 5, {tag_name:'nightly'}, {tag_name:'v9.0.0', draft:true}])).toEqual({stable:null, beta:null});
    expect(pickLatest([{tag_name:'v4.0.1', html_url:'javascript:alert(1)'}]).stable?.url).toBe('');
  });

  it('beurteilt die Firmware eines Hubs', () => {
    const latest = pickLatest(RELEASES);
    expect(firmwareState('4.0.1', latest)).toMatchObject({state:'aktuell', target:null});
    expect(firmwareState('v4.0.0', latest)).toMatchObject({state:'veraltet', target:{version:'4.0.1'}});
    expect(firmwareState('3.6.1', latest).state).toBe('veraltet');
    expect(firmwareState('3.2.0', latest).state).toBe('zu-alt');
    expect(firmwareState('4.1.0b5', latest).state).toBe('beta-aktuell');
    expect(firmwareState('4.1.0b3', latest)).toMatchObject({state:'beta-veraltet', target:{version:'4.1.0b5'}});
    // eine alte Beta bekommt die fertige Fassung angeboten, wenn es keine neuere Beta gibt
    expect(firmwareState('4.0.0b11', pickLatest(RELEASES.slice(2)))).toMatchObject({state:'beta-veraltet', target:{version:'4.0.1'}});
    // ohne Liste (kein Internet) gilt nichts als veraltet
    expect(firmwareState('4.0.0', {stable:null, beta:null}).state).toBe('aktuell');
  });

  it('sagt, ob die neueste Fassung zum geprüften Stand passt', () => {
    expect(apiNote(pickLatest(RELEASES))).toContain('passt dazu');
    expect(apiNote(pickLatest([{tag_name:'v4.1.0'}]))).toContain('neuer als der Stand');
    expect(apiNote({stable:null, beta:null})).toBe('');
  });

  it('kennt die Versionen der eingebauten Pakete', () => {
    expect(BUILD.blockly).toMatch(/^\d+\.\d+\.\d+/);
    expect(BUILD.mpyCross).toMatch(/^\d+\.\d+\.\d+/);
    expect(BUILD.app).toMatch(/^\d+\.\d+\.\d+/);
    expect(PYBRICKS_API).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('Hub am Kabel nicht gefunden', () => {
  it('nennt die Firmware des letzten Hubs, wenn sie kein USB kann', () => {
    for (const fw of ['4.0.1', 'v4.0.0', '3.6.1', '4.0.0b11']){
      const text = usbHint(fw);
      expect(text).toContain(`Pybricks ${fw}`);
      expect(text).toContain('kann kein USB');
      expect(text).toContain('beta.pybricks.com');
    }
  });
  it('verweist bei einer Firmware mit USB auf Hub und Kabel', () => {
    for (const fw of ['4.1.0b1', '4.1.0b5', '4.1.0', '5.0.0']){
      const text = usbHint(fw);
      expect(text).not.toContain('kann kein USB');
      expect(text).toContain('Daten überträgt');
    }
  });
  it('erklärt ohne bekannte Firmware beide Möglichkeiten', () => {
    for (const fw of [undefined, null, '', 'unbekannt']){
      const text = usbHint(fw);
      expect(text).toContain('stabilen Pybricks-Firmware 4.0');
      expect(text).toContain('Daten überträgt');
    }
  });
});
