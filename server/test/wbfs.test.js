// Tests for WBFS expansion (server/src/hashing/wbfs.js).
//
// WBFS is a sector map, not a compressor: what it does not store is padding the
// real disc had and nobody kept, so a reconstruction can only be checked sector
// by sector, not by comparing whole files. These tests therefore build small
// WBFS files with a known map and read specific offsets back out.
//
// The expanded image is a single-layer Wii disc — 4.7 GB — however few sectors a
// fixture stores, because the format fixes the disc size, not the file. It is
// created with truncate and only the mapped sectors are written, so it stays a
// sparse file and costs almost nothing on disk; the reads below seek rather than
// scan.
//
// The real check is elsewhere: a WBFS built from a genuine Super Mario Galaxy 2
// dump expands byte-identically and hashes to c40d458e2064edb1298cf4f11e4648a5,
// which is one of the two hashes RetroAchievements publishes for the game.
//
// wbfs.js writes into config.tempDir, so RA_DATA_DIR points at a throwaway
// directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, openSync, readSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-wbfs-'));
process.env.RA_DATA_DIR = tempDataDir;

let wbfs;
before(async () => { wbfs = await import('../src/hashing/wbfs.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const HD_SHIFT = 9;
const WB_SHIFT = 21;
const HD = 1 << HD_SHIFT;
const WB = 1 << WB_SHIFT;
const SECTORS_PER_DISC = (2 * 143432) >> (WB_SHIFT - 15); // 4482
const INFO_SIZE = Math.ceil((0x100 + SECTORS_PER_DISC * 2) / HD) * HD;
const SINGLE_LAYER = 143432 * 0x8000;

// `map` gives the wbfs sector each logical sector lives in, 0 meaning "never
// used". Each stored sector is filled with a byte derived from its index so the
// reader cannot pass by copying the wrong one.
function packWbfs({ map, slots = [0], hdShift = HD_SHIFT, wbShift = WB_SHIFT, magic = 'WBFS', truncateLast = false } = {}) {
  const highest = Math.max(0, ...map);
  const size = (highest + 1) * WB;
  const file = Buffer.alloc(size);

  file.write(magic, 0, 'latin1');
  file.writeUInt32BE(size / HD, 4);
  file[8] = hdShift;
  file[9] = wbShift;
  file[10] = 1;
  for (const slot of slots) file[0x0c + slot] = 1;

  // Slot 0's disc info: a Wii-looking header, then the map.
  const info = HD;
  file.writeUInt32BE(0x5d1c9ea3, info + 0x18);
  file.write('SMNE01', info, 'latin1');
  map.forEach((physical, logical) => file.writeUInt16BE(physical, info + 0x100 + logical * 2));

  map.forEach((physical, logical) => {
    if (physical !== 0) file.fill(0x40 + logical, physical * WB, (physical + 1) * WB);
  });
  // Writers stop the file where the data stops, so the physical sector written
  // last is usually shorter than a full one.
  return truncateLast ? file.subarray(0, highest * WB + 0x40000) : file;
}

let fixtureNo = 0;
async function expand(file) {
  const path = join(tempDataDir, `fixture-${fixtureNo++}.wbfs`);
  writeFileSync(path, file);
  return { result: await wbfs.expandWbfs(path), path };
}

// Read one byte at the start of a logical sector without pulling in the file.
function byteAt(path, offset) {
  const buf = Buffer.alloc(1);
  const fd = openSync(path, 'r');
  try { readSync(fd, buf, 0, 1, offset); } finally { closeSync(fd); }
  return buf[0];
}

test('WBFS: mapped sectors land at their logical offsets', async () => {
  // Deliberately out of order: the map, not the file order, decides.
  const { result } = await expand(packWbfs({ map: [2, 1, 3] }));
  assert.equal(result?.error, undefined, `expandWbfs failed: ${result?.error}`);
  try {
    assert.equal(byteAt(result.path, 0 * WB), 0x40);
    assert.equal(byteAt(result.path, 1 * WB), 0x41);
    assert.equal(byteAt(result.path, 2 * WB), 0x42);
  } finally {
    await result.cleanup();
  }
});

test('WBFS: an unused sector reads back as zeroes', async () => {
  const { result } = await expand(packWbfs({ map: [1, 0, 2] }));
  assert.equal(result?.error, undefined, `expandWbfs failed: ${result?.error}`);
  try {
    assert.equal(byteAt(result.path, 0 * WB), 0x40);
    assert.equal(byteAt(result.path, 1 * WB), 0x00);
    assert.equal(byteAt(result.path, 2 * WB), 0x42);
  } finally {
    await result.cleanup();
  }
});

test('WBFS: the image is a whole single-layer disc, not just what is stored', async () => {
  const { result } = await expand(packWbfs({ map: [1, 2] }));
  try {
    assert.equal(result.size, SINGLE_LAYER);
  } finally {
    await result.cleanup();
  }
});

test('WBFS: the last sector straddling the end does not force a dual-layer image', async () => {
  // Logical sector 2241 starts inside a single-layer disc but ends past it —
  // rounding up to whole wbfs sectors first would double the image size.
  const map = new Array(2242).fill(0);
  map[0] = 1;
  map[2241] = 2;
  const { result } = await expand(packWbfs({ map }));
  try {
    assert.equal(result.size, SINGLE_LAYER);
    assert.equal(byteAt(result.path, 2241 * WB), (0x40 + 2241) & 0xff);
  } finally {
    await result.cleanup();
  }
});

test('WBFS: a file that stops inside its last sector still expands', async () => {
  // Found the hard way: a real WBFS ends where its data ends, so insisting on a
  // full final sector rejected a perfectly good file.
  const { result } = await expand(packWbfs({ map: [1, 2], truncateLast: true }));
  assert.equal(result?.error, undefined, `expandWbfs failed: ${result?.error}`);
  try {
    assert.equal(byteAt(result.path, 0 * WB), 0x40);
    assert.equal(byteAt(result.path, 1 * WB), 0x41);
  } finally {
    await result.cleanup();
  }
});

test('expandWbfs ignores files that are not WBFS', async () => {
  const { result } = await expand(packWbfs({ map: [1], magic: 'XBFS' }));
  assert.equal(result, null);
});

test('expandWbfs refuses a WBFS holding several discs', async () => {
  const { result } = await expand(packWbfs({ map: [1], slots: [0, 1] }));
  assert.match(result.error, /2 discs/);
});

test('expandWbfs rejects an implausible sector size', async () => {
  const { result } = await expand(packWbfs({ map: [1], wbShift: 8 }));
  assert.match(result.error, /wbfs sector shift/);
});

test('isWbfsPath covers the extension and nothing else', () => {
  assert.equal(wbfs.isWbfsPath('C:/roms/Game.WBFS'), true);
  assert.equal(wbfs.isWbfsPath('/roms/Game.iso'), false);
  assert.equal(wbfs.isWbfsPath('/roms/Game.rvz'), false);
});
