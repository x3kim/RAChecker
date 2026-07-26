# 🎮 RAChecker

**Check your ROM library against RetroAchievements — find out which games you can earn achievements on.**

RAChecker scans your sorted ROM root folder (including all subfolders), computes the
**exact RetroAchievements hash** for every file, and immediately tells you whether that
ROM is compatible with achievements. Fully **offline** against a locally cached hash
database — after the first sync, a scan needs **zero API requests**.

![Version](https://img.shields.io/badge/version-0.11-22e0ff) ![Node](https://img.shields.io/badge/node-22.5%2B-39ff8b) ![License](https://img.shields.io/badge/license-MIT-9d6bff) ![Data](https://img.shields.io/badge/data-%C2%A9%20retroachievements.org-666)

🇩🇪 [Deutsche Version](README.de.md)

> **RAChecker is an unofficial, independent community project and is not affiliated with RetroAchievements in any way.** It ships **no** ROMs. Game data, hashes and images come from [retroachievements.org](https://retroachievements.org) and remain their property. RAChecker runs entirely locally, collects no data and sends nothing to third parties; your API key stays on your machine.

---

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="49%">
  <img src="docs/screenshots/scan.png" alt="Scan view" width="49%">
</p>

---

## ✨ What it does

- **First-run wizard** — ROM folder, RA login and hash sync in three guided steps.
- **Scan your whole library** — point it at a root folder, all subfolders are searched recursively.
- **Runs in the background** — the scan/sync keeps going even if you switch tabs (no more losing progress).
- **Clean filtering** — `._*` leftovers (macOS), hidden files and junk (`.txt/.nfo/.sav/.png` …) are skipped automatically.
- **Remembers everything** — every checked file lands permanently in your **collection**; unchanged files are **not re-hashed** on a re-scan (hash cache keyed by path+size+date). Optionally skip already-collected files entirely on a re-scan (they aren't even re-listed — unchanged archives aren't opened) so only genuinely new/changed files show up.
- **DAT completeness check** — import No-Intro/Redump/logiqx/ClrMamePro/MAME **DAT** catalogs and see, per catalog, which entries you already have and which are missing (exportable list). Matched by your files' real checksums (CRC32, plus md5/sha1 for Redump CHD & MAME `<disk>`), read straight from `.zip/.7z/.rar` archives **without extraction** — independent of the RetroAchievements hash. Plus an *Extra / unknown dumps* view for files whose hash is in no imported DAT (bad dumps / hacks / systems without a DAT).
- **Collection view** — a searchable, filterable list of every ROM ever scanned, with per-system status, multi-select (delete/copy paths) and RetroArch `.lpl` export.
- **Collection diff** — after each scan, see what's new, newly playable, lost, or gone.
- **Browse games & achievements** — search globally or per system; every achievement with badges, points and compatible ROM versions.
- **Your RA progress** — Mastery tab + per game: which achievements you already have, completion %, avatar & "recently played".
- **Hardcore catch-up list** — shows per game how far your hardcore progress trails your softcore progress (your own ROMs first). Every softcore unlock can be earned again in hardcore — only that counts for golden badges, leaderboards and full points.
- **Discover tab** — three views onto the RA world beyond your own shelf:
  - *Free games*: the list of legally free homebrew/freeware titles curated by RetroAchievements (91 games, 10 systems), cross-referenced with your collection, with a link to the developer's own download. **No ROMs ship with this app** — links only.
  - *Set radar*: which achievement sets are being built right now (active claims), split into "affects a game you own", "probably affects one of your ROMs" and the rest; plus your own set requests and your "Want to Play" list.
  - *Community*: Achievement of the Week and freshly mastered games — each flagged with whether you own the game.
- **Leaderboards** — every RA leaderboard per game including your own entry and rank (they only count in hardcore mode).
- **Playtime tracking (opt-in)** — polls Rich Presence for what you are playing and builds a local session/playtime history from it; RetroAchievements itself stores no such history. Off by default.
- **Launch directly** — open ROMs from your collection in RetroArch with one click, including a per-system core recommendation (noting whether that core supports achievements/hardcore).
- **RA world coverage** — what percentage of all RA games, achievements and points your collection covers, broken down per system.
- **Offline package** — export/import hash DB, game details and image cache as a single archive (second machine or full backup), plus a "does everything work without internet?" readiness check.
- **Launcher exports** — besides RetroArch playlists (`.lpl`) also ES-DE/EmulationStation (a ZIP with one `gamelist.xml` per system and relative paths), Playnite (CSV) and LaunchBox (XML), each using the target launcher's official platform names.
- **New systems** — after a sync you get told which systems RetroAchievements has started supporting since last time.
- **Drag & drop** — drop ROMs/folders anywhere on the page → quick upload check against the hash DB (temp files deleted afterwards).
- **Find the right version** — on a NO MATCH, match the filename to the game and show the accepted versions + patches.
- **Compatibility patches** — RAPatches download links per ROM version (patch on top of a base ROM → matching hash → achievements).
- **Duplicates (1G1R)** — the same game found across multiple files is detected and grouped, with extra copies deletable directly (keeps the first file).
- **Folder watch** — optionally watch the ROM folder; new files are checked automatically. Choose between continuous watch and interval mode (a short check every N minutes), off by default.
- **Scheduled scans** — automatically scan once a day at a set time (on/off, in Settings).
- **Scan filter** — restrict to a single system; "Reveal in Explorer" per hit; a system selection controls which systems sync & scan even consider.
- **55+ systems** — from NES/SNES/Mega Drive through Game Boy/GBA to PlayStation, Saturn, Dreamcast, Arcade …
- **Archives, directly** — `.zip`, `.rar`, `.7z` are read **without** manual extraction. ZIP contents are hashed in memory (no temp clutter); 7z/RAR are extracted to a temp folder and **auto-deleted afterwards**. Archive contents are cached too. Large files can optionally be copied to local temp before hashing (threshold configurable) — avoids timeouts on slow network drives.
- **Correct hashes** — the real RetroAchievements method is reproduced per system (stripping iNES headers, SNES copier headers, N64 byteswap, Arcade = filename hash …). Disc systems & `.chd` via the official **RAHasher**.
- **Aggressive caching** — the entire hash database is stored locally in SQLite. Re-sync only after **90 days** (or on demand). System, game and achievement images are cached locally too (including a pre-cache for badges/box art).
- **API-friendly** — a built-in rate limiter; only **one** request per system (bulk endpoint) instead of one per ROM.
- **Live progress** — Server-Sent Events show every match in real time, with box art, achievement count and points.
- **Automatic backups** — the database is backed up on startup and after every scan; back up manually, download or restore in Settings.
- **Storage overview** — see how much space the database, images, backups & temp files use, plus a "clear temp" button.
- **Command palette (Ctrl+K)** and **keyboard shortcuts** (`g` + key to navigate, `/` to search, `?` for help).
- **Guided tour** through the UI, reachable via the compass icon.
- **German/English** switchable, the whole UI is translated.
- **6 themes** (CRT Cyan, Amber Terminal, Synthwave, Matrix, Game Boy, Light) + 2 secret unlocks, plus 3 fonts and an optional aurora background — freely selectable, stored locally.
- **CSV export** of scan and collection results.
- **Also as a desktop app** — an optional Electron build for Windows, see [docs/BUILDING.md](docs/BUILDING.md).
- **A slick retro CRT interface** 🕹️

---

## 🚀 Quick start

### Option A — Double-click (Windows)
1. Install [Node.js 22.5+](https://nodejs.org).
2. Double-click **`Start-RAChecker.bat`**.
   On first run, dependencies are installed and the UI is built (one-time, takes a bit). It then opens <http://localhost:8088> automatically.

### Option A' — Double-click (Linux/macOS)
1. Install [Node.js 22.5+](https://nodejs.org).
2. Run **`./start.sh`** (`chmod +x start.sh` if needed).
   Installs dependencies, builds the UI and starts the server at <http://localhost:8088>. Disc systems need a self-built RAHasher there (see the "Disc systems & RAHasher" section below).

### Option B — Terminal (any platform)
```bash
npm install          # once
npm run serve        # builds the frontend and starts the server
# -> http://localhost:8088
```

### Development (with hot reload)
```bash
npm run dev          # backend (watch) + Vite dev server on :5173
```

---

## 🧭 Usage

1. **Hash-DB** → **Sync.** Fetches all games + hashes from RetroAchievements once per system
   (takes a few minutes the first time — cached afterwards).
2. **Scan** → choose the ROM root folder (the onboarding wizard asks for it on the very first run; no path is pre-filled) → **Start scan.**
   Results appear live:
   | Status | Meaning |
   |---|---|
   | 🟢 **PLAYABLE** | Hash matches — you can earn achievements here |
   | 🔴 **NO MATCH** | RA doesn't know this ROM version — no cheevo support |
   | 🟡 **RAHASHER** | Disc system/`.chd` — needs the RAHasher tool (see below) |
   | 🟣 **UNCLEAR** | System not clearly identifiable (e.g. a loose `.bin` with no system folder) |
3. Click a green row → details (achievements, points, reference ROM name, full hash, link to RA).
4. Filter by status/system, search, **export as CSV.**

> **Tip:** Sort your ROMs into folders named after the system (`SNES`, `PlayStation`, `Game Boy` …).
> RAChecker uses the folder name to disambiguate ambiguous extensions like `.bin`/`.iso`/`.cue`.

---

## 💿 Disc systems & RAHasher

Cartridge systems (NES, SNES, Mega Drive, GB/GBA, N64 …) are hashed entirely in-process.
**Disc-based** systems (PS1, PS2, PSP, Saturn, Dreamcast, Sega CD, PCE-CD, 3DO, GameCube, Wii, DS …)
and compressed **`.chd`** images need the official **RAHasher** tool from RetroAchievements
(which computes the correct disc hashes, including CHD support).

→ **Settings → Download RAHasher.** Automatically fetches the current Windows binary from the
[RALibretro release](https://github.com/RetroAchievements/RALibretro/releases) and places it under `bin/`.
Without RAHasher, disc games are marked as 🟡 **RAHASHER** (not as an error).

The auto-download only works on Windows. On Linux/macOS, build RAHasher yourself from
[RALibretro](https://github.com/RetroAchievements/RALibretro) (it also has Linux/Mac build instructions)
and enter the path under `rahasherPath` in Settings.

---

## 🖥️ Desktop app

RAChecker normally runs as a local web app, but for Windows it can also be built into a
standalone **desktop app** (Electron; a single window, no browser tab, no visible terminal):

```bash
npm run app:dev     # test run straight from the repo
npm run app:dist     # installer + portable EXE in release/
```

Details, data location and limitations: [docs/BUILDING.md](docs/BUILDING.md).

---

## ⚙️ Configuration

Default values live in [`server/src/config.js`](server/src/config.js). To override them permanently
(recommended for credentials): copy [`server/config.local.example.json`](server/config.local.example.json)
to `server/config.local.json` and edit it (git-ignored).

| Key | Default | Meaning |
|---|---|---|
| `raUsername` / `raApiKey` | (empty) | RetroAchievements Web API access — set via the onboarding wizard/Settings (stored in the DB) |
| `romRoot` | (empty) — set on first run/onboarding | scan path |
| `port` / `host` | `8088` / `127.0.0.1` | server binds locally only |
| `hashCacheTtlDays` | `90` | re-sync a system after this many days |
| `rateLimit.minIntervalMs` | `500` | min. gap between API requests (≈ 2/s) |
| `rahasherPath` | *(auto)* | path to RAHasher.exe (otherwise `bin/` + PATH) |

Alternatively via environment variable: `RA_USERNAME`, `RA_API_KEY`, `RA_ROM_ROOT`, `PORT`, `RA_DATA_DIR`, `RA_RAHASHER`.

You'll find the Web API key under [retroachievements.org → Settings](https://retroachievements.org/settings),
in the **"Keys"** tab — reveal/generate the Web API Key there.

---

## 🛠️ How it works (short version)

```
ROM file ──► detect system (folder name + extension)
         ──► compute hash   (rcheevos rules in JS  |  RAHasher for disc/CHD)
         ──► lookup in local SQLite hash DB
         ──► 🟢 match (game + achievements)  /  🔴 no match
```

- The **hash DB** comes once per system via `API_GetGameList?h=1&f=1` (all games + MD5s in one request)
  and lives in `data/ra-checker.db`. Matching is then purely local → **0 API calls per scan.**
- **File hash cache**: a file that's been hashed once (path + size + modified time) isn't hashed again.
- Details: [`docs/HASHING.md`](docs/HASHING.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/USAGE.md`](docs/USAGE.md)

---

## 📁 Project structure

```
RAChecker/
├─ Start-RAChecker.bat      # Windows launcher (double-click)
├─ start.sh                  # Linux/macOS launcher
├─ server/                   # backend (Fastify, node:sqlite — no native deps)
│  └─ src/
│     ├─ index.js            # server startup, serves the built frontend
│     ├─ config.js           # configuration + defaults
│     ├─ db.js               # SQLite schema + queries
│     ├─ routes.js           # HTTP/SSE routes (the actual API)
│     ├─ sse.js              # Server-Sent-Events helpers
│     ├─ ra-api.js           # RA Web API client + rate limiter
│     ├─ sync.js             # hash DB sync (90-day TTL)
│     ├─ scanner.js          # recursive scanner + console detection
│     ├─ consoles.js         # system metadata (hash method, extensions, aliases)
│     ├─ images.js           # image cache
│     ├─ fs-browse.js        # server-side folder browser (folder picker backend)
│     ├─ watcher.js          # folder watch (continuous + interval mode)
│     ├─ scheduler.js        # scheduled daily scan
│     ├─ scan-lock.js        # prevents overlapping scans (manual/watch/schedule)
│     ├─ presence.js         # Rich Presence polling → local playtime sessions
│     ├─ launch.js           # launch a ROM in the configured emulator (core resolution)
│     ├─ offline.js          # offline package export/import + readiness check
│     ├─ data/               # bundled data tables (free-games catalog, RetroArch cores)
│     └─ hashing/            # file-hash | archive | rahasher | dispatcher
├─ web/                      # frontend (Vite + React + Tailwind v4)
├─ electron/                 # desktop app wrapper (main.mjs, see docs/BUILDING.md)
├─ scripts/                  # build helper scripts (e.g. icon generator)
├─ build/                    # Electron build resources (icon etc.)
├─ .github/                  # CI workflow (tests + build on Windows/Linux)
├─ docs/                     # architecture, hashing rules, usage, desktop build
└─ data/                     # runtime: DB, image cache, backups, temp (git-ignored)
```

---

## ✅ Tests

```bash
npm test     # correctness of the hashing rules (NES/SNES/N64/Lynx/7800/PCE/Arduboy/Arcade)
```

The hashing rules are tested via provable invariants (e.g. N64 `z64`/`v64`/`n64` of the same
ROM must hash identically). End-to-end was verified against **real** RA data (arcade hits,
cartridge detection, ZIP expansion, `.chd` → RAHasher).

---

## 🔄 Updating

**Desktop app:** the **installer** build updates itself — it checks GitHub on launch, downloads a newer release in the background and offers *Restart & install* (bottom-left). The **portable** build can't replace a running exe in place (Windows locks it), so it downloads the new `-portable.exe` and offers *Restart & replace* (or reveals it in the folder).

**From source:**

1. Get the new code: `git pull` (or extract the current ZIP over the existing folder).
2. `npm install` — needed if dependencies changed.
3. Restart (`Start-RAChecker.bat` / `./start.sh` / `npm run serve`) — the frontend is rebuilt automatically.

`data/` (collection, backups, image cache, settings) is git-ignored and is left untouched when updating.

## ⚠️ Notes

- RAChecker only reads — it never modifies or moves your ROMs.
- **No ROMs** are included; you need your own files.
- Not affiliated with RetroAchievements. Game data, hashes and images © [retroachievements.org](https://retroachievements.org).
- The server binds to `127.0.0.1` only (not reachable over the network).
- **Security:** CORS is restricted to `localhost`/`127.0.0.1` (no open `origin: true`), `/api/image` only accepts RetroAchievements image hosts (not an open image proxy), and a scan lock prevents a manual scan, folder watch and scheduled scan from running over the same folder tree at the same time.
- All fonts are bundled locally (`web/public/fonts`) — RAChecker doesn't load anything from Google Fonts or other CDNs, so it works fully offline in the browser.

## 🧱 Known limitations

- RAR files are read entirely into memory (for large RAR disc images, prefer `.chd`/`.7z`).
- `.cdi`/`.toc` may need converting to `.cue`/`.chd`.
- The automatic RAHasher download only supports Windows; on Linux/macOS you need to build RAHasher yourself from [RALibretro](https://github.com/RetroAchievements/RALibretro).
- The Electron installer is unsigned (Windows SmartScreen warns on first run) — see [docs/BUILDING.md](docs/BUILDING.md).

## 🤝 Contributing

Setup, tests and conventions: [CONTRIBUTING.md](CONTRIBUTING.md). The code itself is under the
[MIT license](LICENSE); game data, hashes and images remain © retroachievements.org (not covered by the license).
