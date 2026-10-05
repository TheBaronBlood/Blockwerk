// Brücke zwischen Seite und Programm: nur das Nötige für die Hub-Auswahl
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('blockwerkDesktop', {
  /** Meldet die Liste der gefundenen Hubs (Bluetooth oder Kabel), sobald sie sich ändert. */
  onDevices: (callback) => { ipcRenderer.on('hub-devices', (_event, devices) => callback(devices)); },
  /** Vor jeder Suche aufrufen: Ein »Abbrechen« aus einem früheren Versuch gilt dann nicht mehr. */
  startSearch: () => { ipcRenderer.send('hub-search'); },
  /** Wählt einen Hub aus; ein leerer Text bricht die Suche ab. */
  chooseDevice: (id) => { ipcRenderer.send('hub-choose', id); },
  /** Meldet, wenn im Menü etwas gewählt wurde (»save«, »open«, »run« …). */
  onMenu: (callback) => { ipcRenderer.on('menu', (_event, action) => callback(action)); },
  /** Größe der ganzen Oberfläche; 1 ist die normale Größe. */
  setZoom: (factor) => { ipcRenderer.send('set-zoom', factor); },
  openDevTools: () => { ipcRenderer.send('open-devtools'); },
  /** Speicherort der Daten: ansehen, ändern (gilt nach dem Neustart), zurücksetzen, im Dateimanager zeigen. */
  data: {
    info: () => ipcRenderer.invoke('data-info'),
    choose: () => ipcRenderer.invoke('data-choose'),
    reset: () => ipcRenderer.invoke('data-reset'),
    open: () => ipcRenderer.invoke('data-open'),
    restart: () => ipcRenderer.invoke('app-restart')
  }
});
