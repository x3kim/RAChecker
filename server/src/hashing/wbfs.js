// WBFS (the container USB loaders keep Wii games in) support.
//
// RAHasher cannot open one — it reads the WBFS header as if it were the disc and
// reports "Not a supported Wii file" — so a .wbfs is turned back into a plain
// .iso in the temp folder, like .rvz, .gcz and .cso.
//
// Unlike those, WBFS does not compress: it is a sector map. The partition is cut
// into "wbfs sectors" (2 MiB is usual) and only the ones a disc actually uses are
// stored, in whatever order they were written. A table per disc says where each
// logical sector ended up.
//
//   hd sector 0    wbfs_head_t: magic "WBFS", the partition's sector counts, and
//                  a disc_table with one byte per slot (non-zero = in use)
//   hd sector 1+   one wbfs_disc_info_t per slot: the disc's first 0x100 bytes
//                  followed by a be16 per logical sector, naming the wbfs sector
//                  it lives in — or 0 for a sector the disc never used
//
// All integers are big endian. Layout and constants follow libwbfs (Wiimm's
// wiimms-iso-tools, project/src/libwbfs).
//
// One consequence worth stating plainly: **the reconstruction is not byte-exact**
// and cannot be. A real disc fills its unused areas with pseudo-random padding;
// WBFS throws those sectors away, and nothing in the file records what was in
// them, so they come back as zeroes. That does not affect the RetroAchievements
// hash, which only reads partition data — the part WBFS always keeps — but it
// does mean this expansion is verified by hash rather than by comparing bytes.
import { open, stat, unlink, statfs } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { config } from '../config.js';

const WII_SECTOR_SIZE = 0x8000;
const WII_SECTOR_SHIFT = 15;
// The disc sizes the format is built around: a single-layer disc, and the
// theoretical maximum a wlba table can address.
const WII_SECTORS_SINGLE_LAYER = 143432;
const WII_MAX_SECTORS = 2 * WII_SECTORS_SINGLE_LAYER;
const SINGLE_LAYER_SIZE = WII_SECTORS_SINGLE_LAYER * WII_SECTOR_SIZE; // 4,699,979,776
// What a dual-layer Wii dump measures, which is less than the addressable maximum.
const DUAL_LAYER_SIZE = 259740 * WII_SECTOR_SIZE; // 8,511,160,320

const DISC_INFO_HEADER = 0x100;
const COPY_CHUNK = 4 << 20;

export function isWbfsPath(filePath) {
  return extname(String(filePath)).toLowerCase() === '.wbfs';
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

// Parse the header and the first used disc's sector map. Returns null when the
// file is not a WBFS, so the caller can hash it exactly as before.
async function readWbfsIndex(fh, fileSize) {
  const head = Buffer.alloc(0x10);
  const { bytesRead } = await fh.read(head, 0, 0x10, 0);
  if (bytesRead < 0x10) return null;
  if (head.toString('latin1', 0, 4) !== 'WBFS') return null;

  const hdSectorShift = head[8];
  const wbfsSectorShift = head[9];
  if (hdSectorShift < 9 || hdSectorShift > 16) throw new Error(`implausible hd sector shift ${hdSectorShift}`);
  if (wbfsSectorShift < WII_SECTOR_SHIFT || wbfsSectorShift > 32) {
    throw new Error(`implausible wbfs sector shift ${wbfsSectorShift}`);
  }
  const hdSectorSize = 1 << hdSectorShift;
  const wbfsSectorSize = 2 ** wbfsSectorShift;

  // How many logical sectors a disc's table covers, and how much room that table
  // takes once padded out to whole hd sectors.
  const sectorsPerDisc = WII_MAX_SECTORS >> (wbfsSectorShift - WII_SECTOR_SHIFT);
  if (sectorsPerDisc < 1) throw new Error('wbfs sector size is larger than a disc');
  const infoSize = Math.ceil((DISC_INFO_HEADER + sectorsPerDisc * 2) / hdSectorSize) * hdSectorSize;

  // The disc table fills the rest of hd sector 0, one byte per slot.
  const table = await readExact(fh, hdSectorSize, 0);
  let slot = -1;
  let discCount = 0;
  for (let i = 0x0c; i < hdSectorSize; i++) {
    if (table[i] === 0) continue;
    discCount++;
    if (slot < 0) slot = i - 0x0c;
  }
  if (slot < 0) throw new Error('the disc table is empty');

  const infoOffset = hdSectorSize + slot * infoSize;
  if (infoOffset + infoSize > fileSize) throw new Error('the disc table points past the end of the file');
  const info = await readExact(fh, infoSize, infoOffset);
  const wlba = info.subarray(DISC_INFO_HEADER, DISC_INFO_HEADER + sectorsPerDisc * 2);

  return { wbfsSectorSize, sectorsPerDisc, wlba, discCount };
}

// Is there room in temp for the expanded image (plus 15% headroom)?
async function tempHasRoom(bytes) {
  try {
    const fs = await statfs(config.tempDir);
    return fs.bavail * fs.bsize >= bytes * 1.15;
  } catch { return true; }
}

/**
 * Expand a .wbfs into a plain .iso in the temp folder.
 *
 * Returns { path, cleanup, size } on success, { error } when it cannot be read,
 * or null when the file is not a WBFS at all. `onProgress(done, total)` reports
 * written bytes.
 */
export async function expandWbfs(filePath, { signal, onProgress } = {}) {
  const fh = await open(filePath, 'r');
  const fileSize = (await stat(filePath)).size;
  let index;
  try {
    index = await readWbfsIndex(fh, fileSize);
  } catch (e) {
    await fh.close();
    return { error: `Could not read the WBFS header: ${String(e.message).slice(0, 160)}` };
  }
  if (!index) {
    await fh.close();
    return null;
  }

  const { wbfsSectorSize, sectorsPerDisc, wlba, discCount } = index;
  if (discCount > 1) {
    await fh.close();
    return { error: `This WBFS holds ${discCount} discs; RAChecker can only hash a single-disc one.` };
  }

  // Everything past the last stored sector is padding on the real disc, so the
  // image is grown to whatever standard size covers what is here.
  let lastUsed = -1;
  for (let i = 0; i < sectorsPerDisc; i++) if (wlba.readUInt16BE(i * 2) !== 0) lastUsed = i;
  if (lastUsed < 0) {
    await fh.close();
    return { error: 'This WBFS stores no sectors for its disc.' };
  }
  const covered = (lastUsed + 1) * wbfsSectorSize;
  // The disc only has to be big enough to *reach* the last stored sector: that
  // sector usually straddles the end of the image, so rounding up to whole wbfs
  // sectors first would push a single-layer disc into the dual-layer size.
  const minimum = lastUsed * wbfsSectorSize + 1;
  const isoSize = minimum <= SINGLE_LAYER_SIZE ? SINGLE_LAYER_SIZE
    : minimum <= DUAL_LAYER_SIZE ? DUAL_LAYER_SIZE
      : Math.ceil(covered / WII_SECTOR_SIZE) * WII_SECTOR_SIZE;

  if (!(await tempHasRoom(isoSize))) {
    await fh.close();
    const gb = (isoSize / 1024 ** 3).toFixed(1);
    return { error: `Not enough free space in the temp folder to expand this WBFS (needs about ${gb} GB).` };
  }

  const dest = join(config.tempDir, `wbfs-${process.pid}-${Date.now()}-${basename(filePath, extname(filePath))}.iso`);
  const cleanup = async () => { try { await unlink(dest); } catch { /* best effort */ } };
  const out = await open(dest, 'w');

  let written = 0;
  let lastReport = 0;
  const buf = Buffer.allocUnsafe(COPY_CHUNK);
  try {
    // Sectors the disc never used stay zero, which is what truncate leaves behind.
    await out.truncate(isoSize);

    for (let i = 0; i <= lastUsed; i++) {
      if (signal?.aborted) throw new Error('aborted');
      const physical = wlba.readUInt16BE(i * 2);
      if (physical === 0) continue;

      const from = physical * wbfsSectorSize;
      const to = i * wbfsSectorSize;
      if (from >= fileSize) throw new Error(`logical sector ${i} points past the end of the file`);
      // Two ways a sector can be short of a full 2 MiB: the disc size is not a
      // whole multiple of the wbfs sector size, and the physical sector written
      // last is only as long as the data in it, so the file simply stops there.
      const length = Math.min(wbfsSectorSize, isoSize - to, fileSize - from);

      for (let done = 0; done < length; done += COPY_CHUNK) {
        const size = Math.min(COPY_CHUNK, length - done);
        await fh.read(buf, 0, size, from + done);
        await out.write(buf, 0, size, to + done);
      }
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
    return { error: `Could not expand the WBFS: ${String(e.message).slice(0, 160)}` };
  } finally {
    await out.close();
    await fh.close();
  }
}
