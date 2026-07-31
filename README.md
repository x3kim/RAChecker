<p align="center">
  <img src="branding/RAChecker-Logo-512px.png" alt="RAChecker" width="150">
</p>

<h1 align="center">RAChecker</h1>

<p align="center">
  <b>Find out which of your ROMs can earn RetroAchievements.</b><br>
  Point it at your ROM folder — it hashes every file the way RetroAchievements does<br>
  and tells you exactly which games are supported.
</p>

<p align="center">
  <a href="https://github.com/x3kim/RAChecker/releases/latest"><img src="https://img.shields.io/badge/⬇%20Desktop-Windows-22e0ff?style=for-the-badge" alt="Download desktop"></a>
  &nbsp;
  <a href="https://github.com/x3kim/RAChecker/releases"><img src="https://img.shields.io/badge/⬇%20Android-APK-39ff8b?style=for-the-badge" alt="Download Android APK"></a>
  &nbsp;
  <a href="https://x3kim.github.io/RAChecker/"><img src="https://img.shields.io/badge/📖%20Docs-Website-9d6bff?style=for-the-badge" alt="Documentation"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/desktop-0.13-22e0ff" alt="Desktop version">
  <img src="https://img.shields.io/badge/android-0.6-39ff8b" alt="Android version">
  <img src="https://img.shields.io/badge/node-22.5%2B-ffb648" alt="Node 22.5+">
  <img src="https://img.shields.io/badge/license-MIT-9d6bff" alt="MIT license">
  <img src="https://img.shields.io/badge/data-%C2%A9%20retroachievements.org-666" alt="Data © retroachievements.org">
</p>

<p align="center">
  🇩🇪 <a href="README.de.md">Deutsche Version</a> · 📖 <a href="https://x3kim.github.io/RAChecker/">Documentation</a> · 💬 <a href="https://github.com/x3kim/RAChecker/issues">Issues</a>
</p>

> **Unofficial community project — not affiliated with RetroAchievements.** It ships **no ROMs**.
> Game data, hashes and images come from [retroachievements.org](https://retroachievements.org) and remain their property.
> Everything runs locally; your API key never leaves your machine.

> [!IMPORTANT]
> **The Android app is early and still rough around the edges.** It works, but please know what to expect:
> - **Big files take minutes.** Decompression runs in JavaScript, so a multi-gigabyte disc image inside a `.7z`
>   can take several minutes on the phone (measured: a 1.6 GB image ≈ 1.5 min on a PC, noticeably longer on an
>   older phone). The scan shows unpacking progress — it is working, not frozen. The desktop app is far faster
>   for large libraries.
> - **Sync your disc systems.** Disc images can only match if you selected and synced those systems in the
>   **Hash DB** tab.
> - **Not everything is supported yet:** RAR archives, GameCube/Wii, CSO/RVZ/GCZ/GDI, split CUE/BIN and M3U,
>   and CHDs whose data is FLAC-compressed. Those still need the desktop app.
>
> Bug reports are very welcome — please open an [issue](https://github.com/x3kim/RAChecker/issues).

---

<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard" width="49%">
  <img src="docs/screenshots/scan.png" alt="Scan view" width="49%">
</p>

---

## Contents

- [Two apps](#two-apps) · [Quick start](#quick-start) · [How it works](#how-it-works)
- [Features](#features) · [Android app](#android-app) · [Disc systems](#disc-systems)
- [Configuration](#configuration) · [Project layout](#project-layout) · [Notes & limits](#notes--limits)

---

## Two apps

|  | 🖥️ **Desktop** (Windows/Linux/macOS) | 📱 **Android** |
|---|---|---|
| **Best for** | Scanning a whole ROM library | Checking ROMs on your phone |
| **Needs** | Node 22.5+, or the packaged installer | Nothing — standalone APK |
| **Cartridge ROMs** | ✅ | ✅ |
| **Disc images** | ✅ all formats (via RAHasher) | ✅ CHD, ISO, PBP — hashed on the phone |
| **Archives** | ✅ ZIP, 7z, RAR | ✅ ZIP, 7z |
| **DAT completeness check** | ✅ | — |
| **Launch in emulator** | ✅ | — |

Both match your ROMs **fully offline** against a hash list synced once from RetroAchievements.

---

## Quick start

<table>
<tr><th>Windows</th><th>Linux / macOS</th><th>Any platform</th></tr>
<tr valign="top">
<td>

Download the [installer](https://github.com/x3kim/RAChecker/releases/latest),
**or** from source:

1. Install [Node.js 22.5+](https://nodejs.org)
2. Double-click **`Start-RAChecker.bat`**

</td>
<td>

1. Install [Node.js 22.5+](https://nodejs.org)
2. Run **`./start.sh`**
   (`chmod +x start.sh` first)

</td>
<td>

```bash
npm install
npm run serve
```

</td>
</tr>
</table>

Opens at **<http://localhost:8088>**. First launch installs dependencies and builds the UI once.

**Then:** the first-run wizard walks you through it — pick your ROM folder, connect your
RetroAchievements account, sync the hash list. After that, scanning needs **zero API requests**.

<details>
<summary>Development (hot reload)</summary>

```bash
npm run dev     # backend (watch) + Vite dev server on :5173
npm test        # hashing-rule tests
```
</details>

---

## How it works

```
ROM file ──► compute every plausible RetroAchievements hash
         ──► look each one up in the local SQLite hash DB
         ──► 🟢 match (game + achievements)   🔴 not in RetroAchievements
```

The **hash** is not a plain MD5 of the file — each system has its own rule (strip the iNES
header, strip an SNES copier header, byte-swap N64 ROMs, read the boot executable out of a
PlayStation disc …). RAChecker reproduces those rules exactly, so its result equals what
RetroAchievements expects.

Because the full hash list lives on your machine, **files are identified by their content** —
not by folder names. A correctly dumped ROM matches no matter how you sort your collection.

- Hash list: one request per system (`API_GetGameList`), stored in `data/ra-checker.db`, re-synced after 90 days.
- File cache: a file hashed once (path + size + date) is never re-hashed.
- Details: [HASHING.md](docs/HASHING.md) · [ARCHITECTURE.md](docs/ARCHITECTURE.md) · [USAGE.md](docs/USAGE.md)

---

## Features

### 🔍 Scanning & matching

- **Whole library at once** — point at a root folder; all subfolders are searched recursively.
- **Content-based identification** — every plausible hash for a file is computed and looked up; the one the database knows settles game *and* system. No reliance on folder names.
- **55+ systems** — NES/SNES/Mega Drive, Game Boy/GBA, N64, PlayStation, Saturn, Dreamcast, Arcade and more.
- **Archives read directly** — `.zip`, `.7z`, `.rar` without manual extraction; contents cached too.
- **Skips the junk** — `._*` leftovers, hidden files, saves, images and text files are ignored.
- **Remembers everything** — unchanged files aren't re-hashed; optionally hide already-collected files entirely on a re-scan.
- **Runs in the background** — switching tabs doesn't interrupt a scan or sync.
- **Live progress** — every match appears in real time with box art, achievement count and points.

### 🏆 Your RetroAchievements progress

- **Profile & mastery** — completion per game, avatar, recently played.
- **Quick wins** — games from your collection you're closest to mastering.
- **Hardcore catch-up** — how far hardcore trails softcore per game (only hardcore counts for golden badges and leaderboards).
- **Leaderboards** — every leaderboard per game including your own rank.
- **Playtime tracking (opt-in, off by default)** — builds a local session history from Rich Presence; RetroAchievements itself keeps none.

### 🧭 Discover

- **Free games** — legally free homebrew/freeware titles curated by RetroAchievements (91 games, 10 systems), cross-referenced with your collection. Links to the developers' own pages — **no ROMs ship with this app**.
- **Set radar** — which achievement sets are being built right now, sorted by whether they affect a game you own; plus your set requests and "Want to Play" list.
- **Community** — Achievement of the Week and freshly mastered games, flagged by whether you own them.
- **New systems** — after a sync, see which systems RetroAchievements started supporting.

### 📚 Library management

- **Collection view** — searchable, filterable list of every ROM ever scanned, with multi-select actions.
- **Collection diff** — after each scan: what's new, newly playable, lost or gone.
- **DAT completeness check** — import No-Intro/Redump/logiqx/ClrMamePro/MAME catalogs and see per catalog what you have and what's missing (exportable). Matched by real checksums read straight from archives *without* extraction, independent of the RetroAchievements hash. Includes an *unknown dumps* view.
- **Preferred region & language** — the region and languages baked into ROM filenames (No-Intro, GoodTools, TOSEC, translation tags) are read and shown as short codes. Put your preference in order (e.g. *Japanese → Japan → Europe*) and the collection sorts by it, duplicates mark the copy to keep, and a game's detail window lists which regions RetroAchievements supports and which of them you already own. Filter the collection by any region or language. Nothing is ever hidden or deleted because of it.
- **Duplicates (1G1R)** — the same game across multiple files is grouped; extra copies deletable, keeping your preferred region.
- **Find the right version** — on a miss, match the filename to the game and show accepted versions + RAPatches links.
- **RA world coverage** — what share of all RA games, achievements and points your collection covers, per system.
- **Exports** — RetroArch `.lpl`, ES-DE/EmulationStation, Playnite, LaunchBox, CSV.
- **Offline package** — export/import hash DB, game details and image cache as one archive.

### ⚙️ Automation & quality of life

- **Folder watch** — optional; continuous or every N minutes. Off by default.
- **Scheduled scans** — once a day at a set time.
- **Launch in RetroArch** — one click from your collection, with a per-system core recommendation.
- **Drag & drop** — drop ROMs anywhere for a quick check (temp files removed afterwards).
- **Automatic backups** — on startup and after every scan; manual backup, download and restore in Settings.
- **Storage overview** — space used by database, images, backups and temp, with a cleanup button.

### 🎨 Interface

- **Command palette** (`Ctrl`/`Cmd`+`K`) and keyboard shortcuts (`g`+key to navigate, `/` search, `?` help).
- **Guided tour** through the UI.
- **English & German**, fully translated.
- **6 themes** (CRT Cyan, Amber Terminal, Synthwave, Matrix, Game Boy, Light) + 2 secret unlocks, 3 fonts, optional aurora background.
- **Fully offline UI** — fonts are bundled; nothing is loaded from any CDN.

---

## Android app

A **standalone** app — no PC, no server, no network beyond the one-time hash sync.

- **Hashes on the device:** cartridge/handheld ROMs *and* disc images — **CHD, ISO and PBP** — for PlayStation, PS2, PSP, Saturn, Sega CD, Dreamcast, PC Engine CD, PC-FX, 3DO, Neo Geo CD and Atari Jaguar CD. CHD reads zlib- and LZMA-compressed images directly.
- **Archives:** ZIP and **7z** are unpacked and hashed on the phone, including disc images inside them.
- **Same look and features as the desktop:** profile with collection & insights, games-by-system browser, Discover, 6 themes, English + German.
- **Clear results:** each file says whether it earns achievements, has no achievement set yet, belongs to a system you haven't synced, or isn't known to RetroAchievements at all.
- **Region & language:** read from each filename and shown on every row; set your preferred order in Settings to sort and filter by it.
- **Auto-update (opt-in):** checks GitHub on launch and can install newer APKs; decline or disable in Settings.

**Install:** grab the newest `RAChecker-*.apk` from the [Releases page](https://github.com/x3kim/RAChecker/releases)
(Android tags look like `android-vX.Y.Z`) and allow "install from unknown sources" — the APK is unsigned.

**Still desktop-only:** RAR archives, the remaining disc containers (GameCube/Wii, CSO, RVZ, GCZ, GDI, split CUE/BIN, M3U),
DAT checks and launching emulators.

<details>
<summary>Build it yourself</summary>

```bash
cd mobile
npx eas build --profile preview --platform android
```
</details>

---

## Disc systems

**Desktop:** disc-based systems and `.chd` images are hashed with the official
**RAHasher** tool from RetroAchievements.

→ **Settings → Download RAHasher** fetches the current Windows binary from the
[RALibretro release](https://github.com/RetroAchievements/RALibretro/releases) into `bin/`.
Without it, disc games are marked 🟡 *RAHASHER* — not as an error.

The automatic download is Windows-only. On Linux/macOS, build RAHasher yourself from
[RALibretro](https://github.com/RetroAchievements/RALibretro) and set `rahasherPath` in Settings.

**Android** doesn't need RAHasher — the disc rules are implemented natively in the app.

---

## Configuration

Defaults live in [`server/src/config.js`](server/src/config.js). To override them permanently,
copy [`server/config.local.example.json`](server/config.local.example.json) to
`server/config.local.json` (git-ignored).

| Key | Default | Meaning |
|---|---|---|
| `raUsername` / `raApiKey` | *(empty)* | RetroAchievements Web API access — normally set in the wizard/Settings |
| `romRoot` | *(empty)* | Scan path, set on first run |
| `port` / `host` | `8088` / `127.0.0.1` | Server binds locally only |
| `hashCacheTtlDays` | `90` | Re-sync a system after this many days |
| `rateLimit.minIntervalMs` | `500` | Minimum gap between API requests (≈2/s) |
| `rahasherPath` | *(auto)* | Path to RAHasher (otherwise `bin/` + PATH) |

Environment variables also work: `RA_USERNAME`, `RA_API_KEY`, `RA_ROM_ROOT`, `PORT`, `RA_DATA_DIR`, `RA_RAHASHER`.

Your Web API key is at [retroachievements.org → Settings](https://retroachievements.org/settings) → **Keys**.

---

## Project layout

```
RAChecker/
├─ Start-RAChecker.bat / start.sh   launchers
├─ server/src/                      backend (Fastify, node:sqlite)
│  ├─ scanner.js                    recursive scan + system detection
│  ├─ sync.js  ra-api.js            hash-DB sync + API client
│  ├─ hashing/                      file hashes, archives, RAHasher
│  └─ …                             db, routes, watcher, scheduler, presence, launch
├─ web/                             frontend (Vite + React + Tailwind)
├─ mobile/                          Android app (Expo / React Native)
│  └─ src/{disc,archive,lzma}/      on-device disc, 7z and LZMA readers
├─ packages/core/                   hashing rules + filename region/language parser,
│                                   shared by desktop + mobile
├─ electron/                        desktop wrapper
├─ docs/                            architecture, hashing, usage, building
└─ data/                            runtime: DB, images, backups (git-ignored)
```

---

## Updating

**Desktop app:** the installer build updates itself — it checks GitHub on launch and offers
*Restart & install*. The portable build can't replace a running exe, so it downloads the new
`-portable.exe` and offers *Restart & replace*.

**From source:** `git pull` → `npm install` (if dependencies changed) → restart.
`data/` (collection, backups, settings) is untouched.

---

## Notes & limits

- RAChecker **only reads** — it never modifies, moves or renames your ROMs.
- **No ROMs are included.** You need your own files.
- The server binds to `127.0.0.1` only and is not reachable over the network. CORS is restricted to localhost, `/api/image` only accepts RetroAchievements hosts, and a lock prevents manual/watched/scheduled scans from overlapping.
- RAR archives are read entirely into memory — for large RAR disc images prefer `.chd` or `.7z`.
- `.cdi`/`.toc` may need converting to `.cue`/`.chd`.
- The Electron installer is unsigned, so Windows SmartScreen warns on first run — see [BUILDING.md](docs/BUILDING.md).
- Android: RAR isn't supported (it needs a native decoder that can't ship in the app).

---

## Tests

```bash
npm test     # hashing rules: NES/SNES/N64/Lynx/7800/PCE/Arduboy/Arcade
```

Rules are tested via provable invariants (e.g. `z64`/`v64`/`n64` of the same ROM must hash
identically) and verified end-to-end against the official RAHasher.

## Contributing

Setup, tests and conventions: [CONTRIBUTING.md](CONTRIBUTING.md).
Code is [MIT](LICENSE); game data, hashes and images remain © retroachievements.org.
