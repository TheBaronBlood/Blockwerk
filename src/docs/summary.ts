/** Der erste Satz eines Hilfetexts – als Kurzbeschreibung in Listen. Abkürzungen wie »z. B.« beenden ihn nicht. */
export function summary(text: string): string {
  const first = text.split('\n')[0].replace(/`/g, '');
  // Satzende: Punkt, Ausrufe- oder Fragezeichen vor einem Großbuchstaben oder am Zeilenende
  const m = first.match(/^.*?[.!?](?=\s+[A-ZÄÖÜ»]|$)/);
  return m ? m[0] : first;
}
