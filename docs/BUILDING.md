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

`build/icon.ico` wird von `npm run icon` (`scripts/make-icon.mjs`) erzeugt —
ein dependency-freier Pixel-Art-Generator (PNG/ICO von Hand kodiert).
Eigenes Icon: einfach `build/icon.ico` ersetzen.

## Grenzen

- Der Installer ist **unsigniert** — Windows SmartScreen zeigt beim ersten
  Start eine Warnung („Weitere Informationen" → „Trotzdem ausführen").
  Code-Signing-Zertifikate sind für Community-Projekte optional.
- Linux/macOS: die Web-Variante (`./start.sh`) läuft dort; ein Electron-Build
  wäre mit weiteren `target`-Einträgen in `electron-builder.yml` möglich,
  RAHasher muss dort aber selbst gebaut werden.
