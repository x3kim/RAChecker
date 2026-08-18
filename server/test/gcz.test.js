// Tests for GCZ expansion (server/src/hashing/gcz.js).
//
// A GCZ is an image cut into fixed-size blocks, each deflated or stored, plus a
// table of block offsets. These tests build one from a known image, expand it
// again and require the result to be byte-identical — that equality is what makes
// the RetroAchievements hash RAHasher then produces trustworthy.
//
// gcz.js writes the expanded image into config.tempDir, so RA_DATA_DIR points at
// a throwaway directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-gcz-'));
process.env.RA_DATA_DIR = tempDataDir;

let gcz;
before(async () => { gcz = await import('../src/hashing/gcz.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const BLOCK = 0x8000;

// Deterministic content: runs that deflate to nothing next to noise that does not
// compress at all, so both the stored and the deflated block paths are used.
function makeImage(blocks, tailBytes = BLOCK) {
  const total = (blocks - 1) * BLOCK + tailBytes;
  const buf = Buffer.alloc(total);
  let s = 0x2545f491;
  for (let i = 0; i < total; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    buf[i] = Math.floor(i / BLOCK) % 3 === 0 ? 0x41 : (s >>> 16) & 0xff;
  }
  buf.writeUInt32BE(0xc2339f3d, 0x1c); // the GameCube magic word
  return buf;
}

const adler32 = (buf) => {
  let a = 1;
  let b = 0;
  for (const x of buf) { a = (a + x) % 65521; b = (b + a) % 65521; }
  return ((b << 16) | a) >>> 0;
};

// Pack an image the way Dolphin does: blocks that do not get smaller are stored
// verbatim and flagged with bit 63 of their offset.
function packGcz(image, { blockSize = BLOCK, corrupt } = {}) {
  const blocks = Math.ceil(image.length / blockSize);
  const offsets = Buffer.alloc(blocks * 8);
  const hashes = Buffer.alloc(blocks * 4);
  const parts = [];
  let cursor = 0n;
  for (let i = 0; i < blocks; i++) {
    const plain = image.subarray(i * blockSize, Math.min((i + 1) * blockSize, image.length));
    const packed = deflateSync(plain);
    const stored = packed.length >= plain.length;
    const bytes = stored ? plain : packed;
    offsets.writeBigUInt64LE(cursor | (stored ? 1n << 63n : 0n), i * 8);
    hashes.writeUInt32LE(adler32(bytes), i * 4);
    parts.push(bytes);
    cursor += BigInt(bytes.length);
  }
  const data = Buffer.concat(parts);
  const head = Buffer.alloc(0x20);
  head.writeUInt32LE(corrupt?.magic ?? 0xb10bc001, 0x00);
  head.writeUInt32LE(0, 0x04);
  head.writeBigUInt64LE(BigInt(data.length), 0x08);
  head.writeBigUInt64LE(BigInt(image.length), 0x10);
  head.writeUInt32LE(corrupt?.blockSize ?? blockSize, 0x18);
  head.writeUInt32LE(corrupt?.blocks ?? blocks, 0x1c);
  return Buffer.concat([head, offsets, hashes, data]);
}

let fixtureNo = 0;
async function roundTrip(file, expected) {
  const path = join(tempDataDir, `fixture-${fixtureNo++}.gcz`);
  writeFileSync(path, file);
  const result = await gcz.expandGcz(path);
  assert.equal(result?.error, undefined, `expandGcz failed: ${result?.error}`);
  try {
    const got = readFileSync(result.path);
    assert.equal(got.length, expected.length, 'expanded image has the wrong length');
    if (!got.equals(expected)) {
      const at = got.findIndex((b, i) => b !== expected[i]);
      assert.fail(`expanded image differs from the reference at 0x${at.toString(16)}`);
    }
  } finally {
    await result.cleanup();
  }
}

test('GCZ: an image round-trips byte for byte', async () => {
  const image = makeImage(9);
  await roundTrip(packGcz(image), image);
});

test('GCZ: a trailing partial block round-trips', async () => {
  const image = makeImage(6, 1234);
  await roundTrip(packGcz(image), image);
});

test('GCZ: a different block size round-trips', async () => {
  const image = makeImage(4);
  await roundTrip(packGcz(image, { blockSize: 0x4000 }), image);
});

test('expandGcz ignores files that are not GCZ', async () => {
  const path = join(tempDataDir, 'plain.gcz');
  writeFileSync(path, makeImage(2));
  assert.equal(await gcz.expandGcz(path), null);
});

test('expandGcz rejects a header that contradicts itself', async () => {
  const image = makeImage(4);
  const path = join(tempDataDir, 'bad-count.gcz');
  writeFileSync(path, packGcz(image, { corrupt: { blocks: 99 } }));
  const result = await gcz.expandGcz(path);
  assert.match(result.error, /block count/);
});

test('isGczPath covers the extension and nothing else', () => {
  assert.equal(gcz.isGczPath('C:/roms/Game.GCZ'), true);
  assert.equal(gcz.isGczPath('/roms/Game.iso'), false);
  assert.equal(gcz.isGczPath('/roms/Game.rvz'), false);
});
