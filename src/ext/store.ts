// ---------------------------------------------------------------
// Installierte Erweiterungen: Verzeichnis im Speicher, abgelegt in localStorage.
// ---------------------------------------------------------------
import { parseExtension, type Extension } from './parse';
import { registerExtension, unregisterTypes } from './register';

const STORE_KEY = 'blockwerk-extensions-v1';
const installed = new Map<string, {ext: Extension; types: string[]}>();

export const extensions = () => [...installed.values()].map(e => e.ext).sort((a, b) => a.name.localeCompare(b.name));
export const getExtension = (id: string) => installed.get(id)?.ext;
/** Blocktypen einer installierten Erweiterung. */
export const extensionTypes = (id: string) => installed.get(id)?.types ?? [];

function persist(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify(extensions().map(e => e.source))); } catch { /* kein Speicher verfügbar */ }
}

/** Installiert eine Erweiterung oder ersetzt die gleichnamige. Liefert null, wenn der Quelltext Fehler hat. */
export function installExtension(source: string, save = true): Extension | null {
  const {ext, errors} = parseExtension(source);
  if (!ext || errors.length) return null;
  const old = installed.get(ext.id);
  if (old) unregisterTypes(old.types);
  installed.set(ext.id, {ext, types:registerExtension(ext)});
  if (save) persist();
  return ext;
}
export function removeExtension(id: string){
  const old = installed.get(id);
  if (!old) return;
  unregisterTypes(old.types);
  installed.delete(id);
  persist();
}

/** Beim Start: gespeicherte Erweiterungen anmelden, bevor ein Projekt geladen wird. */
export function loadStoredExtensions(){
  let sources: unknown = [];
  try { sources = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); } catch { /* beschädigt – dann eben keine */ }
  if (Array.isArray(sources)) for (const s of sources) if (typeof s === 'string') installExtension(s, false);
}
