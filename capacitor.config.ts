// Blockwerk als App für iPadOS und Android (Capacitor): dieselbe Seite aus dist/ in einer
// nativen Hülle. Bluetooth läuft dort über ein Plugin, weil die eingebauten Browser der
// Tablets kein Web Bluetooth können – siehe src/hub/nativeBle.ts.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.blockwerk.app',
  appName: 'Blockwerk',
  webDir: 'dist',
  // Farbe hinter der Seite, solange sie lädt – wie der Ladebildschirm im dunklen Design
  backgroundColor: '#16171D',
  // Die Seite füllt den Bildschirm genau aus; ohne das ließe sie sich am iPad als Ganzes verschieben
  ios: { scrollEnabled: false },
  plugins: {
    // Texte der Hub-Auswahl, die das Bluetooth-Plugin selbst anzeigt
    BluetoothLe: {
      displayStrings: {
        scanning: 'Suche läuft … Der Hub muss eingeschaltet sein.',
        cancel: 'Abbrechen',
        availableDevices: 'Gefundene Hubs',
        noDeviceFound: 'Kein Hub gefunden'
      }
    }
  }
};

export default config;
