// CSO/ZSO (compressed ISO) support.
//
// RAHasher cannot open these — it reports "Could not open track" — so a .cso is
// expanded back into a plain .iso in the temp folder and *that* is handed to
// RAHasher. The expansion is lossless: a CSO is just an ISO cut into fixed-size
// blocks, each stored raw or compressed, plus a table of block offsets.
//
// Layout (little endian):
//   0  magic          "CISO" (deflate blocks) or "ZISO" (LZ4 blocks)
//   4  header size    0x18, though some writers leave it 0
//   8  total bytes    size of the original ISO (u64)
//   16 block size     usually 2048
//   20 version        1 or 2
//   21 index shift    block offsets are shifted left by this many bits
//   24 index table    (blocks + 1) u32 entries; bit 31 marks a stored block,
//                     the rest is the offset of the block's data
//
// A block's compressed length is the distance to the next entry, so the table is
// read once up front and the payload streamed in windows afterwards.
import { open, stat, unlink, statfs } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { join, basename, extname } from 'node:path';
import { inflateRawSync, inflateSync } from 'node:zlib';
import { config } from '../config.js';

// `.ciso` is ambiguous: PSP dumps use it for this format, GameCube/Wii for a
// different one. It is accepted here because the header check below rejects the
// GameCube layout, leaving those files to be hashed exactly as before.
export const CSO_EXTS = new Set(['.cso', '.zso', '.ciso']);

// Read/decompress window over the packed file. Big enough that a 2 KiB block
// never costs its own syscall, small enough to stay off the heap radar.
const WINDOW = 4 << 20;
const MAX_BLOCK_SIZE = 1 << 16;

export function isCsoPath(filePath) {
  return CSO_EXTS.has(extname(String(filePath)).toLowerCase());
}

// Parse the header + index table. Returns null when the file is not a PSP-style
// CSO/ZSO — notably GameCube/Wii ".ciso", which reuses the "CISO" magic for a
// completely different layout (a 32 KB byte map, no index table).
async function readCsoIndex(fh) {
  const head = Buffer.alloc(24);
  const { bytesRead } = await fh.read(head, 0, 24, 0);
  if (bytesRead < 24) return null;

  const magic = head.toString('latin1', 0, 4);
  if (magic !== 'CISO' && magic !== 'ZISO') return null;

  const totalBytes = Number(head.readBigUInt64LE(8));
  const blockSize = head.readUInt32LE(16);
  const version = head[20];
  const indexShift = head[21];

  // Guard against the GameCube ".ciso" layout and against nonsense values: a
  // real PSP CSO has a small power-of-two block size and version 1 or 2.
  const powerOfTwo = blockSize >= 512 && blockSize <= MAX_BLOCK_SIZE && (blockSize & (blockSize - 1)) === 0;
  if (!powerOfTwo || version < 1 || version > 2) return null;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return null;
  if (indexShift > 31) return null;

  const blocks = Math.ceil(totalBytes / blockSize);
  const table = Buffer.alloc((blocks + 1) * 4);
  const read = await fh.read(table, 0, table.length, 24);
  if (read.bytesRead < table.length) return null;

  return { magic, totalBytes, blockSize, version, indexShift, blocks, table };
}

// LZ4 block decompression (the raw block format, no frame header). Used by ZSO
// and by the LZ4 blocks a CSO v2 may contain.
export function lz4DecompressBlock(src, outLength) {
  const out = Buffer.allocUnsafe(outLength);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let litLen = token >> 4;
    if (litLen === 15) {
      let b;
      do { b = src[i++]; litLen += b; } while (b === 255 && i < src.length);
    }
    if (litLen > 0) {
      if (i + litLen > src.length || o + litLen > outLength) throw new Error('LZ4 literal run out of bounds');
      src.copy(out, o, i, i + litLen);
      i += litLen; o += litLen;
    }
    if (i >= src.length) break;             // last sequence is literals only
    const offset = src[i++] | (src[i++] << 8);
    if (offset === 0 || offset > o) throw new Error('LZ4 match offset out of bounds');
    let matchLen = token & 15;
    if (matchLen === 15) {
      let b;
      do { b = src[i++]; matchLen += b; } while (b === 255 && i < src.length);
    }
    matchLen += 4;
    if (o + matchLen > outLength) throw new Error('LZ4 match run out of bounds');
    let from = o - offset;
    for (let n = 0; n < matchLen; n++) out[o++] = out[from++];   // may overlap
  }
  if (o !== outLength) throw new Error(`LZ4 produced ${o} of ${outLength} bytes`);
  return out;
}

// Expand one block. The magic says which codec to expect, but a CSO v2 may mix
// deflate and LZ4 blocks, so the other codec is tried as a fallback. Decoding a
// block with the wrong codec does not silently succeed — it either throws or
// produces the wrong length, which is checked by the caller.
function decompressBlock(packed, blockSize, preferLz4) {
  const order = preferLz4 ? ['lz4', 'deflate'] : ['deflate', 'lz4'];
  let firstError = null;
  for (const codec of order) {
    try {
      if (codec === 'lz4') return lz4DecompressBlock(packed, blockSize);
      // CSO uses a headerless deflate stream; a few writers emit zlib instead.
      try { return inflateRawSync(packed); } catch { return inflateSync(packed); }
    } catch (e) {
      if (!firstError) firstError = e;
    }
  }
  throw firstError || new Error('block could not be decompressed');
}

// Is there room in temp for the expanded image (plus 15% headroom)?
async function tempHasRoom(bytes) {
  try {
    const fs = await statfs(config.tempDir);
    return fs.bavail * fs.bsize >= bytes * 1.15;
  } catch { return true; }
}

/**
 * Expand a .cso/.zso into a plain .iso in the temp folder.
 *
 * Returns { path, cleanup } on success, or { error } / null when the file is
 * not a CSO at all (caller then hashes the original as before).
 * `onProgress(done, total)` reports written bytes.
 */
export async function expandCso(filePath, { signal, onProgress } = {}) {
  const fh = await open(filePath, 'r');
  let index;
  try {
    index = await readCsoIndex(fh);
  } catch (e) {
    await fh.close();
    return { error: `Could not read the CSO header: ${String(e.message).slice(0, 160)}` };
  }
  if (!index) {
    await fh.close();
    return null;
  }

  const { magic, totalBytes, blockSize, indexShift, blocks, table } = index;
  if (!(await tempHasRoom(totalBytes))) {
    await fh.close();
    const gb = (totalBytes / 1024 ** 3).toFixed(1);
    return { error: `Not enough free space in the temp folder to expand this CSO (needs about ${gb} GB).` };
  }

  const packedSize = (await stat(filePath)).size;
  const preferLz4 = magic === 'ZISO';
  const dest = join(config.tempDir, `cso-${process.pid}-${Date.now()}-${basename(filePath, extname(filePath))}.iso`);
  const ws = createWriteStream(dest);
  const cleanup = async () => { try { await unlink(dest); } catch { /* best effort */ } };

  // Offsets of every block plus the end marker, so a block's packed length is
  // simply the distance to its successor.
  const offsetAt = (i) => (table.readUInt32LE(i * 4) & 0x7fffffff) * (1 << indexShift);
  const isStored = (i) => (table.readUInt32LE(i * 4) & 0x80000000) !== 0;

  let window = Buffer.alloc(0);
  let windowStart = 0;
  const ensure = async (start, end) => {
    if (start >= windowStart && end <= windowStart + window.length) return;
    const len = Math.min(Math.max(WINDOW, end - start), packedSize - start);
    const buf = Buffer.allocUnsafe(len);
    const { bytesRead } = await fh.read(buf, 0, len, start);
    window = buf.subarray(0, bytesRead);
    windowStart = start;
    if (end > windowStart + window.length) throw new Error('CSO block extends past the end of the file');
  };

  let written = 0;
  try {
    for (let i = 0; i < blocks; i++) {
      if (signal?.aborted) throw new Error('aborted');
      const start = offsetAt(i);
      const end = offsetAt(i + 1);
      if (end <= start || start >= packedSize) throw new Error(`CSO index entry ${i} is invalid`);

      await ensure(start, Math.min(end, packedSize));
      const packed = window.subarray(start - windowStart, Math.min(end, packedSize) - windowStart);

      // The final block is short whenever the ISO size is not a whole multiple.
      const wanted = Math.min(blockSize, totalBytes - written);
      let plain;
      if (isStored(i)) {
        plain = packed.subarray(0, wanted);
      } else {
        const out = decompressBlock(packed, blockSize, preferLz4);
        if (out.length < wanted) throw new Error(`CSO block ${i} decompressed to ${out.length} of ${wanted} bytes`);
        plain = out.subarray(0, wanted);
      }

      if (!ws.write(plain)) await once(ws, 'drain');
      written += plain.length;
      if ((i & 1023) === 0) onProgress?.(written, totalBytes);
    }
    ws.end();
    await once(ws, 'finish');
    onProgress?.(written, totalBytes);
    return { path: dest, cleanup, size: written };
  } catch (e) {
    ws.destroy();
    await cleanup();
    if (signal?.aborted) throw e;
    return { error: `Could not expand the CSO: ${String(e.message).slice(0, 160)}` };
  } finally {
    await fh.close();
  }
}
