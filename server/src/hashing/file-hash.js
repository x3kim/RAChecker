// File-based RetroAchievements hashing. The per-console RULE logic lives in
// ra-core (shared with the mobile app); this module supplies Node's MD5 and the
// constant-memory streaming I/O so files of ANY size hash correctly.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, open, readFile } from 'node:fs/promises';
import {
  hashBuffer as coreHashBuffer, applyHeaderRule,
  stripBytes, n64Mode, byteswap16InPlace, byteswap32InPlace,
} from 'ra-core';

function md5(buf) { return createHash('md5').update(buf).digest('hex'); }

// In-memory hash for a header rule (null = whole-file MD5). Delegates to core.
export function hashBuffer(buf, headerRule) {
  return coreHashBuffer(buf, headerRule, md5);
}

// Whole-file MD5 streamed from a byte offset to EOF — constant memory, any size.
// Optional `signal` aborts the read (used to actually stop work on scan cancel);
// optional `onProgress(bytes)` reports streamed bytes for a per-file progress UI.
function streamMd5(filePath, start = 0, { signal, onProgress } = {}) {
  return new Promise((resolve, reject) => {
    const h = createHash('md5');
    const s = createReadStream(filePath, start ? { start } : undefined);
    const onAbort = () => s.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { s.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    let done = 0;
    s.on('data', (c) => { h.update(c); if (onProgress) { done += c.length; onProgress(done); } });
    s.on('end', () => { signal?.removeEventListener('abort', onAbort); resolve(h.digest('hex')); });
    s.on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); });
  });
}

// Read just the first n bytes (header detection). n is tiny, so a single small
// read can never hit the Int32-length limit that a whole-file read could.
async function readHead(filePath, n) {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(n);
    const { bytesRead } = await fh.read(buf, 0, n, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// N64 byteswap, streamed: swap adjacent bytes (.v64) or 4-byte words (.n64),
// carrying sub-word leftovers across chunk boundaries to stay aligned. Trailing
// bytes that don't fill a word are hashed unswapped, matching rcheevos. The
// swap helpers come from ra-core (shared with mobile).
function hashN64Streamed(filePath, mode, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const h = createHash('md5');
    let carry = Buffer.alloc(0);
    const s = createReadStream(filePath);
    const onAbort = () => s.destroy(new Error('aborted'));
    if (signal) {
      if (signal.aborted) { s.destroy(); return reject(new Error('aborted')); }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    s.on('data', (chunk) => {
      const buf = carry.length ? Buffer.concat([carry, chunk]) : chunk;
      const n = buf.length - (buf.length % mode);
      const aligned = Buffer.from(buf.subarray(0, n)); // copy before mutating
      carry = Buffer.from(buf.subarray(n));
      if (mode === 2) byteswap16InPlace(aligned); else byteswap32InPlace(aligned);
      h.update(aligned);
    });
    s.on('end', () => { signal?.removeEventListener('abort', onAbort); if (carry.length) h.update(carry); resolve(h.digest('hex')); });
    s.on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); });
  });
}

// Hash a file on disk for a given header rule. EVERYTHING is streamed at
// constant memory, so files of ANY size hash correctly — no buffering, no size
// cap, and no risk of the multi-GB native fs.read crash. Header rules only need
// the first few bytes + the total size to decide what to strip (ra-core).
export async function hashFile(filePath, headerRule, opts = {}) {
  if (!headerRule) return streamMd5(filePath, 0, opts);

  if (headerRule === 'n64') {
    const head = await readHead(filePath, 1);
    const mode = n64Mode(head[0]); // .v64 (2) / .n64 (4) / native (1)
    return mode === 1 ? streamMd5(filePath, 0, opts) : hashN64Streamed(filePath, mode, opts);
  }

  if (headerRule === 'arduboy') {
    // .hex is a small text file; core normalizes its line endings.
    return coreHashBuffer(await readFile(filePath), 'arduboy', md5);
  }

  // Strip-style rules: skip a fixed-size header, then stream-hash the rest.
  const size = (await stat(filePath)).size;
  const head = await readHead(filePath, 16);
  return streamMd5(filePath, stripBytes(headerRule, size, head), opts);
}

export { md5, applyHeaderRule };
