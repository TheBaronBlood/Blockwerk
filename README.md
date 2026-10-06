<p align="center">
  <img src="public/logo.svg" width="128" alt="Logo von Blockwerk">
</p>

<h1 align="center">Blockwerk</h1>

<p align="center">
  <b>Blöcke stecken, Python lesen.</b><br>
  Ein Blockeditor im Stil der LEGO-SPIKE-App, der live Python-Code für
  <a href="https://pybricks.com">Pybricks</a> erzeugt.
</p>

<p align="center">
  <a href="https://github.com/TheBaronBlood/blockwerk/releases/latest"><img src="https://img.shields.io/github/v/release/TheBaronBlood/blockwerk?label=Version&color=0090F5" alt="Neueste Version"></a>
  <a href="https://github.com/TheBaronBlood/blockwerk/actions/workflows/programm.yml"><img src="https://github.com/TheBaronBlood/blockwerk/actions/workflows/programm.yml/badge.svg" alt="Stand des letzten Baus"></a>
  <img src="https://img.shields.io/badge/läuft_auf-Windows_·_macOS_·_Linux_·_Android-0FBD8C" alt="Läuft auf Windows, macOS, Linux und Android">
</p>

<p align="center">
  <a href="#herunterladen">Herunterladen</a> ·
  <a href="#erste-schritte">Erste Schritte</a> ·
  <a href="#was-blockwerk-kann">Funktionen</a> ·
  <a href="ROADMAP.md">Roadmap</a> ·
  <a href="CHANGELOG.md">Versionen</a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/bilder/editor-dunkel.png">
    <img src="docs/bilder/editor-hell.png" alt="Blockwerk: links das Programm aus Blöcken, rechts dasselbe Programm in Python" width="900">
  </picture>
</p>

Blockwerk ist für eine Robotik-AG mit LEGO SPIKE Prime entstanden. Die Schülerinnen und
Schüler bauen ihr Programm aus Blöcken und sehen daneben, wie dasselbe Programm in Python
aussieht. So wird der Umstieg von Blöcken auf Python ein Schritt, den man mitlesen kann.

> [!NOTE]
> Blockwerk ist in Entwicklung (Version 0.x). Vieles ist bisher nur im Emulator und mit
> nachgestellten Hubs geprüft, noch nicht an echten Hubs und Tablets. Was erprobt ist und
> was nicht, steht bei jedem Meilenstein in der [Roadmap](ROADMAP.md).

## Was Blockwerk kann

- **Blöcke → Python:** Fahren, Motoren, Sensoren, Licht und Ton, Steuerung, Operatoren,
  Listen, Variablen, eigene Blöcke. Ein Klick auf eine Codezeile markiert den Block dazu.
- **Mehreres gleichzeitig:** Mehrere Ereignisse laufen nebeneinander, wie in der
  SPIKE-App – »wenn Programm startet«, »wenn …« mit jeder Bedingung und Nachrichten
  zwischen den Programmteilen. Mit nur einem Ereignis bleibt das Python so einfach wie
  zuvor.
- **Direkt auf den Hub laden:** per Bluetooth, mit Terminal für die Ausgaben des Hubs. Bei
  einem Fehler wird der auslösende Block markiert. Mit der Beta-Firmware 4.1 von Pybricks
  geht es auch über das USB-Kabel.
- **Fernsteuerung:** Steuerfeld mit Joystick und Tasten – auf dem Tablet als Controller
  über den ganzen Bildschirm, frei anzuordnen –, dazu Xbox-Controller und
  LEGO-Fernbedienung.
- **Eingebaute Hilfe:** »Erste Schritte« in sieben Lektionen, eine Seite zu jedem Block mit
  Python-Beispiel, Erklärungen zu den Python-Wörtern im Code und kurze Kapitel zum Umstieg
  auf Python.
- **Kurs der Robotik-AG:** die Module 0 bis 8 mit Aufgaben, Hilfekarten zum Aufdecken,
  Bug-Jagd-Programmen und einem Quiz je Modul. Stolpersteine und Lösungen sieht nur, wer in
  den Einstellungen »Kursleitung« einschaltet.
- **Hub-Ansicht:** zeigt den Hub von oben und für jeden Anschluss, was dort steckt und was
  es gerade misst – bei Motoren den Winkel mit einem Zeiger, der sich mitdreht, beim
  Farbsensor Farbe oder Reflexion, dazu Abstand und Kraft; außerdem Akku, Ladezustand und
  Neigung. Sie läuft, solange kein eigenes Programm läuft: Blockwerk lädt dafür ein kleines
  Anzeige-Programm auf den Hub, das nichts bewegt, und legt beim Schließen wieder dein
  zuletzt geladenes Programm darauf.
- **SPIKE-Projekte öffnen:** `.llsp3`-Dateien (Wortblöcke) aus der SPIKE-App werden in
  Blockwerk-Blöcke übersetzt; ein Bericht zeigt, was umgerechnet wurde.
- **Erweiterungen:** eigene Blöcke mit eigenem Python-Code bauen (zum Beispiel einen
  PID-Regler), mit Vorschau, und als Datei weitergeben. Anleitung:
  [docs/ERWEITERUNGEN.md](docs/ERWEITERUNGEN.md).

| Hub-Ansicht |
|:---:|
| <img src="docs/bilder/hub-ansicht.png" alt="Hub-Ansicht: der Hub von oben, links und rechts die Anschlüsse mit Motor, Farbsensor, Abstandssensor und Kraftsensor, darunter Akku und Neigung" width="620"> |
| Was an den Anschlüssen hängt und was es gerade misst – hier mit dem Test-Hub. |

| Steuerfeld als Controller | Eingebaute Hilfe |
|:---:|:---:|
| <img src="docs/bilder/controller.png" alt="Controller-Ansicht beim Anordnen: Joystick und vier Tasten in einem Raster" width="430"> | <img src="docs/bilder/hilfe.png" alt="Hilfe mit den sieben Lektionen der ersten Schritte" width="430"> |
| Joystick und Tasten liegen in einem Raster und lassen sich verschieben. | Lektionen, Blockseiten und Python-Kapitel, ohne Internet. |

## Herunterladen

Die fertigen Programme hängen an jedem
[Release](https://github.com/TheBaronBlood/blockwerk/releases/latest). Sie laufen ohne
Internet und ohne Browser.

| System | Datei | Für wen |
|--------|-------|---------|
| Windows | `…-Setup.exe` | Installation ohne Administratorrechte – der empfohlene Weg |
| Windows | `.zip` | ohne Installation: entpacken (auch auf einen USB-Stick) und `Blockwerk.exe` starten |
| Windows | `…-portable.exe` | eine einzelne Datei; packt sich bei **jedem** Start aus und braucht rund zehn Sekunden |
| macOS | `…-mac-arm64.dmg` | Macs mit Apple-Chip (alle seit Ende 2020) |
| macOS | `…-mac-x64.dmg` | ältere Macs mit Intel-Prozessor |
| Linux | `.deb` | Ubuntu und Verwandte – der zuverlässigste Weg |
| Linux | `.AppImage` | ohne Installation |
| Android | `…-android.apk` | Tablets und Handys |
| iPad | – | derzeit nicht unterstützt, siehe [Tablets](#tablets) |

<details>
<summary><b>Hinweise zum ersten Start je System</b></summary>

- **Windows:** Der Installer fragt nach dem Ordner und legt einen Eintrag zum
  Deinstallieren an (Windows-Einstellungen → Apps, oder `Uninstall Blockwerk.exe` im
  Programmordner). Danach startet Blockwerk in etwa einer Sekunde. Windows warnt beim
  ersten Start vor einem unbekannten Herausgeber: »Weitere Informationen« → »Trotzdem
  ausführen«.
- **macOS:** Das Programm ist nicht von Apple beglaubigt. Beim ersten Start meldet macOS,
  der Entwickler sei nicht überprüft. Dann Systemeinstellungen → »Datenschutz &
  Sicherheit« → »Dennoch öffnen« (bei älterem macOS: Rechtsklick → »Öffnen«). Auf einem
  Mac mit Apple-Chip läuft die Intel-Fassung zwar, aber spürbar zäh.
- **Linux:** Das `.deb` braucht Administratorrechte: `sudo apt install ./Blockwerk-….deb`.
  Das AppImage ausführbar machen (`chmod +x`) und starten; Ubuntu ab 22.04 braucht dafür
  einmalig das Paket `libfuse2`. Fehlt es und darf man nichts installieren, startet
  `./Blockwerk-….AppImage --appimage-extract-and-run` trotzdem.
- **Linux ohne Installationsrechte (Schul-PC, USB-Stick):** Das AppImage braucht keine
  Installation. Von einem Stick mit FAT oder exFAT lässt es sich aber nicht direkt starten,
  weil diese Dateisysteme kein »ausführbar« kennen: die Datei erst in den persönlichen
  Ordner kopieren, dort ausführbar machen und starten. Liegt neben der AppImage-Datei ein
  Ordner `Blockwerk-Daten`, legt Blockwerk seine Daten dort ab statt im Benutzerprofil.
  Für den Hub am **Kabel** braucht jeder PC einmalig die Freigabe durch einen Administrator
  (das `.deb` oder die Datei `build/70-blockwerk-hub.rules`, siehe unten) – außer die
  Benutzer gehören zur Gruppe `dialout`. Bluetooth geht ohne.
- **Android:** Die APK auf dem Gerät öffnen und die Installation erlauben. Ob sich eine
  neue Fassung über die vorhandene installieren lässt, hängt vom Schlüssel ab, mit dem die
  APK signiert ist: Ohne festen Schlüssel ist jede Fassung anders signiert, und die alte App
  muss vorher deinstalliert werden (die gespeicherten Programme gehen dabei verloren –
  vorher speichern). Mit festem Schlüssel entfällt das, siehe
  [Android-Schlüssel](#android-schlüssel).
- **Bluetooth:** Der Rechner braucht einen Bluetooth-Adapter (ab Version 4.0). Viele
  Standrechner haben keinen eingebaut – dann hilft ein USB-Bluetooth-Stecker.

</details>

## Erste Schritte

1. **Pybricks auf den Hub spielen** – einmalig, über [Pybricks Code](https://code.pybricks.com).
   Blockwerk selbst installiert keine Firmware.
2. **Blockwerk starten** und über »Beispiel laden …« zum Beispiel »Quadrat fahren« wählen.
3. **»Hub verbinden«** anklicken, Bluetooth wählen und den Hub aus der Liste nehmen. Der
   Hub muss eingeschaltet sein; seine Bluetooth-Taste blinkt blau.
4. **»Starten«** lädt das Programm auf den Hub und startet es. Was der Hub ausgibt, steht
   im Terminal.

Wie es danach weitergeht, zeigt die eingebaute Hilfe unter »Erste Schritte«.

## Gut zu wissen

### Hub am USB-Kabel

»Hub verbinden« bietet neben Bluetooth auch das USB-Kabel an. Das funktioniert nur, wenn
auf dem Hub eine Pybricks-Firmware läuft, die USB kann: derzeit die **Beta 4.1**
(Installation über [beta.pybricks.com](https://beta.pybricks.com)). Die stabile Firmware
4.0 hat USB abgeschaltet; dort bleibt nur Bluetooth.

Unter Linux ist die Schnittstelle des Hubs ohne Freigabe gesperrt. Das `.deb`-Paket
richtet die Freigabe selbst ein. Beim AppImage oder im Browser einmalig von Hand:

```
sudo cp build/70-blockwerk-hub.rules /etc/udev/rules.d/
sudo udevadm control --reload
```

Danach den Hub neu einstecken. Windows und macOS brauchen nichts weiter.

### Tablets

Die eingebauten Browser der Tablets können weder Web Bluetooth noch Web Serial; in der App
gehen Bluetooth und Kabel deshalb über die Wege des Geräts selbst.

Die App gibt es für **Android** (Tablets und Handys):

| | Android |
|---|---|
| Bluetooth | ja |
| USB-Kabel | ja (USB-C direkt, sonst OTG-Adapter; Pybricks-Beta 4.1) |
| Speichern | Dateiauswahl des Systems (»Speichern unter«) |
| Woher | APK am Release |

**Stand:** Die Android-App ist im Emulator durchgespielt (Start, Plugins, Suche nach Hubs,
Meldung ohne Hub am Kabel, Speichern, Steuerfeld mit Berührungen, Kurs, Python-Übersetzer).
Bluetooth lief mit der App auf einem echten Handy; das Kabel ist an einem echten Gerät noch
nicht erprobt.

**iPad:** zurückgestellt. Blockwerk gibt es vorerst für Windows, macOS, Linux und Android.
Das iPad-Projekt liegt im Ordner `ios/` bei und läuft im Simulator, ist aber an keinem Hub
erprobt und wird derzeit nicht gepflegt. Ein Kabel ginge dort ohnehin nicht – iPadOS lässt
Apps nicht an beliebige USB-Geräte –, und die Verteilung an mehrere iPads braucht das Apple
Developer Program.

### Wo Blockwerk seine Daten ablegt

Das Programm auf der Arbeitsfläche, die Erweiterungen und die Einstellungen liegen in einem
Datenordner. Welcher das ist, bestimmst du:

- **Standard:** der übliche Ordner des Betriebssystems (unter Windows
  `%APPDATA%\Blockwerk`). Die Deinstallation räumt ihn mit auf.
- **Selbst gewählt:** Zahnrad → **Speicherort** → »Ordner ändern …«. Blockwerk legt dort
  einen Unterordner `Blockwerk-Daten` an und zieht beim Neustart mit allen Daten um.
- **Beim Programm (USB-Stick):** Liegt neben `Blockwerk.exe` ein Ordner `Blockwerk-Daten`,
  benutzt Blockwerk immer diesen – auf jedem Rechner, an dem der Stick steckt. Auf dem
  Rechner selbst bleibt dann nichts zurück.

Projekte, die du mit »Speichern« sicherst, landen dort, wo du sie hinlegst.

## Selbst bauen

### Voraussetzungen

- [Node.js](https://nodejs.org) ab Version 20
- Python 3 (nur für die Tests, die den erzeugten Code prüfen)
- Zum Laden auf den Hub im Browser: Chrome oder Edge und ein Hub mit Pybricks-Firmware

### Im Browser

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

### Im Netz bereitstellen (Cloudflare)

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

### Was Blockwerk speichert und was ins Internet geht

Blockwerk hat keinen Server, keine Konten und keine Auswertung der Nutzung. Programme,
Erweiterungen, Einstellungen und Quiz-Ergebnisse bleiben auf dem Gerät (im Browser im
Speicher der Seite, im Programm im Datenordner). Ins Internet geht genau eine Anfrage, und
nur auf Knopfdruck: »Über Blockwerk« → »Nach neuer Pybricks-Firmware suchen« fragt die Liste
der Pybricks-Fassungen bei GitHub ab. Schriften, Symbole und der Python-Übersetzer liegen
Blockwerk bei.

### Als Programm

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

### App für Tablets bauen

Dieselbe Oberfläche läuft als App auf Tablets – verpackt mit
[Capacitor](https://capacitorjs.com).

| Befehl | Wirkung |
|--------|---------|
| `npm run tablet` | Seite bauen und in die App-Projekte übernehmen (`cap sync`) |
| `npm run tablet:android` | danach Android Studio öffnen (`android/`) |

**Android** – braucht das Android-SDK und Java 21. Ohne Android Studio:
`cd android && ./gradlew assembleDebug`, die Datei liegt dann unter
`android/app/build/outputs/apk/debug/`.

#### Android-Schlüssel

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

**iPad** – zurückgestellt (siehe [Tablets](#tablets)). Wer es trotzdem versuchen will:
`npm run tablet:ios` öffnet das Projekt in Xcode; dort unter *Signing & Capabilities* das
eigene Team wählen. Mit einer kostenlosen Apple-ID läuft die App sieben Tage.

Nach einer Änderung am Logo: `npx electron build/render-app-icons.cjs`.

### Aufbau

| Ordner | Inhalt |
|--------|--------|
| `src/` | Quelltext: Blöcke, Python-Generator, Oberfläche |
| `src/hub/` | Verbindung über Bluetooth und USB-Kabel, Kompilieren, Terminal-Auswertung, Steuerfeld, Hub-Ansicht |
| `src/docs/` | Hilfetexte zu Blöcken und Python |
| `src/spike/` | Import von SPIKE-Projekten |
| `src/ext/` | Erweiterungen: Dateiformat, Editor, Anbindung an den Generator |
| `tests/` | Tests (Vitest) |
| `referenz/` | SPIKE-Projekte der AG: Kursprogramme und Testmaterial für den Import (ohne die Klänge und Bilder der SPIKE-App) |
| `electron/` | Hülle für die Programm-Version (Fenster, Hub-Auswahl) |
| `android/`, `ios/` | App-Projekte: Android (gepflegt) und iPad (zurückgestellt) |
| `docs/` | Anleitung für Erweiterungen, Bilder dieser Seite |
| `legacy/` | die ursprüngliche Version als einzelne HTML-Datei |

## Mehr lesen

- [ROADMAP.md](ROADMAP.md) – Meilensteine, was fertig ist und was noch nicht an echter
  Hardware erprobt wurde
- [CHANGELOG.md](CHANGELOG.md) – was sich von Version zu Version geändert hat
- [docs/ERWEITERUNGEN.md](docs/ERWEITERUNGEN.md) – eigene Blöcke bauen

Fehler gefunden oder eine Idee? Unter
[Issues](https://github.com/TheBaronBlood/blockwerk/issues) ist der richtige Ort dafür.

## Lizenz

Blockwerk steht unter der [MIT-Lizenz](LICENSE): Jeder darf es benutzen, verändern und
weitergeben – auch als Teil eigener Projekte. Der Lizenztext mit dem Urhebervermerk muss
dabei bleiben; eine Gewähr gibt es nicht.

## Lizenzen der verwendeten Software

Blockly: Apache-2.0. Pybricks (Firmware, mpy-cross, Protokoll), fflate, Capacitor und
Electron: MIT. Die Schriften Atkinson Hyperlegible und JetBrains Mono: SIL Open Font
License 1.1. Der Klang beim Zusammenstecken der Blöcke (`src/assets/snap.mp3`) stammt von
[Pixabay](https://pixabay.com/service/license-summary/) und steht unter der dortigen
Inhaltslizenz, nicht unter MIT: als Teil von Blockwerk frei benutzbar, aber nicht für sich
allein weiterzuverkaufen.

Die vollständigen Lizenztexte stellt der Build aus den Paketen zusammen, die wirklich im
fertigen Blockwerk stecken (`build/lizenzen.mjs`), und legt sie als `lizenzen.txt` neben die
Seite. In Blockwerk stehen sie unter »Über Blockwerk« → »Lizenzen anzeigen«.

LEGO und SPIKE sind Marken der LEGO Gruppe; dieses Projekt ist kein Produkt von LEGO oder
Pybricks und wird von beiden weder unterstützt noch geprüft.
