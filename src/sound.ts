// ---------------------------------------------------------------
// Klänge der Oberfläche: ein Klick beim Zusammenstecken, ein Wischen beim Löschen eines Blocks – dazu
// leise Rückmeldungen für Knöpfe, Start, Stopp, »Hub verbunden« und Fehler im Programm.
// Blocklys eigene Klänge bleiben abgeschaltet (sounds:false); Blockly meldet aber weiter, wann einer
// fällig wäre (»click«, »delete«). Abgespielt wird über die Web-Audio-Schnittstelle: Die ist nach der
// ersten Bedienung der Seite verlässlich zu hören – ein <audio>-Element, das Blockly nie vorgeladen
// hat, blieb in manchen Browsern (Edge) stumm.
// Herkunft: snap.mp3 von Pixabay; tap, start, stop, connected und error aus »Interface Sounds« von
// Kenney (kenney.nl, CC0), nach WAV umgewandelt. Die Lizenzhinweise stehen in build/lizenzen.mjs.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';
// no-inline: als data:-Adresse ließe die Inhaltsrichtlinie das Laden nicht zu
import snapUrl from './assets/snap.mp3?url&no-inline';
import whooshUrl from './assets/wosh.wav?url&no-inline';
import tapUrl from './assets/tap.wav?url&no-inline';
import startUrl from './assets/start.wav?url&no-inline';
import stopUrl from './assets/stop.wav?url&no-inline';
import connectedUrl from './assets/connected.wav?url&no-inline';
import errorUrl from './assets/error.wav?url&no-inline';

/** `volume`: 1 = wie aufgenommen. »click« und »delete« sind die Namen, unter denen Blockly sie abspielt. */
export const SOUNDS = {
  click:{url:snapUrl, volume:0.25},
  delete:{url:whooshUrl, volume:0.18},
  /** ein Knopf oder eine Kategorie wurde angetippt */
  tap:{url:tapUrl, volume:0.16},
  start:{url:startUrl, volume:0.22},
  stop:{url:stopUrl, volume:0.22},
  connected:{url:connectedUrl, volume:0.16},
  error:{url:errorUrl, volume:0.2}
} satisfies Record<string, {url: string; volume: number}>;
export type SoundName = keyof typeof SOUNDS;

/**
 * Richtet die Klänge ein, solange `enabled()` gilt: Die Arbeitsfläche klickt beim Zusammenstecken und
 * wischt beim Löschen. Zurück kommt die Funktion, mit der die Oberfläche die übrigen Klänge abspielt.
 */
export function installSounds(ws: Blockly.WorkspaceSvg, enabled: () => boolean): (name: SoundName) => void {
  const Context = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Context) return () => {};
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

  const playSound = (name: SoundName) => {
    const buffer = buffers.get(name);
    if (!enabled() || !context || !buffer) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffer; gain.gain.value = SOUNDS[name].volume;
    source.connect(gain).connect(context.destination);
    source.start();
  };
  const audio = ws.getAudioManager();
  const play = audio.play.bind(audio);
  audio.play = (name: string, volume?: number) => {
    if (name !== 'click' && name !== 'delete') return play(name, volume);
    playSound(name);
    return Promise.resolve();
  };
  return playSound;
}
