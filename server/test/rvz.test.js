// Tests for WIA/RVZ expansion (server/src/hashing/rvz.js).
//
// The format stores a disc as compressed chunks, with Wii partitions kept
// decrypted and hash-stripped and unused areas replaced by the seed of the
// generator that produced their padding. These tests build a reference ISO,
// pack it into a WIA/RVZ by hand, expand it again and require the result to be
// byte-identical — that equality is what makes the RetroAchievements hash
// RAHasher then produces trustworthy.
//
// The packer and the Wii hash-tree builder below are written independently of
// the ones in rvz.js (straight-line, no streaming) so that a transcription slip
// in either shows up as a mismatch rather than cancelling out.
//
// rvz.js writes the expanded image into config.tempDir, so RA_DATA_DIR points at
// a throwaway directory BEFORE the import.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, createCipheriv } from 'node:crypto';
import { zstdCompressSync } from 'node:zlib';

const tempDataDir = mkdtempSync(join(tmpdir(), 'ra-checker-rvz-'));
process.env.RA_DATA_DIR = tempDataDir;

let rvz;
before(async () => { rvz = await import('../src/hashing/rvz.js'); });
after(() => { try { rmSync(tempDataDir, { recursive: true, force: true }); } catch { /* windows file locks */ } });

const NONE = 0;
const ZSTD = 5;
const SECTOR = 0x8000;
const SDATA = 0x7c00;
const SHASH = 0x400;

const sha1 = (b) => createHash('sha1').update(b).digest();

// Deterministic filler that does not compress to nothing.
function noise(size, seed = 1) {
  const buf = Buffer.alloc(size);
  let s = seed >>> 0;
  for (let i = 0; i < size; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    buf[i] = (s >>> 16) & 0xff;
  }
  return buf;
}

// ---------------------------------------------------------------------------
// The lagged Fibonacci generator, written the way Dolphin does it: the output
// transform is applied once to the whole state (it is XOR-linear, so it commutes
// with the stepping) and the bytes then fall out in big-endian order. rvz.js
// applies the same transform per byte instead, so the two agreeing is a real
// cross-check of the "shift by 18, not 16" quirk.
function junkBytes(seed, skip, count) {
  const state = new Uint32Array(521);
  for (let i = 0; i < 17; i++) state[i] = seed.readUInt32BE(i * 4);
  for (let i = 17; i < 521; i++) {
    state[i] = (((state[i - 17] << 23) >>> 0) ^ (state[i - 16] >>> 9) ^ state[i - 1]) >>> 0;
  }
  const step = () => {
    for (let i = 0; i < 32; i++) state[i] = (state[i] ^ state[i + 521 - 32]) >>> 0;
    for (let i = 32; i < 521; i++) state[i] = (state[i] ^ state[i - 32]) >>> 0;
  };
  for (let i = 0; i < 4; i++) step();

  const page = Buffer.alloc(521 * 4);
  const render = () => {
    for (let i = 0; i < 521; i++) {
      const x = state[i];
      page.writeUInt32BE(((x & 0xff00ffff) | ((x >>> 2) & 0x00ff0000)) >>> 0, i * 4);
    }
  };
  render();

  let pos = 0;
  const consume = (n, target) => {
    let done = 0;
    while (done < n) {
      if (pos === page.length) { step(); render(); pos = 0; }
      const take = Math.min(page.length - pos, n - done);
      if (target) page.copy(target, done, pos, pos + take);
      done += take;
      pos += take;
    }
  };

  const out = Buffer.alloc(count);
  consume(skip, null);
  consume(count, out);
  return out;
}

// ---------------------------------------------------------------------------
// WIA/RVZ writer. `jobs` are the group payloads in group-table order.
//
//   { zero: true }                                  a group of nothing but zeroes
//   { body, packedSize?, exceptionLists?, raw? }     everything else
//
// `raw` stores the group without compressing it, which RVZ marks with a cleared
// top bit in data_size.
function buildImage({
  isRvz = true, discType = 1, compression = NONE, chunkSize,
  isoSize, discHead, rawRuns = [], partitions = [], jobs,
}) {
  const encodeJob = (job) => {
    if (job.zero) return { stored: Buffer.alloc(0), dataSize: 0, packedSize: 0 };
    const pieces = [];
    for (const list of job.exceptionLists ?? []) {
      const buf = Buffer.alloc(2 + list.length * 22);
      buf.writeUInt16BE(list.length, 0);
      list.forEach((ex, i) => {
        buf.writeUInt16BE(ex.offset, 2 + i * 22);
        ex.hash.copy(buf, 4 + i * 22);
      });
      pieces.push(buf);
    }
    let head = Buffer.concat(pieces);
    const method = job.raw ? NONE : compression;
    if (job.exceptionLists && method === NONE && head.length % 4 !== 0) {
      head = Buffer.concat([head, Buffer.alloc(4 - (head.length % 4))]);
    }
    const plain = Buffer.concat([head, job.body]);
    const stored = method === ZSTD ? zstdCompressSync(plain) : plain;
    const flag = isRvz && method !== NONE ? 0x80000000 : 0;
    return { stored, dataSize: (stored.length | flag) >>> 0, packedSize: job.packedSize ?? 0 };
  };

  const encoded = jobs.map(encodeJob);
  const groupEntrySize = isRvz ? 12 : 8;

  const partTable = Buffer.alloc(partitions.length * 0x30);
  partitions.forEach((p, i) => {
    p.key.copy(partTable, i * 0x30);
    p.runs.forEach((r, j) => {
      const o = i * 0x30 + 16 + j * 16;
      partTable.writeUInt32BE(r.firstSector, o);
      partTable.writeUInt32BE(r.numSectors, o + 4);
      partTable.writeUInt32BE(r.groupIndex, o + 8);
      partTable.writeUInt32BE(r.numGroups, o + 12);
    });
  });

  const rawTable = Buffer.alloc(rawRuns.length * 0x18);
  rawRuns.forEach((r, i) => {
    const o = i * 0x18;
    rawTable.writeBigUInt64BE(BigInt(r.offset), o);
    rawTable.writeBigUInt64BE(BigInt(r.size), o + 8);
    rawTable.writeUInt32BE(r.groupIndex, o + 16);
    rawTable.writeUInt32BE(r.numGroups, o + 20);
  });

  // Tables carry the disc's compression; group offsets are stored divided by 4,
  // so every blob has to start on a 4-byte boundary.
  const packTable = (buf) => (compression === ZSTD ? zstdCompressSync(buf) : buf);
  const packedRaw = packTable(rawTable);

  const parts = [];
  let cursor = 0x48 + 0xdc;
  const place = (buf) => {
    const pad = (4 - (cursor % 4)) % 4;
    if (pad) { parts.push(Buffer.alloc(pad)); cursor += pad; }
    const at = cursor;
    parts.push(buf);
    cursor += buf.length;
    return at;
  };

  const partOffset = place(partTable);
  const rawOffset = place(packedRaw);
  // The group table needs the blob offsets, which need the table's own size, so
  // it is laid out first with a placeholder and filled in afterwards.
  const groupTable = Buffer.alloc(encoded.length * groupEntrySize);
  const groupTableOffset = place(Buffer.alloc(groupTable.length + 1024));
  const blobStart = [];
  for (const e of encoded) blobStart.push(e.stored.length ? place(e.stored) : 0);

  encoded.forEach((e, i) => {
    const o = i * groupEntrySize;
    groupTable.writeUInt32BE(blobStart[i] / 4, o);
    groupTable.writeUInt32BE(e.dataSize, o + 4);
    if (groupEntrySize >= 12) groupTable.writeUInt32BE(e.packedSize, o + 8);
  });
  const packedGroups = packTable(groupTable);
  assert.ok(packedGroups.length <= groupTable.length + 1024, 'group table outgrew its reserved space');

  const disc = Buffer.alloc(0xdc);
  disc.writeUInt32BE(discType, 0x00);
  disc.writeUInt32BE(compression, 0x04);
  disc.writeUInt32BE(chunkSize, 0x0c);
  discHead.copy(disc, 0x10);
  disc.writeUInt32BE(partitions.length, 0x90);
  disc.writeUInt32BE(0x30, 0x94);
  disc.writeBigUInt64BE(BigInt(partOffset), 0x98);
  disc.writeUInt32BE(rawRuns.length, 0xb4);
  disc.writeBigUInt64BE(BigInt(rawOffset), 0xb8);
  disc.writeUInt32BE(packedRaw.length, 0xc0);
  disc.writeUInt32BE(encoded.length, 0xc4);
  disc.writeBigUInt64BE(BigInt(groupTableOffset), 0xc8);
  disc.writeUInt32BE(packedGroups.length, 0xd0);

  const head = Buffer.alloc(0x48);
  head.write(isRvz ? 'RVZ\x01' : 'WIA\x01', 0, 'latin1');
  head.writeUInt32BE(1, 0x04);
  head.writeUInt32BE(1, 0x08);
  head.writeUInt32BE(0xdc, 0x0c);
  head.writeBigUInt64BE(BigInt(isoSize), 0x24);

  const body = Buffer.concat(parts);
  const file = Buffer.concat([head, disc, body]);
  // Splice the (possibly compressed) group table over its placeholder.
  packedGroups.copy(file, groupTableOffset);
  head.writeBigUInt64BE(BigInt(file.length), 0x2c);
  head.copy(file, 0);
  return file;
}

// Encode a group as an RVZ-packed stream of literal and padding runs.
// `runs` = [{ junk: bool, size, seed? , data? }].
function packRuns(runs) {
  const pieces = [];
  for (const run of runs) {
    const header = Buffer.alloc(4);
    header.writeUInt32BE((run.size | (run.junk ? 0x80000000 : 0)) >>> 0, 0);
    pieces.push(header, run.junk ? run.seed : run.data);
  }
  return Buffer.concat(pieces);
}

// ---------------------------------------------------------------------------
// The encrypted, hashed on-disc form of a run of Wii partition sectors, built
// the obvious way: hash every sector, then every subgroup, then every group.
function encryptPartition(plain, sectorCount, key, exceptions) {
  const nominal = Math.ceil(sectorCount / 64) * 64;
  const blocks = [];
  for (let s = 0; s < nominal; s++) {
    const block = Buffer.alloc(SHASH);
    for (let i = 0; i < 31; i++) {
      const at = s * SDATA + i * 0x400;
      const chunk = s < sectorCount ? plain.subarray(at, at + 0x400) : Buffer.alloc(0x400);
      sha1(chunk).copy(block, i * 20);
    }
    blocks.push(block);
  }
  for (let sub = 0; sub < nominal / 8; sub++) {
    const h1 = Buffer.alloc(160);
    for (let i = 0; i < 8; i++) sha1(blocks[sub * 8 + i].subarray(0, 0x26c)).copy(h1, i * 20);
    for (let i = 0; i < 8; i++) h1.copy(blocks[sub * 8 + i], 0x280);
  }
  for (let grp = 0; grp < nominal / 64; grp++) {
    const h2 = Buffer.alloc(160);
    for (let sg = 0; sg < 8; sg++) {
      sha1(blocks[grp * 64 + sg * 8].subarray(0x280, 0x320)).copy(h2, sg * 20);
    }
    for (let i = 0; i < 64; i++) h2.copy(blocks[grp * 64 + i], 0x340);
  }
  for (const ex of exceptions) ex.hash.copy(blocks[ex.sector], ex.offset);

  const out = Buffer.alloc(sectorCount * SECTOR);
  const zeroIv = Buffer.alloc(16);
  for (let s = 0; s < sectorCount; s++) {
    const hc = createCipheriv('aes-128-cbc', key, zeroIv).setAutoPadding(false);
    const encHash = Buffer.concat([hc.update(blocks[s]), hc.final()]);
    const dc = createCipheriv('aes-128-cbc', key, encHash.subarray(0x3d0, 0x3e0)).setAutoPadding(false);
    const encData = Buffer.concat([dc.update(plain.subarray(s * SDATA, (s + 1) * SDATA)), dc.final()]);
    encHash.copy(out, s * SECTOR);
    encData.copy(out, s * SECTOR + SHASH);
  }
  return out;
}

// ---------------------------------------------------------------------------
let fixtureNo = 0;
async function roundTrip(file, expectedIso) {
  const path = join(tempDataDir, `fixture-${fixtureNo++}.rvz`);
  writeFileSync(path, file);
  const result = await rvz.expandRvz(path);
  assert.equal(result?.error, undefined, `expandRvz failed: ${result?.error}`);
  try {
    const got = readFileSync(result.path);
    assert.equal(got.length, expectedIso.length, 'expanded image has the wrong length');
    if (!got.equals(expectedIso)) {
      const at = got.findIndex((b, i) => b !== expectedIso[i]);
      assert.fail(`expanded image differs from the reference at 0x${at.toString(16)}`);
    }
  } finally {
    await result.cleanup();
  }
}

// A GameCube-shaped disc: everything is raw data, no partitions. 4 chunks of
// 128 KiB — the size Dolphin defaults to — covering a group of real content, a
// group of zeroes, a group that is nothing but padding, and a group whose
// padding starts part-way through a sector.
function gameCubeFixture(compression, { isRvz = true, chunkSize = 0x20000 } = {}) {
  const isoSize = chunkSize * 4;
  const discHead = noise(0x80, 7);
  discHead.writeUInt32BE(0xc2339f3d, 0x1c); // the GameCube magic word

  const seedA = noise(68, 11);
  const seedB = noise(68, 12);
  const iso = Buffer.alloc(isoSize);
  discHead.copy(iso, 0);
  noise(chunkSize - 0x80, 2).copy(iso, 0x80);
  // chunk 1 stays zero
  junkBytes(seedA, 0, chunkSize).copy(iso, chunkSize * 2);
  const literal = noise(0x1000, 3);
  literal.copy(iso, chunkSize * 3);
  // 0x1000 into the chunk, so the generator has to skip that far into its sector
  junkBytes(seedB, 0x1000, 0x1000).copy(iso, chunkSize * 3 + 0x1000);
  noise(chunkSize - 0x2000, 4).copy(iso, chunkSize * 3 + 0x2000);

  const tail = noise(chunkSize - 0x2000, 4);
  const jobs = [
    { body: iso.subarray(0, chunkSize) },
    { zero: true },
    ...(isRvz
      ? [{ body: packRuns([{ junk: true, size: chunkSize, seed: seedA }]), packedSize: 4 + 68 }]
      : [{ body: iso.subarray(chunkSize * 2, chunkSize * 3) }]),
    ...(isRvz
      ? [{
          body: packRuns([
            { size: 0x1000, data: literal },
            { junk: true, size: 0x1000, seed: seedB },
            { size: chunkSize - 0x2000, data: tail },
          ]),
          packedSize: 4 * 3 + 0x1000 + 68 + (chunkSize - 0x2000),
          raw: true, // stored uncompressed even on a compressed disc
        }]
      : [{ body: iso.subarray(chunkSize * 3) }]),
  ];

  const file = buildImage({
    isRvz, discType: 1, compression, chunkSize, isoSize, discHead,
    rawRuns: [{ offset: 0x80, size: isoSize - 0x80, groupIndex: 0, numGroups: 4 }],
    jobs,
  });
  return { file, iso };
}

test('RVZ: a GameCube disc round-trips byte for byte (uncompressed)', async () => {
  const { file, iso } = gameCubeFixture(NONE);
  await roundTrip(file, iso);
});

test('RVZ: a GameCube disc round-trips byte for byte (Zstandard)', async () => {
  const { file, iso } = gameCubeFixture(ZSTD);
  await roundTrip(file, iso);
});

test('WIA: a GameCube disc round-trips byte for byte', async () => {
  // WIA has no RVZ packing and its chunks are multiples of 2 MiB.
  const { file, iso } = gameCubeFixture(ZSTD, { isRvz: false, chunkSize: 0x200000 });
  await roundTrip(file, iso);
});

// A Wii-shaped disc: raw data on either side of one partition of 70 sectors,
// which is 64 + 6 — so the last group is partial and its hash tree still has to
// cover all 64 nominal sectors.
const PARTITION_FIRST_SECTOR = 4;
const PARTITION_SECTORS = 70;

function wiiFixture(chunkSize) {
  const partOffset = PARTITION_FIRST_SECTOR * SECTOR;
  const partBytes = PARTITION_SECTORS * SECTOR;
  const tailOffset = partOffset + partBytes;
  const isoSize = tailOffset + SECTOR;

  const discHead = noise(0x80, 21);
  discHead.writeUInt32BE(0x5d1c9ea3, 0x18); // the Wii magic word
  const key = noise(16, 22);
  const plain = noise(PARTITION_SECTORS * SDATA, 23);
  // Two sectors whose stored hashes do not match the tree: one in the full first
  // group, one in the short trailing group.
  const exceptions = [
    { sector: 3, offset: 0x14, hash: noise(20, 24) },
    { sector: 67, offset: 0x2a0, hash: noise(20, 25) },
  ];

  const iso = Buffer.alloc(isoSize);
  discHead.copy(iso, 0);
  noise(partOffset - 0x80, 26).copy(iso, 0x80);
  encryptPartition(plain, PARTITION_SECTORS, key, exceptions).copy(iso, partOffset);
  noise(SECTOR, 27).copy(iso, tailOffset);

  // Raw runs: everything before the partition, and the sector after it.
  const headRun = { offset: 0x80, size: partOffset - 0x80, groupIndex: 0, numGroups: 1 };
  const jobs = [{ body: iso.subarray(0, partOffset) }];

  const tailRun = { offset: tailOffset, size: SECTOR, groupIndex: 1, numGroups: 1 };
  jobs.push({ body: iso.subarray(tailOffset) });

  // Partition chunks. One exception list per 2 MiB group, each covering 64
  // sectors — or the whole chunk when a chunk is smaller than that.
  const sectorsPerChunk = chunkSize / SECTOR;
  const listsPerChunk = chunkSize % 0x200000 === 0 ? chunkSize / 0x200000 : 1;
  const sectorsPerList = Math.min(64, sectorsPerChunk);
  const numGroups = Math.ceil(PARTITION_SECTORS / sectorsPerChunk);
  for (let g = 0; g < numGroups; g++) {
    const first = g * sectorsPerChunk;
    const count = Math.min(sectorsPerChunk, PARTITION_SECTORS - first);
    const lists = [];
    for (let l = 0; l < listsPerChunk; l++) {
      lists.push(
        exceptions
          .filter((ex) => ex.sector >= first + l * sectorsPerList && ex.sector < first + (l + 1) * sectorsPerList)
          .map((ex) => ({ offset: (ex.sector - first - l * sectorsPerList) * SHASH + ex.offset, hash: ex.hash }))
      );
    }
    jobs.push({
      body: plain.subarray(first * SDATA, (first + count) * SDATA),
      exceptionLists: lists,
    });
  }

  const file = buildImage({
    isRvz: true, discType: 2, compression: ZSTD, chunkSize, isoSize, discHead,
    rawRuns: [headRun, tailRun],
    partitions: [{
      key,
      runs: [
        { firstSector: PARTITION_FIRST_SECTOR, numSectors: PARTITION_SECTORS, groupIndex: 2, numGroups },
        { firstSector: 0, numSectors: 0, groupIndex: 0, numGroups: 0 },
      ],
    }],
    jobs,
  });
  return { file, iso };
}

test('RVZ: a Wii partition is re-hashed and re-encrypted (chunks below 2 MiB)', async () => {
  const { file, iso } = wiiFixture(0x20000);
  await roundTrip(file, iso);
});

test('RVZ: a Wii partition is re-hashed and re-encrypted (chunk with two exception lists)', async () => {
  const { file, iso } = wiiFixture(0x400000);
  await roundTrip(file, iso);
});

test('expandRvz ignores files that are not WIA/RVZ', async () => {
  const path = join(tempDataDir, 'not-an-image.rvz');
  writeFileSync(path, noise(4096, 31));
  assert.equal(await rvz.expandRvz(path), null);
});

test('expandRvz names the compression it cannot read', async () => {
  const { file } = gameCubeFixture(NONE);
  file.writeUInt32BE(4, 0x48 + 0x04); // claim LZMA2
  const path = join(tempDataDir, 'lzma2.rvz');
  writeFileSync(path, file);
  const result = await rvz.expandRvz(path);
  assert.match(result.error, /LZMA2/);
  assert.match(result.error, /Zstandard/);
});

test('isRvzPath covers both extensions and nothing else', () => {
  assert.equal(rvz.isRvzPath('C:/roms/Game.RVZ'), true);
  assert.equal(rvz.isRvzPath('/roms/Game.wia'), true);
  assert.equal(rvz.isRvzPath('/roms/Game.iso'), false);
  assert.equal(rvz.isRvzPath('/roms/Game.cso'), false);
});
