// Tests for GameCube/Wii CISO expansion (server/src/hashing/ciso-gc.js).
//
// This format shares its magic word with the PSP CSO that cso.js reads and has
// nothing else in common with it, so half of what matters here is that each
// reader leaves the other's files alone.
//
// Like WBFS, a CISO drops blocks rather than compressing them, so a dump can end
// before the disc does. The image is grown back to the disc's real size, which is
// created with truncate and left sparse — the fixtures below therefore cost
// almost nothing on disk despite expanding to 1.4 GB.
//
// ciso-gc.js writes into config.tempDir, so RA_DATA_DIR points at a throwaway
// directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-ciso-'));
process.env.RA_DATA_DIR = tempDataDir;

let ciso;
before(async () => { ciso = await import('../src/hashing/ciso-gc.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const HEADER = 0x8000;
const BLOCK = 0x8000;
const GAMECUBE_SIZE = 1459978240;

// `present` says which blocks were kept. Each kept block is filled with a byte
// derived from its index, so copying the wrong one cannot pass.
function packCiso({ present, blockSize = BLOCK, magic = 'CISO', header } = {}) {
  const head = Buffer.alloc(HEADER);
  head.write(magic, 0, 'latin1');
  head.writeUInt32LE(blockSize, 4);
  const parts = [head];
  present.forEach((kept, i) => {
    if (!kept) return;
    head[8 + i] = 1;
    const block = Buffer.alloc(blockSize, 0x40 + i);
    if (i === 0 && header) header(block);
    parts.push(block);
  });
  return Buffer.concat(parts);
}

let fixtureNo = 0;
async function expand(file) {
  const path = join(tempDataDir, `fixture-${fixtureNo++}.ciso`);
  writeFileSync(path, file);
  return ciso.expandGameCubeCiso(path);
}

function byteAt(path, offset) {
  const buf = Buffer.alloc(1);
  const fd = openSync(path, 'r');
  try { readSync(fd, buf, 0, 1, offset); } finally { closeSync(fd); }
  return buf[0];
}

test('CISO: stored blocks come back at their own offsets', async () => {
  const result = await expand(packCiso({ present: [1, 1, 1] }));
  assert.equal(result?.error, undefined, `expandGameCubeCiso failed: ${result?.error}`);
  try {
    // No disc header, so nothing tells it to grow: the image is what was stored.
    assert.equal(result.size, 3 * BLOCK);
    const got = readFileSync(result.path);
    for (let i = 0; i < 3; i++) {
      assert.ok(got.subarray(i * BLOCK, (i + 1) * BLOCK).every((b) => b === 0x40 + i), `block ${i}`);
    }
  } finally {
    await result.cleanup();
  }
});

test('CISO: a dropped block comes back as zeroes', async () => {
  const result = await expand(packCiso({ present: [1, 0, 1] }));
  assert.equal(result?.error, undefined, `expandGameCubeCiso failed: ${result?.error}`);
  try {
    const got = readFileSync(result.path);
    assert.equal(got[0], 0x40);
    assert.ok(got.subarray(BLOCK, 2 * BLOCK).every((b) => b === 0), 'the dropped block is not zero');
    assert.equal(got[2 * BLOCK], 0x42);
  } finally {
    await result.cleanup();
  }
});

test('CISO: a GameCube dump is grown back to a whole disc', async () => {
  // A scrubbed dump stops early; a hash rule reading near the end has to find
  // zeroes there, not the end of the file.
  const result = await expand(packCiso({
    present: [1, 1],
    header: (block) => block.writeUInt32BE(0xc2339f3d, 0x1c),
  }));
  assert.equal(result?.error, undefined, `expandGameCubeCiso failed: ${result?.error}`);
  try {
    assert.equal(result.size, GAMECUBE_SIZE);
    assert.equal(byteAt(result.path, BLOCK), 0x41);
    assert.equal(byteAt(result.path, GAMECUBE_SIZE - 1), 0x00);
  } finally {
    await result.cleanup();
  }
});

test('a PSP CSO is left alone rather than read as this format', async () => {
  // Same magic word, 2 KiB blocks. cso.js owns those; this reader must decline
  // so the file keeps being handled the way it was.
  assert.equal(await expand(packCiso({ present: [1], blockSize: 2048 })), null);
});

test('expandGameCubeCiso ignores files that are not CISO', async () => {
  assert.equal(await expand(packCiso({ present: [1], magic: 'XISO' })), null);
});

test('expandGameCubeCiso rejects a dump missing its first block', async () => {
  const result = await expand(packCiso({ present: [0, 1] }));
  assert.match(result.error, /first block/);
});

test('expandGameCubeCiso rejects a map claiming more than the file holds', async () => {
  const file = packCiso({ present: [1, 1, 1] });
  const result = await expand(file.subarray(0, HEADER + BLOCK));
  assert.match(result.error, /more blocks than the file holds/);
});
