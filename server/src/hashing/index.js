// Hashing dispatcher: given a file (or an archive member) and a target console,
// produce the RetroAchievements hash using the correct method.
import { basename, extname, dirname } from 'node:path';
import { CONSOLE_BY_ID } from '../consoles.js';
import { hashFile, hashBuffer, md5 } from './file-hash.js';
import { readEntry } from './archive.js';
import { hashWithRAHasher, isRAHasherAvailable } from './rahasher.js';
import { isCsoPath, expandCso } from './cso.js';

// FBNeo parent-folder names that get prefixed into the arcade name hash.
const ARCADE_KNOWN_PARENTS = new Set([
  'nes', 'fds', 'sms', 'msx', 'ngp', 'pce', 'chf', 'sgx', 'tg16', 'msx1',
  'neocd', 'coleco', 'sg1000', 'genesis', 'gamegear', 'megadriv', 'pcengine',
  'channelf', 'spectrum', 'megadrive', 'supergrafx', 'zxspectrum',
  'mastersystem', 'colecovision',
]);

// Arcade hash = MD5 of the file *name* (no extension), optionally prefixed by a
// known parent-folder name. Contents are never read.
export function hashArcade(filePath) {
  const file = basename(filePath);
  const dot = file.lastIndexOf('.');
  const name = dot >= 0 ? file.slice(0, dot) : file;
  const parent = basename(dirname(filePath)).toLowerCase();
  const key = ARCADE_KNOWN_PARENTS.has(parent) ? `${parent}_${name}` : name;
  return md5(Buffer.from(key, 'binary'));
}

// Main entry. `entry` (optional) = { name, size } when the file is an archive
// member to be hashed from inside the archive. `signal` aborts the underlying
// read/child process on scan cancel; `onPhase(phase, done, total)` reports what
// is happening ('extracting' | 'hashing' | 'rahasher') for the UI.
export async function hashTarget({ filePath, consoleId, entry, signal, onPhase, timeoutMs }) {
  const phase = (p, done, total) => { try { onPhase?.(p, done, total); } catch { /* ignore */ } };
  const c = CONSOLE_BY_ID.get(consoleId);
  if (!c) return { status: 'error', message: `Unknown console id ${consoleId}` };

  if (c.method === 'unsupported') {
    return { status: 'unsupported', message: `${c.name}: hashing not supported.` };
  }

  if (c.method === 'arcade') {
    // For arcade, the archive itself (the .zip) is the unit — hash its name.
    return { md5: hashArcade(filePath), method: 'arcade' };
  }

  if (c.method === 'file') {
    try {
      if (entry) {
        phase('extracting', 0, entry.size);
        const r = await readEntry(filePath, entry.name, { size: entry.size });
        try {
          phase('hashing', 0, entry.size);
          const hash = r.buffer
            ? hashBuffer(r.buffer, c.headerRule)
            : await hashFile(r.tempPath, c.headerRule, { signal, onProgress: (b) => phase('hashing', b, entry.size) });
          return { md5: hash, method: 'file' };
        } finally {
          await r.cleanup?.();
        }
      }
      phase('hashing');
      const hash = await hashFile(filePath, c.headerRule, { signal, onProgress: (b) => phase('hashing', b) });
      return { md5: hash, method: 'file' };
    } catch (e) {
      return { status: 'error', message: `Hashing failed: ${String(e.message).slice(0, 200)}` };
    }
  }

  if (c.method === 'rahasher') {
    const available = await isRAHasherAvailable();
    if (!available) {
      return {
        status: 'needs_rahasher',
        message: `${c.name} needs RAHasher (disc/special hashing). Install it in Settings.`,
      };
    }
    // Disc images inside archives: extract to temp first, then hash.
    if (entry) {
      phase('extracting', 0, entry.size);
      const r = await readEntry(filePath, entry.name, { size: entry.size, maxInMemory: 0 });
      try {
        const target = r.tempPath;
        if (!target) return { status: 'error', message: 'Could not extract disc image from archive.' };
        return await rahasherWithCso(consoleId, target, entry.name, { signal, timeoutMs, phase });
      } finally {
        await r.cleanup?.();
      }
    }
    return await rahasherWithCso(consoleId, filePath, filePath, { signal, timeoutMs, phase });
  }

  return { status: 'error', message: `No hashing method for ${c.name}` };
}

// Run RAHasher against a disc image, expanding compressed ISOs first. RAHasher
// cannot read .cso/.zso ("Could not open track"), so those are unpacked into a
// plain .iso in temp and removed again straight after hashing — the hash is the
// same one RAHasher would produce for the uncompressed image.
async function rahasherWithCso(consoleId, filePath, displayPath, { signal, timeoutMs, phase }) {
  let target = filePath;
  let cleanup = null;
  if (isCsoPath(displayPath)) {
    phase('extracting', 0, 0);
    const expanded = await expandCso(filePath, { signal, onProgress: (d, t) => phase('extracting', d, t) });
    if (expanded?.error) return { status: 'error', message: expanded.error };
    if (expanded?.path) { target = expanded.path; cleanup = expanded.cleanup; }
  }
  try {
    phase('rahasher');
    const res = await hashWithRAHasher(consoleId, target, { signal, timeoutMs });
    if (res.md5) return { md5: res.md5, method: 'rahasher' };
    if (res.missing) return { status: 'needs_rahasher', message: 'RAHasher not installed.' };
    return { status: 'error', message: res.error };
  } finally {
    await cleanup?.();
  }
}

export { md5 };
