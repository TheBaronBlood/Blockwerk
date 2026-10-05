// ---------------------------------------------------------------
// Merkt sich die Firmware des zuletzt verbundenen Hubs. Damit lässt sich erklären, warum am
// Kabel nichts gefunden wird: Die stabile Pybricks-Firmware 4.0 kann kein USB.
// ---------------------------------------------------------------
const STORE_KEY = 'blockwerk-hub-v1';

export function rememberFirmware(firmware: string){
  try { localStorage.setItem(STORE_KEY, JSON.stringify({firmware})); } catch { /* kein Speicher verfügbar */ }
}
export function lastFirmware(): string | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')?.firmware;
    return typeof value === 'string' && value ? value : null;
  } catch { return null; }
}
