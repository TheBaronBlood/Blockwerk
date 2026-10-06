// ---------------------------------------------------------------
// Blockwerk als Programm für Windows, macOS und Linux (Electron)
// Zeigt den fertigen Build aus dist/ in einem eigenen Fenster.
// ---------------------------------------------------------------
const { app, BrowserWindow, Menu, dialog, ipcMain, protocol, shell } = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dataDirs = require('./dataDir.cjs');
const { createHubChoice } = require('./hubChoice.cjs');

// Speicherort der Daten festlegen – muss geschehen, bevor Electron den Ordner zum ersten Mal benutzt.
// Mit »--user-data-dir« (Selbsttest) gilt, was dort steht.
const defaultDataDir = app.getPath('userData');
// die portable Exe läuft aus einem Zwischenordner; ihr eigentlicher Platz steht in der Umgebungsvariablen
// »Neben dem Programm«: bei der portablen Exe und beim AppImage der Ordner der Datei selbst – beide
// packen sich beim Start an einen anderen Ort aus, dort wäre der Datenordner nach dem Beenden weg.
const programDir = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR || (process.env.APPIMAGE ? path.dirname(process.env.APPIMAGE) : path.dirname(app.getPath('exe'))))
  : null;
let dataInfo = {dir:defaultDataDir, source:'default'};
if (!process.argv.some(a => a.startsWith('--user-data-dir'))){
  dataInfo = dataDirs.resolveDataDir({defaultDir:defaultDataDir, programDir});
  if (dataInfo.source !== 'default') app.setPath('userData', dataInfo.dir);
}

const DIST = path.join(__dirname, '..', 'dist');
const ALLOWED_PERMISSIONS = new Set(['local-fonts', 'clipboard-sanitized-write', 'fullscreen', 'serial']);
/** abgelehnte Anfragen der Seite – der Selbsttest gibt sie aus, damit eine zu strenge Regel auffällt */
const deniedPermissions = [];
const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.wasm':'application/wasm', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png',
  '.woff2':'font/woff2', '.woff':'font/woff'
};
// Selbsttest für die Build-Pipeline: »--smoke-test« startet, prüft die Seite und beendet sich wieder
const smokeTest = process.argv.includes('--smoke-test');
const smokeShot = (process.argv.find(a => a.startsWith('--smoke-shot=')) || '').slice('--smoke-shot='.length);

// Eigenes Schema statt file://: Die Seite bekommt eine feste Herkunft (gespeicherte Projekte
// bleiben erhalten), fetch() funktioniert (der Compiler lädt so seine WASM-Datei), und
// Bluetooth ist erlaubt, weil das Schema als sicher gilt.
protocol.registerSchemesAsPrivileged([{scheme:'app', privileges:{standard:true, secure:true, supportFetchAPI:true, stream:true}}]);
// Unter Linux ist Web Bluetooth in Chromium nicht von sich aus eingeschaltet
if (process.platform === 'linux'){
  app.commandLine.appendSwitch('enable-features', 'WebBluetooth');
  app.commandLine.appendSwitch('enable-experimental-web-platform-features');
}

// Inhaltsrichtlinie für die Seite: Es laufen nur Skripte aus dem Programm selbst – kein eingeschleuster
// Skripttext, nichts aus dem Netz. »wasm-unsafe-eval« braucht der Python-Übersetzer (WebAssembly),
// »unsafe-inline« bei den Stilen Blockly; ins Netz geht nur die Frage nach neuer Firmware bei GitHub.
// (Nur hier im Programm: Die Apps für Tablets zeigen dieselbe Seite, aber Capacitor schreibt auf alten
// Android-Geräten seine Brücke als Skripttext in die Seite – eine Richtlinie in der Seite sperrte sie aus.)
const CSP = [
  "default-src 'self'", "script-src 'self' 'wasm-unsafe-eval'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:", "connect-src 'self' https://api.github.com",
  "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"
].join('; ');

function serve(request){
  let rel;
  try { rel = decodeURIComponent(new URL(request.url).pathname); } catch { return new Response('', {status:400}); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST + path.sep)) return new Response('', {status:403});
  return fs.promises.readFile(file)
    .then(data => new Response(data, {headers:{'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      ...(path.extname(file).toLowerCase() === '.html' ? {'content-security-policy': CSP} : {})}}))
    .catch(() => new Response('Nicht gefunden', {status:404}));
}

function menu(){
  const isMac = process.platform === 'darwin';
  // Die Seite führt die Befehle aus – dieselben Wege wie bei einem Klick auf den Knopf
  const item = (label, action, accelerator) => ({label, accelerator, click:() => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (win) win.webContents.send('menu', action);
  }});
  return Menu.buildFromTemplate([
    ...(isMac ? [{role:'appMenu'}] : []),
    {label:'Datei', submenu:[
      item('Neu', 'new', 'CmdOrCtrl+N'), item('Öffnen …', 'open', 'CmdOrCtrl+O'), item('Speichern', 'save', 'CmdOrCtrl+S'), {type:'separator'},
      item('Erweiterungen …', 'extensions'), item('Einstellungen …', 'settings', 'CmdOrCtrl+,'), {type:'separator'},
      isMac ? {role:'close', label:'Fenster schließen'} : {role:'quit', label:'Beenden'}]},
    {label:'Bearbeiten', submenu:[
      {role:'undo', label:'Rückgängig'}, {role:'redo', label:'Wiederholen'}, {type:'separator'},
      {role:'cut', label:'Ausschneiden'}, {role:'copy', label:'Kopieren'}, {role:'paste', label:'Einfügen'}, {role:'selectAll', label:'Alles auswählen'}, {type:'separator'},
      item('Python-Code kopieren', 'copy', 'CmdOrCtrl+Shift+C')]},
    {label:'Hub', submenu:[
      item('Verbinden / Trennen', 'connect', 'CmdOrCtrl+Shift+H'), {type:'separator'},
      item('Programm starten', 'run', 'F5'), item('Programm stoppen', 'stop', 'Shift+F5'), {type:'separator'},
      item('Hub-Ansicht: Anschlüsse und Akku …', 'hubview', 'CmdOrCtrl+Shift+A')]},
    {label:'Ansicht', submenu:[
      item('Python-Bereich ein- oder ausklappen', 'code', 'CmdOrCtrl+B'), {type:'separator'},
      {role:'reload', label:'Neu laden'}, {type:'separator'},
      {role:'togglefullscreen', label:'Vollbild'}, {role:'toggleDevTools', label:'Entwicklerwerkzeuge'}]},
    {label:'Hilfe', submenu:[
      item('Hilfe zu Blöcken und Python', 'help', 'F1'), {type:'separator'},
      {label:'Pybricks Code öffnen', click:() => shell.openExternal('https://code.pybricks.com')}, {type:'separator'},
      item('Über Blockwerk', 'about')]}
  ]);
}

function createWindow(){
  // »--smoke-size=1280x800« gibt dem Fenster des Selbsttests eine andere Größe (Fotos im Tablet-Format)
  const [smokeW, smokeH] = ((process.argv.find(a => a.startsWith('--smoke-size=')) || '').slice('--smoke-size='.length) || '1400x900').split('x').map(Number);
  const win = new BrowserWindow({
    width:smokeW || 1400, height:smokeH || 900, minWidth:Math.min(700, smokeW || 700), minHeight:500, title:'Blockwerk', backgroundColor:'#16171D', show:!smokeTest,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    // Rechtschreibprüfung aus: Unter Windows und Linux lüde Electron dafür Wörterbücher von einem Google-Server
    webPreferences:{preload:path.join(__dirname, 'preload.cjs'), contextIsolation:true, nodeIntegration:false, sandbox:true, spellcheck:false}
  });

  // Hub-Auswahl: Chromium meldet gefundene Geräte, zeigt aber in Electron kein eigenes Fenster.
  // Die Liste geht an die Seite, die Wahl kommt über »hub-choose« zurück ('' = abbrechen).
  // (Wer wem wann antwortet, steht in hubChoice.cjs.)
  const choice = createHubChoice();
  win.webContents.on('select-bluetooth-device', (event, devices, callback) => {
    event.preventDefault();
    if (!choice.bluetoothFound(callback)) return;   // diese Suche war schon abgebrochen
    ports = null;
    win.webContents.send('hub-devices', devices.map(d => ({id:d.deviceId, name:d.deviceName})));
  });
  for (const channel of ['hub-choose', 'hub-search']) ipcMain.removeAllListeners(channel);
  ipcMain.on('hub-search', () => choice.searchStarted());
  ipcMain.on('hub-choose', (_event, id) => { if (choice.chosen(id)) ports = null; });

  // USB-Kabel: Der Hub erscheint als serielle Schnittstelle. Hängt genau einer am Kabel, wird
  // er ohne Nachfrage genommen; sonst wählt die Seite aus der Liste (oder wartet, bis einer
  // eingesteckt wird).
  const ses = win.webContents.session;
  let ports = null;   // Liste, solange eine Auswahl am Kabel offen ist
  const sendPorts = () => win.webContents.send('hub-devices', ports.map(p => ({id:p.portId, name:p.displayName || p.portName})));
  for (const name of ['select-serial-port', 'serial-port-added', 'serial-port-removed']) ses.removeAllListeners(name);
  ses.on('select-serial-port', (event, portList, _webContents, callback) => {
    event.preventDefault();
    if (portList.length === 1){ callback(portList[0].portId); return; }
    choice.serialOffered(callback); ports = [...portList];
    sendPorts();
  });
  ses.on('serial-port-added', (_event, port) => { if (ports){ ports.push(port); sendPorts(); } });
  ses.on('serial-port-removed', (_event, port) => { if (ports){ ports = ports.filter(p => p.portId !== port.portId); sendPorts(); } });
  // Schon angeschlossene Schnittstellen darf die Seite ohne Auswahlfenster sehen
  ses.setDevicePermissionHandler((details) => details.deviceType === 'serial');
  // Was die Seite sonst noch anfragen darf: Systemschriften (Einstellungen), Kopieren, Vollbild, Kabel.
  // Alles andere – Kamera, Mikrofon, Standort, Benachrichtigungen … – braucht Blockwerk nicht und bekommt es nicht.
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ALLOWED_PERMISSIONS.has(permission);
    if (!allowed) deniedPermissions.push(permission);
    callback(allowed);
  });

  // Einstellungen der Seite: Größe der Oberfläche, Entwicklerwerkzeuge
  for (const channel of ['set-zoom', 'open-devtools']) ipcMain.removeAllListeners(channel);
  ipcMain.on('set-zoom', (_event, factor) => { if (typeof factor === 'number' && factor >= 0.5 && factor <= 2) win.webContents.setZoomFactor(factor); });
  ipcMain.on('open-devtools', () => win.webContents.openDevTools({mode:'detach'}));

  // Links nach außen (Pybricks Code) öffnet der normale Browser, nicht ein zweites Blockwerk-Fenster
  win.webContents.setWindowOpenHandler(({url}) => { if (/^https?:/.test(url)) shell.openExternal(url); return {action:'deny'}; });
  win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('app://')){ event.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  if (smokeTest) runSmokeTest(win);
  win.loadURL('app://blockwerk/index.html');
  return win;
}

// Speicherort aus den Einstellungen heraus ansehen und ändern
function registerDataHandlers(){
  const info = () => ({...dataInfo, defaultDir:defaultDataDir, programFolder:programDir ? path.join(programDir, dataDirs.FOLDER) : null});
  ipcMain.handle('data-info', info);
  ipcMain.handle('data-open', () => shell.openPath(dataInfo.dir));
  ipcMain.handle('app-restart', () => { app.relaunch(); app.quit(); });
  // Liefert {dir}, wenn ein Umzug vorgemerkt wurde (gilt nach dem Neustart), sonst {cancelled} oder {error}.
  const move = async (event, target) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (target === dataInfo.dir) return {cancelled:true};
    let adopt = false;
    if (dataDirs.hasData(target)){
      const {response} = await dialog.showMessageBox(win, {
        type:'question', title:'Speicherort', message:'In diesem Ordner liegen schon Daten von Blockwerk.',
        detail:target, buttons:['Diese Daten benutzen', 'Mit den jetzigen überschreiben', 'Abbrechen'], defaultId:0, cancelId:2, noLink:true});
      if (response === 2) return {cancelled:true};
      adopt = response === 0;
    }
    try {
      dataDirs.scheduleMove({defaultDir:defaultDataDir, currentDir:dataInfo.dir, target, adopt});
      // alles Ungesicherte auf die Platte bringen, bevor beim nächsten Start kopiert wird
      event.sender.session.flushStorageData();
      return {dir:target};
    } catch (err){ return {error:'In diesen Ordner kann Blockwerk nicht schreiben.'}; }
  };
  ipcMain.handle('data-choose', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const picked = await dialog.showOpenDialog(win, {
      title:'Ordner für die Daten von Blockwerk', buttonLabel:'Hier speichern', defaultPath:dataInfo.dir, properties:['openDirectory', 'createDirectory']});
    if (picked.canceled || !picked.filePaths[0]) return {cancelled:true};
    return move(event, dataDirs.targetFor(picked.filePaths[0]));
  });
  ipcMain.handle('data-reset', (event) => move(event, defaultDataDir));
}

// Der Selbsttest probiert selbst aus, ob die Inhaltsrichtlinie Skripttext sperrt. Chromium meldet das je
// nach System zusätzlich in der Konsole, mit der Prüfsumme des gesperrten Skripts (unter Linux, nicht
// unter macOS). Genau diese eine Meldung ist kein Fehler; jeder andere gesperrte Text hat eine andere
// Prüfsumme und fällt weiter auf.
const CSP_PROBE = 'return 1';
const CSP_PROBE_HASH = 'eval-sha256-' + crypto.createHash('sha256').update(`(function anonymous(\n) {\n${CSP_PROBE}\n})`).digest('base64');

function runSmokeTest(win){
  const errors = [];
  win.webContents.on('console-message', (event) => { if (event.level === 'error' && !event.message.includes(CSP_PROBE_HASH)) errors.push(event.message); });
  win.webContents.on('did-fail-load', (_e, code, text) => errors.push(`Laden fehlgeschlagen: ${code} ${text}`));
  win.webContents.once('did-finish-load', () => setTimeout(async () => {
    let result = {};
    try {
      result = await win.webContents.executeJavaScript(`(async () => ({
        splashGone: !document.getElementById('splash'),
        codeLines: document.querySelectorAll('#codeLines .ln').length,
        blocks: document.querySelectorAll('.blocklyDraggable').length,
        bluetooth: !!navigator.bluetooth,
        fonts: await (window.queryLocalFonts ? window.queryLocalFonts().then(f => f.length, e => String(e)) : 'fehlt'),
        serial: !!navigator.serial && await navigator.serial.getPorts().then(() => true, () => false),
        hubBarVisible: !document.getElementById('hubBar').classList.contains('hidden'),
        desktopBridge: !!window.blockwerkDesktop,
        fontLoaded: await document.fonts.load('15px "Atkinson Hyperlegible"').then(f => f.length > 0),
        // die Lizenztexte der eingebauten Software müssen dem Programm beiliegen (build/lizenzen.mjs)
        licenses: await fetch('lizenzen.txt').then(r => r.ok ? r.text() : '').then(t => t.startsWith('Blockwerk') ? t.length : 0, () => 0),
        // die Inhaltsrichtlinie gilt: Skripttext wird nicht ausgeführt
        csp: (() => { try { new Function(${JSON.stringify(CSP_PROBE)})(); return false; } catch { return true; } })()
      }))()`);
      // (Lädt die Seite etwas aus dem Netz – etwa Blocklys Symbole –, meldet die Richtlinie das in der
      // Konsole als Fehler, und der Selbsttest schlägt fehl.)
      // »--smoke-ext« probiert zusätzlich den Editor für Erweiterungen aus: Vorlage öffnen, Vorschau
      // prüfen, hinzufügen. Das legt die Vorlage im Profil ab – deshalb nur mit eigenem
      // »--user-data-dir« aufrufen.
      if (process.argv.includes('--smoke-ext')){
        const wait = (ms) => new Promise(r => setTimeout(r, ms));
        await win.webContents.executeJavaScript(`document.getElementById('btnExt').click()`);
        await wait(1200);
        if (smokeShot) fs.writeFileSync(smokeShot.replace(/\.png$/, '-ext.png'), (await win.webContents.capturePage()).toPNG());
        result.ext = await win.webContents.executeJavaScript(`(async () => {
          const dialog = document.querySelector('dialog.ext');
          const preview = dialog.querySelectorAll('.ext-preview .blocklyBlockCanvas > g').length;
          const problems = dialog.querySelectorAll('.ext-errors li').length;
          dialog.querySelector('[data-act=save]').click();
          await new Promise(r => setTimeout(r, 4000));
          const after = [...dialog.querySelectorAll('.ext-errors li')].map(li => li.textContent);
          dialog.close();
          return {preview, problems, after, listed: dialog.querySelectorAll('.ext-list li').length,
            category: [...document.querySelectorAll('.blocklyToolboxCategoryLabel, .blocklyTreeLabel')].some(e => e.textContent === 'PID-Regler')};
        })()`);
        result.extOk = result.ext.preview >= 4 && result.ext.problems === 0 && result.ext.after.length === 0 && result.ext.listed === 1 && result.ext.category;
        if (!result.extOk) errors.push('Editor für Erweiterungen: ' + JSON.stringify(result.ext));
      }
      // »--smoke-hub« öffnet die Hub-Ansicht am Test-Hub (Entwickleroption): Der nachgestellte Hub spielt die
      // Meldungen des Anzeige-Programms nach. Geprüft wird der ganze Weg – übersetzen, laden, Zeilen auswerten,
      // zeichnen, schließen. Schaltet die Entwickleroptionen im Profil ein – nur mit eigenem »--user-data-dir«.
      if (process.argv.includes('--smoke-hub')){
        result.hub = await win.webContents.executeJavaScript(`(async () => {
          const wait = (ms) => new Promise(r => setTimeout(r, ms));
          const until = async (fn, ms) => { for (const end = Date.now() + ms; Date.now() < end; await wait(100)){ const v = fn(); if (v) return v; } return null; };
          document.getElementById('btnSettings').click(); await wait(300);
          const settings = document.querySelector('dialog.settings[open]');
          for (const name of ['dev', 'devTestHub']){ const box = settings.querySelector('input[name=' + name + ']'); if (!box.checked) box.click(); await wait(100); }
          settings.close();
          // Vorgabe eines Motor-Blocks in der Blockliste: ohne Hub »C«
          const motorPort = () => window.__blockwerkWorkspace.options.languageTree.contents.find(c => c.name === 'Motoren').contents[0].fields.PORT;
          const ports = [motorPort()];
          document.getElementById('btnConnect').click();
          const connect = await until(() => document.querySelector('dialog.connect[open]'), 3000);
          if (!connect) return {failed:'Fenster »Hub verbinden« fehlt'};
          connect.querySelector('[data-kind=test]').click();
          // Nach dem Verbinden sieht Blockwerk nach, was steckt (am Test-Hub: ein Motor an A), und stellt die Liste darauf ein
          await until(() => motorPort() === 'A' && document.getElementById('hubState').textContent.includes('bereit'), 10000);
          ports.push(motorPort());
          await wait(150);   // das Terminal schreibt mit kurzer Verzögerung
          const told = document.getElementById('termOut').textContent.includes('Am Hub erkannt: Motor an A, Farbsensor an C, Abstandssensor an D, Kraftsensor an E.');
          document.getElementById('btnHubView').click();
          const view = await until(() => document.querySelector('dialog.hubv[open]'), 5000);
          if (!view) return {failed:'Hub-Ansicht öffnet sich nicht'};
          const live = await until(() => view.querySelector('.hubv-port[data-kind=motor]') && view.querySelector('.hubv-port[data-kind=color]'), 8000);
          const kinds = [...view.querySelectorAll('.hubv-port')].map(c => c.dataset.port + ':' + c.dataset.kind).join(' ');
          const battery = (view.querySelector('.hubv-battery b') || {}).textContent || '';
          view.querySelector('[data-act=close]').click();
          const idle = await until(() => document.getElementById('hubState').textContent.includes('bereit'), 5000);
          const terminal = document.getElementById('termOut').textContent;
          window.blockwerk.hub().disconnect();
          // ohne Hub gelten wieder die üblichen Vorgaben
          await until(() => motorPort() === 'C', 2000);
          ports.push(motorPort());
          return {live:!!live, kinds, battery, idle:!!idle, clean:!terminal.includes('\\x1e') && !terminal.includes('Programm beendet'), ports:ports.join('>'), told};
        })()`, true);
        result.hubOk = !!result.hub.live && result.hub.kinds === 'A:motor C:color E:force B:none D:ultra F:none' && / V$/.test(result.hub.battery)
          && result.hub.idle && result.hub.clean && result.hub.ports === 'C>A>C' && result.hub.told;
        if (!result.hubOk) errors.push('Hub-Ansicht: ' + JSON.stringify(result.hub));
      }
      // »--smoke-matrix« legt den Block »zeige Muster« auf die Fläche und öffnet seinen Editor
      if (process.argv.includes('--smoke-matrix')){
        result.matrix = await win.webContents.executeJavaScript(`(async () => {
          const ws = window.__blockwerkWorkspace;
          const block = ws.newBlock('pb_display_pixels'); block.initSvg(); block.render();
          // ans Ende des Programms hängen – ein loser Block würde ausgegraut
          let last = ws.getBlocksByType('pb_start')[0];
          while (last && last.getNextBlock()) last = last.getNextBlock();
          if (last && last.nextConnection) last.nextConnection.connect(block.previousConnection); else block.moveBy(420, 60);
          await new Promise(r => setTimeout(r, 300));
          block.getField('PIXELS').showEditor();
          await new Promise(r => setTimeout(r, 500));
          const editor = document.querySelector('.blocklyDropDownDiv .mx');
          if (!editor) return {editor:false};
          // einen dunklen Punkt setzen: Helligkeit wählen, dann oben links klicken
          editor.querySelectorAll('.mx-level')[6].click();
          const px = editor.querySelector('.mx-px');
          px.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); editor.dispatchEvent(new PointerEvent('pointerup', {bubbles:true}));
          return {editor:true, pixels:editor.querySelectorAll('.mx-px').length, presets:editor.querySelectorAll('.mx-preset').length, value:block.getFieldValue('PIXELS')};
        })()`);
        if (!(result.matrix.editor && result.matrix.pixels === 25 && result.matrix.value[0] === '3')) errors.push('Muster-Editor: ' + JSON.stringify(result.matrix));
        // das unsichtbare Fenster zeichnet nur auf Anforderung: erst anstoßen, dann aufnehmen
        await win.webContents.capturePage();
        await new Promise(r => setTimeout(r, 500));
        if (smokeShot) fs.writeFileSync(smokeShot.replace(/\.png$/, '-matrix.png'), (await win.webContents.capturePage()).toPNG());
      }
      // »--smoke-js=…« führt vor dem Foto beliebiges JavaScript in der Seite aus (zum Durchklicken)
      // (»--smoke-js-file=…« liest es aus einer Datei – für längere Abläufe)
      const jsFile = (process.argv.find(a => a.startsWith('--smoke-js-file=')) || '').slice('--smoke-js-file='.length);
      const js = jsFile ? fs.readFileSync(jsFile, 'utf8') : (process.argv.find(a => a.startsWith('--smoke-js=')) || '').slice('--smoke-js='.length);
      if (js){
        result.js = await win.webContents.executeJavaScript(`(async () => { ${js} })()`, true);
        await win.webContents.capturePage();
        await new Promise(r => setTimeout(r, 700));
      }
      // »--smoke-click=btnConnect« klickt vor dem Bildschirmfoto einen Knopf an (für Fotos von Fenstern)
      const click = (process.argv.find(a => a.startsWith('--smoke-click=')) || '').slice('--smoke-click='.length);
      if (click){
        await win.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(click)}).click()`, true);
        await new Promise(r => setTimeout(r, 3500));
        result.dialog = await win.webContents.executeJavaScript(`document.querySelector('dialog[open]')?.className || null`);
      }
      if (smokeShot) fs.writeFileSync(smokeShot, (await win.webContents.capturePage()).toPNG());
    } catch (err){ errors.push(String(err)); }
    const ok = result.splashGone && result.codeLines > 0 && result.blocks > 0 && result.desktopBridge && result.licenses > 10000
      && result.csp && errors.length === 0;
    console.log('SMOKE ' + JSON.stringify({ok, ...result, deniedPermissions, errors}));
    app.exit(ok ? 0 : 1);
  }, 4000));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { const [win] = BrowserWindow.getAllWindows(); if (win){ if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    protocol.handle('app', serve);
    registerDataHandlers();
    Menu.setApplicationMenu(menu());
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
}
