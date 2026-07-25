# Hashing — wie RetroAchievements ROMs identifiziert

RetroAchievements identifiziert ein Spiel über einen **Hash**. Für die meisten Systeme ist das
die **MD5-Summe der ROM-Bytes** — aber pro System mit Vorverarbeitung (Header strippen,
Byte-Reihenfolge normalisieren) oder ganz anders (Disc-Systeme, Arcade). RAChecker bildet
diese Regeln aus der offiziellen **rcheevos**-Bibliothek nach.

> Quellen: [`rcheevos/src/rhash/hash_rom.c`](https://github.com/RetroAchievements/rcheevos) ·
> [RA „Game Identification"](https://docs.retroachievements.org/developer-docs/game-identification.html) ·
> Implementierung hier: [`server/src/hashing/file-hash.js`](../server/src/hashing/file-hash.js)

## Cartridge / Handheld — in-process (kein externes Tool)

| System | ID | Endungen | Regel |
|---|---|---|---|
| NES / Famicom | 7 | `.nes` | iNES-Header (16 B) strippen, wenn `NES\x1a`/`FDS\x1a` — sonst ganze Datei |
| Famicom Disk System | 81 | `.fds` | wie NES (`FDS\x1a` → 16 B strippen) |
| SNES / Super Famicom | 3 | `.sfc .smc .swc .fig` | Copier-Header (512 B) strippen, wenn `size % 0x2000 == 512` |
| Nintendo 64 | 2 | `.n64 .v64 .z64` | nach z64 (Big-Endian) normalisieren, dann MD5 |
| Game Boy / Color / Advance | 4 / 6 / 5 | `.gb .gbc .gba` | ganze Datei |
| Mega Drive / 32X / SMS / GG / SG-1000 | 1 / 10 / 11 / 15 / 33 | `.md .gen .smd .32x .sms .gg .sg` | ganze Datei |
| PC Engine (HuCard) | 8 | `.pce .sgx` | 512 B strippen, wenn `size & 512` |
| Atari 2600 / 7800 / Lynx / Jaguar | 25 / 51 / 13 / 17 | `.a26 .a78 .lnx .j64` | 2600/Jaguar: ganze Datei · 7800: `ATARI7800`-Header (128 B) · Lynx: `LYNX`-Header (64 B) |
| Virtual Boy, WonderSwan, NGP, Pokémon Mini, ColecoVision, Intellivision, Vectrex, Odyssey², Channel F, Mega Duck, Watara, MSX, Uzebox, Arcadia, VC4000, WASM-4 … | div. | div. | ganze Datei |
| Arduboy | 71 | `.hex` | MD5 des **normalisierten Texts** (LF-Zeilenenden) |
| **Arcade** (FBNeo) | 27 | `.zip` | MD5 des **Dateinamens** (ohne Endung), ggf. mit bekanntem Eltern-Ordner-Präfix — **Inhalt wird nicht gelesen** |

## Disc-basiert — via RAHasher (extern)

Diese Systeme öffnen das Disc-Image und hashen einen abgeleiteten Bereich (Boot-Executable,
Volume-Header …). Eine simple Datei-MD5 ist **falsch**. RAChecker delegiert an **RAHasher.exe**
(unterstützt `.cue/.bin`, `.iso`, `.chd`, `.gdi`, `.pbp`, `.m3u`):

| System | ID | | System | ID |
|---|---|---|---|---|
| PlayStation | 12 | | Dreamcast | 40 |
| PlayStation 2 | 21 | | 3DO | 43 |
| PSP | 41 | | Neo Geo CD | 56 |
| Saturn | 39 | | PC-FX | 49 |
| Sega CD | 9 | | Jaguar CD | 77 |
| PC Engine CD | 76 | | GameCube / Wii | 16 / 19 |
| Nintendo DS / DSi | 18 / 78 | | Amstrad CPC / Apple II / PC-8800 | 37 / 38 / 47 |

**RAHasher-CLI:** `RAHasher <systemId> <pfad>` → gibt den 32-stelligen Hash auf stdout aus
(`????…` bei Fehlschlag). Bezug: [RALibretro-Releases](https://github.com/RetroAchievements/RALibretro/releases)
(`RAHasher-x64-Windows-*.zip`, GPLv3). Auto-Download in den **Einstellungen**.

## Warum „falsche" Versionen keine Erfolge geben

RA kennt pro Spiel eine Liste **konkreter** ROM-Versionen (No-Intro/Redump). Nur exakt diese
Dateien (gleicher Hash) lösen Erfolge aus. Ein anderer Dump, eine Hack-/Trainer-Version oder
ein abweichender Header → anderer Hash → **kein Match**. Genau das findet RAChecker.
