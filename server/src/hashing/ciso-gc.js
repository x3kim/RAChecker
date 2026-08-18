// GameCube/Wii CISO support.
//
// `.ciso` names two unrelated formats. PSP dumps use it for the block-index
// layout cso.js reads; GameCube and Wii backup tools use it for this one, which
// shares only the magic word. cso.js rejects anything that is not a PSP CSO, so
// a file that falls through to here is either this format or not a CISO at all.
//
// RAHasher cannot open one — it reads the CISO header as if it were the disc and
// reports "Not a Gamecube disc" — so it is turned back into a plain .iso, like
// .rvz, .gcz and .wbfs.
//
// The layout is the simplest of the lot: a fixed 0x8000-byte header holding the
// magic, the block size and one byte per block saying whether that block was
// stored, then the stored blocks back to back. Blocks that were dropped were all
// zeroes, and come back as zeroes.
//
//   0x0000  char  magic "CISO"
//   0x0004  u32   block size, little endian (2 MiB is usual)
//   0x0008  u8    presence map, one byte per block, non-zero = stored
//   0x8000        the stored blocks, in order
import { open, stat, unlink, statfs } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { config } from '../config.js';

const HEADER_SIZE = 0x8000;
const MAP_OFFSET = 8;
const MAP_ENTRIES = HEADER_SIZE - MAP_OFFSET;
const MAX_BLOCK_SIZE = 64 << 20;
const COPY_CHUNK = 4 << 20;

// The sizes a finished dump has, so a stored region that stops short of the end
// of the disc is padded rather than truncated.
const GAMECUBE_SIZE = 1459978240;
const WII_SINGLE_LAYER_SIZE = 143432 * 0x8000;
const WII_DUAL_LAYER_SIZE = 259740 * 0x8000;

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

// Parse the header. Returns null when the file is not a GameCube/Wii CISO.
async function readCisoIndex(fh, fileSize) {
  const head = Buffer.alloc(HEADER_SIZE);
  const { bytesRead } = await fh.read(head, 0, HEADER_SIZE, 0);
  if (bytesRead < HEADER_SIZE) return null;
  if (head.toString('latin1', 0, 4) !== 'CISO') return null;

  // A block size outside what this format uses means the file is something else
  // wearing the same magic — a malformed PSP CSO, most likely. Returning null
  // leaves it to be hashed exactly as it was before, rather than failing it.
  const blockSize = head.readUInt32LE(4);
  if (blockSize < 0x8000 || blockSize > MAX_BLOCK_SIZE || (blockSize & (blockSize - 1)) !== 0) return null;
  // The first block is always stored: it holds the disc header.
  if (head[MAP_OFFSET] === 0) throw new Error('the first block is missing');

  let stored = 0;
  let lastStored = -1;
  for (let i = 0; i < MAP_ENTRIES; i++) {
    if (head[MAP_OFFSET + i] === 0) continue;
    stored++;
    lastStored = i;
  }
  if (HEADER_SIZE + stored * blockSize > fileSize) {
    throw new Error('the presence map claims more blocks than the file holds');
  }

  return { head, blockSize, lastStored };
}

// Is there room in temp for the expanded image (plus 15% headroom)?
async function tempHasRoom(bytes) {
  try {
    const fs = await statfs(config.tempDir);
    return fs.bavail * fs.bsize >= bytes * 1.15;
  } catch { return true; }
}

/**
 * Expand a GameCube/Wii `.ciso` into a plain `.iso` in the temp folder.
 *
 * Returns { path, cleanup, size } on success, { error } when it cannot be read,
 * or null when the file is not this format. `onProgress(done, total)` reports
 * written bytes.
 */
export async function expandGameCubeCiso(filePath, { signal, onProgress } = {}) {
  const fh = await open(filePath, 'r');
  const fileSize = (await stat(filePath)).size;
  let index;
  try {
    index = await readCisoIndex(fh, fileSize);
  } catch (e) {
    await fh.close();
    return { error: `Could not read the CISO header: ${String(e.message).slice(0, 160)}` };
  }
  if (!index) {
    await fh.close();
    return null;
  }

  const { head, blockSize, lastStored } = index;
  const covered = (lastStored + 1) * blockSize;

  // A dump that ends before the disc does was scrubbed, not truncated: the rest
  // was zeroes. Grow the image to the disc's real size so a hash rule reading
  // near the end finds zeroes rather than the end of the file. Which size that
  // is comes from the disc header, which sits in the first block.
  const first = await readExact(fh, 0x20, HEADER_SIZE);
  let standard = 0;
  if (first.readUInt32BE(0x1c) === 0xc2339f3d) standard = GAMECUBE_SIZE;
  else if (first.readUInt32BE(0x18) === 0x5d1c9ea3) {
    standard = covered <= WII_SINGLE_LAYER_SIZE ? WII_SINGLE_LAYER_SIZE : WII_DUAL_LAYER_SIZE;
  }
  const isoSize = standard > covered ? standard : covered;

  if (!(await tempHasRoom(isoSize))) {
    await fh.close();
    const gb = (isoSize / 1024 ** 3).toFixed(1);
    return { error: `Not enough free space in the temp folder to expand this CISO (needs about ${gb} GB).` };
  }

  const dest = join(config.tempDir, `ciso-${process.pid}-${Date.now()}-${basename(filePath, extname(filePath))}.iso`);
  const cleanup = async () => { try { await unlink(dest); } catch { /* best effort */ } };
  const out = await open(dest, 'w');

  let written = 0;
  let lastReport = 0;
  const buf = Buffer.allocUnsafe(COPY_CHUNK);
  try {
    // Blocks the dump dropped stay zero, which is what truncate leaves behind.
    await out.truncate(isoSize);

    let source = HEADER_SIZE;
    for (let i = 0; i <= lastStored; i++) {
      if (signal?.aborted) throw new Error('aborted');
      if (head[MAP_OFFSET + i] === 0) continue;

      const to = i * blockSize;
      // The final block is short when the disc size is not a whole multiple, and
      // the file itself may stop inside it.
      const length = Math.min(blockSize, isoSize - to, fileSize - source);
      if (length <= 0) break;

      for (let done = 0; done < length; done += COPY_CHUNK) {
        const size = Math.min(COPY_CHUNK, length - done);
        await fh.read(buf, 0, size, source + done);
        await out.write(buf, 0, size, to + done);
      }
      source += blockSize;
      written += length;
      if (written - lastReport >= 64 << 20) {
        lastReport = written;
        onProgress?.(written, covered);
      }
    }
    onProgress?.(covered, covered);
    return { path: dest, cleanup, size: isoSize };
  } catch (e) {
    await cleanup();
    if (signal?.aborted) throw e;
    return { error: `Could not expand the CISO: ${String(e.message).slice(0, 160)}` };
  } finally {
    await out.close();
    await fh.close();
  }
}
