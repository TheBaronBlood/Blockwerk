// Wo Blockwerk gerade läuft: als Programm am Computer (Electron), als App auf einem Tablet
// (Capacitor, iPadOS oder Android) oder als Seite im Browser.
// Capacitor legt in der App `window.Capacitor` an, bevor die Seite startet – die Abfrage
// braucht deshalb keinen Import und kostet im Browser nichts.
interface CapacitorGlobal { isNativePlatform?(): boolean; getPlatform?(): string }
const capacitor = () => (globalThis as {Capacitor?: CapacitorGlobal}).Capacitor;

export type Where = 'app' | 'tablet' | 'browser';

/** App auf einem Tablet oder Handy? */
export const isTablet = () => !!capacitor()?.isNativePlatform?.();
/** Betriebssystem der App; null, wenn Blockwerk nicht als App läuft. */
export function tabletSystem(): 'ios' | 'android' | null {
  const system = isTablet() ? capacitor()!.getPlatform?.() : null;
  return system === 'ios' || system === 'android' ? system : null;
}
/** Programm am Computer (Electron)? */
export const isDesktopApp = () => typeof window !== 'undefined' && 'blockwerkDesktop' in window;
export const where = (): Where => isDesktopApp() ? 'app' : isTablet() ? 'tablet' : 'browser';
