// ---------------------------------------------------------------
// Klänge der Oberfläche. Welcher Anlass welchen Klang bekommt, steht nicht hier, sondern in
// `public/klang/klang.json` – dort lässt es sich ohne Programmieren ändern: Datei in den Ordner
// `public/klang/` legen, ihren Namen eintragen, Seite neu laden. Ohne Dateinamen bleibt ein Anlass stumm.
// Blocklys eigene Klänge bleiben abgeschaltet (sounds:false); Blockly meldet aber weiter, wann einer
// fällig wäre (»click«, »delete«). Abgespielt wird über die Web-Audio-Schnittstelle: Die ist nach der
// ersten Bedienung der Seite verlässlich zu hören – ein <audio>-Element, das Blockly nie vorgeladen
// hat, blieb in manchen Browsern (Edge) stumm.
// ---------------------------------------------------------------
import type * as Blockly from 'blockly';

/** Die Anlässe, zu denen ein Klang kommen kann – so heißen sie auch in klang.json. */
export const SOUND_EVENTS = ['zusammenstecken', 'loeschen', 'knopf', 'kategorie', 'start', 'stopp', 'verbunden', 'getrennt', 'fehler'] as const;
export type SoundEvent = typeof SOUND_EVENTS[number];
export interface SoundChoice { file: string; volume: number }
/** Der Ordner mit klang.json und den Klangdateien, neben der Seite. */
export const SOUND_DIR = './klang/';

/**
 * Liest klang.json: je Anlass `{"datei": "…", "lautstaerke": 0 bis 1}`. Unbekanntes und Unsinniges fällt
 * weg; als Datei gilt nur ein Name im Klang-Ordner (kein Pfad, keine Adresse), Endung mp3, wav oder ogg.
 */
export function readSoundConfig(raw: unknown): Partial<Record<SoundEvent, SoundChoice>> {
  const out: Partial<Record<SoundEvent, SoundChoice>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const event of SOUND_EVENTS){
    const entry = (raw as Record<string, unknown>)[event] as {datei?: unknown; lautstaerke?: unknown} | undefined;
    if (!entry || typeof entry.datei !== 'string' || !/^[\w][\w .-]*\.(mp3|wav|ogg)$/i.test(entry.datei)) continue;
    const volume = typeof entry.lautstaerke === 'number' && Number.isFinite(entry.lautstaerke) ? Math.max(0, Math.min(1, entry.lautstaerke)) : 0.25;
    out[event] = {file:entry.datei, volume};
  }
  return out;
}

/**
 * Richtet die Klänge ein, solange `enabled()` gilt: Die Arbeitsfläche klickt beim Zusammenstecken und
 * wischt beim Löschen. Zurück kommt die Funktion, mit der die Oberfläche die übrigen Anlässe meldet.
 */
export function installSounds(ws: Blockly.WorkspaceSvg, enabled: () => boolean): (event: SoundEvent) => void {
  const Context = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
  if (!Context) return () => {};
  let context: AudioContext | null = null;
  const loaded = new Map<SoundEvent, {buffer: AudioBuffer; volume: number}>();
  // Browser lassen Ton erst nach einer Bedienung zu: Beim ersten Druck entsteht die Ausgabe, und die Klänge werden geladen
  const wake = () => {
    if (!context){
      const made = context = new Context();
      fetch(SOUND_DIR + 'klang.json').then(r => r.json()).then((raw) => {
        for (const [event, choice] of Object.entries(readSoundConfig(raw)) as [SoundEvent, SoundChoice][]){
          fetch(SOUND_DIR + encodeURIComponent(choice.file)).then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
            .then(data => made.decodeAudioData(data)).then(buffer => { loaded.set(event, {buffer, volume:choice.volume}); })
            .catch(() => console.warn(`Klang »${choice.file}« (${event}) ließ sich nicht laden.`));
        }
      }).catch(() => { /* ohne Klang geht alles andere weiter */ });
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  };
  for (const type of ['pointerdown', 'keydown']) window.addEventListener(type, wake, {capture:true, passive:true});

  const playSound = (event: SoundEvent) => {
    const sound = loaded.get(event);
    if (!enabled() || !context || !sound) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = sound.buffer; gain.gain.value = sound.volume;
    source.connect(gain).connect(context.destination);
    source.start();
  };
  const audio = ws.getAudioManager();
  const play = audio.play.bind(audio);
  audio.play = (name: string, volume?: number) => {
    if (name !== 'click' && name !== 'delete') return play(name, volume);
    playSound(name === 'click' ? 'zusammenstecken' : 'loeschen');
    return Promise.resolve();
  };
  return playSound;
}
