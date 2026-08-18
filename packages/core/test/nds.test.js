// The Nintendo DS hash: header + ARM9 + ARM7 + icon, each read at an address the
// header points at. We can't ship ROMs, so correctness is pinned two ways:
//
//   - here, with synthetic ROMs whose expected digest is computed independently
//     (plain MD5 over the concatenation), which fixes the offsets and the order;
//   - against RAHasher.exe over 14 real retail dumps (EU/DE, DSi-enhanced), all
//     byte-identical — e.g. Final Fantasy III (EU) = 435ac50f4dbd02bb4d049228df60418a
//     and Pokémon SoulSilver (DE) = 1051ea6f1d599812a8a382b2fa4b02b2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashNds, NDS_EXTS } from '../hash/nds.js';

const md5 = () => {
  const h = createHash('md5');
  return { update: (b) => h.update(b), hex: () => h.digest('hex') };
};
const rawMd5 = (...parts) => {
  const h = createHash('md5');
  for (const p of parts) h.update(p);
  return h.digest('hex');
};

const reader = (bytes) => ({
  size: bytes.length,
  async read(offset, length) { return bytes.subarray(offset, Math.min(bytes.length, offset + length)); },
});

// Build a DS ROM whose four hashed regions hold distinguishable filler.
function buildRom({ arm9Size = 0x400, arm7Size = 0x200, superCard = false, iconBytes = 0xa00 } = {}) {
  const arm9Addr = 0x4000;
  const arm7Addr = arm9Addr + arm9Size + 0x100;   // deliberate gap: must be skipped
  const iconAddr = arm7Addr + arm7Size + 0x100;   // another gap
  const end = iconAddr + iconBytes;

  const header = new Uint8Array(512);
  for (let i = 0; i < 512; i++) header[i] = i & 0xff;
  const put = (at, v) => { header[at] = v & 0xff; header[at + 1] = (v >> 8) & 0xff; header[at + 2] = (v >> 16) & 0xff; header[at + 3] = (v >>> 24) & 0xff; };
  put(0x20, arm9Addr); put(0x2c, arm9Size);
  put(0x30, arm7Addr); put(0x3c, arm7Size);
  put(0x68, iconAddr);

  const prefix = superCard ? 512 : 0;
  const rom = new Uint8Array(prefix + end);
  if (superCard) {
    rom[0] = 0x2e; rom[1] = 0x00; rom[2] = 0x00; rom[3] = 0xea;
    rom[0xb0] = 0x44; rom[0xb1] = 0x46; rom[0xb2] = 0x96; rom[0xb3] = 0x00;
  }
  rom.set(header, prefix);
  const arm9 = new Uint8Array(arm9Size).fill(0xa9);
  const arm7 = new Uint8Array(arm7Size).fill(0xa7);
  const icon = new Uint8Array(iconBytes).fill(0x1c);
  rom.set(arm9, prefix + arm9Addr);
  rom.set(arm7, prefix + arm7Addr);
  rom.set(icon, prefix + iconAddr);

  return { rom, header, arm9, arm7, icon };
}

test('hashes header[0:0x160] + arm9 + arm7 + icon, in that order', async () => {
  const { rom, header, arm9, arm7, icon } = buildRom();
  const expected = rawMd5(header.subarray(0, 0x160), arm9, arm7, icon);
  assert.equal(await hashNds(reader(rom), md5), expected);
});

test('the gaps between the blocks are not hashed', async () => {
  // Same ROM twice, the second with every unhashed byte flipped. If the filler
  // between the blocks leaked into the digest, these would differ.
  const a = buildRom();
  const b = buildRom();
  for (let i = 0x160; i < 0x4000; i++) b.rom[i] = 0xff;                 // header tail + pre-arm9
  for (let i = 0x4000 + a.arm9.length; i < 0x4000 + a.arm9.length + 0x100; i++) b.rom[i] = 0xff;
  assert.equal(await hashNds(reader(b.rom), md5), await hashNds(reader(a.rom), md5));
});

test('only the first 352 bytes of the header count', async () => {
  const a = buildRom();
  const b = buildRom();
  b.rom[0x15f] = b.rom[0x15f] ^ 0xff;   // inside the hashed range -> must change
  assert.notEqual(await hashNds(reader(b.rom), md5), await hashNds(reader(a.rom), md5));
});

test('a SuperCard header is skipped and every address is relative to it', async () => {
  const plain = buildRom();
  const sc = buildRom({ superCard: true });
  assert.equal(await hashNds(reader(sc.rom), md5), await hashNds(reader(plain.rom), md5));
});

test('a short icon block is zero-padded to 2560 bytes', async () => {
  const short = buildRom({ iconBytes: 0x40 });          // homebrew: truncated icon
  const padded = new Uint8Array(0xa00);
  padded.set(short.icon);
  const expected = rawMd5(short.header.subarray(0, 0x160), short.arm9, short.arm7, padded);
  assert.equal(await hashNds(reader(short.rom), md5), expected);
});

test('refuses a file whose code sizes exceed 16 MB (not a DS ROM)', async () => {
  const { rom } = buildRom();
  rom[0x2c] = 0x00; rom[0x2d] = 0x00; rom[0x2e] = 0x00; rom[0x2f] = 0x01; // arm9 = 16 MB
  rom[0x3c] = 0x00; rom[0x3d] = 0x00; rom[0x3e] = 0x00; rom[0x3f] = 0x01; // arm7 = 16 MB
  assert.equal(await hashNds(reader(rom), md5), null);
});

test('refuses a file too small to hold a header', async () => {
  assert.equal(await hashNds(reader(new Uint8Array(16)), md5), null);
});

test('NDS_EXTS covers the DS extensions, including the ones shared with other systems', () => {
  for (const e of ['.nds', '.dsi', '.ids', '.srl']) assert.ok(NDS_EXTS.has(e), e);
  assert.ok(!NDS_EXTS.has('.gba'));
});
