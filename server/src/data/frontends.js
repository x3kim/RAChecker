// Platform naming per launcher frontend, keyed by RetroAchievements console id.
//
// `esde`      = ES-DE / EmulationStation Desktop Edition system directory name.
//               Verified against es-de's own resources/systems/windows/es_systems.xml.
//               ES-DE expects one gamelist.xml per system, stored either in
//               <ROMs>/<system>/gamelist.xml or ~/ES-DE/gamelists/<system>/.
// `launchbox` = LaunchBox platform name (its importer matches on this string).
//
// Systems ES-DE has no directory for are simply absent — the export then skips
// them rather than inventing a folder name.
export const FRONTEND_PLATFORMS = {
  1:  { esde: 'megadrive',     launchbox: 'Sega Genesis' },
  2:  { esde: 'n64',           launchbox: 'Nintendo 64' },
  3:  { esde: 'snes',          launchbox: 'Super Nintendo Entertainment System' },
  4:  { esde: 'gb',            launchbox: 'Nintendo Game Boy' },
  5:  { esde: 'gba',           launchbox: 'Nintendo Game Boy Advance' },
  6:  { esde: 'gbc',           launchbox: 'Nintendo Game Boy Color' },
  7:  { esde: 'nes',           launchbox: 'Nintendo Entertainment System' },
  8:  { esde: 'pcengine',      launchbox: 'NEC TurboGrafx-16' },
  9:  { esde: 'segacd',        launchbox: 'Sega CD' },
  10: { esde: 'sega32x',       launchbox: 'Sega 32X' },
  11: { esde: 'mastersystem',  launchbox: 'Sega Master System' },
  12: { esde: 'psx',           launchbox: 'Sony Playstation' },
  13: { esde: 'atarilynx',     launchbox: 'Atari Lynx' },
  14: { esde: 'ngp',           launchbox: 'SNK Neo Geo Pocket' },
  15: { esde: 'gamegear',      launchbox: 'Sega Game Gear' },
  16: { esde: 'gc',            launchbox: 'Nintendo GameCube' },
  17: { esde: 'atarijaguar',   launchbox: 'Atari Jaguar' },
  18: { esde: 'nds',           launchbox: 'Nintendo DS' },
  19: { esde: 'wii',           launchbox: 'Nintendo Wii' },
  21: { esde: 'ps2',           launchbox: 'Sony Playstation 2' },
  23: { esde: 'odyssey2',      launchbox: 'Magnavox Odyssey 2' },
  24: { esde: 'pokemini',      launchbox: 'Nintendo Pokemon Mini' },
  25: { esde: 'atari2600',     launchbox: 'Atari 2600' },
  27: { esde: 'arcade',        launchbox: 'Arcade' },
  28: { esde: 'virtualboy',    launchbox: 'Nintendo Virtual Boy' },
  29: { esde: 'msx',           launchbox: 'Microsoft MSX' },
  33: { esde: 'sg-1000',       launchbox: 'Sega SG-1000' },
  37: { esde: 'amstradcpc',    launchbox: 'Amstrad CPC' },
  38: { esde: 'apple2',        launchbox: 'Apple II' },
  39: { esde: 'saturn',        launchbox: 'Sega Saturn' },
  40: { esde: 'dreamcast',     launchbox: 'Sega Dreamcast' },
  41: { esde: 'psp',           launchbox: 'Sony PSP' },
  43: { esde: '3do',           launchbox: '3DO Interactive Multiplayer' },
  44: { esde: 'colecovision',  launchbox: 'ColecoVision' },
  45: { esde: 'intellivision', launchbox: 'Mattel Intellivision' },
  46: { esde: 'vectrex',       launchbox: 'GCE Vectrex' },
  47: { esde: 'pc88',          launchbox: 'NEC PC-8801' },
  49: { esde: 'pcfx',          launchbox: 'NEC PC-FX' },
  51: { esde: 'atari7800',     launchbox: 'Atari 7800' },
  53: { esde: 'wonderswan',    launchbox: 'WonderSwan' },
  56: { esde: 'neogeocd',      launchbox: 'SNK Neo Geo CD' },
  57: { esde: 'channelf',      launchbox: 'Fairchild Channel F' },
  63: { esde: 'supervision',   launchbox: 'Watara Supervision' },
  69: { esde: 'megaduck',      launchbox: 'Mega Duck' },
  71: { esde: 'arduboy',       launchbox: 'Arduboy' },
  72: { esde: 'wasm4',         launchbox: 'WASM-4' },
  73: { esde: 'arcadia',       launchbox: 'Emerson Arcadia 2001' },
  74: { esde: null,            launchbox: 'Interton VC 4000' },
  75: { esde: null,            launchbox: 'Elektor TV Games Computer' },
  76: { esde: 'pcenginecd',    launchbox: 'NEC TurboGrafx-CD' },
  77: { esde: 'atarijaguarcd', launchbox: 'Atari Jaguar CD' },
  78: { esde: 'nds',           launchbox: 'Nintendo DS' },   // ES-DE has no separate DSi system
  80: { esde: 'uzebox',        launchbox: 'Uzebox' },
  81: { esde: 'fds',           launchbox: 'Nintendo Famicom Disk System' },
};

export function esdeSystem(consoleId) {
  return FRONTEND_PLATFORMS[consoleId]?.esde ?? null;
}
export function launchboxPlatform(consoleId, fallback = '') {
  return FRONTEND_PLATFORMS[consoleId]?.launchbox ?? fallback;
}
