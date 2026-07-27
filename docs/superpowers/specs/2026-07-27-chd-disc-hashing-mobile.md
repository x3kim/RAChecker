# Spec — On-device disc / CHD hashing for the Android app

Status: **DESIGN / PREP** — written 2026-07-27 alongside mobile v0.3.0 (which only
*detects* disc images and flags them as desktop-only). This document is the
starting point for the next session that actually implements disc hashing.

Related: [`2026-07-26-android-apk-design.md`](2026-07-26-android-apk-design.md),
[`2026-07-26-android-apk-first-slice.md`](../plans/2026-07-26-android-apk-first-slice.md).

---

## 1. Goal

Let the Android app hash **disc-based ROMs** on-device and match them against the
RetroAchievements DB, the same way the desktop app does via the bundled
`RAHasher.exe`. The tester feedback that triggered this: *"it'll need to read CHD
files, that's what most use for saving space."*

Non-goal (for the first disc slice): 100 % system coverage. Get **PlayStation**
working end-to-end first (by far the most common disc system), then widen.

## 2. Why this is hard (and why it's a separate project from v0.3.0)

There is **no JS disc-hash code to reuse**. The desktop app doesn't hash discs in
JS — it shells out to `RAHasher.exe` (C, from rcheevos). So a mobile port is a
*fresh* JS implementation of rcheevos' `rc_hash` disc rules. Two independent
problems:

- **(A) Read decoded 2048/2352-byte CD sectors** out of whatever container the
  user has: `.cue`+`.bin`, `.iso`, or **`.chd`** (compressed). `.chd` is the hard
  one — it's a compressed container, not a raw image.
- **(B) Per-system hash rule.** Each disc system has a bespoke algorithm: parse
  the CD filesystem (ISO9660), find a boot file, MD5 a system-specific
  combination of header + executable bytes. Getting the byte-exact recipe right
  is what makes the hash equal RA's.

Either half is useless without the other. Stage them (§6).

## 3. rcheevos disc-hash rules (authority — verify against source next session)

Source of truth: **rcheevos `src/rhash/hash_disc.c`** (+ `cdreader.c` for sector
reading, ISO9660 dir walk `rc_cd_find_file_sector`). Confirm every byte-level
detail against that file before trusting the summary below.

| RA id | System | rc_hash fn | Rule (summary — VERIFY) |
|------|--------|-----------|--------------------------|
| 12 | PlayStation | `rc_hash_psx` | ISO9660 → `SYSTEM.CNF`, parse `BOOT = cdrom:\XXX;1` → exe. Verify "PS-X EXE" marker. **MD5 = boot filename string, then exe contents** (exe size counts the 2048-byte header). Fallback to `PSX.EXE` if no SYSTEM.CNF. |
| 21 | PlayStation 2 | `rc_hash_ps2` | Like PSX but `BOOT2` key, `cdrom0:` prefix; hashes the ELF. |
| 41 | PSP | `rc_hash_psp` | UMD: `PSP_GAME/PARAM.SFO` + `EBOOT.BIN` (confirm exact combo). |
| 9  | Sega CD | (mega-cd path) | Hash of the boot header region of the data track (confirm size). |
| 39 | Saturn | `rc_hash_sega_cd`/saturn | IP.BIN security/header + boot files. |
| 40 | Dreamcast | `rc_hash_dreamcast` | `IP.BIN` metadata (256 bytes) from first data track (track 3 on GD-ROM) + boot exe named in IP.BIN. |
| 76 | PC Engine CD | `rc_hash_pce_cd` | Sector 1 marker "PC Engine CD-ROM SYSTEM", then 22-byte title + program sectors. |
| 43 | 3DO | `rc_hash_3do` | 3DO Opera FS boot + LaunchMe. |
| 56 | Neo Geo CD | `rc_hash_neogeo_cd` | PRG/boot files. |
| 49 | PC-FX | `rc_hash_pcfx` | boot area of data track. |
| 77 | Atari Jaguar CD | `rc_hash_jaguar_cd` | locate boot via "ATARI APPROVED DATA HEADER". |
| 16 | GameCube | `rc_hash_gamecube` | partition headers + `main.dol` segments (uses `.iso/.rvz`, NOT chd). |

**ISO9660**: rcheevos walks directory records by hand (`rc_cd_find_file_sector`) —
no external lib. Reimplementing this in JS is straightforward: read the Primary
Volume Descriptor at sector 16, walk the root dir records to find a file by name,
return its start sector + size.

CHD-relevant (have `.chd` in their desktop ext list) = **9, 12, 21, 39, 40, 41,
43, 49, 56, 76, 77** (11 CD systems). GameCube/Wii/DS are disc/cart but not CHD.

## 4. CHD format (what a Phase-2 reader must do)

CHD = "Compressed Hunk of Data" (MAME). To read sector N you:

1. **Parse the header.** v5 is current (124 bytes). Magic `"MComprHD"`. Fields:
   4× compressor FourCCs, `logicalbytes` (total uncompressed), `mapoffset`,
   `metaoffset`, `hunkbytes`, `unitbytes`, three SHA1s. A ready parser is in §9.
2. **Read the hunk map** (at `mapoffset`) → for each hunk: which compressor, and
   its compressed offset/length. v5 uses a compressed map format (self-refing).
3. **Decompress the target hunk** with its codec.
4. **Reassemble CD sectors.** CD CHDs store data in 2448-byte units
   (2352 sector + 96 subcode); metadata tags (`CHT2`/`CHTR`) describe the tracks
   (mode1/mode2, pregap). Map (LBA → hunk, offset) to pull a given sector.

### Codecs — the key tractability insight
CD CHDs typically use: `cdzl` (zlib), `cdlz` (LZMA), `cdfl` (**FLAC**, audio),
`cdzs` (zstd). **The boot executable lives in the DATA track**, which is
compressed with `cdzl`/`cdlz`, **never FLAC** (FLAC is only for CD-audio tracks).
So a reader that supports **zlib + LZMA (+ optionally zstd)** can decode the data
track and hash the game — **we can skip the painful FLAC decoder entirely** for
hashing. This is what makes a pure-JS CHD reader realistic.

JS decompressors: zlib → `fflate` (already a dep!) `inflate`; LZMA → a small
lzma-js (verify license + that it's the raw-LZMA variant CHD uses, not xz); zstd
→ `fzstd` if needed.

## 5. Alternative: native module (libchdr + rc_hash)
Compile `libchdr` (CHD reader, C) and rcheevos `rc_hash` as a React Native native
module / Expo config-plugin. Pros: exact, complete, fast, FLAC included. Cons:
breaks the current **managed / EAS-cloud-only** workflow — needs a config plugin
+ `expo prebuild` and likely a dev build, more moving parts, bigger APK. **Decision
for the user next session:** pure-JS staged port (keeps managed workflow) vs.
native module (correct+complete but heavier build). Recommendation: **pure-JS,
Phase 1 first** — proves the pipeline with zero native risk; revisit native only
if LZMA/zstd in JS proves too slow on-device.

## 6. Staged plan

- **Phase 1 — PSX from uncompressed images (`.cue`+`.bin`, `.iso`).** No CHD yet.
  Build: a CD sector reader for cue/bin + iso (mode1 2048 / mode2/2352), an
  ISO9660 file finder, and `rc_hash_psx`. Verify a known PSX game's md5 equals the
  desktop RAHasher md5 for the same disc. **This proves half (B) with zero
  decompression.** Ship it — PSX alone is a big win.
- **Phase 2 — CHD reader (zlib+LZMA, skip FLAC).** Header (§9) → hunk map →
  decode data track → feed the Phase-1 sector reader. Now `.chd` PSX works.
- **Phase 3 — widen systems.** Add PS2, Dreamcast, Saturn, Sega CD, PCE-CD, PSP…
  one `rc_hash_*` rule at a time, each verified against RAHasher.
- **Phase 4 (maybe) — `.m3u`, multi-track, zstd, native fallback.**

Each phase is independently shippable and independently verifiable against the
desktop hash (the oracle).

## 7. Test oracle (how to verify without guessing)
The desktop `RAHasher.exe` is the ground truth. For any test disc: run
`bin/RAHasher.exe <consoleId> <file>` on the desktop → that md5 is what the mobile
code must reproduce. Build a fixture list (small homebrew discs, legally
distributable) with expected md5s and assert on them. Do NOT ship a rule until its
md5 matches RAHasher for at least one real disc.

## 8. Prep already done (v0.3.0, on branch `feature/mobile-v0.3.0`)
- `DISC_EXTS` set + folder-scan detection in `mobile/src/hashFile.ts`.
- Scan surfaces a "N disc image(s) — need the desktop app" summary row
  (`scan.discSummary`/`scan.discNote` i18n).
- This spec + the disc-console table above.

## 9. Reference code — CHD v5 header parser (self-contained, ready to lift in)
Not yet wired into the app. Drop into `mobile/src/disc/chdHeader.ts` next session.
Big-endian throughout. v4-and-earlier have a different layout — handle later.

```ts
// Minimal CHD v5 header parser. Reads only the fixed 124-byte header.
// Returns null for non-CHD or unsupported version.
export type ChdHeader = {
  version: number;
  compressors: string[];   // up to 4 FourCCs, e.g. ["cdlz","cdzl","cdfl",""]
  logicalBytes: number;    // total uncompressed size
  mapOffset: number;
  metaOffset: number;
  hunkBytes: number;       // bytes per hunk
  unitBytes: number;       // bytes per unit (CD: usually 2448)
  hunkCount: number;
};

function u32(b: Uint8Array, o: number) {
  return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
}
function u64(b: Uint8Array, o: number) {
  // CHDs are < 2^53 bytes in practice → safe as a JS number.
  return u32(b, o) * 0x1_0000_0000 + u32(b, o + 4);
}
function fourcc(b: Uint8Array, o: number) {
  let s = "";
  for (let i = 0; i < 4; i++) { const c = b[o + i]; if (c) s += String.fromCharCode(c); }
  return s;
}

export function parseChdHeader(b: Uint8Array): ChdHeader | null {
  const TAG = "MComprHD";
  for (let i = 0; i < 8; i++) if (b[i] !== TAG.charCodeAt(i)) return null;
  const version = u32(b, 12);
  if (version !== 5) return null; // v4/earlier: different offsets, add later
  const compressors = [0, 1, 2, 3].map((i) => fourcc(b, 16 + i * 4)).filter(Boolean);
  const logicalBytes = u64(b, 32);
  const mapOffset = u64(b, 40);
  const metaOffset = u64(b, 48);
  const hunkBytes = u32(b, 56);
  const unitBytes = u32(b, 60);
  const hunkCount = Math.ceil(logicalBytes / hunkBytes);
  return { version, compressors, logicalBytes, mapOffset, metaOffset, hunkBytes, unitBytes, hunkCount };
}
```

## 10. Open decisions for the user (ask at the start of next session)
1. **Pure-JS staged port** (keeps EAS-managed builds) **vs. native libchdr module**
   (exact+complete, heavier build). Recommendation: pure-JS, Phase 1 first.
2. **Scope of the first slice:** PSX-only (recommended) vs. "PSX + Dreamcast" etc.
3. **CHD in slice 1 or slice 2?** Recommend Phase 1 = uncompressed cue/bin/iso
   first (fastest path to a verified hash), CHD in Phase 2.
4. Memory / perf budget: decompressing a data track on a phone — acceptable to
   read/keep the whole data track in memory? (Usually yes for a single-track data
   region; multi-GB PS2 discs may need streaming.)
