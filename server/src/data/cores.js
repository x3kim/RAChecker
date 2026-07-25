// RetroArch core recommendations per RetroAchievements system id.
// Sourced from RA's emulator-support docs; data only, no runtime network.
//
// Core ids were cross-checked against the authoritative libretro core-info
// listing (github.com/libretro/libretro-core-info) so the filenames below
// are real, current libretro core identifiers.

export const CORES_SOURCE = 'https://docs.retroachievements.org/general/emulator-support-and-issues.html';

// RA-compatible frontends that can run libretro cores with achievement / hardcore support.
export const RA_FRONTENDS = [
  {
    name: 'RetroArch',
    url: 'https://www.retroarch.com/index.php?page=platforms',
    note: 'Reference libretro frontend; supports 40+ systems.'
  },
  {
    name: 'RALibRetro',
    url: 'https://retroachievements.org/downloads',
    note: 'Lightweight libretro frontend maintained by RetroAchievements; supports 40+ systems.'
  },
  {
    name: 'Firelight',
    url: 'https://biscuitcakes.itch.io/firelight',
    note: 'Third-party libretro frontend; supports 10+ systems.'
  },
  {
    name: 'Manic EMU',
    url: 'https://github.com/Manic-EMU/ManicEMU',
    note: 'iOS libretro frontend; supports 10+ systems.'
  },
  {
    name: 'Delta',
    url: 'https://apps.apple.com/us/app/delta-game-emulator/id1048524688',
    note: 'iOS libretro frontend; supports 5+ systems.'
  }
];

// consoleId -> { cores: [{ id, name, achievements, hardcore, note }], standalone: [string] }
//   id           libretro core identifier WITHOUT the .dll/.so suffix, e.g. 'snes9x_libretro'
//   name         human-readable core name, e.g. 'Snes9x'
//   achievements true when the core supports RA achievements
//   hardcore     true when RA hardcore mode is supported by that core
//   note         short English note or null
// The FIRST core in `cores` is the recommended default.
export const CORES_BY_CONSOLE = {
  1: { // Genesis/Mega Drive
    cores: [
      { id: 'genesis_plus_gx_libretro', name: 'Genesis Plus GX', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'picodrive_libretro', name: 'PicoDrive', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  2: { // Nintendo 64
    cores: [
      { id: 'mupen64plus_next_libretro', name: 'Mupen64Plus-Next', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'parallel_n64_libretro', name: 'ParaLLEl N64', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  3: { // SNES
    cores: [
      { id: 'snes9x_libretro', name: 'Snes9x', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'mesen-s_libretro', name: 'Mesen-S', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  4: { // Game Boy
    cores: [
      { id: 'gambatte_libretro', name: 'Gambatte', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'gearboy_libretro', name: 'Gearboy', achievements: true, hardcore: true, note: null },
      { id: 'mgba_libretro', name: 'mGBA', achievements: true, hardcore: true, note: null },
      { id: 'vbam_libretro', name: 'VBA-M', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  5: { // Game Boy Advance
    cores: [
      { id: 'mgba_libretro', name: 'mGBA', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'vbam_libretro', name: 'VBA-M', achievements: true, hardcore: true, note: null },
      { id: 'mednafen_gba_libretro', name: 'Beetle GBA', achievements: true, hardcore: true, note: null },
      { id: 'vba_next_libretro', name: 'VBA Next', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  6: { // Game Boy Color
    cores: [
      { id: 'gambatte_libretro', name: 'Gambatte', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'gearboy_libretro', name: 'Gearboy', achievements: true, hardcore: true, note: null },
      { id: 'mgba_libretro', name: 'mGBA', achievements: true, hardcore: true, note: null },
      { id: 'vbam_libretro', name: 'VBA-M', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  7: { // NES/Famicom
    cores: [
      { id: 'fceumm_libretro', name: 'FCEUmm', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'mesen_libretro', name: 'Mesen', achievements: true, hardcore: true, note: null },
      { id: 'quicknes_libretro', name: 'QuickNES', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  8: { // PC Engine/TurboGrafx-16/SuperGrafx
    cores: [
      { id: 'mednafen_supergrafx_libretro', name: 'Beetle SuperGrafx', achievements: true, hardcore: true, note: 'Most recommended core; also covers PC Engine and PC Engine CD.' },
      { id: 'mednafen_pce_fast_libretro', name: 'Beetle PCE Fast', achievements: true, hardcore: true, note: 'Faster but not SuperGrafx compatible.' }
    ],
    standalone: []
  },
  9: { // Sega CD
    cores: [
      { id: 'genesis_plus_gx_libretro', name: 'Genesis Plus GX', achievements: true, hardcore: true, note: 'Unmapped RAM issues on some games.' },
      { id: 'picodrive_libretro', name: 'PicoDrive', achievements: true, hardcore: true, note: 'Unmapped RAM issues on some games.' }
    ],
    standalone: []
  },
  10: { // 32X
    cores: [
      { id: 'picodrive_libretro', name: 'PicoDrive', achievements: true, hardcore: true, note: 'Issues with some games; the BizHawk build is recommended for problem titles.' }
    ],
    standalone: []
  },
  11: { // Master System/Mark III
    cores: [
      { id: 'genesis_plus_gx_libretro', name: 'Genesis Plus GX', achievements: true, hardcore: true, note: null },
      { id: 'gearsystem_libretro', name: 'Gearsystem', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  12: { // PlayStation
    cores: [
      { id: 'mednafen_psx_hw_libretro', name: 'Beetle PSX HW', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'mednafen_psx_libretro', name: 'Beetle PSX', achievements: true, hardcore: true, note: null },
      { id: 'swanstation_libretro', name: 'SwanStation', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['DuckStation']
  },
  13: { // Atari Lynx
    cores: [
      { id: 'handy_libretro', name: 'Handy', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'mednafen_lynx_libretro', name: 'Beetle Lynx', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  14: { // Neo Geo Pocket (Color)
    cores: [
      { id: 'mednafen_ngp_libretro', name: 'Beetle NeoPop', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  15: { // Game Gear
    cores: [
      { id: 'genesis_plus_gx_libretro', name: 'Genesis Plus GX', achievements: true, hardcore: true, note: null },
      { id: 'gearsystem_libretro', name: 'Gearsystem', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  16: { // GameCube
    cores: [],
    standalone: ['Dolphin', 'DolphinUWP']
  },
  17: { // Atari Jaguar
    cores: [
      { id: 'virtualjaguar_libretro', name: 'Virtual Jaguar', achievements: true, hardcore: true, note: 'No save states, no CD emulation; numerous issues per RA docs.' }
    ],
    standalone: []
  },
  18: { // Nintendo DS
    cores: [
      { id: 'desmume_libretro', name: 'DeSmuME', achievements: true, hardcore: true, note: 'No DSi emulation.' },
      { id: 'melonds_libretro', name: 'melonDS', achievements: true, hardcore: true, note: null },
      { id: 'melondsds_libretro', name: 'melonDS DS', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  19: { // Wii
    cores: [],
    standalone: ['Dolphin', 'DolphinUWP']
  },
  21: { // PlayStation 2
    cores: [],
    standalone: ['PCSX2', 'XBSX2', 'ARMSX2']
  },
  23: { // Magnavox Odyssey 2 / Philips Videopac+
    cores: [
      { id: 'o2em_libretro', name: 'O2EM', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  24: { // Pokemon Mini
    cores: [
      { id: 'pokemini_libretro', name: 'PokeMini', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  25: { // Atari 2600
    cores: [
      { id: 'stella_libretro', name: 'Stella', achievements: true, hardcore: true, note: null },
      { id: 'stella2014_libretro', name: 'Stella 2014', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  27: { // Arcade
    cores: [
      { id: 'fbneo_libretro', name: 'FinalBurn Neo', achievements: true, hardcore: true, note: 'Some arcade boards may not be fully exposed.' },
      { id: 'flycast_libretro', name: 'Flycast', achievements: true, hardcore: true, note: 'For Atomiswave and NAOMI 1/2 boards.' }
    ],
    standalone: []
  },
  28: { // Virtual Boy
    cores: [
      { id: 'mednafen_vb_libretro', name: 'Beetle VB', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  29: { // MSX
    cores: [
      { id: 'bluemsx_libretro', name: 'blueMSX', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  33: { // SG-1000
    cores: [
      { id: 'genesis_plus_gx_libretro', name: 'Genesis Plus GX', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'bluemsx_libretro', name: 'blueMSX', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  37: { // Amstrad CPC
    cores: [
      { id: 'cap32_libretro', name: 'Caprice32', achievements: true, hardcore: true, note: 'Lacks disk writing support.' }
    ],
    standalone: []
  },
  38: { // Apple II
    cores: [],
    standalone: ['RAppleWin']
  },
  39: { // Saturn
    cores: [
      { id: 'mednafen_saturn_libretro', name: 'Beetle Saturn', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['Yaba Sanshiro']
  },
  40: { // Dreamcast
    cores: [
      { id: 'flycast_libretro', name: 'Flycast', achievements: true, hardcore: true, note: 'Disable threaded rendering for proper save states.' }
    ],
    standalone: ['Flycast']
  },
  41: { // PSP
    cores: [
      { id: 'ppsspp_libretro', name: 'PPSSPP', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['PPSSPP']
  },
  43: { // 3DO
    cores: [
      { id: 'opera_libretro', name: 'Opera', achievements: true, hardcore: true, note: 'May have BIOS-dependent issues.' }
    ],
    standalone: []
  },
  44: { // ColecoVision
    cores: [
      { id: 'bluemsx_libretro', name: 'blueMSX', achievements: true, hardcore: true, note: null },
      { id: 'gearcoleco_libretro', name: 'Gearcoleco', achievements: true, hardcore: true, note: 'Purpose-built ColecoVision core; standard libretro core, not explicitly named on the fetched RA docs snapshot.' }
    ],
    standalone: ['RAMeka']
  },
  45: { // Intellivision
    cores: [
      { id: 'freeintv_libretro', name: 'FreeIntv', achievements: true, hardcore: true, note: 'Crashes on reset; Intellivoice not emulated.' }
    ],
    standalone: []
  },
  46: { // Vectrex
    cores: [
      { id: 'vecx_libretro', name: 'vecx', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  47: { // PC-8000/8800
    cores: [
      { id: 'quasi88_libretro', name: 'QUASI88', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['RAQUASI88']
  },
  49: { // PC-FX
    cores: [
      { id: 'mednafen_pcfx_libretro', name: 'Beetle PC-FX', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  51: { // Atari 7800
    cores: [
      { id: 'prosystem_libretro', name: 'ProSystem', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  53: { // WonderSwan (Color)
    cores: [
      { id: 'mednafen_wswan_libretro', name: 'Beetle Cygne', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  56: { // Neo Geo CD
    cores: [
      { id: 'neocd_libretro', name: 'NeoCD', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  57: { // Fairchild Channel F
    cores: [
      { id: 'freechaf_libretro', name: 'FreeChaF', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  63: { // Watara Supervision
    cores: [
      { id: 'potator_libretro', name: 'Potator', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  69: { // Mega Duck
    cores: [
      { id: 'sameduck_libretro', name: 'SameDuck', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  71: { // Arduboy
    cores: [
      { id: 'ardens_libretro', name: 'Ardens', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'arduous_libretro', name: 'Arduous', achievements: true, hardcore: true, note: 'Cannot emulate Arduboy FX.' }
    ],
    standalone: []
  },
  72: { // WASM-4
    cores: [
      { id: 'wasm4_libretro', name: 'WASM-4', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  73: { // Arcadia 2001
    cores: [
      { id: 'amiarcadia_libretro', name: 'AmiArcadia', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['WinArcadia', 'DroidArcadia']
  },
  74: { // Interton VC 4000
    cores: [
      { id: 'amiarcadia_libretro', name: 'AmiArcadia', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['WinArcadia', 'DroidArcadia']
  },
  75: { // Elektor TV Games Computer
    cores: [
      { id: 'amiarcadia_libretro', name: 'AmiArcadia', achievements: true, hardcore: true, note: null }
    ],
    standalone: ['WinArcadia', 'DroidArcadia']
  },
  76: { // PC Engine CD/TurboGrafx-CD
    cores: [
      { id: 'mednafen_supergrafx_libretro', name: 'Beetle SuperGrafx', achievements: true, hardcore: true, note: 'Most recommended core for this system.' },
      { id: 'mednafen_pce_fast_libretro', name: 'Beetle PCE Fast', achievements: true, hardcore: true, note: 'Faster but not SuperGrafx compatible.' }
    ],
    standalone: []
  },
  77: { // Atari Jaguar CD
    cores: [],
    standalone: []
  },
  78: { // Nintendo DSi
    cores: [
      { id: 'melondsds_libretro', name: 'melonDS DS', achievements: true, hardcore: true, note: 'No save state support currently.' }
    ],
    standalone: ['melonDS Android']
  },
  80: { // Uzebox
    cores: [
      { id: 'uzem_libretro', name: 'Uzem', achievements: true, hardcore: true, note: null }
    ],
    standalone: []
  },
  81: { // Famicom Disk System
    cores: [
      { id: 'mesen_libretro', name: 'Mesen', achievements: true, hardcore: true, note: 'Most recommended core for this system.' }
    ],
    standalone: ['RANes']
  }
};

// Return { cores, standalone } for a RetroAchievements console id, with empty defaults if unknown.
export function coresFor(consoleId) {
  const entry = CORES_BY_CONSOLE[consoleId];
  if (!entry) return { cores: [], standalone: [] };
  return entry;
}

// Return the recommended (first) core object for a console id, or null if none.
export function recommendedCore(consoleId) {
  const { cores } = coresFor(consoleId);
  return cores.length > 0 ? cores[0] : null;
}

// 'snes9x_libretro' -> 'snes9x_libretro.dll' on win32, '.so' elsewhere.
export function coreFileName(coreId, platform = process.platform) {
  const ext = platform === 'win32' ? '.dll' : '.so';
  return `${coreId}${ext}`;
}
