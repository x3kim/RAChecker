# Architektur

RAChecker ist eine **lokale Web-App**: ein Node-Backend (Fastify) serviert eine React-Oberfläche
und bietet eine kleine API. Alles läuft auf `127.0.0.1` — keine Cloud, kein externer Zugriff.

```
┌── Browser (React + Tailwind) ──────────────────────────────────────────┐
│  Dashboard · Scan (SSE) · Spiele · Hash-DB (SSE) ·                     │
│  Profil (Mastery/Sammlung/Insights) · Einstellungen                    │
└───────────────┬──────────────────────────────────────────────────────┘
                │  HTTP /api/*   +   EventSource (SSE)
┌───────────────▼──────────── Fastify (Node 22.5+) ──────────────────────┐
│  routes.js / sse.js ── scanner.js ── hashing/{file,archive,rahasher}   │
│      │            │            │                                       │
│   ra-api.js    consoles.js    scan-lock.js                             │
│  (Limiter)   (Metadaten)    (kein Scan-Overlap)                        │
│      │            │                                                    │
│  watcher.js   scheduler.js        images.js   fs-browse.js             │
│  (Ordner-Watch) (tägl. Scan)    (Bild-Cache)  (Ordner-Picker)          │
│      │                                                                 │
│   sync.js ───────────────► db.js (node:sqlite, WAL)                    │
└──────────────────────────────────┬─────────────────────────────────────┘
                                    │
   RetroAchievements Web-API   data/ra-checker.db · images/ · temp/ · backups/
```

## Komponenten

| Datei | Aufgabe |
|---|---|
| `index.js` | Server-Bootstrap, serviert `web/dist`, SPA-Fallback |
| `config.js` | Defaults + `config.local.json` + ENV-Overrides; legt `data/`-Ordner an |
| `db.js` | SQLite-Schema & alle Queries (prepared statements) |
| `ra-api.js` | RA-Web-API-Client mit serialisiertem **Rate-Limiter** + Retry/Backoff |
| `sync.js` | lädt pro System Spiele+Hashes (Bulk), schreibt in DB, 90-Tage-TTL |
| `consoles.js` | System-Metadaten: Hash-Methode, Endungen, **Ordnernamen-Aliase** |
| `hashing/file-hash.js` | rcheevos-Regeln in JS (MD5 + Header/Byteswap) |
| `hashing/archive.js` | ZIP (in-memory stream) · 7z/RAR (Temp + Cleanup) |
| `hashing/rahasher.js` | RAHasher-Aufruf + Auto-Download des Windows-Binaries |
| `hashing/index.js` | Dispatcher: wählt Methode je System |
| `scanner.js` | rekursiver Walk, Erkennung, Hash, Lookup, Persistenz, Events |
| `routes.js` / `sse.js` | HTTP-Endpunkte + Server-Sent-Events |
| `images.js` | Bild-Cache (Icons/Boxart/Badges), nur RA-Bild-Hosts erlaubt |
| `fs-browse.js` | Server-Ordner-Browser für den Ordner-Picker (`/api/fs/list`) |
| `watcher.js` | Ordner-Überwachung (an/aus + Dauer-/Intervall-Modus) |
| `scheduler.js` | geplanter täglicher Scan zu fester Uhrzeit |
| `scan-lock.js` | ein Scan-Mutex für manuellen Scan, Watch und Zeitplan gemeinsam |
| `presence.js` | Rich-Presence-Polling (opt-in) → lokale Play-Sessions; erkennt Session-Enden über RAs `LastActivity`-Zeitstempel |
| `launch.js` | Emulator-Start: Core-Auflösung (Override → Empfehlung), Whitelist auf Sammlungs-Pfade, detached Spawn |
| `offline.js` | Offline-Paket (7za-Archiv aus DB-Snapshot + Bildcache) + Bereitschaftscheck |
| `data/free-games.js` | gebündelter Katalog legal kostenloser Spiele (aus der RA-Doku, nur Metadaten + Links) |
| `data/cores.js` | RetroArch-Core-Tabelle je System (Achievements-/Hardcore-Tauglichkeit, Dateiname) |
| `data/frontends.js` | Plattform-Namen je Launcher (ES-DE-Systemordner, LaunchBox-Plattform) — Basis für die Launcher-Exporte |

## Datenfluss eines Scans

1. `routes` öffnet SSE, legt `scans`-Eintrag an, startet `Scanner`.
2. `Scanner.walk` sammelt alle Dateien rekursiv (ignoriert `$RECYCLE.BIN`, `@eaDir` …).
3. Pro Datei: **System erkennen** (Ordner-Alias → Endung), Methode wählen.
4. **Hash** (Cache-Treffer via `file_hash_cache` → sofort; sonst berechnen + cachen).
5. **Lookup** `hashes.md5` → Spiel; Status `match`/`no_match`/`needs_rahasher`/… .
6. Ergebnis wird in `scan_items` gespeichert **und** live als SSE-`result` gesendet.
7. Ein kleiner Worker-Pool (Standard 4) verarbeitet parallel.

## Datenbank (SQLite via `node:sqlite`, keine nativen Deps)

| Tabelle | Inhalt |
|---|---|
| `consoles` | System-Metadaten + Hash-Methode |
| `games` | Spiele mit Erfolgen (id, title, image_icon, num_achievements, points) |
| `hashes` | `md5 → game_id` (+ rom_name/labels, lazy angereichert) |
| `console_sync` | letzter Sync-Zeitpunkt + Zähler je System (TTL-Logik) |
| `file_hash_cache` | `pfad|größe|mtime → md5` (Re-Scan ohne Neuberechnung) |
| `scans` / `scan_items` | Scan-Historie + Einzelergebnisse |
| `library` | dauerhafte ROM-Sammlung (Pfad, Hash, Status, Spiel) — zentrale Tabelle des Sammlung-Tabs |
| `api_cache` | TTL-gecachte RA-API-Antworten (Spiel-Details, Profil, Completion) |
| `scan_baseline` | Schnappschuss der Sammlung vor einem Scan, Basis für die Sammlung-Diff-Ansicht |
| `play_sessions` | lokale Spielzeit-Historie aus Rich Presence (Start/letztes Sample je Spiel) |
| `settings` | persistente Einstellungen (z. B. `romRoot`, `presenceConfig`, `emulatorConfig`, `consoleFirstSeen`) |

## API (Auszug)

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/status` | Gesamtstatus (Systeme, Totals, RAHasher, aktiver Scan) |
| GET | `/api/settings` · POST `/api/settings` | Einstellungen lesen/speichern |
| GET | `/api/scan/stream?path=` | **SSE** Live-Scan |
| POST | `/api/scan/cancel` | laufenden Scan abbrechen |
| GET | `/api/sync/stream?force=&consoles=` | **SSE** Hash-DB-Sync |
| POST | `/api/check-file` | Einzeldatei prüfen |
| GET | `/api/fs/list?path=` | Server-Ordner durchsuchen (Picker) |
| GET | `/api/image?path=` · `/api/console/:id/icon` | gecachte Bilder (nur RA-Hosts) |
| GET | `/api/cache/images/stream` | **SSE** Badges/Boxart vorab lokal cachen |
| GET | `/api/game/:id` | Spiel-Details (live von RA, mit Hash-Liste) |
| GET | `/api/games/search` | globale Spielesuche |
| GET | `/api/user/profile` · `/api/user/completion` | eigenes RA-Profil / Completion |
| GET | `/api/library` · `/api/library/stats` | Sammlung abrufen / Statistik |
| GET | `/api/library/diff` | Sammlung-Diff seit letztem Scan |
| GET | `/api/library/duplicates` | Duplikat-Gruppen (1G1R) |
| POST | `/api/library/delete-files` | Duplikat-Dateien löschen (Sammlung + Datenträger) |
| GET | `/api/library/health` · POST `/api/library/prune` | fehlende Dateien finden / aus der Sammlung entfernen |
| POST | `/api/watch/start` · `/stop` · `/config` · GET `/status` | Ordner-Überwachung steuern |
| GET | `/api/schedule` · POST `/api/schedule` | geplanten täglichen Scan lesen/setzen |
| GET | `/api/backups` · POST `/api/backup/now` · `/restore` · GET `/download` | DB-Backups verwalten |
| GET | `/api/storage` · POST `/api/storage/clear-temp` | Speicherverbrauch / Temp leeren |
| GET | `/api/rahasher/download/stream` | **SSE** RAHasher installieren |
| GET | `/api/community/aotw` · `/recent-awards` · `/claims` | Achievement der Woche, frische Mastery-Awards, aktive Set-Claims — jeweils mit Sammlungs-Abgleich |
| GET | `/api/user/set-requests` · `/want-to-play` · `/hardcore-gap` | eigene Set-Anfragen, Wunschliste, Hardcore-Rückstand |
| GET | `/api/game/:id/leaderboards` · `/api/leaderboard/:id/entries` | Ranglisten eines Spiels + eigene Platzierung, Top-Einträge |
| GET | `/api/free-games` | Gratis-Katalog, gegen lokale Spiele-DB und Sammlung aufgelöst |
| GET | `/api/coverage` | RA-Weltabdeckung (lokal berechnet) |
| GET | `/api/cores` · `/api/cores/:consoleId` | Core-Empfehlungen je System |
| GET | `/api/systems/new` | seit dem letzten Sync neu unterstützte Systeme |
| GET | `/api/presence` · POST `/api/presence/config` · `/poll` · `/clear` · GET `/sessions` · `/playtime` | Rich Presence & Spielzeit |
| GET | `/api/emulator` · POST `/api/emulator` · POST `/api/launch` | Emulator-Konfiguration und ROM-Start |
| GET | `/api/offline/readiness` · `/api/offline/export` · POST `/api/offline/import` | Offline-Paket |
| GET | `/api/export/esde` · `/api/frontends/platforms` | ES-DE-Export (ZIP, gamelist.xml je System) · Plattform-Namen der Launcher |

## Warum diese Entscheidungen

- **`node:sqlite`** (eingebaut) statt `better-sqlite3` → **keine nativen Build-Tools**, Install kann nicht an Binär-Kompilierung scheitern. Warnung via `--no-warnings` unterdrückt.
- **Bulk-Sync + lokaler Cache** → ein Scan kostet 0 API-Calls; schont die RA-API massiv.
- **ZIP in-memory** statt entpacken → kein Temp-Müll, kein Datei-Lock-Problem.
- **SSE** statt Polling → echte Live-Ergebnisse bei großen Bibliotheken.
