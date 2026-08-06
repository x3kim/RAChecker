// Tests for CSO/ZSO expansion (server/src/hashing/cso.js).
//
// A CSO is an ISO cut into blocks, each stored raw or deflate-compressed, plus a
// table of block offsets. These tests build such a file from a known ISO, expand
// it again and require the result to be byte-identical — that equality is what
// makes the resulting RetroAchievements hash trustworthy.
//
// cso.js writes the expanded image into config.tempDir, so RA_DATA_DIR points at
// a throwaway directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-cso-'));
process.env.RA_DATA_DIR = tempDataDir;

let cso;
before(async () => { cso = await import('../src/hashing/cso.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const BLOCK = 2048;

// Deterministic pseudo-ISO content: long runs (compress well) interleaved with
// noise (does not compress at all, so those blocks end up stored raw).
function makeIso(blocks, tailBytes = BLOCK) {
  const total = (blocks - 1) * BLOCK + tailBytes;
  const buf = Buffer.alloc(total);
  let seed = 0x2545f491;
  for (let i = 0; i < total; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // every third block is a run of one byte, the rest is noise
    buf[i] = Math.floor(i / BLOCK) % 3 === 0 ? 0x41 : seed & 0xff;
  }
  return buf;
}

// Pack an ISO into a CISO v1 file, exactly as maxcso/ciso would: blocks that do
// not get smaller are stored raw and flagged with bit 31 of their index entry.
function packCiso(iso, { magic = 'CISO', indexShift = 0 } = {}) {
  const blocks = Math.ceil(iso.length / BLOCK);
  const header = Buffer.alloc(24);
  header.write(magic, 0, 'latin1');
  header.writeUInt32LE(0x18, 4);
  header.writeBigUInt64LE(BigInt(iso.length), 8);
  header.writeUInt32LE(BLOCK, 16);
  header[20] = 1;              // version
  header[21] = indexShift;

  const table = Buffer.alloc((blocks + 1) * 4);
  const chunks = [];
  let offset = header.length + table.length;
  const align = 1 << indexShift;
  for (let i = 0; i < blocks; i++) {
    const plain = iso.subarray(i * BLOCK, Math.min(iso.length, (i + 1) * BLOCK));
    const packed = deflateRawSync(plain, { level: 9 });
    const stored = packed.length >= plain.length;
    let data = stored ? Buffer.from(plain) : packed;
    // Offsets are shifted, so each block has to start on an aligned boundary.
    const pad = (align - (offset % align)) % align;
    if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
    table.writeUInt32LE((offset / align) | (stored ? 0x80000000 : 0), i * 4);
    chunks.push(data);
    offset += data.length;
  }
  const pad = (align - (offset % align)) % align;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  table.writeUInt32LE(offset / align, blocks * 4);
  return Buffer.concat([header, table, ...chunks]);
}

async function roundTrip(iso, packOpts) {
  const src = join(tempDataDir, `sample-${Math.random().toString(36).slice(2)}.cso`);
  writeFileSync(src, packCiso(iso, packOpts));
  const out = await cso.expandCso(src);
  assert.ok(out && out.path, `expandCso failed: ${out && out.error}`);
  try {
    return readFileSync(out.path);
  } finally {
    await out.cleanup();
  }
}

test('expands a CISO back to the original ISO byte for byte', async () => {
  const iso = makeIso(64);
  assert.deepEqual(await roundTrip(iso), iso);
});

test('handles a final block that is shorter than the block size', async () => {
  const iso = makeIso(9, 777);
  const back = await roundTrip(iso);
  assert.equal(back.length, iso.length);
  assert.deepEqual(back, iso);
});

test('honours the index shift used by images larger than 2 GB', async () => {
  const iso = makeIso(24);
  assert.deepEqual(await roundTrip(iso, { indexShift: 3 }), iso);
});

test('spans the read window, so block reads are not limited to one buffer', async () => {
  // 3000 blocks ≈ 6 MB of ISO, more than the 4 MB read window.
  const iso = makeIso(3000);
  assert.deepEqual(await roundTrip(iso), iso);
});

test('ignores files that are not a PSP-style CSO', async () => {
  // GameCube ".ciso" reuses the magic with a completely different layout: a
  // block size at offset 4 and a 32 KB byte map. It must be left alone.
  const gc = Buffer.alloc(40 * 1024);
  gc.write('CISO', 0, 'latin1');
  gc.writeUInt32LE(2 * 1024 * 1024, 4);
  gc[8] = 1;
  const src = join(tempDataDir, 'gamecube.ciso');
  writeFileSync(src, gc);
  assert.equal(await cso.expandCso(src), null);
});

test('decompresses LZ4 blocks (ZSO)', () => {
  // Hand-built LZ4 block: literals "abcdefgh", then a match of 12 bytes at
  // offset 8 → "abcdefgh" + "abcdefghabcd".
  const literals = Buffer.from('abcdefgh', 'latin1');
  const block = Buffer.concat([
    Buffer.from([(8 << 4) | (12 - 4)]),   // token: 8 literals, match length 12
    literals,
    Buffer.from([8, 0]),                  // match offset 8
  ]);
  const out = cso.lz4DecompressBlock(block, 20);
  assert.equal(out.toString('latin1'), 'abcdefghabcdefghabcd');
});

test('reports a clear error instead of producing a wrong image', async () => {
  const iso = makeIso(8);
  const packed = packCiso(iso);
  packed[packed.length - 5] ^= 0xff;   // corrupt the last block's payload
  const src = join(tempDataDir, 'broken.cso');
  writeFileSync(src, packed);
  const out = await cso.expandCso(src);
  assert.ok(out.error, 'a corrupt CSO must not expand silently');
  assert.match(out.error, /CSO/);
});
