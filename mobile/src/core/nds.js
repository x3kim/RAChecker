// The RetroAchievements Nintendo DS / DSi hash.
// Source of truth: rcheevos src/rhash/hash_rom.c, rc_hash_nintendo_ds().
//
// Unlike the cartridge rules in rules.js this is not one pass over the file. A
// DS ROM is a container: its 512-byte header points at an ARM9 code block, an
// ARM7 code block and an icon/title block, and only those four pieces are
// hashed — in that order, with everything between them ignored. That is why a
// plain whole-file MD5 of a .nds never matches RetroAchievements.
//
// The byte source is therefore a random-access reader, not a buffer, and MD5 is
// injected as an incremental accumulator so the identical code runs under Node
// (crypto) and React Native (js-md5).

// Extensions that carry a DS ROM. `.srl` is shared with Game Boy Advance and
// `.ids` with DSi, so callers should treat the DS hash as one candidate among
// others rather than the only answer for those two.
export const NDS_EXTS = new Set(['.nds', '.dsi', '.ids', '.srl']);

const HEADER_BYTES = 512;   // read; only the first 0x160 are hashed
const HASHED_HEADER = 0x160;
const ICON_BYTES = 0xa00;
// ARM9 + ARM7 are typically well under 1 MB each. rcheevos treats anything past
// 16 MB as proof this is not a DS ROM rather than trying to read it.
const MAX_CODE_BYTES = 16 * 1024 * 1024;

// A SuperCard flash cart prepends its own 512-byte header; the real DS header
// follows it and every address in it is relative to that shifted origin.
function hasSuperCardHeader(h) {
  return h[0] === 0x2e && h[1] === 0x00 && h[2] === 0x00 && h[3] === 0xea
    && h[0xb0] === 0x44 && h[0xb1] === 0x46 && h[0xb2] === 0x96 && h[0xb3] === 0x00;
}

function u32le(b, at) {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

// Read exactly `length` bytes at `offset`, zero-filling whatever the file does
// not provide. rcheevos 0-pads a short icon block explicitly; for the code
// blocks it would hash uninitialised memory, which no real dump reaches and
// which cannot be reproduced — zeroes keep a truncated file deterministic.
async function readPadded(reader, offset, length) {
  const out = new Uint8Array(length);
  if (offset >= reader.size) return out;
  const got = await reader.read(offset, Math.min(length, reader.size - offset));
  out.set(got.subarray(0, Math.min(got.length, length)));
  return out;
}

/**
 * Hash a Nintendo DS ROM.
 *
 * @param reader     {{ size: number, read(offset, length): Promise<Uint8Array> }}
 * @param createMd5  () => { update(bytes): void, hex(): string }
 * @returns the lowercase hex hash, or null when the file is not a DS ROM.
 */
export async function hashNds(reader, createMd5) {
  if (!reader || reader.size < HEADER_BYTES) return null;

  let origin = 0;
  let header = await reader.read(0, HEADER_BYTES);
  if (header.length < HEADER_BYTES) return null;

  if (hasSuperCardHeader(header)) {
    origin = HEADER_BYTES;
    if (reader.size < origin + HEADER_BYTES) return null;
    header = await reader.read(origin, HEADER_BYTES);
    if (header.length < HEADER_BYTES) return null;
  }

  const arm9Addr = u32le(header, 0x20);
  const arm9Size = u32le(header, 0x2c);
  const arm7Addr = u32le(header, 0x30);
  const arm7Size = u32le(header, 0x3c);
  const iconAddr = u32le(header, 0x68);

  // Not a DS ROM (or a corrupt one): refuse instead of reading gigabytes.
  if (arm9Size + arm7Size > MAX_CODE_BYTES) return null;

  const md5 = createMd5();
  md5.update(header.subarray(0, HASHED_HEADER));
  md5.update(await readPadded(reader, arm9Addr + origin, arm9Size));
  md5.update(await readPadded(reader, arm7Addr + origin, arm7Size));
  md5.update(await readPadded(reader, iconAddr + origin, ICON_BYTES));
  return md5.hex();
}
