// Cartridge/handheld/arcade consoles RAChecker can hash on-device (the desktop's
// 'file'/'arcade' method systems). Disc systems are excluded — they need
// RAHasher. `short` mirrors the desktop console short_code and drives the system
// artwork URL (static.retroachievements.org). Used for the hash-DB sync, the
// games-by-system browser, and to name/icon matched games' systems.
export const CART_CONSOLES: { id: number; name: string; short: string }[] = [
  { id: 1, name: 'Genesis/Mega Drive', short: 'md' },
  { id: 2, name: 'Nintendo 64', short: 'n64' },
  { id: 3, name: 'SNES', short: 'snes' },
  { id: 4, name: 'Game Boy', short: 'gb' },
  { id: 5, name: 'Game Boy Advance', short: 'gba' },
  { id: 6, name: 'Game Boy Color', short: 'gbc' },
  { id: 7, name: 'NES', short: 'nes' },
  { id: 8, name: 'PC Engine', short: 'pce' },
  { id: 10, name: '32X', short: '32x' },
  { id: 11, name: 'Master System', short: 'sms' },
  { id: 13, name: 'Atari Lynx', short: 'lynx' },
  { id: 14, name: 'Neo Geo Pocket', short: 'ngp' },
  { id: 15, name: 'Game Gear', short: 'gg' },
  { id: 17, name: 'Atari Jaguar', short: 'jag' },
  { id: 23, name: 'Magnavox Odyssey 2', short: 'mo2' },
  { id: 24, name: 'Pokemon Mini', short: 'mini' },
  { id: 25, name: 'Atari 2600', short: '2600' },
  { id: 27, name: 'Arcade', short: 'arc' },
  { id: 28, name: 'Virtual Boy', short: 'vb' },
  { id: 29, name: 'MSX', short: 'msx' },
  { id: 33, name: 'SG-1000', short: 'sg1k' },
  { id: 44, name: 'ColecoVision', short: 'cv' },
  { id: 45, name: 'Intellivision', short: 'intv' },
  { id: 46, name: 'Vectrex', short: 'vect' },
  { id: 51, name: 'Atari 7800', short: '7800' },
  { id: 53, name: 'WonderSwan', short: 'ws' },
  { id: 57, name: 'Fairchild Channel F', short: 'chf' },
  { id: 63, name: 'Watara Supervision', short: 'wsv' },
  { id: 69, name: 'Mega Duck', short: 'duck' },
  { id: 71, name: 'Arduboy', short: 'ard' },
  { id: 72, name: 'WASM-4', short: 'wasm4' },
  { id: 73, name: 'Arcadia 2001', short: 'a2001' },
  { id: 74, name: 'Interton VC 4000', short: 'vc4000' },
  { id: 75, name: 'Elektor TV Games Computer', short: 'elek' },
  { id: 80, name: 'Uzebox', short: 'uze' },
  { id: 81, name: 'Famicom Disk System', short: 'fds' },
];

const NAME_BY_ID = new Map(CART_CONSOLES.map((c) => [c.id, c.name]));
const SHORT_BY_ID = new Map(CART_CONSOLES.map((c) => [c.id, c.short]));

export function consoleName(id: number | null | undefined): string | null {
  return id != null ? NAME_BY_ID.get(id) ?? null : null;
}
export function consoleShort(id: number | null | undefined): string | null {
  return id != null ? SHORT_BY_ID.get(id) ?? null : null;
}

// System artwork, straight from RA's static host (same source the desktop's
// /api/console/:id/icon proxies). expo-image loads it directly.
export function consoleIconUrl(id: number | null | undefined): string | null {
  const s = consoleShort(id);
  return s ? `https://static.retroachievements.org/assets/images/system/${s}.png` : null;
}
