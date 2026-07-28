// Low-level on-device hashing: read a file's bytes (works for picker file://
// URIs via the new File API and for SAF content:// URIs via the legacy base64
// reader) and compute the RA hash through the shared core.
import { File } from 'expo-file-system';
import { readAsStringAsync, EncodingType, getInfoAsync } from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
// Vendored shared core (source of truth: packages/core).
import { consoleForExt } from './core';
import { hashDisc, HASHABLE_DISC_EXTS } from './disc';
import { RandomReader, bufferReader } from './disc/reader';
import { hashCartCandidates, rulesForExt, Candidate } from './hashCandidates';

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

function base64ToBytes(b64: string): Uint8Array {
  // React Native / Hermes provides atob.
  const bin = (globalThis as any).atob(b64) as string;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function readBytes(uri: string): Promise<Uint8Array> {
  try {
    const b = await new File(uri).bytes();
    if (b && b.length) return b;
  } catch {
    /* content:// (SAF) or unsupported — fall back to the legacy base64 reader */
  }
  const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
  return base64ToBytes(b64);
}

// `md5` is the primary hash (used for the collection); `candidates` holds every
// plausible hash for the file, which the scanner looks up in turn — that's how a
// ROM is identified without relying on the folder name or one extension guess.
export type Hashed = {
  name: string; ext: string; rule: string | null;
  consoleId: number | null; md5: string; candidates: Candidate[];
};

// Archives we cannot open on the device: both need native code (no pure-JS
// decoder exists that runs under Hermes), so we fail with a clear reason instead
// of trying to read a multi-GB file into memory.
export const UNSUPPORTED_ARCHIVE_EXTS = new Set(['.7z', '.rar', '.tar', '.gz', '.bz2', '.xz']);

async function hashBytesCandidates(displayName: string, extName: string, bytes: Uint8Array): Promise<Hashed> {
  const ext = extOf(extName);
  const meta = consoleForExt(ext);
  const candidates = await hashCartCandidates(bufferReader(bytes), bytes.length, rulesForExt(ext));
  return {
    name: displayName, ext, rule: meta?.headerRule ?? null,
    consoleId: meta?.consoleId ?? null,
    md5: candidates[0]?.md5 ?? '', candidates,
  };
}

export async function hashTarget(uri: string, name: string): Promise<Hashed> {
  const ext = extOf(name);
  const size = await fileSize(uri);
  // Stream from the file when we know its size; fall back to a whole-file read
  // only when the size is unavailable (very small/odd providers).
  const reader = size > 0 ? await createFileReader(uri, size) : bufferReader(await readBytes(uri));
  const candidates = await hashCartCandidates(reader, reader.size, rulesForExt(ext));
  const meta = consoleForExt(ext);
  return {
    name, ext, rule: meta?.headerRule ?? null,
    consoleId: meta?.consoleId ?? null,
    md5: candidates[0]?.md5 ?? '', candidates,
  };
}

// A random-access reader over a file URI. Reads byte ranges on demand (base64,
// position+length) so multi-hundred-MB images are never loaded whole into memory.
function fileRandomReader(uri: string, size: number): RandomReader {
  return {
    size,
    async read(offset: number, length: number): Promise<Uint8Array> {
      if (length <= 0) return new Uint8Array(0);
      const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64, position: offset, length });
      return base64ToBytes(b64);
    },
  };
}

// Largest file we'll pull fully into memory. Only reached when ranged reads fail
// or the size is unknown: a whole-file base64 read is what produced the native
// "ExponentFileSystem.readAsStringAsync" rejection on large files, so past this
// point we fail with a readable message instead of crashing.
const MAX_BUFFERED_BYTES = 96 * 1024 * 1024;

// Build a reader for this URI. Ranged reads (`position` + `length` with Base64)
// are supported by expo-file-system for both file:// and SAF content:// URIs, so
// they're the normal path and keep memory flat regardless of file size. If the
// platform rejects a ranged read we fall back to buffering the whole file, which
// is only viable below MAX_BUFFERED_BYTES.
async function createFileReader(uri: string, size: number): Promise<RandomReader> {
  const ranged = fileRandomReader(uri, size);
  try {
    const probe = await ranged.read(0, Math.min(16, size));
    if (probe.length > 0) return ranged;
  } catch {
    /* ranged read rejected — fall back to a whole-file read below */
  }
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(`Cannot read this file in slices and it is too large to load at once (${Math.round(size / 1048576)} MB). Use the desktop app for this one.`);
  }
  return bufferReader(await readBytes(uri));
}

async function fileSize(uri: string): Promise<number> {
  try { const info = await getInfoAsync(uri); if (info.exists && typeof info.size === 'number') return info.size; } catch { /* ignore */ }
  try { const s = new File(uri).size; if (typeof s === 'number') return s; } catch { /* ignore */ }
  return 0;
}

// Hash a disc image (.chd/.iso/.pbp) on-device via the ported rcheevos disc rules.
// Returns a Hashed row, or null when the format/codecs aren't supported (caller
// then shows the desktop-only note). Throws on a read/decode failure with a reason.
export async function hashDiscFile(uri: string, name: string): Promise<Hashed | null> {
  const size = await fileSize(uri);
  if (!size) return null;
  const res = await hashDisc(await createFileReader(uri, size), name);
  if (!res) return null;
  return {
    name, ext: extOf(name), rule: `disc:${res.system}`, consoleId: res.consoleId,
    md5: res.md5, candidates: [{ rule: `disc:${res.system}`, md5: res.md5 }],
  };
}

export { HASHABLE_DISC_EXTS };

// True for an archive member that looks like a cartridge ROM we can hash. Skips
// Apple/hidden junk (._foo, .DS_Store) and anything that isn't a known cart ext.
function isRomInnerName(name: string): boolean {
  const base = name.split(/[\\/]/).pop() || name;
  if (!base || base.startsWith('._') || base.startsWith('.')) return false;
  return CART_EXTS.has(extOf(base));
}

// Read a .zip and hash every cartridge ROM inside it (mirrors the desktop, which
// hashes each recognizable member separately). fflate is pure JS — no native
// module. Returns one Hashed per inner ROM; empty when the archive holds none.
// Throws on an unreadable/encrypted/unsupported-compression archive.
export async function hashZip(uri: string, archiveName: string): Promise<Hashed[]> {
  const bytes = await readBytes(uri);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => isRomInnerName(f.name) });
  } catch (e: any) {
    throw new Error(`ZIP: ${String(e?.message || e).slice(0, 120)}`);
  }
  const out: Hashed[] = [];
  for (const [inner, data] of Object.entries(files)) {
    if (!data || !data.length) continue;
    const base = inner.split(/[\\/]/).pop() || inner;
    out.push(await hashBytesCandidates(`${archiveName} › ${base}`, base, data));
  }
  return out;
}

// Extensions we attempt to hash on-device (cartridge/handheld). Everything else
// (disc images, saves, junk) is skipped during a folder scan.
export const CART_EXTS = new Set([
  '.nes', '.fds', '.unf', '.unif', '.sfc', '.smc', '.swc', '.fig', '.bs',
  '.n64', '.v64', '.z64', '.ndd', '.gb', '.gbc', '.cgb', '.gba', '.agb', '.srl',
  '.md', '.gen', '.smd', '.bin', '.mdx', '.32x', '.sms', '.gg', '.pce', '.sgx',
  '.lnx', '.lyx', '.ngp', '.ngc', '.npc', '.j64', '.jag', '.rom', '.a26', '.a78',
  '.vb', '.vboy', '.min', '.sg', '.sc', '.col', '.cv', '.int', '.itv', '.vec',
  '.gam', '.ws', '.wsc', '.pc2', '.chf', '.sv', '.uze', '.hex', '.arduboy',
  '.wasm', '.mx1', '.mx2', '.rom',
]);

// Disc-image formats. On-device hashing needs RAHasher (rcheevos disc rules),
// which the desktop app bundles but mobile can't run — so we DETECT these and
// flag them clearly (Scan shows a "use the desktop app" note) instead of
// silently ignoring them. `.bin` is intentionally absent: it's a Mega Drive
// cart ext (in CART_EXTS) and hashing it raw is harmless when it's a disc track.
export const DISC_EXTS = new Set([
  '.chd', '.cue', '.iso', '.pbp', '.cso', '.rvz', '.gcz', '.wbfs', '.wia',
  '.gdi', '.cdi', '.nrg', '.mds', '.ccd', '.m3u',
]);

// Everything the folder scanner should surface: cart ROMs, ZIP archives, and
// disc images (the last only to report they need the desktop).
export function isScannable(ext: string): boolean {
  return ext === '.zip' || CART_EXTS.has(ext) || DISC_EXTS.has(ext);
}
