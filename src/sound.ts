// ---------------------------------------------------------------
// Klänge der Arbeitsfläche: ein Klick beim Zusammenstecken, ein Wischen beim Löschen eines Blocks.
// Blocklys eigene Klänge bleiben abgeschaltet (sounds:false); Blockly meldet aber weiter, wann einer
// fällig wäre (»click«, »delete«). Abgespielt wird über die Web-Audio-Schnittstelle: Die ist nach der
// ersten Bedienung der Seite verlässlich zu hören – ein <audio>-Element, das Blockly nie vorgeladen
// hat, blieb in manchen Browsern (Edge) stumm.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
// no-inline: als data:-Adresse ließe die Inhaltsrichtlinie das Laden nicht zu
import snapUrl from './assets/snap.mp3?url&no-inline';
import whooshUrl from './assets/wosh.wav?url&no-inline';

/** Die Klänge unter dem Namen, unter dem Blockly sie abspielt; `volume`: 1 = wie aufgenommen. */
export const SOUNDS: Record<string, {url: string; volume: number}> = {
  click:{url:snapUrl, volume:0.25},
  delete:{url:whooshUrl, volume:0.35}
};

/** Lässt die Arbeitsfläche beim Zusammenstecken klicken und beim Löschen wischen, solange `enabled()` gilt. */
export function installSounds(ws: Blockly.WorkspaceSvg, enabled: () => boolean): void {
  const Context = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Context) return;
  let context: AudioContext | null = null;
  const buffers = new Map<string, AudioBuffer>();
  // Browser lassen Ton erst nach einer Bedienung zu: Beim ersten Druck entsteht die Ausgabe, und die Klänge werden geladen
  const wake = () => {
    if (!context){
      const made = context = new Context();
      for (const [name, sound] of Object.entries(SOUNDS)){
        fetch(sound.url).then(r => r.arrayBuffer()).then(data => made.decodeAudioData(data)).then(buffer => { buffers.set(name, buffer); })
          .catch(() => { /* ohne Klang geht alles andere weiter */ });
      }
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, wake, {capture:true, passive:true});

  const audio = ws.getAudioManager();
  const play = audio.play.bind(audio);
  audio.play = (name: string, volume?: number) => {
    const sound = SOUNDS[name];
    if (!sound) return play(name, volume);
    const buffer = buffers.get(name);
    if (enabled() && context && buffer){
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; gain.gain.value = sound.volume;
      source.connect(gain).connect(context.destination);
      source.start();
    }
    return Promise.resolve();
  };
}
