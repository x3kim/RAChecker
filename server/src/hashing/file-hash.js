// File-based RetroAchievements hashing — reimplements rcheevos rc_hash rules
// for cartridge/handheld consoles in pure JS. The RA hash is almost always the
// MD5 of the raw bytes; per-console rules only strip copier/emulator headers or
// normalize byte order first.
//
// Source of truth: rcheevos src/rhash/hash_rom.c, src/rhash/hash.c.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, open, readFile } from 'node:fs/promises';

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

// ---- byte-order helpers (Nintendo 64) ------------------------------------
function byteswap16InPlace(buf) {
  // [b0,b1,b2,b3,...] -> [b1,b0,b3,b2,...]  (swap adjacent bytes)
  const n = buf.length - (buf.length % 2);
  for (let i = 0; i < n; i += 2) {
    const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t;
  }
}
function byteswap32InPlace(buf) {
  // [b0,b1,b2,b3] -> [b3,b2,b1,b0]
  const n = buf.length - (buf.length % 4);
  for (let i = 0; i < n; i += 4) {
    const a = buf[i], b = buf[i + 1], c = buf[i + 2], d = buf[i + 3];
    buf[i] = d; buf[i + 1] = c; buf[i + 2] = b; buf[i + 3] = a;
  }
}

function hashN64(buf) {
  const out = Buffer.from(buf); // copy; we mutate
  const b0 = out[0];
  if (b0 === 0x37) byteswap16InPlace(out);        // .v64 byteswapped
  else if (b0 === 0x40) byteswap32InPlace(out);   // .n64 little-endian
  // 0x80 (.z64 big-endian native) and 0xE8/0x22 (.ndd) => no swap
  return md5(out);
}

function startsWith(buf, bytes, offset = 0) {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}
const NES = [0x4e, 0x45, 0x53, 0x1a]; // "NES\x1a"
const FDS = [0x46, 0x44, 0x53, 0x1a]; // "FDS\x1a"
const LYNX = [0x4c, 0x59, 0x4e, 0x58]; // "LYNX"
const ATARI7800 = [0x41, 0x54, 0x41, 0x52, 0x49, 0x37, 0x38, 0x30, 0x30]; // "ATARI7800"
const EMUSCV = [0x45, 0x6d, 0x75, 0x53, 0x43, 0x56]; // "EmuSCV"

function hashNES(buf) {
  if (buf.length > 16 && (startsWith(buf, NES) || startsWith(buf, FDS))) {
    return md5(buf.subarray(16)); // 16-byte iNES/FDS header NOT hashed
  }
  return md5(buf);
}
function hashSNES(buf) {
  const calc = Math.floor(buf.length / 0x2000) * 0x2000;
  if (buf.length - calc === 512) return md5(buf.subarray(512)); // strip copier header
  return md5(buf);
}
function hashLynx(buf) {
  if (buf.length > 64 && startsWith(buf, LYNX)) return md5(buf.subarray(64));
  return md5(buf);
}
function hash7800(buf) {
  if (buf.length > 128 && startsWith(buf, ATARI7800, 1)) return md5(buf.subarray(128));
  return md5(buf);
}
function hashPCE(buf) {
  if (buf.length & 512) return md5(buf.subarray(512)); // 512 over an 8KB multiple
  return md5(buf);
}
function hashSCV(buf) {
  if (buf.length > 32 && startsWith(buf, EMUSCV)) return md5(buf.subarray(32));
  return md5(buf);
}
function hashArduboyHex(buf) {
  // rc_hash_text: read lines, append "\n" after each, MD5 the normalized text.
  const text = buf.toString('utf8');
  const lines = text.split(/\r\n|\r|\n/);
  // drop a single trailing empty element produced by a final newline
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  let normalized = '';
  for (const l of lines) normalized += l + '\n';
  return md5(Buffer.from(normalized, 'utf8'));
}

const RULES = {
  nes: hashNES,
  snes: hashSNES,
  n64: hashN64,
  lynx: hashLynx,
  a7800: hash7800,
  pce: hashPCE,
  scv: hashSCV,
  arduboy: hashArduboyHex,
};

// Hash an in-memory buffer for a given header rule (null = whole-file MD5).
export function hashBuffer(buf, headerRule) {
  const fn = headerRule && RULES[headerRule];
  return fn ? fn(buf) : md5(buf);
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

// How many leading header bytes a strip-style rule removes, from the total size
// and the file's first bytes. 0 = no header → hash the whole file.
function stripBytes(rule, size, head) {
  switch (rule) {
    case 'nes':   return size > 16 && (startsWith(head, NES) || startsWith(head, FDS)) ? 16 : 0;
    case 'snes':  return size - Math.floor(size / 0x2000) * 0x2000 === 512 ? 512 : 0;
    case 'lynx':  return size > 64 && startsWith(head, LYNX) ? 64 : 0;
    case 'a7800': return size > 128 && startsWith(head, ATARI7800, 1) ? 128 : 0;
    case 'pce':   return (size & 512) ? 512 : 0;
    case 'scv':   return size > 32 && startsWith(head, EMUSCV) ? 32 : 0;
    default:      return 0;
  }
}

// N64 byteswap, streamed: swap adjacent bytes (.v64) or 4-byte words (.n64),
// carrying sub-word leftovers across chunk boundaries to stay aligned. Trailing
// bytes that don't fill a word are hashed unswapped, matching rcheevos.
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
// the first few bytes + the total size to decide what to strip.
export async function hashFile(filePath, headerRule, opts = {}) {
  if (!headerRule) return streamMd5(filePath, 0, opts);

  if (headerRule === 'n64') {
    const head = await readHead(filePath, 1);
    const mode = head[0] === 0x37 ? 2 : head[0] === 0x40 ? 4 : 1; // .v64 / .n64 / native
    return mode === 1 ? streamMd5(filePath, 0, opts) : hashN64Streamed(filePath, mode, opts);
  }

  if (headerRule === 'arduboy') {
    // .hex is a small text file; the rule normalizes its line endings.
    return hashArduboyHex(await readFile(filePath));
  }

  // Strip-style rules: skip a fixed-size header, then stream-hash the rest.
  const size = (await stat(filePath)).size;
  const head = await readHead(filePath, 16);
  return streamMd5(filePath, stripBytes(headerRule, size, head), opts);
}

export { md5 };
