# RAChecker Android (Expo) — Design

**Date:** 2026-07-26
**Status:** Approved design → implementation planning
**Branch:** `feature/android-apk`

## Goal

A real, standalone Android APK of RAChecker that works **on the phone alone**
— usable by people who have no PC. It scans a ROM folder on the device, computes
the exact RetroAchievements cartridge hashes on-device, matches them against a
locally-synced hash database, and shows per game whether it earns achievements
and the user's progress.

"One app, not two separate ones" is achieved by a **shared, framework-agnostic
core** that both the existing desktop app and the new mobile app import. The
logic (hash rules, RA API, console metadata, match) is maintained once; each
platform provides only a thin I/O shell for its OS. A literal single binary is
impossible — the Windows build relies on a Node server, `node:sqlite`,
`RAHasher.exe` and NAS scanning, none of which exist on Android — so "one app"
means one shared brain, two thin shells.

## Non-goals (explicitly OUT for the MVP)

- **Disc systems** (PS1/PS2/PSP/Saturn/Dreamcast/CHD/ISO …). They need
  `RAHasher.exe`, which has no Android port. Cartridge systems do NOT need it —
  they are hashed by the pure-JS rules in `file-hash.js`.
- **7z / RAR extraction on device.** Only ZIP is supported on-device (pure-JS
  unzip). For 7z/rar the app tells the user to extract first.
- **NAS / SMB browsing.** Local device storage only (via SAF).
- Not a port of the whole desktop UI. The mobile UI is new and minimal.

## Architecture — monorepo with a shared core

```
packages/core/            pure JS/TS, NO node:* imports, no DOM, no RN
  hash/
    header-rules.ts       iNES strip, N64 byteswap, Lynx/PCE/7800/Arduboy … (from file-hash.js)
    hash.ts               orchestration: (bytes, consoleRule) -> md5 hex; md5 + chunk-reader injected
    arcade.ts             arcade = md5 of the filename (no extension)
  consoles.ts             console metadata + folder aliases + ext maps (from consoles.js)
  ra-api.ts               RA Web API client (fetch-based, from ra-api.js)
  match.ts                hash -> game lookup; DB row shapes
  index.ts                public surface

server/                   DESKTOP (unchanged behaviour) — imports packages/core,
                          provides node I/O: createReadStream streaming, node:sqlite,
                          RAHasher, archive.js. file-hash.js becomes a thin node
                          wrapper that streams bytes into core's pure rules.

mobile/                   EXPO app — imports packages/core, provides RN I/O:
  app/                    expo-router screens (onboarding, scan, results, game, settings)
  io/
    files.ts             expo-file-system + SAF: pick folder (persisted), pick single
                         file, recurse, read bytes (chunked)
    md5.ts               pure-JS md5 (js-md5/spark-md5) — injected into core
    unzip.ts             fflate — list + read ZIP members
    db.ts                expo-sqlite — hash DB (synced) + collection
  sync/                  on-device RA hash-DB sync (per console) via core/ra-api
```

### Core extraction (the key refactor)

`server/src/hashing/file-hash.js` today mixes **pure byte rules** (portable) with
**`node:crypto` md5 + `node:fs` streaming** (platform-specific). We split it:

- Pure into `packages/core/hash/`, operating on `Uint8Array` (not node `Buffer`),
  with `md5(bytes) => hex` and a `readChunks(handle)` abstraction **injected** by
  the caller.
- Desktop keeps a small `file-hash.js` wrapper that supplies node's `createHash`
  + `createReadStream` and calls core.
- Mobile supplies a JS md5 + an expo-file-system chunk reader and calls the SAME
  core.

This is what makes the hashes provably identical on both platforms — the same
rule code runs, only the byte source and the md5 primitive differ.

## MVP scope (what ships first)

1. **First run:** language + RA login (username + Web API key) stored in
   `expo-secure-store`. Pick which cartridge systems you own.
2. **Sync hash DB on-device:** for the chosen systems, download their hashes from
   the RA Web API into `expo-sqlite`. Standalone — no PC required. (Optional
   later: import the desktop offline package.)
3. **Storage:** pick a **top folder** (Android SAF, persisted permission) →
   recurse like the desktop. Also pick a **single file** to test (like the
   desktop's drag-and-drop single check).
4. **Scan:** for each cartridge file: read bytes → apply header rule → md5 (core)
   → match against on-device DB. ZIP archives: list members with `fflate`, hash
   inner ROMs. Live progress UI.
5. **Results:** per ROM — matched game, "has achievements", and the user's
   progress (fetched from the RA API and cached).

## Data flow

```
pick folder/file → enumerate (SAF) → for each cart file:
  read bytes (chunked) → header rule → md5   [packages/core]
  → match against on-device hash DB           [packages/core + expo-sqlite]
→ enrich matched games via RA API (details / achievements / progress)  [cached]
→ results list
```

## RetroAchievements auth

Same as desktop: the user's RA **username + Web API key** (from their RA
settings). Stored in `expo-secure-store`. Used for hash-DB sync AND for game /
achievement / progress data. No password is ever entered.

## Build — both paths prepared

- **EAS cloud build** (default for testing): Expo builds the APK in the cloud;
  only an Expo account needed, no local Android SDK. Output is a downloadable APK.
- **Local build** (Android Studio + SDK + JDK): `npx expo run:android` /
  `eas build --local`, run on an emulator or a physical device over ADB.

The project is configured so both work; EAS is the quick path, local is fully
offline/under the user's control.

## Testing

- **Core hash rules** get the **same test vectors** the desktop uses
  (`server/test/file-hash.test.js` logic runs against `packages/core`) — proving
  the shared core produces identical hashes on desktop and mobile.
- Desktop regression: after the extraction, the existing 44 tests must still pass
  (the node wrapper delegates to core).
- Mobile smoke tests: folder pick → hash one file → match against a seeded DB.

## First implementation slice (proof the pipeline runs on device)

1. Monorepo scaffold (workspaces) + `packages/core` with the extracted, pure
   hash rules and a passing hash-vector test.
2. Desktop rewired to import `packages/core`; all existing tests still green.
3. Expo `mobile/` app that: (a) picks a folder/file via SAF, (b) hashes one
   cartridge file on-device, (c) shows its md5 + a match against a small seeded
   hash DB.

That proves the end-to-end on-device pipeline before building the full UI, sync,
and results screens.

## Risks / open points

- **md5 performance in JS** on large cart files (GBA/N64 up to ~64 MB): chunked
  hashing keeps memory flat; speed is acceptable for carts (discs are out).
- **SAF quirks:** persisted folder permissions + recursive listing via
  expo-file-system's Storage Access Framework API; single-file access is simpler.
- **Hash-DB size** on device: only the chosen systems are synced; a few thousand
  hashes per system is fine for expo-sqlite.
- **Core extraction must not regress the desktop** — guarded by the existing test
  suite running against the new core.

## PC setup the user needs

- Node (already has) + Expo CLI.
- For local builds: Android Studio (SDK/emulator/ADB) + JDK, and a physical
  Android device or emulator.
- For EAS: a free Expo account.
