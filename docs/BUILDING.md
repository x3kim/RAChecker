# Desktop-App bauen (Electron)

RAChecker läuft normal als lokale Web-App (`Start-RAChecker.bat` / `npm run serve`).
Zusätzlich lässt sich daraus eine eigenständige **Windows-Desktop-App** bauen —
ein Fenster, keine Browser-Session, kein sichtbares Terminal.

## Voraussetzungen

- Node.js ≥ 22.5
- `npm install` (installiert auch `electron` + `electron-builder`)

## Entwicklung / Testlauf

```bash
npm run app:dev
```

Baut das Frontend und startet die App direkt aus dem Repo (ohne Installer).

## Installer & Portable bauen

```bash
npm run app:dist
```

Ergebnis in `release/`:

| Datei | Was |
|---|---|
| `RAChecker Setup <version>.exe` | NSIS-Installer (Installationsordner wählbar) |
| `RAChecker-<version>-portable.exe` | Portable-EXE, keine Installation nötig |

Nur den entpackten Ordner (schneller, zum Testen): `npm run app:dir` → `release/win-unpacked/`.

## Android-APK bauen

Die Android-App liegt in [`mobile/`](../mobile/) (Expo / React Native, eigener
Dependency-Baum — **kein** npm-Workspace des Desktop-Repos). Der geteilte
Hashing-Kern ist nach `mobile/src/core` vendored (EAS lädt nur `mobile/` hoch).

```bash
cd mobile
npm install
npx eas build --profile preview --platform android   # Cloud-Build → APK
# oder lokal (braucht Android Studio + Gerät/Emulator):
npx expo run:android
```

Cloud-Builds laufen über EAS (Account `x3dev`, Projekt `rachecker`) und zählen
gegen das monatliche Build-Kontingent. Automatisiert: ein Tag `android-vX.Y.Z`
löst `.github/workflows/android-release.yml` aus (baut die APK auf EAS und
hängt sie ans GitHub-Release) — dafür muss das Repo-Secret `EXPO_TOKEN` gesetzt
sein. Version pflegen in `mobile/app.json` (`version` + `versionCode`) und
`mobile/src/version.ts` (`APP_VERSION` + Changelog).

## Wie der Wrapper funktioniert

- `electron/main.mjs` startet den Fastify-Server **in-process** (Electrons Node
  bringt `node:sqlite` mit) und öffnet dann ein BrowserWindow auf `http://127.0.0.1:<port>`.
- Der Port ist standardmäßig 8088; ist er belegt, wird automatisch ein freier gewählt.
- **Datenablage installiert:** `%APPDATA%/RAChecker/data` (DB, Bilder, Backups, Temp)
  via `RA_DATA_DIR` — die Installation selbst bleibt unangetastet/read-only.
- **RAHasher:** das gebündelte `bin/RAHasher.exe` wird mitgeliefert; der
  In-App-Download neuer Versionen landet in `%APPDATA%/RAChecker/bin`
  (`RA_BIN_DIR`), weil `Program Files` nicht beschreibbar ist.
- Externe Links öffnen im Standard-Browser.
- Zweiter Start fokussiert das vorhandene Fenster (Single-Instance-Lock).
- Es wird **kein asar** verwendet (`asar: false`), damit die gebündelten
  Binaries (RAHasher, 7za aus `7zip-min`) und die statischen Dateien normal
  per Pfad erreichbar bleiben.

## Icon

`build/icon.ico` (+ `build/icon.png`, `web/public/icon.png`) wird von
`npm run icon` (`scripts/make-icon.mjs`) erzeugt. Ist **ImageMagick** (`magick`)
installiert, konvertiert das Skript das Marken-Logo
`branding/RAChecker-Logo-512px.png` in ein Multi-Res-ICO (16–256 px); ohne
ImageMagick fällt es auf einen dependency-freien Pixel-Art-Platzhalter zurück.
Eigenes Icon: `branding/RAChecker-Logo-512px.png` austauschen und `npm run icon`
laufen lassen (oder `build/icon.ico` direkt ersetzen).

## Grenzen

- Der Installer ist **unsigniert** — Windows SmartScreen zeigt beim ersten
  Start eine Warnung („Weitere Informationen" → „Trotzdem ausführen").
  Code-Signing-Zertifikate sind für Community-Projekte optional.
- Linux/macOS: die Web-Variante (`./start.sh`) läuft dort; ein Electron-Build
  wäre mit weiteren `target`-Einträgen in `electron-builder.yml` möglich,
  RAHasher muss dort aber selbst gebaut werden.
