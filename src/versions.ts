// Versionen: womit Blockwerk gebaut ist, gegen welche Pybricks-Fassung es geprüft wurde und
// ob die Firmware eines Hubs noch aktuell ist. Ohne DOM – getestet in tests/versions.test.ts.

/** Stand, gegen den die Blöcke und der erzeugte Code geprüft sind (PyPI-Paket `pybricks`). */
export const PYBRICKS_API = '4.0.0';
/** Stand der Firmware, gegen den das USB-Protokoll geprüft ist (nur die Beta kann USB). */
export const PYBRICKS_USB = '4.1.0b5';
/** Ab hier meldet sich der Hub überhaupt am Kabel; die Reihe 4.0 hat USB abgeschaltet. */
export const PYBRICKS_USB_FIRST = '4.1.0b1';
/** Älteste Firmware, mit der Blockwerk über Bluetooth arbeitet (Protokoll 1.3). */
export const PYBRICKS_MIN = '3.3.0';
/** Hier listet Pybricks seine Firmware-Fassungen; die Abfrage läuft nur auf Knopfdruck. */
export const PYBRICKS_RELEASES = 'https://api.github.com/repos/pybricks/pybricks-micropython/releases?per_page=30';
export const PYBRICKS_CODE = 'https://code.pybricks.com';
export const PYBRICKS_CODE_BETA = 'https://beta.pybricks.com';

/** Versionen der Pakete, aus denen Blockwerk gebaut ist; setzt Vite beim Bauen ein. */
declare const __VERSIONS__: {app: string; blockly: string; mpyCross: string; electron: string} | undefined;
export const BUILD = typeof __VERSIONS__ === 'undefined' ? {app:'', blockly:'', mpyCross:'', electron:''} : __VERSIONS__;

// Vorabfassungen nach PEP 440, wie Pybricks sie schreibt: 3.3.0b9, 3.3.0c1 (auch »rc1«)
const STAGE: Record<string, number> = {a:0, b:1, c:2, rc:2};
/**
 * Zerlegt »v4.1.0b5« in Zahlen, die sich vergleichen lassen: [4, 1, 0, Stufe, Nummer].
 * Eine fertige Fassung zählt mehr als jede Vorabfassung derselben Nummer.
 */
export function parseVersion(text: string): number[] | null {
  const m = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:(a|b|rc|c)(\d+))?/.exec(text.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3] ?? 0), m[4] ? STAGE[m[4]] : 3, Number(m[5] ?? 0)];
}
/** Kleiner, gleich oder größer als null – wie beim Sortieren. Unlesbares zählt als älteste Fassung. */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a) ?? [0, 0, 0, 0, 0], y = parseVersion(b) ?? [0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}
/**
 * Erklärung, wenn am Kabel kein Hub auftaucht. Der häufigste Grund ist die Firmware: Mit der
 * stabilen Reihe 4.0 erscheint der Hub am Kabel gar nicht als Gerät – er lädt nur.
 * @param firmware Firmware des zuletzt verbundenen Hubs, falls bekannt
 */
export function usbHint(firmware?: string | null): string {
  const cable = 'Hub einschalten und ein USB-Kabel nehmen, das auch Daten überträgt – manche Kabel laden nur.';
  if (firmware && parseVersion(firmware)){
    return compareVersions(firmware, PYBRICKS_USB_FIRST) < 0
      ? `Kein Hub am Kabel gefunden. Der zuletzt verbundene Hub hat Pybricks ${firmware}: Diese Fassung kann kein USB, am Kabel lädt der Hub nur. ` +
        'USB geht erst mit der Beta 4.1 (Installation über beta.pybricks.com). Über Bluetooth klappt es wie gewohnt.'
      : `Kein Hub am Kabel gefunden. ${cable}`;
  }
  return 'Kein Hub am Kabel gefunden. Häufigster Grund: Mit der stabilen Pybricks-Firmware 4.0 ist USB abgeschaltet, der Hub lädt am Kabel nur. ' +
    `USB geht erst mit der Beta 4.1 (Installation über beta.pybricks.com). Sonst: ${cable}`;
}
export const isPrerelease = (version: string) => (parseVersion(version)?.[3] ?? 3) < 3;
const clean = (version: string) => version.trim().replace(/^v/, '');

export interface Release { version: string; date: string; url: string }
export interface Latest { stable: Release | null; beta: Release | null }
/** Sucht aus der Liste von GitHub die neueste fertige Fassung und die neueste Beta, die noch neuer ist. */
export function pickLatest(releases: unknown): Latest {
  const list: Release[] = [];
  for (const r of Array.isArray(releases) ? releases : []){
    const o = r as Record<string, unknown>;
    if (typeof o?.tag_name !== 'string' || !parseVersion(o.tag_name) || o.draft === true) continue;
    list.push({version:clean(o.tag_name), date:typeof o.published_at === 'string' ? o.published_at.slice(0, 10) : '',
      url:typeof o.html_url === 'string' && o.html_url.startsWith('https://github.com/') ? o.html_url : ''});
  }
  list.sort((a, b) => compareVersions(b.version, a.version));
  const stable = list.find(r => !isPrerelease(r.version)) ?? null;
  const beta = list.find(r => isPrerelease(r.version)) ?? null;
  return {stable, beta: beta && (!stable || compareVersions(beta.version, stable.version) > 0) ? beta : null};
}

export type FirmwareState = 'aktuell' | 'veraltet' | 'beta-aktuell' | 'beta-veraltet' | 'zu-alt';
/** Vergleicht die Firmware eines Hubs mit dem, was Pybricks gerade anbietet. */
export function firmwareState(firmware: string, latest: Latest): {state: FirmwareState; text: string; target: Release | null} {
  if (compareVersions(firmware, PYBRICKS_MIN) < 0)
    return {state:'zu-alt', target:latest.stable, text:`Die Firmware ${clean(firmware)} ist für Blockwerk zu alt. Bitte aktualisieren.`};
  if (isPrerelease(firmware)){
    // Wer eine Beta fährt, bekommt die neueste Fassung überhaupt angeboten – Beta oder fertig
    const target = [latest.beta, latest.stable].filter((r): r is Release => !!r).sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
    return target && compareVersions(firmware, target.version) < 0
      ? {state:'beta-veraltet', target, text:`Auf dem Hub läuft die Vorabfassung ${clean(firmware)}. Neuer ist ${target.version}.`}
      : {state:'beta-aktuell', target:null, text:`Auf dem Hub läuft die Vorabfassung ${clean(firmware)} – neuer geht es gerade nicht.`};
  }
  return latest.stable && compareVersions(firmware, latest.stable.version) < 0
    ? {state:'veraltet', target:latest.stable, text:`Auf dem Hub läuft ${clean(firmware)}. Aktuell ist ${latest.stable.version}.`}
    : {state:'aktuell', target:null, text:`Die Firmware ${clean(firmware)} ist aktuell.`};
}

/** Passt die neueste Pybricks-Fassung noch zu dem Stand, gegen den Blockwerk geprüft ist? */
export function apiNote(latest: Latest): string {
  if (!latest.stable) return '';
  const now = parseVersion(latest.stable.version)!, checked = parseVersion(PYBRICKS_API)!;
  if (now[0] === checked[0] && now[1] === checked[1])
    return `Blockwerk ist gegen Pybricks ${PYBRICKS_API} geprüft; ${latest.stable.version} gehört zur selben Reihe und passt dazu.`;
  return `Pybricks ${latest.stable.version} ist neuer als der Stand, gegen den Blockwerk geprüft ist (${PYBRICKS_API}). ` +
    'Die Blöcke laufen meist weiter – neue Befehle kennt Blockwerk aber erst nach einem Update von Blockwerk.';
}
