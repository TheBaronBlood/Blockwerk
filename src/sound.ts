// ---------------------------------------------------------------
// Klang beim Zusammenstecken von Blöcken.
// Blocklys eigene Klänge bleiben abgeschaltet (sounds:false); hier kommt nur der eine
// eigene dazu, leiser als aufgenommen.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
// no-inline: als data:-Adresse ließe die Inhaltsrichtlinie das Laden nicht zu
import snapUrl from './assets/snap.mp3?url&no-inline';

/** Lautstärke des Klangs (1 = wie aufgenommen). */
export const SNAP_VOLUME = 0.25;

/** Lässt die Arbeitsfläche beim Zusammenstecken leise klicken, solange `enabled()` gilt. */
export function installSnapSound(ws: Blockly.WorkspaceSvg, enabled: () => boolean): void {
  const audio = ws.getAudioManager();
  // »click« ist der Name, unter dem Blockly den Klang beim Verbinden abspielt
  audio.load([snapUrl], 'click').catch(() => { /* ohne Klang geht alles andere weiter */ });
  const play = audio.play.bind(audio);
  audio.play = (name: string, volume?: number) =>
    name !== 'click' ? play(name, volume) : enabled() ? play(name, SNAP_VOLUME) : Promise.resolve();
}
