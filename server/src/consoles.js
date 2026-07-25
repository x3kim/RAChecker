// Console metadata: RetroAchievements system id -> hashing method, file
// extensions, header rule, and folder-name aliases for detection.
//
// hashMethod:
//   'file'    -> hashed in-process by JS (whole-file MD5 or header strip)
//   'arcade'  -> MD5 of the file *name* (FBNeo); contents are NOT read
//   'rahasher'-> needs the external RAHasher.exe (disc images, DS/DSi, computers)
//   'unsupported' -> not a hashing target
//
// headerRule (only for hashMethod 'file'): null = whole-file MD5, otherwise the
// per-console preprocessing key implemented in hashing/file-hash.js.
// Source: rcheevos src/rhash/hash_rom.c + RA "Game Identification" docs.

export const CONSOLES = [
  { id: 1,  short: 'md',    name: 'Genesis/Mega Drive',        method: 'file',     headerRule: null,      exts: ['.md', '.gen', '.smd', '.bin', '.mdx'] },
  { id: 2,  short: 'n64',   name: 'Nintendo 64',               method: 'file',     headerRule: 'n64',     exts: ['.n64', '.v64', '.z64', '.ndd'] },
  { id: 3,  short: 'snes',  name: 'SNES/Super Famicom',        method: 'file',     headerRule: 'snes',    exts: ['.sfc', '.smc', '.swc', '.fig', '.bs'] },
  { id: 4,  short: 'gb',    name: 'Game Boy',                  method: 'file',     headerRule: null,      exts: ['.gb'] },
  { id: 5,  short: 'gba',   name: 'Game Boy Advance',          method: 'file',     headerRule: null,      exts: ['.gba', '.agb', '.srl'] },
  { id: 6,  short: 'gbc',   name: 'Game Boy Color',            method: 'file',     headerRule: null,      exts: ['.gbc', '.cgb'] },
  { id: 7,  short: 'nes',   name: 'NES/Famicom',               method: 'file',     headerRule: 'nes',     exts: ['.nes', '.unf', '.unif'] },
  { id: 8,  short: 'pce',   name: 'PC Engine/TurboGrafx-16',   method: 'file',     headerRule: 'pce',     exts: ['.pce', '.sgx'] },
  { id: 9,  short: 'scd',   name: 'Sega CD',                   method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.iso', '.m3u'] },
  { id: 10, short: '32x',   name: '32X',                       method: 'file',     headerRule: null,      exts: ['.32x', '.bin'] },
  { id: 11, short: 'sms',   name: 'Master System',             method: 'file',     headerRule: null,      exts: ['.sms'] },
  { id: 12, short: 'ps1',   name: 'PlayStation',               method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.bin', '.pbp', '.m3u', '.iso', '.img', '.ccd'] },
  { id: 13, short: 'lynx',  name: 'Atari Lynx',                method: 'file',     headerRule: 'lynx',    exts: ['.lnx', '.lyx'] },
  { id: 14, short: 'ngp',   name: 'Neo Geo Pocket',            method: 'file',     headerRule: null,      exts: ['.ngp', '.ngc', '.npc'] },
  { id: 15, short: 'gg',    name: 'Game Gear',                 method: 'file',     headerRule: null,      exts: ['.gg'] },
  { id: 16, short: 'gc',    name: 'GameCube',                  method: 'rahasher', headerRule: null,      exts: ['.iso', '.rvz', '.gcm', '.gcz', '.ciso'] },
  { id: 17, short: 'jag',   name: 'Atari Jaguar',              method: 'file',     headerRule: null,      exts: ['.j64', '.jag', '.rom', '.abs', '.cof'] },
  { id: 18, short: 'ds',    name: 'Nintendo DS',               method: 'rahasher', headerRule: null,      exts: ['.nds', '.srl', '.ids'] },
  { id: 19, short: 'wii',   name: 'Wii',                       method: 'rahasher', headerRule: null,      exts: ['.iso', '.rvz', '.wbfs', '.wad'] },
  { id: 21, short: 'ps2',   name: 'PlayStation 2',             method: 'rahasher', headerRule: null,      exts: ['.iso', '.chd', '.cue', '.bin', '.m3u'] },
  { id: 23, short: 'mo2',   name: 'Magnavox Odyssey 2',        method: 'file',     headerRule: null,      exts: ['.bin'] },
  { id: 24, short: 'mini',  name: 'Pokemon Mini',              method: 'file',     headerRule: null,      exts: ['.min'] },
  { id: 25, short: '2600',  name: 'Atari 2600',                method: 'file',     headerRule: null,      exts: ['.a26', '.bin'] },
  { id: 27, short: 'arc',   name: 'Arcade',                    method: 'arcade',   headerRule: null,      exts: ['.zip', '.7z'] },
  { id: 28, short: 'vb',    name: 'Virtual Boy',               method: 'file',     headerRule: null,      exts: ['.vb', '.vboy'] },
  { id: 29, short: 'msx',   name: 'MSX',                       method: 'file',     headerRule: null,      exts: ['.rom', '.mx1', '.mx2', '.dsk', '.cas'] },
  { id: 33, short: 'sg1k',  name: 'SG-1000',                   method: 'file',     headerRule: null,      exts: ['.sg', '.sc', '.bin'] },
  { id: 37, short: 'cpc',   name: 'Amstrad CPC',               method: 'rahasher', headerRule: null,      exts: ['.dsk', '.sna', '.cpr', '.cdt'] },
  { id: 38, short: 'a2',    name: 'Apple II',                  method: 'rahasher', headerRule: null,      exts: ['.dsk', '.nib', '.woz', '.po', '.do', '.2mg'] },
  { id: 39, short: 'sat',   name: 'Saturn',                    method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.iso', '.m3u', '.ccd'] },
  { id: 40, short: 'dc',    name: 'Dreamcast',                 method: 'rahasher', headerRule: null,      exts: ['.gdi', '.chd', '.cue', '.cdi', '.m3u'] },
  { id: 41, short: 'psp',   name: 'PlayStation Portable',      method: 'rahasher', headerRule: null,      exts: ['.iso', '.cso', '.pbp', '.chd'] },
  { id: 43, short: '3do',   name: '3DO Interactive Multiplayer', method: 'rahasher', headerRule: null,    exts: ['.cue', '.iso', '.chd', '.m3u'] },
  { id: 44, short: 'cv',    name: 'ColecoVision',              method: 'file',     headerRule: null,      exts: ['.col', '.cv', '.bin', '.rom'] },
  { id: 45, short: 'intv',  name: 'Intellivision',             method: 'file',     headerRule: null,      exts: ['.int', '.itv', '.bin', '.rom'] },
  { id: 46, short: 'vect',  name: 'Vectrex',                   method: 'file',     headerRule: null,      exts: ['.vec', '.gam', '.bin'] },
  { id: 47, short: '8088',  name: 'PC-8000/8800',              method: 'rahasher', headerRule: null,      exts: ['.d88', '.d98', '.88d', '.cmt'] },
  { id: 49, short: 'pc-fx', name: 'PC-FX',                     method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.ccd', '.toc', '.m3u'] },
  { id: 51, short: '7800',  name: 'Atari 7800',                method: 'file',     headerRule: 'a7800',   exts: ['.a78'] },
  { id: 53, short: 'ws',    name: 'WonderSwan',                method: 'file',     headerRule: null,      exts: ['.ws', '.wsc', '.pc2'] },
  { id: 56, short: 'ngcd',  name: 'Neo Geo CD',                method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.iso', '.m3u'] },
  { id: 57, short: 'chf',   name: 'Fairchild Channel F',       method: 'file',     headerRule: null,      exts: ['.chf', '.bin', '.rom'] },
  { id: 63, short: 'wsv',   name: 'Watara Supervision',        method: 'file',     headerRule: null,      exts: ['.sv', '.bin'] },
  { id: 69, short: 'duck',  name: 'Mega Duck',                 method: 'file',     headerRule: null,      exts: ['.bin'] },
  { id: 71, short: 'ard',   name: 'Arduboy',                   method: 'file',     headerRule: 'arduboy', exts: ['.hex', '.arduboy'] },
  { id: 72, short: 'wasm4', name: 'WASM-4',                    method: 'file',     headerRule: null,      exts: ['.wasm'] },
  { id: 73, short: 'a2001', name: 'Arcadia 2001',              method: 'file',     headerRule: null,      exts: ['.bin'] },
  { id: 74, short: 'vc4000',name: 'Interton VC 4000',          method: 'file',     headerRule: null,      exts: ['.bin'] },
  { id: 75, short: 'elek',  name: 'Elektor TV Games Computer', method: 'file',     headerRule: null,      exts: ['.bin', '.tvc'] },
  { id: 76, short: 'pccd',  name: 'PC Engine CD/TurboGrafx-CD',method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.ccd', '.toc', '.m3u'] },
  { id: 77, short: 'jcd',   name: 'Atari Jaguar CD',           method: 'rahasher', headerRule: null,      exts: ['.cue', '.chd', '.cdi', '.m3u'] },
  { id: 78, short: 'dsi',   name: 'Nintendo DSi',              method: 'rahasher', headerRule: null,      exts: ['.nds', '.dsi', '.ids', '.srl'] },
  { id: 80, short: 'uze',   name: 'Uzebox',                    method: 'file',     headerRule: null,      exts: ['.uze'] },
  { id: 81, short: 'fds',   name: 'Famicom Disk System',       method: 'file',     headerRule: 'nes',     exts: ['.fds'] },
  { id: 102,short: 'exe',   name: 'Standalone',                method: 'unsupported', headerRule: null,   exts: ['.exe'] },
];

export const CONSOLE_BY_ID = new Map(CONSOLES.map((c) => [c.id, c]));

// Folder-name aliases -> console id. The user keeps ROMs sorted into named
// folders, so the parent directory is a strong (often decisive) signal that
// disambiguates shared extensions like .bin / .iso / .cue / .zip.
export const FOLDER_ALIASES = {
  // Nintendo
  nes: 7, famicom: 7, nintendo: 7, fc: 7, 'nintendo entertainment system': 7,
  fds: 81, 'famicom disk system': 81, 'disk system': 81,
  snes: 3, sfc: 3, 'super nintendo': 3, 'super famicom': 3, 'super nintendo entertainment system': 3,
  n64: 2, 'nintendo 64': 2, 'n 64': 2,
  gb: 4, gameboy: 4, 'game boy': 4,
  gbc: 6, 'game boy color': 6, 'gameboy color': 6,
  gba: 5, 'game boy advance': 5, 'gameboy advance': 5,
  ds: 18, nds: 18, 'nintendo ds': 18,
  dsi: 78, 'nintendo dsi': 78,
  gc: 16, gamecube: 16, ngc: 16, 'nintendo gamecube': 16,
  wii: 19, 'nintendo wii': 19,
  vb: 28, 'virtual boy': 28, virtualboy: 28,
  'pokemon mini': 24, pokemini: 24, mini: 24,
  // Sega
  genesis: 1, megadrive: 1, 'mega drive': 1, md: 1, 'sega genesis': 1, 'sega mega drive': 1, smd: 1,
  '32x': 10, 'sega 32x': 10,
  segacd: 9, 'sega cd': 9, scd: 9, megacd: 9, 'mega cd': 9,
  sms: 11, 'master system': 11, 'sega master system': 11,
  gg: 15, gamegear: 15, 'game gear': 15, 'sega game gear': 15,
  sg1000: 33, 'sg-1000': 33, sg: 33,
  saturn: 39, 'sega saturn': 39, sat: 39, ss: 39,
  dreamcast: 40, 'sega dreamcast': 40, dc: 40,
  pico: 1, 'sega pico': 1,
  // Sony
  ps1: 12, psx: 12, playstation: 12, 'playstation 1': 12, psone: 12, 'sony playstation': 12,
  ps2: 21, playstation2: 21, 'playstation 2': 21,
  psp: 41, 'playstation portable': 41,
  // NEC
  pce: 8, pcengine: 8, 'pc engine': 8, turbografx: 8, 'turbografx-16': 8, tg16: 8, sgx: 8, supergrafx: 8,
  pccd: 76, 'pc engine cd': 76, 'turbografx-cd': 76, 'turbo cd': 76,
  'pc-fx': 49, pcfx: 49,
  'pc-8000': 47, 'pc-8800': 47, pc88: 47, pc98: 47,
  // Atari
  '2600': 25, 'atari 2600': 25, a2600: 25, vcs: 25,
  '7800': 51, 'atari 7800': 51, a7800: 51,
  lynx: 13, 'atari lynx': 13,
  jaguar: 17, 'atari jaguar': 17, jag: 17,
  'jaguar cd': 77, jagcd: 77,
  // SNK / Bandai
  ngp: 14, neogeopocket: 14, 'neo geo pocket': 14, ngpc: 14, 'neo geo pocket color': 14,
  ngcd: 56, 'neo geo cd': 56, neogeocd: 56,
  ws: 53, wonderswan: 53, 'wonderswan color': 53,
  // Others
  arcade: 27, mame: 27, fbneo: 27, 'fb neo': 27, fba: 27, 'final burn': 27, neogeo: 27, 'neo geo': 27,
  msx: 29, msx2: 29,
  coleco: 44, colecovision: 44, cv: 44,
  intellivision: 45, intv: 45,
  vectrex: 46,
  odyssey2: 23, 'magnavox odyssey 2': 23, o2: 23,
  'channel f': 57, 'fairchild channel f': 57, channelf: 57,
  supervision: 63, 'watara supervision': 63, wsv: 63,
  megaduck: 69, 'mega duck': 69,
  arduboy: 71,
  'wasm-4': 72, wasm4: 72,
  'arcadia 2001': 73, arcadia: 73,
  'vc 4000': 74, vc4000: 74,
  'amstrad cpc': 37, amstrad: 37, cpc: 37,
  'apple ii': 38, apple2: 38, appleii: 38,
  uzebox: 80,
};

// Build ext -> [consoleId,...] (ambiguous exts map to several systems).
export const EXT_TO_CONSOLES = (() => {
  const m = new Map();
  for (const c of CONSOLES) {
    for (const e of c.exts) {
      if (!m.has(e)) m.set(e, []);
      m.get(e).push(c.id);
    }
  }
  return m;
})();

export const ARCHIVE_EXTS = new Set(['.zip', '.7z', '.rar', '.gz', '.tar', '.tgz']);
// Disc/playlist containers that should go straight to RAHasher, never extracted.
export const DISC_EXTS = new Set(['.cue', '.bin', '.iso', '.chd', '.pbp', '.m3u', '.gdi', '.cdi', '.toc', '.ccd', '.img', '.rvz', '.cso', '.wbfs', '.gcm', '.gcz', '.ciso', '.nrg']);

export function consoleMethod(id) {
  return CONSOLE_BY_ID.get(id)?.method ?? 'unknown';
}

// Normalize a folder/segment name for alias matching.
export function normalizeName(s) {
  return String(s)
    .toLowerCase()
    .replace(/[\[\](){}]/g, ' ')      // brackets -> space
    .replace(/[._]+/g, ' ')           // dots/underscores -> space
    .replace(/\s+/g, ' ')
    .trim();
}

// Look up a console id from any path segment via folder aliases.
export function consoleFromFolderSegments(segments) {
  for (let i = segments.length - 1; i >= 0; i--) {
    const norm = normalizeName(segments[i]);
    if (FOLDER_ALIASES[norm] != null) return FOLDER_ALIASES[norm];
    // token-level fallback: any token equal to a single-word alias
    for (const tok of norm.split(' ')) {
      if (FOLDER_ALIASES[tok] != null) return FOLDER_ALIASES[tok];
    }
  }
  return null;
}
