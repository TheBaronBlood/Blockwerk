// ---------------------------------------------------------------
// Die Programme des Kurses: die SPIKE-Projekte der AG aus referenz/spike-dateien/beispiele.
// Vite legt sie als Dateien neben die Seite; geladen und übersetzt werden sie erst, wenn
// jemand im Kurs auf »laden« klickt. (Nur für den Browser-Build – nicht in Tests einbinden.)
// »no-inline«: Die Dateien sind wenige Kilobyte klein; Vite würde sie sonst als data:-Adresse in das
// Skript schreiben statt als eigene Dateien auszuliefern.
// ---------------------------------------------------------------
const files = import.meta.glob('../../referenz/spike-dateien/beispiele/*/*.llsp3', {query:'?url&no-inline', import:'default', eager:true}) as Record<string, string>;

const byName = new Map(Object.entries(files).map(([path, url]) => [path.split('/').pop()!.replace(/\.llsp3$/, ''), url]));

/** Lädt die Bytes eines Kursprogramms; `name` ist der Dateiname ohne Endung. */
export async function courseProgram(name: string): Promise<Uint8Array> {
  const url = byName.get(name);
  if (!url) throw new Error(`Kursprogramm fehlt: ${name}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Kursprogramm lässt sich nicht laden: ${name}`);
  return new Uint8Array(await response.arrayBuffer());
}
