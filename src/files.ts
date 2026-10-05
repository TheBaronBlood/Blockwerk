// Eine Datei an den Nutzer geben: im Browser und im Programm als Download. In der App auf dem
// Tablet geht das nicht aus der Seite heraus – dort öffnet Android die Dateiauswahl des Systems
// (»Speichern unter«, eigenes kleines Plugin SaveFilePlugin.java) und iPadOS das Fenster
// »Teilen« (mit »In Dateien sichern«, AirDrop …).
import { tabletSystem } from './platform';

interface SaveFilePlugin { save(options: {name: string; text: string; type: string}): Promise<{saved: boolean}> }

/** Liefert false, wenn in der App die Auswahl abgebrochen wurde. */
export async function saveFile(name: string, text: string, type: string): Promise<boolean> {
  const system = tabletSystem();
  if (system === 'android'){
    const { registerPlugin } = await import('@capacitor/core');
    return (await registerPlugin<SaveFilePlugin>('SaveFile').save({name, text, type})).saved;
  }
  if (system === 'ios'){
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const { uri } = await Filesystem.writeFile({path:name, data:text, directory:Directory.Cache, encoding:Encoding.UTF8});
    try { await Share.share({title:name, files:[uri]}); return true; }
    catch { return false; }   // abgebrochen
  }
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
