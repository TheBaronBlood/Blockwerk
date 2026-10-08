# Blockwerk selbst bauen und bereitstellen

Wie man Blockwerk aus dem Quelltext startet, ins Netz stellt, als Programm und als App baut –
und wie der Quelltext aufgebaut ist. Was Blockwerk kann und wie man es benutzt, steht in der
[README](../README.md).

- [Voraussetzungen](#voraussetzungen)
- [Im Browser](#im-browser)
- [Im Netz bereitstellen (Cloudflare)](#im-netz-bereitstellen-cloudflare)
- [Als Programm](#als-programm)
- [App für Tablets bauen](#app-für-tablets-bauen) – mit dem [Android-Schlüssel](#android-schlüssel)
- [Aufbau](#aufbau)

## Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 20
- Python 3 (nur für die Tests, die den erzeugten Code prüfen)
- Zum Laden auf den Hub im Browser: Chrome oder Edge und ein Hub mit Pybricks-Firmware

## Im Browser

```
npm install
npm run dev
```

Danach `http://localhost:5173` öffnen. In VS Code genügt **F5**.

| Befehl | Wirkung |
|--------|---------|
| `npm run dev` | Entwicklungsserver; Änderungen erscheinen sofort |
| `npm run build` | Typprüfung und fertige Version in `dist/` |
| `npm run preview` | die fertige Version lokal ansehen (`http://localhost:4173`) |
| `npm test` | alle Tests |

Der Inhalt von `dist/` lässt sich auf jeden Webserver legen. Für Bluetooth muss die Seite
über HTTPS (oder `localhost`) laufen.

Wer Blockwerk selbst ins Netz stellt, kann dem Browser zusätzlich vorschreiben, dass nur
Skripte der Seite selbst laufen – als Kopfzeile des Webservers (das Programm für den Computer
setzt dieselbe Regel von sich aus):

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://api.github.com; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'
```

## Im Netz bereitstellen (Cloudflare)

So lässt sich Blockwerk für die AG als Link anbieten – ohne Installation, mit HTTPS (nötig für
Bluetooth und Kabel). Die Kinder brauchen Chrome oder Edge.

1. In Cloudflare: **Workers & Pages → Erstellen → Repository importieren**, dieses Repository
   wählen. Der Projektname muss `blockwerk` sein – oder so, wie er in `wrangler.jsonc` steht.
2. Build-Befehl `npm run build`, Bereitstellungsbefehl `npx wrangler deploy` (so schlägt
   Cloudflare es vor). Was hochgeladen wird, steht in `wrangler.jsonc`: der Ordner `dist`.
3. »Mit Cloudflare Access schützen« aus lassen, sonst kommt niemand ohne Anmeldung auf die
   Seite. Vorschau-Builds braucht es nicht.
4. Nach dem ersten Bau in den Einstellungen des Projekts unter **Domains** die eigene
   Subdomain eintragen, zum Beispiel `blockwerk.deinedomain.de`. Liegt die Domain bei
   Cloudflare, legt es den DNS-Eintrag selbst an.

Jeder Push nach `main` baut danach neu – zu sehen im Projekt unter »Bereitstellungen« →
»Neueste Builds«. Kommt dort nach einem Push nichts an, fehlt Cloudflare der Zugriff: Bei GitHub
unter Settings → Applications → »Cloudflare Workers and Pages« → Configure muss das Repository
unter »Repository access« ausgewählt sein. Ein öffentliches Repository kann Cloudflare auch ohne
das lesen – der erste Bau klappt dann, aber von einem Push erfährt es nichts.

Die Kopfzeilen (Inhaltsrichtlinie, Zugriff auf
Bluetooth und Kabel, Zwischenspeicher) stehen in `public/_headers` und gelten automatisch.
Wer mag, setzt bei den Build-Variablen `ELECTRON_SKIP_BINARY_DOWNLOAD` = `1`: Electron wird
zum Bauen der Seite nicht gebraucht, das spart nur Zeit. Die Node-Version steht in
`.node-version`. Dienste, die Skripte in die Seite einfügen (Web Analytics, Rocket Loader),
bleiben aus – die Inhaltsrichtlinie sperrt sie.

Das ältere »Cloudflare Pages« geht genauso: Build command `npm run build`, Build output
directory `dist`. Vorab am eigenen Rechner ansehen: `npm run build`, dann `npx wrangler dev`.

## Als Programm

| Befehl | Wirkung |
|--------|---------|
| `npm run app` | Programm aus dem aktuellen Stand starten |
| `npm run app:check` | Selbsttest: startet, prüft die Oberfläche, beendet sich |
| `npm run dist` | Programm für das eigene Betriebssystem packen (Ausgabe in `../blockwerk-programm/`) |

Jedes Betriebssystem baut nur sein eigenes Paket. Alle auf einmal baut GitHub:
unter **Actions → Programm bauen → Run workflow**. Nach einigen Minuten hängen die Dateien
als »Artifacts« am Lauf.

Bei einem Versions-Tag (`git push origin v0.23.0`) entsteht zusätzlich von selbst ein
**Release**: mit den Programmen aller Systeme und den Änderungen seit der vorigen Version.
Die Notizen bestehen aus dem Abschnitt der Version in `CHANGELOG.md` und der Liste der
Commits, sortiert nach ihrer Art (`feat` → Neu, `fix` → Behoben, …). Zum Ansehen vorab:
`node build/release-notes.mjs v0.23.0`.

## App für Tablets bauen

Dieselbe Oberfläche läuft als App auf Tablets – verpackt mit
[Capacitor](https://capacitorjs.com).

| Befehl | Wirkung |
|--------|---------|
| `npm run tablet` | Seite bauen und in die App-Projekte übernehmen (`cap sync`) |
| `npm run tablet:android` | danach Android Studio öffnen (`android/`) |

**Android** – braucht das Android-SDK und Java 21. Ohne Android Studio:
`cd android && ./gradlew assembleDebug`, die Datei liegt dann unter
`android/app/build/outputs/apk/debug/`.

### Android-Schlüssel

Android installiert eine neue Fassung nur dann über eine vorhandene, wenn beide mit demselben
Schlüssel signiert sind. Der Schlüssel kostet nichts und braucht kein Konto: Man erzeugt ihn
einmal selbst, mit `keytool` aus Java – am Mac im Terminal, unter Windows in der PowerShell.

**1. Schlüssel erzeugen,** in einem Ordner außerhalb des Projekts:

```
keytool -genkeypair -v -keystore blockwerk.jks -storetype PKCS12 -keyalg RSA -keysize 4096 -validity 10000 -alias blockwerk
```

`keytool` fragt nach einem Passwort (am besten nur Buchstaben und Ziffern), nach Name und Land
und zum Schluss, ob alles stimmt – dort `ja` tippen, Enter allein heißt Nein. Es entsteht die
Datei `blockwerk.jks`. **Datei und Passwort gehören nicht ins Repository** und an zwei sichere
Orte: Wer beides hat, kann Updates unter diesem Namen signieren; geht eines verloren, müssen
alle die App einmal deinstallieren, bevor eine neu signierte Fassung läuft.

**2. Prüfen,** ob Passwort und Datei zusammenpassen:

```
keytool -list -keystore blockwerk.jks
```

Nach dem Passwort erscheint eine Zeile mit `blockwerk, …, PrivateKeyEntry`.

**3. Die Datei als Text in die Zwischenablage legen.** Ein Secret kann nur Text sein, deshalb
wird die Datei umgewandelt (Base64). Am Mac:

```
base64 -i blockwerk.jks | pbcopy
```

Unter Windows (PowerShell):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\blockwerk.jks")) | Set-Clipboard
```

Der Befehl gibt nichts aus. In der Zwischenablage liegt danach ein langer Text, der mit `MII`
beginnt – **dieser Text** kommt ins Secret, nicht der Befehl.

**4. Vier Secrets anlegen** (GitHub → Settings → Secrets and variables → Actions → New
repository secret):

| Secret | Inhalt |
|--------|--------|
| `ANDROID_KEYSTORE` | der Text aus der Zwischenablage |
| `ANDROID_KEYSTORE_PASSWORD` | das Passwort |
| `ANDROID_KEY_ALIAS` | `blockwerk` |
| `ANDROID_KEY_PASSWORD` | dasselbe Passwort noch einmal |

**5. Ausprobieren:** Actions → Programm bauen → Run workflow. Im Job »Android-App bauen« muss
der Schritt »App bauen (Release, fester Schlüssel)« laufen. Passt etwas nicht, bricht schon
»Schlüssel bereitlegen« ab und nennt das Secret, an dem es liegt.

Ab dann baut der Workflow die Release-Fassung mit diesem Schlüssel; ohne die Secrets entsteht
wie bisher die Debug-Fassung. Am eigenen Rechner: dieselben Angaben als Umgebungsvariablen
`BLOCKWERK_KEYSTORE` (Pfad zur Datei), `BLOCKWERK_KEYSTORE_PASSWORD`, `BLOCKWERK_KEY_ALIAS`,
`BLOCKWERK_KEY_PASSWORD` setzen und `./gradlew assembleRelease` aufrufen.

**iPad** – zurückgestellt (siehe [Tablets](../README.md#tablets) in der README). Wer es trotzdem versuchen will:
`npm run tablet:ios` öffnet das Projekt in Xcode; dort unter *Signing & Capabilities* das
eigene Team wählen. Mit einer kostenlosen Apple-ID läuft die App sieben Tage.

Nach einer Änderung am Logo: `npx electron build/render-app-icons.cjs`.

## Aufbau

| Ordner | Inhalt |
|--------|--------|
| `src/` | Quelltext: Blöcke, Python-Generator, Oberfläche |
| `src/hub/` | Verbindung über Bluetooth und USB-Kabel, Kompilieren, Terminal-Auswertung, Steuerfeld, Hub-Ansicht |
| `src/sim/` | Simulator: Bahn und Sensoren, Roboter aus dem Programm, Ausführen der Blöcke, Ansicht |
| `src/docs/` | Hilfetexte zu Blöcken und Python |
| `src/spike/` | Import von SPIKE-Projekten |
| `src/ext/` | Erweiterungen: Dateiformat, Editor, Anbindung an den Generator |
| `tests/` | Tests (Vitest) |
| `referenz/` | SPIKE-Projekte der AG: Kursprogramme und Testmaterial für den Import (ohne die Klänge und Bilder der SPIKE-App) |
| `electron/` | Hülle für die Programm-Version (Fenster, Hub-Auswahl) |
| `android/`, `ios/` | App-Projekte: Android (gepflegt) und iPad (zurückgestellt) |
| `docs/` | Anleitungen (Erweiterungen, diese Seite), Bilder der README |
| `legacy/` | die ursprüngliche Version als einzelne HTML-Datei |
