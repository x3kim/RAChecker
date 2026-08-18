// WIA/RVZ (Dolphin's compressed GameCube/Wii disc images) support.
//
// RAHasher only understands raw disc images, so an .rvz/.wia is expanded back
// into a plain .iso in the temp folder and *that* is handed to RAHasher —
// exactly the trick cso.js plays for .cso/.zso. The expansion is lossless, so
// the hash is the one RAHasher would have produced for the original dump.
//
// The format (Dolphin's docs/WiaAndRvz.md; every integer is big-endian) stores
// the disc as fixed-size chunks called "groups":
//
//   0x00  wia_file_head_t   magic "WIA\1"/"RVZ\1", ISO size, offsets
//   0x48  wia_disc_t        disc type, compression, chunk size, the first 0x80
//                           bytes of the disc, and where the three tables live
//   ...   wia_part_t[]      one per Wii partition: title key + two data runs
//   ...   wia_raw_data_t[]  the parts of the disc that are stored verbatim
//   ...   wia_group_t[]     where each group's payload sits in the file
//
// Two things are *not* stored the way they appear on the disc and have to be
// reconstructed here:
//
//   - Wii partition data is kept decrypted and with its hash tree stripped, so
//     the H0/H1/H2 hashes are recomputed and the sectors re-encrypted with the
//     partition's title key (rebuildWiiGroup below).
//   - RVZ "packing" replaces the pseudo-random padding Nintendo's mastering
//     wrote across unused areas with a 68-byte seed for the lagged-Fibonacci
//     generator that produced it (decodeRvzPacking below).
//
// Everything is done one group at a time: a 4.7 GB Wii disc would not fit in a
// Buffer, let alone in memory.
import { open, stat, unlink, statfs } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { createHash, createCipheriv } from 'node:crypto';
import { zstdDecompressSync } from 'node:zlib';
import { config } from '../config.js';
import { bzip2Decompress } from './bzip2.js';
import { lzma1Decompress, lzma2Decompress } from './lzma.js';

export const RVZ_EXTS = new Set(['.rvz', '.wia']);

export function isRvzPath(filePath) {
  return RVZ_EXTS.has(extname(String(filePath)).toLowerCase());
}

const FILE_HEAD_SIZE = 0x48;
const DISC_SIZE = 0xdc;
const PART_ENTRY_SIZE = 0x30;
const RAW_DATA_ENTRY_SIZE = 0x18;

const DISC_TYPE_WII = 2;

const COMPRESSION = { NONE: 0, PURGE: 1, BZIP2: 2, LZMA: 3, LZMA2: 4, ZSTD: 5 };
const COMPRESSION_NAMES = ['none', 'Purge', 'bzip2', 'LZMA', 'LZMA2', 'Zstandard'];
const SUPPORTED_COMPRESSION = new Set(Object.values(COMPRESSION));

// Wii disc geometry. A sector is 0x8000 bytes on disc: a 0x400 hash block
// followed by 0x7c00 bytes of encrypted payload.
const SECTOR_SIZE = 0x8000;
const SECTOR_DATA_SIZE = 0x7c00;
const SECTOR_HASH_SIZE = 0x400;
const SECTORS_PER_SUBGROUP = 8;
const SUBGROUPS_PER_GROUP = 8;
const SECTORS_PER_GROUP = SECTORS_PER_SUBGROUP * SUBGROUPS_PER_GROUP; // 64
const WII_GROUP_SIZE = SECTORS_PER_GROUP * SECTOR_SIZE; // 0x200000

async function readExact(fh, size, position) {
  const buf = Buffer.alloc(size);
  let got = 0;
  while (got < size) {
    const { bytesRead } = await fh.read(buf, got, size - got, position + got);
    if (bytesRead === 0) throw new Error(`file ends at ${position + got}, wanted ${position + size}`);
    got += bytesRead;
  }
  return buf;
}

// Whole-stream codecs. PURGE is not one of these — it is a sparse-segment
// encoding applied to the group payload itself, decoded by decodePurge.
//
// `maxSize` is how much output the caller can possibly need. bzip2 and LZMA2 use
// it only to bound their allocation; raw LZMA1 needs it as the target length,
// because the format stores neither a length nor, in Dolphin's writer, an
// end-of-stream marker.
function decompressStream(method, input, comprData, maxSize) {
  switch (method) {
    case COMPRESSION.NONE: return input;
    case COMPRESSION.ZSTD: return zstdDecompressSync(input);
    case COMPRESSION.BZIP2: return bzip2Decompress(input, maxSize);
    case COMPRESSION.LZMA: return lzma1Decompress(input, comprData[0], maxSize);
    case COMPRESSION.LZMA2: return lzma2Decompress(input, maxSize);
    default:
      throw new Error(`compression method ${COMPRESSION_NAMES[method] ?? method} is not supported`);
  }
}

// PURGE (WIA only): a run of {offset, size, data} segments covering the parts of
// the group that are not zero, then a SHA-1 of everything before it.
function decodePurge(input, outputSize) {
  const out = Buffer.alloc(outputSize);
  let pos = 0;
  while (pos + 8 <= input.length - 20) {
    const offset = input.readUInt32BE(pos);
    const size = input.readUInt32BE(pos + 4);
    pos += 8;
    if (size === 0) continue;
    if (offset + size > outputSize || pos + size > input.length) throw new Error('Purge segment out of range');
    input.copy(out, offset, pos, pos + size);
    pos += size;
  }
  return out;
}

// The lagged Fibonacci generator (f = xor, j = 32, k = 521) that produced the
// padding Nintendo's disc mastering wrote into unused areas. RVZ throws that
// padding away and keeps only the 68-byte seed, so it has to be replayed here.
const LFG_WORDS = 521;
const LFG_LAG = 32;
const LFG_SEED_WORDS = 17;
// Bits 16-17 of each word never reach the output and bits 24-25 appear twice —
// a quirk of the original generator that has to be reproduced exactly.
const LFG_BYTE_SHIFTS = [24, 18, 8, 0];

class JunkGenerator {
  constructor(seed) {
    this.buffer = new Uint32Array(LFG_WORDS);
    for (let i = 0; i < LFG_SEED_WORDS; i++) this.buffer[i] = seed.readUInt32BE(i * 4);
    for (let i = LFG_SEED_WORDS; i < LFG_WORDS; i++) {
      this.buffer[i] =
        (((this.buffer[i - 17] << 23) >>> 0) ^ (this.buffer[i - 16] >>> 9) ^ this.buffer[i - 1]) >>> 0;
    }
    this.position = 0;
    for (let i = 0; i < 4; i++) this.advance(); // the generator always runs four rounds first
  }

  advance() {
    const buf = this.buffer;
    for (let i = 0; i < LFG_LAG; i++) buf[i] = (buf[i] ^ buf[i + LFG_WORDS - LFG_LAG]) >>> 0;
    for (let i = LFG_LAG; i < LFG_WORDS; i++) buf[i] = (buf[i] ^ buf[i - LFG_LAG]) >>> 0;
  }

  nextByte() {
    const byte = (this.buffer[this.position >>> 2] >>> LFG_BYTE_SHIFTS[this.position & 3]) & 0xff;
    this.position++;
    if (this.position === LFG_WORDS * 4) {
      this.advance();
      this.position = 0;
    }
    return byte;
  }

  // Fill `out[start..start+size)` with the next `size` bytes of padding.
  fill(out, start, size) {
    for (let i = 0; i < size; i++) out[start + i] = this.nextByte();
  }

  skip(count) {
    for (let i = 0; i < count; i++) this.nextByte();
  }
}

// A seed describes the padding from the start of its 0x8000-byte sector, so a
// run starting mid-sector has to throw away the bytes before it.
function junkGeneratorAt(seed, discOffset) {
  const gen = new JunkGenerator(seed);
  const misalignment = discOffset % SECTOR_SIZE;
  if (misalignment !== 0) gen.skip(misalignment);
  return gen;
}

// RVZ packing: a stream of [u32 size, msb = "this is padding"] headers, each
// followed either by `size` literal bytes or by a 68-byte generator seed.
function decodeRvzPacking(input, outputSize, baseDiscOffset) {
  const out = Buffer.alloc(outputSize);
  let inPos = 0;
  let outPos = 0;
  while (outPos < outputSize) {
    if (inPos + 4 > input.length) throw new Error('RVZ packing stream ended early');
    const header = input.readUInt32BE(inPos);
    inPos += 4;
    const isJunk = (header & 0x80000000) !== 0;
    const size = header & 0x7fffffff;
    if (size === 0 || outPos + size > outputSize) throw new Error('RVZ packing run out of range');
    if (isJunk) {
      junkGeneratorAt(input.subarray(inPos, inPos + 68), baseDiscOffset + outPos).fill(out, outPos, size);
      inPos += 68;
    } else {
      input.copy(out, outPos, inPos, inPos + size);
      inPos += size;
    }
    outPos += size;
  }
  return out;
}

function sha1(buf) {
  return createHash('sha1').update(buf).digest();
}

// Rebuild one 64-sector Wii group: recompute the hash tree over the decrypted
// payload, apply the recorded exceptions, then encrypt sectors and hash blocks
// with the partition's title key.
//
// `data` always holds a full group (short groups are zero-padded) because the
// H1/H2 hashes of a trailing partial group still cover all 64 nominal sectors,
// exactly as a real disc does. Only `sectorCount` sectors are written out.
//
// Hash block layout, per 0x400-byte block:
//   0x000  H0: SHA-1 of each of the sector's 31 0x400-byte data blocks
//   0x280  H1: SHA-1 of every H0 array in the 8-sector subgroup
//   0x340  H2: SHA-1 of every H1 array in the 64-sector group
const H0_COUNT = 31;
const H0_SIZE = H0_COUNT * 20; // 0x26c
const H1_OFFSET = 0x280;
const H1_SIZE = SECTORS_PER_SUBGROUP * 20; // 0xa0
const H2_OFFSET = 0x340;

function rebuildWiiGroup(data, sectorCount, titleKey, exceptions) {
  const hashBlocks = [];
  for (let s = 0; s < SECTORS_PER_GROUP; s++) {
    const block = Buffer.alloc(SECTOR_HASH_SIZE);
    const sector = data.subarray(s * SECTOR_DATA_SIZE, (s + 1) * SECTOR_DATA_SIZE);
    for (let i = 0; i < H0_COUNT; i++) {
      sha1(sector.subarray(i * 0x400, (i + 1) * 0x400)).copy(block, i * 20);
    }
    hashBlocks.push(block);
  }

  for (let sub = 0; sub < SUBGROUPS_PER_GROUP; sub++) {
    const base = sub * SECTORS_PER_SUBGROUP;
    const h1 = Buffer.alloc(H1_SIZE);
    for (let i = 0; i < SECTORS_PER_SUBGROUP; i++) {
      sha1(hashBlocks[base + i].subarray(0, H0_SIZE)).copy(h1, i * 20);
    }
    for (let i = 0; i < SECTORS_PER_SUBGROUP; i++) h1.copy(hashBlocks[base + i], H1_OFFSET);
  }

  const h2 = Buffer.alloc(SUBGROUPS_PER_GROUP * 20);
  for (let sub = 0; sub < SUBGROUPS_PER_GROUP; sub++) {
    const h1 = hashBlocks[sub * SECTORS_PER_SUBGROUP].subarray(H1_OFFSET, H1_OFFSET + H1_SIZE);
    sha1(h1).copy(h2, sub * 20);
  }
  for (let s = 0; s < SECTORS_PER_GROUP; s++) h2.copy(hashBlocks[s], H2_OFFSET);

  // Sectors whose real hash block differs from what the tree computes (the disc
  // is signed over these, so a mismatch has to be preserved verbatim).
  for (const ex of exceptions) {
    if (ex.sector < SECTORS_PER_GROUP) ex.hash.copy(hashBlocks[ex.sector], ex.offset);
  }

  const out = Buffer.alloc(sectorCount * SECTOR_SIZE);
  const zeroIv = Buffer.alloc(16);
  for (let s = 0; s < sectorCount; s++) {
    const hashCipher = createCipheriv('aes-128-cbc', titleKey, zeroIv).setAutoPadding(false);
    const encryptedHash = Buffer.concat([hashCipher.update(hashBlocks[s]), hashCipher.final()]);
    // The payload's IV is the last 16 bytes of the encrypted hash block.
    const dataIv = encryptedHash.subarray(0x3d0, 0x3e0);
    const dataCipher = createCipheriv('aes-128-cbc', titleKey, dataIv).setAutoPadding(false);
    const payload = data.subarray(s * SECTOR_DATA_SIZE, (s + 1) * SECTOR_DATA_SIZE);
    const encryptedData = Buffer.concat([dataCipher.update(payload), dataCipher.final()]);
    encryptedHash.copy(out, s * SECTOR_SIZE);
    encryptedData.copy(out, s * SECTOR_SIZE + SECTOR_HASH_SIZE);
  }
  return out;
}

// Parse the file header, the disc header and the three tables. Returns null when
// the file is not a WIA/RVZ at all, so the caller can hash it as before.
async function readRvzHeader(fh) {
  const head = await readExact(fh, FILE_HEAD_SIZE, 0);
  const magic = head.toString('latin1', 0, 4);
  if (magic !== 'WIA\x01' && magic !== 'RVZ\x01') return null;

  const isRvz = magic === 'RVZ\x01';
  const isoSize = Number(head.readBigUInt64BE(0x24));
  const discFieldSize = head.readUInt32BE(0x0c);

  // wia_disc_t may be shorter than we know about in an older file; pad it out so
  // the field offsets below stay valid.
  const disc = Buffer.alloc(DISC_SIZE);
  (await readExact(fh, Math.min(Math.max(discFieldSize, 1), DISC_SIZE), FILE_HEAD_SIZE)).copy(disc);

  const ctx = {
    isRvz,
    isoSize,
    discType: disc.readUInt32BE(0x00),
    compression: disc.readUInt32BE(0x04),
    chunkSize: disc.readUInt32BE(0x0c),
    discHead: Buffer.from(disc.subarray(0x10, 0x90)),
    // Codec parameters: the LZMA properties byte and dictionary size for LZMA,
    // the dictionary size property for LZMA2, unused by the others.
    comprData: Buffer.from(disc.subarray(0xd5, 0xdc)),
    groupEntrySize: isRvz ? 12 : 8,
  };

  if (!Number.isSafeInteger(isoSize) || isoSize <= 0) throw new Error('implausible ISO size');
  // WIA chunks are multiples of 2 MiB, RVZ chunks a power of two of at least
  // 32 KiB. Both must divide into whole sectors for the partition maths below.
  const { chunkSize } = ctx;
  const chunkOk = isRvz
    ? chunkSize >= SECTOR_SIZE && chunkSize <= (64 << 20) && (chunkSize & (chunkSize - 1)) === 0
    : chunkSize > 0 && chunkSize % WII_GROUP_SIZE === 0;
  if (!chunkOk) throw new Error(`implausible chunk size ${chunkSize}`);

  const numParts = disc.readUInt32BE(0x90);
  const partEntrySize = disc.readUInt32BE(0x94) || PART_ENTRY_SIZE;
  const partOffset = Number(disc.readBigUInt64BE(0x98));
  const numRawData = disc.readUInt32BE(0xb4);
  const rawDataOffset = Number(disc.readBigUInt64BE(0xb8));
  const rawDataSize = disc.readUInt32BE(0xc0);
  const numGroups = disc.readUInt32BE(0xc4);
  const groupOffset = Number(disc.readBigUInt64BE(0xc8));
  const groupSize = disc.readUInt32BE(0xd0);

  if (!SUPPORTED_COMPRESSION.has(ctx.compression)) {
    const err = new Error(
      `this image uses compression type ${ctx.compression}, which RAChecker does not know. ` +
      'It is newer than the documented WIA/RVZ format — please report the file'
    );
    err.unsupportedCompression = true;
    throw err;
  }

  // The partition table is stored uncompressed; the other two are compressed
  // with the disc's own compression method.
  ctx.parts = [];
  if (numParts > 0) {
    const buf = await readExact(fh, numParts * partEntrySize, partOffset);
    for (let i = 0; i < numParts; i++) {
      const entry = Buffer.alloc(PART_ENTRY_SIZE);
      buf.copy(entry, 0, i * partEntrySize, i * partEntrySize + Math.min(partEntrySize, PART_ENTRY_SIZE));
      const runs = [];
      for (let r = 0; r < 2; r++) {
        const o = 16 + r * 16;
        runs.push({
          firstSector: entry.readUInt32BE(o),
          numSectors: entry.readUInt32BE(o + 4),
          groupIndex: entry.readUInt32BE(o + 8),
          numGroups: entry.readUInt32BE(o + 12),
        });
      }
      ctx.parts.push({ key: Buffer.from(entry.subarray(0, 16)), runs });
    }
  }

  const readTable = async (offset, packedSize, expected) => {
    const raw = await readExact(fh, packedSize, offset);
    const table = decompressStream(ctx.compression, raw, ctx.comprData, expected);
    if (table.length < expected) throw new Error('a table decompressed to fewer bytes than it declares');
    return table;
  };

  ctx.rawData = [];
  if (numRawData > 0) {
    const table = await readTable(rawDataOffset, rawDataSize, numRawData * RAW_DATA_ENTRY_SIZE);
    for (let i = 0; i < numRawData; i++) {
      const o = i * RAW_DATA_ENTRY_SIZE;
      ctx.rawData.push({
        offset: Number(table.readBigUInt64BE(o)),
        size: Number(table.readBigUInt64BE(o + 8)),
        groupIndex: table.readUInt32BE(o + 16),
        numGroups: table.readUInt32BE(o + 20),
      });
    }
  }

  ctx.groups = [];
  if (numGroups > 0) {
    const table = await readTable(groupOffset, groupSize, numGroups * ctx.groupEntrySize);
    for (let i = 0; i < numGroups; i++) {
      const o = i * ctx.groupEntrySize;
      ctx.groups.push({
        dataOffset: table.readUInt32BE(o) * 4,
        dataSize: table.readUInt32BE(o + 4),
        packedSize: ctx.groupEntrySize >= 12 ? table.readUInt32BE(o + 8) : 0,
      });
    }
  }

  return ctx;
}

// Decode one group into `logicalSize` plain bytes. `exceptionLists` is 0 for raw
// data and >= 1 for Wii partition data, where each list prefixes the payload.
async function decodeGroup(ctx, fh, index, { logicalSize, exceptionLists, baseDiscOffset, firstSector }) {
  const group = ctx.groups[index];
  if (!group) throw new Error(`group ${index} is past the end of the group table`);

  const compressed = ctx.isRvz ? (group.dataSize & 0x80000000) !== 0 : ctx.compression !== COMPRESSION.NONE;
  const storedSize = ctx.isRvz ? group.dataSize & 0x7fffffff : group.dataSize;
  // A group with no stored data is a run of zeroes.
  if (storedSize === 0) return { payload: Buffer.alloc(logicalSize), exceptions: [] };

  const method = compressed ? ctx.compression : COMPRESSION.NONE;
  const raw = await readExact(fh, storedSize, group.dataOffset);
  // How much this group can possibly decompress to. The payload's size is known
  // up front; the exception lists in front of it are not, so they are bounded —
  // a sector's 0x400-byte hash block holds at most 47 hashes (31 H0, 8 H1, 8 H2)
  // and one list covers at most a 64-sector group.
  const payloadSize = group.packedSize > 0 ? group.packedSize : logicalSize;
  const maxSize = payloadSize + (exceptionLists > 0
    ? exceptionLists * (2 + SECTORS_PER_GROUP * 47 * 22) + 4
    : 0);
  // Purge is applied to the payload only, so its exception lists sit in front of
  // the still-encoded data rather than inside a decompressed stream.
  const stream = method === COMPRESSION.PURGE
    ? raw
    : decompressStream(method, raw, ctx.comprData, maxSize);

  let pos = 0;
  const exceptions = [];
  if (exceptionLists > 0) {
    // A chunk carries one list per 2 MiB of disc "even for a wia_group_t which
    // contains less data than normal due to it being at the end of a partition",
    // so a list always covers 64 sectors — or the whole chunk when the chunk is
    // smaller than that. Deriving it from `logicalSize` would misplace every
    // exception in the last, short chunk of a run.
    const sectorsPerList = Math.min(SECTORS_PER_GROUP, ctx.chunkSize / SECTOR_SIZE);
    for (let i = 0; i < exceptionLists; i++) {
      const count = stream.readUInt16BE(pos);
      pos += 2;
      for (let j = 0; j < count; j++) {
        const offset = stream.readUInt16BE(pos);
        pos += 2;
        const hash = Buffer.from(stream.subarray(pos, pos + 20));
        pos += 20;
        // `offset` counts bytes through this list's hash blocks back to back.
        const within = i * sectorsPerList * SECTOR_HASH_SIZE + offset;
        exceptions.push({
          sector: firstSector + Math.floor(within / SECTOR_HASH_SIZE),
          offset: within % SECTOR_HASH_SIZE,
          hash,
        });
      }
    }
    // NONE and PURGE pad the lists out to a 4-byte boundary; the real codecs do not.
    if (method === COMPRESSION.NONE || method === COMPRESSION.PURGE) pos = (pos + 3) & ~3;
  }

  const body = stream.subarray(pos);
  let payload;
  if (group.packedSize > 0) {
    payload = decodeRvzPacking(body.subarray(0, group.packedSize), logicalSize, baseDiscOffset);
  } else if (method === COMPRESSION.PURGE) {
    payload = decodePurge(body, logicalSize);
  } else {
    if (body.length < logicalSize) {
      throw new Error(`group ${index} decoded to ${body.length} of ${logicalSize} bytes`);
    }
    payload = body.subarray(0, logicalSize);
  }
  return { payload, exceptions };
}

// Write out one wia_raw_data_t run — the parts of the disc that are stored as
// they appear, i.e. all of a GameCube disc and everything outside the partitions
// on a Wii one.
async function expandRawRun(ctx, fh, out, run, onWritten, signal) {
  if (run.size === 0) return;
  // The groups of a run start at the 0x8000 boundary below its offset, so the
  // first group of the very first run (offset 0x80) really starts at 0 and its
  // leading 0x80 bytes — which live in wia_disc_t instead — are dropped here.
  const gridStart = run.offset - (run.offset % SECTOR_SIZE);
  const total = run.size + (run.offset - gridStart);
  let produced = 0;
  for (let g = 0; g < run.numGroups && produced < total; g++) {
    if (signal?.aborted) throw new Error('aborted');
    const logicalSize = Math.min(ctx.chunkSize, total - produced);
    const chunkStart = gridStart + produced;
    const { payload } = await decodeGroup(ctx, fh, run.groupIndex + g, {
      logicalSize,
      exceptionLists: 0,
      baseDiscOffset: chunkStart,
    });
    const from = Math.max(run.offset, chunkStart);
    const to = Math.min(run.offset + run.size, chunkStart + logicalSize);
    if (to > from) {
      await out.write(payload, from - chunkStart, to - from, from);
      onWritten(to - from);
    }
    produced += logicalSize;
  }
}

// Write out one run of Wii partition data, 64 sectors at a time.
async function expandPartitionRun(ctx, fh, out, key, run, onWritten, signal) {
  if (run.numSectors === 0) return;
  // Always chunk_size / 0x200000 lists, except that RVZ chunks smaller than a
  // 64-sector group carry a single list.
  const exceptionLists = ctx.chunkSize % WII_GROUP_SIZE === 0 ? ctx.chunkSize / WII_GROUP_SIZE : 1;
  // A chunk covers chunk_size bytes *of disc*, which is less once the hash
  // blocks that RVZ does not store are taken out.
  const chunkLogicalSize = (ctx.chunkSize / SECTOR_SIZE) * SECTOR_DATA_SIZE;
  const totalLogicalSize = run.numSectors * SECTOR_DATA_SIZE;
  const runStart = run.firstSector * SECTOR_SIZE;

  const window = Buffer.alloc(SECTORS_PER_GROUP * SECTOR_DATA_SIZE);
  let windowFirstSector = 0;
  let windowSectors = 0;
  let windowExceptions = [];

  const flush = async () => {
    if (windowSectors === 0) return;
    window.fill(0, windowSectors * SECTOR_DATA_SIZE);
    const encrypted = rebuildWiiGroup(window, windowSectors, key, windowExceptions);
    await out.write(encrypted, 0, encrypted.length, runStart + windowFirstSector * SECTOR_SIZE);
    onWritten(encrypted.length);
    windowFirstSector += windowSectors;
    windowSectors = 0;
    windowExceptions = [];
  };

  let produced = 0;
  for (let g = 0; g < run.numGroups && produced < totalLogicalSize; g++) {
    if (signal?.aborted) throw new Error('aborted');
    const logicalSize = Math.min(chunkLogicalSize, totalLogicalSize - produced);
    const chunkFirstSector = produced / SECTOR_DATA_SIZE;
    const { payload, exceptions } = await decodeGroup(ctx, fh, run.groupIndex + g, {
      logicalSize,
      exceptionLists,
      baseDiscOffset: runStart + produced,
      firstSector: chunkFirstSector,
    });

    let taken = 0;
    while (taken < logicalSize) {
      const room = (SECTORS_PER_GROUP - windowSectors) * SECTOR_DATA_SIZE;
      const take = Math.min(room, logicalSize - taken);
      payload.copy(window, windowSectors * SECTOR_DATA_SIZE, taken, taken + take);
      const sectorBase = chunkFirstSector + taken / SECTOR_DATA_SIZE;
      for (const ex of exceptions) {
        if (ex.sector >= sectorBase && ex.sector < sectorBase + take / SECTOR_DATA_SIZE) {
          windowExceptions.push({ ...ex, sector: ex.sector - sectorBase + windowSectors });
        }
      }
      windowSectors += take / SECTOR_DATA_SIZE;
      taken += take;
      if (windowSectors === SECTORS_PER_GROUP) await flush();
    }
    produced += logicalSize;
  }
  await flush();
}

// Is there room in temp for the expanded image (plus 15% headroom)?
async function tempHasRoom(bytes) {
  try {
    const fs = await statfs(config.tempDir);
    return fs.bavail * fs.bsize >= bytes * 1.15;
  } catch { return true; }
}

/**
 * Expand an .rvz/.wia into a plain .iso in the temp folder.
 *
 * Returns { path, cleanup, size } on success, { error } when the image cannot be
 * read, or null when the file is not a WIA/RVZ at all (the caller then hashes
 * the original as before). `onProgress(done, total)` reports written bytes.
 */
export async function expandRvz(filePath, { signal, onProgress } = {}) {
  const fh = await open(filePath, 'r');
  let ctx;
  try {
    ctx = await readRvzHeader(fh);
  } catch (e) {
    await fh.close();
    const what = e.unsupportedCompression ? '' : 'Could not read the RVZ/WIA header: ';
    return { error: `${what}${String(e.message).slice(0, 200)}` };
  }
  if (!ctx) {
    await fh.close();
    return null;
  }
  if (!(await tempHasRoom(ctx.isoSize))) {
    await fh.close();
    const gb = (ctx.isoSize / 1024 ** 3).toFixed(1);
    return { error: `Not enough free space in the temp folder to expand this image (needs about ${gb} GB).` };
  }

  const dest = join(config.tempDir, `rvz-${process.pid}-${Date.now()}-${basename(filePath, extname(filePath))}.iso`);
  const cleanup = async () => { try { await unlink(dest); } catch { /* best effort */ } };
  const out = await open(dest, 'w');

  let written = 0;
  let lastReport = 0;
  const onWritten = (n) => {
    written += n;
    if (written - lastReport >= 16 << 20) {
      lastReport = written;
      onProgress?.(written, ctx.isoSize);
    }
  };

  try {
    // Reserve the full size up front: the runs below are written at their own
    // offsets and anything they do not cover stays zero, as on the real disc.
    await out.truncate(ctx.isoSize);
    // The first 0x80 bytes live in wia_disc_t, not in any group.
    await out.write(ctx.discHead, 0, 0x80, 0);

    for (const run of ctx.rawData) await expandRawRun(ctx, fh, out, run, onWritten, signal);

    if (ctx.discType === DISC_TYPE_WII) {
      for (const part of ctx.parts) {
        for (const run of part.runs) {
          await expandPartitionRun(ctx, fh, out, part.key, run, onWritten, signal);
        }
      }
    }

    onProgress?.(ctx.isoSize, ctx.isoSize);
    const size = (await stat(dest)).size;
    return { path: dest, cleanup, size };
  } catch (e) {
    await cleanup();
    if (signal?.aborted) throw e;
    return { error: `Could not expand the RVZ/WIA: ${String(e.message).slice(0, 200)}` };
  } finally {
    await out.close();
    await fh.close();
  }
}
