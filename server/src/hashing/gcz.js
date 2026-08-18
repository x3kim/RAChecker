// GCZ (Dolphin's older compressed GameCube/Wii image) support.
//
// RAHasher cannot open one — it reads the GCZ header as if it were the disc and
// reports "Not a Gamecube disc" — so a .gcz is expanded back into a plain .iso in
// the temp folder, the same as .cso and .rvz.
//
// The format is a plain block container, simpler than either of those: the image
// is cut into fixed-size blocks, each deflated or stored, with a table of where
// each one starts.
//
//   0x00  u32  magic          0xB10BC001
//   0x04  u32  sub_type
//   0x08  u64  compressed size of the data area
//   0x10  u64  size of the original image
//   0x18  u32  block size
//   0x1c  u32  block count
//   0x20  u64  offset per block, relative to the data area; bit 63 = stored raw
//   ...   u32  Adler-32 per block, over the bytes as stored
//   ...        the data area
//
// Everything is little endian, which is the one thing it does not share with
// WIA/RVZ.
import { open, stat, unlink, statfs } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { join, basename, extname } from 'node:path';
import { inflateSync } from 'node:zlib';
import { config } from '../config.js';

const GCZ_MAGIC = 0xb10bc001;
const HEADER_SIZE = 0x20;
const MAX_BLOCK_SIZE = 16 << 20;
const STORED_FLAG = 1n << 63n;

export function isGczPath(filePath) {
  return extname(String(filePath)).toLowerCase() === '.gcz';
}

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

// Parse the header and the block table. Returns null when the file is not a GCZ,
// so the caller can hash it exactly as before.
async function readGczIndex(fh, fileSize) {
  const head = Buffer.alloc(HEADER_SIZE);
  const { bytesRead } = await fh.read(head, 0, HEADER_SIZE, 0);
  if (bytesRead < HEADER_SIZE) return null;
  if (head.readUInt32LE(0) !== GCZ_MAGIC) return null;

  const dataSize = Number(head.readBigUInt64LE(0x10));
  const blockSize = head.readUInt32LE(0x18);
  const blocks = head.readUInt32LE(0x1c);

  if (!Number.isSafeInteger(dataSize) || dataSize <= 0) throw new Error('implausible image size');
  if (blockSize < 512 || blockSize > MAX_BLOCK_SIZE) throw new Error(`implausible block size ${blockSize}`);
  if (blocks !== Math.ceil(dataSize / blockSize)) throw new Error('block count does not match the image size');

  const offsets = await readExact(fh, blocks * 8, HEADER_SIZE);
  const dataStart = HEADER_SIZE + blocks * 8 + blocks * 4;
  if (dataStart > fileSize) throw new Error('the block table runs past the end of the file');

  return { dataSize, blockSize, blocks, offsets, dataStart };
}

// Is there room in temp for the expanded image (plus 15% headroom)?
async function tempHasRoom(bytes) {
  try {
    const fs = await statfs(config.tempDir);
    return fs.bavail * fs.bsize >= bytes * 1.15;
  } catch { return true; }
}

/**
 * Expand a .gcz into a plain .iso in the temp folder.
 *
 * Returns { path, cleanup, size } on success, { error } when it cannot be read,
 * or null when the file is not a GCZ at all. `onProgress(done, total)` reports
 * written bytes.
 */
export async function expandGcz(filePath, { signal, onProgress } = {}) {
  const fh = await open(filePath, 'r');
  const fileSize = (await stat(filePath)).size;
  let index;
  try {
    index = await readGczIndex(fh, fileSize);
  } catch (e) {
    await fh.close();
    return { error: `Could not read the GCZ header: ${String(e.message).slice(0, 160)}` };
  }
  if (!index) {
    await fh.close();
    return null;
  }

  const { dataSize, blockSize, blocks, offsets, dataStart } = index;
  if (!(await tempHasRoom(dataSize))) {
    await fh.close();
    const gb = (dataSize / 1024 ** 3).toFixed(1);
    return { error: `Not enough free space in the temp folder to expand this GCZ (needs about ${gb} GB).` };
  }

  const dest = join(config.tempDir, `gcz-${process.pid}-${Date.now()}-${basename(filePath, extname(filePath))}.iso`);
  const cleanup = async () => { try { await unlink(dest); } catch { /* best effort */ } };
  const ws = createWriteStream(dest);

  // A block's stored length is the distance to the next one; the last one runs to
  // the end of the file.
  const rawOffset = (i) => offsets.readBigUInt64LE(i * 8);
  const startOf = (i) => Number(rawOffset(i) & ~STORED_FLAG) + dataStart;
  const isStored = (i) => (rawOffset(i) & STORED_FLAG) !== 0n;

  let written = 0;
  try {
    for (let i = 0; i < blocks; i++) {
      if (signal?.aborted) throw new Error('aborted');
      const start = startOf(i);
      const end = i + 1 < blocks ? startOf(i + 1) : fileSize;
      if (end <= start || end > fileSize) throw new Error(`block ${i} has an invalid offset`);

      const packed = await readExact(fh, end - start, start);
      const wanted = Math.min(blockSize, dataSize - written);
      let plain;
      if (isStored(i)) {
        plain = packed.subarray(0, wanted);
      } else {
        const out = inflateSync(packed);
        if (out.length < wanted) throw new Error(`block ${i} inflated to ${out.length} of ${wanted} bytes`);
        plain = out.subarray(0, wanted);
      }

      if (!ws.write(plain)) await once(ws, 'drain');
      written += plain.length;
      if ((i & 63) === 0) onProgress?.(written, dataSize);
    }
    ws.end();
    await once(ws, 'finish');
    onProgress?.(written, dataSize);
    return { path: dest, cleanup, size: written };
  } catch (e) {
    ws.destroy();
    await cleanup();
    if (signal?.aborted) throw e;
    return { error: `Could not expand the GCZ: ${String(e.message).slice(0, 160)}` };
  } finally {
    await fh.close();
  }
}
