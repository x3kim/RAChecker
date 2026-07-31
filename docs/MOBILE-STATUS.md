# Android app — current state & open work

Snapshot after **mobile 0.5.1** / **desktop 0.12.0** (2026-07-30). Both released:
[v0.12.0](https://github.com/x3kim/RAChecker/releases/tag/v0.12.0) (Latest) ·
[android-v0.5.1](https://github.com/x3kim/RAChecker/releases/tag/android-v0.5.1).

This file is the starting point for the next round of work on the mobile app.

---

## What the phone can do

| Area | State |
|---|---|
| Cartridge/handheld ROMs | Works. All hashes verified against `bin/RAHasher.exe`. |
| Disc images `.chd` / `.iso` / `.pbp` | Works — PlayStation, PS2, PSP, Saturn, Sega CD, Dreamcast, PC Engine CD, PC-FX, 3DO, Neo Geo CD, Atari Jaguar CD. |
| CHD compression | `cdzl` (zlib), `cdlz` (LZMA), `cdzs` (zstd), uncompressed. **Not** `cdfl` (FLAC). |
| Archives | `.zip` (store/deflate + LZMA method 14) and `.7z` (LZMA, LZMA2, Copy). |
| Identification | By content: every plausible hash is computed and looked up. Folder names irrelevant. |
| Scan result states | earns achievements · recognised game with no set yet · system not synced · not in RA · note/error. |

### Not supported on the phone
RAR · GameCube/Wii · CSO/RVZ/GCZ/WBFS/WIA · GDI/CDI/NRG/MDS/CCD · split CUE+BIN · M3U ·
7z filter chains (BCJ/BCJ2) · PPMd · encrypted archives · CHD v1–v4 · CHDs with a
FLAC-compressed **data** hunk · CHD parent/child (split) images.

---

## Where the code lives

```
mobile/src/
├─ fileIO.ts            FileHandle-based reader (binary, seekable, has readSync) + temp files
├─ hashCandidates.ts    all plausible cart hashes in ONE read pass (several MD5 accumulators)
├─ hashFile.ts          entry points: hashTarget / hashDiscFile / hashZip / hashSevenZip
├─ scan.ts              orchestration + ScanStatus (match|noset|nomatch|unsynced|note)
├─ lzma/decoder.ts      LZMA1 + LZMA2, sliding window + ByteSink, pull-based ByteSource
├─ archive/sevenZip.ts  7z container (header incl. kEncodedHeader, folders, substreams)
└─ disc/
   ├─ chd.ts            CHD v5: header, compressed hunk map, codecs, track→frame mapping
   ├─ cdreader.ts       ChdCdReader + BinCdReader (raw bin/iso)
   ├─ iso9660.ts        rc_cd_find_file_sector port
   ├─ rules.ts          the rc_hash_* disc rules
   └─ index.ts          hashDisc(): tries each rule, surfaces fatal container errors
```

Shared code: `packages/core/` (source of truth) — hash rules under `hash/`, plus
`region.js`, which parses the region/language tags out of a ROM filename
(No-Intro/GoodTools/TOSEC) for both apps. **Mirrored** into `mobile/src/core/`
because EAS uploads only `mobile/`. Keep both in sync.

---

## Open work, roughly by value

### 1. On-demand extraction for archived disc images
Today a disc image inside a `.7z` is decompressed **in full** to a cache file before
hashing. For PSP the hash only needs `PSP_GAME/PARAM.SFO` and
`PSP_GAME/SYSDIR/EBOOT.BIN`; for PSX only `SYSTEM.CNF` + the boot executable. Those sit
near the start of the image, so decompressing until the needed sectors exist would cut a
1.6 GB extraction to a fraction.

Sketch: extract lazily into the temp file and let the disc reader ask for more when a
requested sector is past what has been written (LZMA is sequential, so "extract more" is
natural). Measured baseline to beat: **1.6 GB in 92 s on a PC**, several minutes on a phone.

### 2. FLAC decoder for CHD
`chdman` picks the smallest codec **per hunk**, so a data track can contain the odd
FLAC-compressed hunk (1 of 66105 in the test file). Such a sector cannot be read today.
Rare, but it makes some images fail. A FLAC subset decoder (fixed 16-bit stereo, rice +
LPC) is roughly 500–600 lines.

### 3. RAR
Its own algorithm — nothing in the codebase to build on. Effectively a separate project.
Currently rejected up front with a clear message.

### 4. Smaller items
- Desktop still syncs `f=1` (games with achievements only) while mobile syncs `f=0`. The
  displayed counts were aligned, but the desktop could gain the same "no achievement set"
  distinction if wanted.
- `enumerateFolder` probes SAF children by trying to read them as directories — works, but
  is slow on large trees.
- Cancel button for a running scan (a multi-GB unpack cannot be interrupted today).

---

## Things worth knowing before touching this code

**Verification is cheap — use it.** Both oracles are in the repo:
- `bin/RAHasher.exe <consoleId> <file>` — the ground truth for any hash. It self-validates:
  a wrong console prints e.g. `Not a Sega CD` and no hash.
- `node_modules/7zip-bin/win/x64/7za.exe` — build real `.7z` fixtures (already a dependency
  via `7zip-min`; nothing to install).

Harness recipe used throughout: write a `scratch-*.ts` next to the app code, bundle with
`node_modules/.bin/esbuild scratch-x.ts --bundle --platform=node --format=cjs --outfile=scratch-x.cjs`,
run with node, delete afterwards. That runs the real app modules against real files.

**Traps that already cost time:**
- `fzstd.decompress(src, buf)` — the second argument is an **output buffer**, not a length.
- `FileHandle.readBytes()` is **synchronous**. That is what allows a large LZMA stream to be
  streamed at all, since the decoder loop is synchronous.
- Never read a whole packed stream in one call. A single `read(offset, 672 MB)` is what made
  a 7z take over an hour on a phone; the decompression itself runs at 17–23 MB/s.
- `getInfoAsync` often reports **no size** for SAF `content://` URIs. `fileSizeOf` falls back
  through the picker's size, a native handle, then probing by reading.
- Disc systems must be in `SYNC_CONSOLES` (`mobile/src/consoles.ts`) or their hashes are never
  synced and disc images can never match — they hash correctly and silently find nothing.
- A new workspace package the desktop server imports must **also** be a root
  `package.json` dependency, or electron-builder leaves it out of the packaged app.
- Run `eas build` from `mobile/`, not the repo root.

**Test files used so far** (in `data/temp/`, not committed):
`3D Lemmings (Europe).chd` — Saturn, `cdzs`+`cdfl`, 298 MB ·
`PSP/Grand Theft Auto - Vice City Stories (Europe) (PSP) (PSN).7z` — 672 MB LZMA1 holding a
1.6 GB ISO.
