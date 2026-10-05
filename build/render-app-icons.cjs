// Zeichnet aus build/icon.svg die Symbole und Startbilder der App für iPadOS und Android.
// Aufruf nach einer Änderung am Logo:  npx electron build/render-app-icons.cjs
// (danach `npx cap sync` bzw. neu bauen). Die Dateien liegen in ios/ und android/ und sind eingecheckt.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ICON_BG = '#18212C';     // Hintergrund des Logos
const SPLASH_BG = '#16171D';   // Hintergrund des Ladebildschirms im dunklen Design
const RES = 'android/app/src/main/res';

// file: Ziel · w/h: Größe · bg: Füllfarbe (ohne: durchsichtig) · logo: Anteil der kürzeren Seite · round: runder Ausschnitt
const jobs = [
  // iPadOS: ein einziges Symbol, randlos – die abgerundeten Ecken schneidet das System selbst
  {file:'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', w:1024, h:1024, bg:ICON_BG, logo:1},
  ...['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']
    .map(name => ({file:`ios/App/App/Assets.xcassets/Splash.imageset/${name}`, w:2732, h:2732, bg:SPLASH_BG, logo:0.16})),
  // Android: altes Symbol (eckig und rund) und der Vordergrund des anpassbaren Symbols. Von dem
  // zeigt Android nur die Mitte (rund zwei Drittel) – das Logo sitzt deshalb kleiner darin.
  ...Object.entries({mdpi:1, hdpi:1.5, xhdpi:2, xxhdpi:3, xxxhdpi:4}).flatMap(([density, f]) => [
    {file:`${RES}/mipmap-${density}/ic_launcher.png`, w:48 * f, h:48 * f, logo:1},
    {file:`${RES}/mipmap-${density}/ic_launcher_round.png`, w:48 * f, h:48 * f, bg:ICON_BG, logo:0.78, round:true},
    {file:`${RES}/mipmap-${density}/ic_launcher_foreground.png`, w:108 * f, h:108 * f, bg:ICON_BG, logo:0.78}
  ]),
  // Startbilder für Android vor Version 12 (ab 12 zeigt das System das Symbol auf der Farbe aus styles.xml)
  ...Object.entries({'drawable':[480, 320], 'drawable-land-mdpi':[480, 320], 'drawable-land-hdpi':[800, 480], 'drawable-land-xhdpi':[1280, 720],
    'drawable-land-xxhdpi':[1600, 960], 'drawable-land-xxxhdpi':[1920, 1280], 'drawable-port-mdpi':[320, 480], 'drawable-port-hdpi':[480, 800],
    'drawable-port-xhdpi':[720, 1280], 'drawable-port-xxhdpi':[960, 1600], 'drawable-port-xxxhdpi':[1280, 1920]})
    .map(([dir, [w, h]]) => ({file:`${RES}/${dir}/splash.png`, w, h, bg:SPLASH_BG, logo:0.34}))
];

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({width:400, height:300, show:false, webPreferences:{offscreen:true}});
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<canvas></canvas>'));
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8').replace(/<\?xml[^>]*\?>/, '');
  for (const job of jobs){
    const dataUrl = await win.webContents.executeJavaScript(`(async () => {
      const job = ${JSON.stringify(job)};
      const image = new Image();
      image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(${JSON.stringify(svg)});
      await image.decode();
      const canvas = document.querySelector('canvas'); canvas.width = job.w; canvas.height = job.h;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, job.w, job.h);
      if (job.round){ ctx.beginPath(); ctx.arc(job.w / 2, job.h / 2, Math.min(job.w, job.h) / 2, 0, 2 * Math.PI); ctx.clip(); }
      if (job.bg){ ctx.fillStyle = job.bg; ctx.fillRect(0, 0, job.w, job.h); }
      const size = Math.min(job.w, job.h) * job.logo;
      ctx.drawImage(image, (job.w - size) / 2, (job.h - size) / 2, size, size);
      return canvas.toDataURL('image/png');
    })()`);
    const target = path.join(ROOT, job.file);
    fs.mkdirSync(path.dirname(target), {recursive:true});
    fs.writeFileSync(target, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${job.w}×${job.h}`.padEnd(11), job.file);
  }
  app.exit(0);
});
