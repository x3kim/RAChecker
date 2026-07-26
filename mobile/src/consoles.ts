// Cartridge/handheld/arcade consoles RAChecker can hash on-device (the desktop's
// 'file'/'arcade' method systems). Disc systems are excluded — they need
// RAHasher. Used to drive the hash-DB sync and to name matched games' systems.
export const CART_CONSOLES: { id: number; name: string }[] = [
  { id: 1, name: 'Genesis/Mega Drive' },
  { id: 2, name: 'Nintendo 64' },
  { id: 3, name: 'SNES' },
  { id: 4, name: 'Game Boy' },
  { id: 5, name: 'Game Boy Advance' },
  { id: 6, name: 'Game Boy Color' },
  { id: 7, name: 'NES' },
  { id: 8, name: 'PC Engine' },
  { id: 10, name: '32X' },
  { id: 11, name: 'Master System' },
  { id: 13, name: 'Atari Lynx' },
  { id: 14, name: 'Neo Geo Pocket' },
  { id: 15, name: 'Game Gear' },
  { id: 17, name: 'Atari Jaguar' },
  { id: 23, name: 'Magnavox Odyssey 2' },
  { id: 24, name: 'Pokemon Mini' },
  { id: 25, name: 'Atari 2600' },
  { id: 27, name: 'Arcade' },
  { id: 28, name: 'Virtual Boy' },
  { id: 29, name: 'MSX' },
  { id: 33, name: 'SG-1000' },
  { id: 44, name: 'ColecoVision' },
  { id: 45, name: 'Intellivision' },
  { id: 46, name: 'Vectrex' },
  { id: 51, name: 'Atari 7800' },
  { id: 53, name: 'WonderSwan' },
  { id: 57, name: 'Fairchild Channel F' },
  { id: 63, name: 'Watara Supervision' },
  { id: 69, name: 'Mega Duck' },
  { id: 71, name: 'Arduboy' },
  { id: 72, name: 'WASM-4' },
  { id: 73, name: 'Arcadia 2001' },
  { id: 74, name: 'Interton VC 4000' },
  { id: 75, name: 'Elektor TV Games Computer' },
  { id: 80, name: 'Uzebox' },
  { id: 81, name: 'Famicom Disk System' },
];

const NAME_BY_ID = new Map(CART_CONSOLES.map((c) => [c.id, c.name]));
export function consoleName(id: number | null | undefined): string | null {
  return id != null ? NAME_BY_ID.get(id) ?? null : null;
}
