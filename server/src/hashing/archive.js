// Archive access for ROMs packed in .zip / .7z / .rar (and .tar/.gz).
// ZIP entries are read in-process (no temp files). 7z/rar are extracted to a
// unique temp dir and cleaned up afterwards (Windows-safe rm with retries).
import { mkdtemp, rm, readFile, mkdir, readdir, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { config } from '../config.js';

const ZIP_EXTS = new Set(['.zip']);
const SEVENZIP_EXTS = new Set(['.7z', '.gz', '.tar', '.tgz']);
const RAR_EXTS = new Set(['.rar']);

export function archiveType(filePath) {
  const e = extname(filePath).toLowerCase();
  if (ZIP_EXTS.has(e)) return 'zip';
  if (RAR_EXTS.has(e)) return 'rar';
  if (SEVENZIP_EXTS.has(e)) return '7z';
  return null;
}

// ---- entry listing --------------------------------------------------------
export async function listEntries(filePath) {
  const type = archiveType(filePath);
  if (type === 'zip') return listZip(filePath);
  if (type === 'rar') return listRar(filePath);
  if (type === '7z') return list7z(filePath);
  return [];
}

async function listZip(filePath) {
  const { default: StreamZip } = await import('node-stream-zip');
  const zip = new StreamZip.async({ file: filePath });
  try {
    const entries = Object.values(await zip.entries());
    return entries
      .filter((e) => !e.isDirectory)
      .map((e) => ({ name: e.name, size: e.size }));
  } catch {
    // node-stream-zip only knows store/deflate. LZMA/PPMd/etc. zips throw
    // "Unknown compression method: N" — fall back to the bundled 7za, which
    // handles them.
    return list7z(filePath);
  } finally {
    await zip.close().catch(() => {});
  }
}

// node-unrar-js (WASM) needs the whole archive as one ArrayBuffer — no
// streaming. Refuse oversized RARs with a clear message instead of OOMing,
// and hand over the Buffer's own ArrayBuffer instead of Uint8Array.from()
// (which copied the whole file a second time, element by element).
const RAR_MAX_BYTES = 1536 * 1024 * 1024;

async function rarData(filePath) {
  const st = await stat(filePath);
  if (st.size > RAR_MAX_BYTES) {
    throw new Error(`RAR ist ${(st.size / (1024 * 1024 * 1024)).toFixed(1)} GB groß — zu groß zum In-Speicher-Entpacken. Bitte als .zip/.7z packen oder Disc-Images als .chd konvertieren.`);
  }
  const data = await readFile(filePath);
  return (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength)
    ? data.buffer
    : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

async function listRar(filePath) {
  const unrar = await import('node-unrar-js');
  const ex = await unrar.createExtractorFromData({ data: await rarData(filePath) });
  const headers = [...ex.getFileList().fileHeaders];
  return headers
    .filter((h) => !h.flags.directory)
    .map((h) => ({ name: h.name, size: h.unpSize }));
}

async function list7z(filePath) {
  const sevenZip = await import('7zip-min');
  const list = sevenZip.list ?? sevenZip.default?.list;
  const items = await listAsync(list, filePath);
  return items
    .filter((i) => !/D/.test(i.attr || '') && i.name)
    .map((i) => ({ name: i.name, size: Number(i.size) || 0 }));
}

function listAsync(listFn, filePath) {
  // 7zip-min v3 returns a Promise; older versions use a callback.
  try {
    const r = listFn(filePath);
    if (r && typeof r.then === 'function') return r;
  } catch { /* fall through to callback form */ }
  return new Promise((resolve, reject) => {
    listFn(filePath, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

// ---- entry listing WITH stored CRC ----------------------------------------
// Reads each member's CRC32 straight from the container's directory/headers —
// no decompression. This is what lets the DAT completeness pass match packed
// collections (.zip/.7z/.rar) cheaply. Returns [{ name, size, crc }] where crc
// is lowercase 8-hex or null when the container doesn't carry one.
function hex8(n) { return (n >>> 0).toString(16).padStart(8, '0'); }

export async function listEntriesWithCrc(filePath) {
  const type = archiveType(filePath);
  if (type === 'zip') return listZipCrc(filePath);
  if (type === 'rar') return listRarCrc(filePath);
  if (type === '7z') return list7zCrc(filePath);
  return [];
}

async function listZipCrc(filePath) {
  const { default: StreamZip } = await import('node-stream-zip');
  const zip = new StreamZip.async({ file: filePath });
  try {
    const entries = Object.values(await zip.entries());
    return entries
      .filter((e) => !e.isDirectory)
      .map((e) => ({ name: e.name, size: e.size, crc: e.crc != null ? hex8(e.crc) : null }));
  } catch {
    // LZMA/PPMd zip that node-stream-zip can't read → bundled 7za still lists it.
    return list7zCrc(filePath);
  } finally {
    await zip.close().catch(() => {});
  }
}

async function list7zCrc(filePath) {
  const sevenZip = await import('7zip-min');
  const list = sevenZip.list ?? sevenZip.default?.list;
  const items = await listAsync(list, filePath);
  return items
    .filter((i) => !/D/.test(i.attr || '') && i.name)
    .map((i) => ({ name: i.name, size: Number(i.size) || 0, crc: i.crc ? String(i.crc).toLowerCase().padStart(8, '0') : null }));
}

async function listRarCrc(filePath) {
  const unrar = await import('node-unrar-js');
  const ex = await unrar.createExtractorFromData({ data: await rarData(filePath) });
  const headers = [...ex.getFileList().fileHeaders];
  return headers
    .filter((h) => !h.flags.directory)
    .map((h) => ({ name: h.name, size: h.unpSize, crc: h.crc != null ? hex8(h.crc) : null }));
}

// ---- read a single entry --------------------------------------------------
// Returns { buffer } for small entries, or { tempPath, cleanup } for large
// ones / 7z / rar. Caller MUST await cleanup() when given a tempPath.
export async function readEntry(filePath, entryName, opts = {}) {
  const maxInMemory = opts.maxInMemory ?? config.archiveInMemoryLimit;
  const size = opts.size ?? Infinity;
  const type = archiveType(filePath);

  if (type === 'zip') {
    const { default: StreamZip } = await import('node-stream-zip');
    const zip = new StreamZip.async({ file: filePath });
    try {
      if (size <= maxInMemory) {
        const buffer = await zip.entryData(entryName);
        return { buffer, cleanup: noop };
      }
      // stream large entry to a temp file
      const { dir, tempPath } = await tempFileFor(entryName);
      const stm = await zip.stream(entryName);
      await pipeline(stm, createWriteStream(tempPath));
      return { tempPath, cleanup: () => safeRm(dir) };
    } catch (e) {
      // Unsupported compression (LZMA/PPMd…) → bundled 7za handles it.
      if (/Unknown compression method|invalid|corrupt|bad|unsupported/i.test(String(e.message))) {
        await zip.close().catch(() => {});
        return extractEntryVia7z(filePath, entryName);
      }
      throw e;
    } finally {
      await zip.close().catch(() => {});
    }
  }

  if (type === 'rar') {
    const unrar = await import('node-unrar-js');
    const ex = await unrar.createExtractorFromData({ data: await rarData(filePath) });
    const extracted = ex.extract({ files: [entryName] });
    const files = [...extracted.files];
    const file = files.find((f) => f.fileHeader.name === entryName) || files[0];
    if (!file || !file.extraction) throw new Error(`RAR entry not found: ${entryName}`);
    return { buffer: Buffer.from(file.extraction), cleanup: noop };
  }

  if (type === '7z') {
    return extractEntryVia7z(filePath, entryName);
  }

  throw new Error(`Unsupported archive: ${filePath}`);
}

// Extract a single entry with the bundled 7za to a temp dir, returning its path
// (streamed-hash friendly). Used for .7z and as the ZIP fallback for archives
// node-stream-zip can't decompress. Caller MUST await cleanup().
async function extractEntryVia7z(filePath, entryName) {
  const sevenZip = await import('7zip-min');
  const dir = await mkdtemp(join(config.tempDir, 'rom7z-'));
  try {
    await extract7zEntry(sevenZip, filePath, dir, entryName);
    return { tempPath: join(dir, entryName), cleanup: () => safeRm(dir) };
  } catch (e) {
    await safeRm(dir);
    throw e;
  }
}

async function extract7zEntry(sevenZip, filePath, dir, entryName) {
  const cmd = sevenZip.cmd ?? sevenZip.default?.cmd;
  const args = ['x', filePath, `-o${dir}`, '-y', entryName];
  const r = cmd(args);
  if (r && typeof r.then === 'function') { await r; return; }
  await new Promise((resolve, reject) => {
    cmd(args, (err) => (err ? reject(err) : resolve()));
  });
}

// ---- temp helpers ---------------------------------------------------------
async function tempFileFor(entryName) {
  const dir = await mkdtemp(join(config.tempDir, 'romzip-'));
  const safe = basename(entryName) || 'entry.bin';
  const tempPath = join(dir, safe);
  return { dir, tempPath };
}

function noop() {}

export async function safeRm(target) {
  try {
    await rm(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  } catch (e) {
    // Last resort: leave a breadcrumb but don't crash the scan.
    console.warn('[archive] temp cleanup failed for', target, '-', e.message);
  }
}

// Ensure temp dir exists (called at startup).
export async function ensureTempDir() {
  await mkdir(config.tempDir, { recursive: true });
}

// Sweep leftover scratch from the temp dir at startup. Extraction/big-file
// copies clean up after themselves, but a crash or a killed scan can orphan
// them — this reclaims that space on the next launch (nothing in temp is meant
// to survive a restart).
export async function sweepTempOnStartup() {
  let entries;
  try { entries = await readdir(config.tempDir, { withFileTypes: true }); }
  catch { return 0; }
  let removed = 0;
  for (const e of entries) {
    try { await rm(join(config.tempDir, e.name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); removed++; }
    catch { /* in use / locked — leave it */ }
  }
  return removed;
}
