// Zeichnet build/icon.svg als build/icon.png (1024 × 1024) – das Symbol der Programm-Version.
// Aufruf nach einer Änderung am Logo:  npx electron build/render-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SIZE = 1024;
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:SIZE, height:SIZE, show:false, frame:false, transparent:true, useContentSize:true,
    webPreferences:{offscreen:true, zoomFactor:1}});
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  const page = `<body style="margin:0;background:transparent"><div style="width:${SIZE}px;height:${SIZE}px">${svg}</div></body>`;
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(page));
  await new Promise(r => setTimeout(r, 500));
  const image = (await win.webContents.capturePage()).resize({width:SIZE, height:SIZE});
  fs.writeFileSync(path.join(__dirname, 'icon.png'), image.toPNG());
  console.log('icon.png', image.getSize());
  app.exit(0);
});
