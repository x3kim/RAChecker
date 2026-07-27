// Low-level on-device hashing: read a file's bytes (works for picker file://
// URIs via the new File API and for SAF content:// URIs via the legacy base64
// reader) and compute the RA hash through the shared core.
import { File } from 'expo-file-system';
import { readAsStringAsync, EncodingType, getInfoAsync } from 'expo-file-system/legacy';
import { unzipSync } from 'fflate';
// Vendored shared core (source of truth: packages/core).
import { hashBuffer, consoleForExt } from './core';
import { md5Bytes } from './md5';
import { hashDisc, HASHABLE_DISC_EXTS } from './disc';
import { RandomReader } from './disc/reader';

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

export type Hashed = { name: string; ext: string; rule: string | null; consoleId: number | null; md5: string };

// Hash raw bytes for a cartridge ROM. `displayName` is what the UI shows (for a
// ZIP member it's "archive.zip › game.nes"); `extName` is the file whose
// extension picks the header rule (the inner name for archive members).
function hashBytes(displayName: string, extName: string, bytes: Uint8Array): Hashed {
  const ext = extOf(extName);
  const meta = consoleForExt(ext);
  const rule: string | null = meta?.headerRule ?? null;
  return { name: displayName, ext, rule, consoleId: meta?.consoleId ?? null, md5: hashBuffer(bytes, rule, md5Bytes) };
}

export async function hashTarget(uri: string, name: string): Promise<Hashed> {
  const bytes = await readBytes(uri);
  return hashBytes(name, name, bytes);
}

// A random-access reader over a file URI. Reads byte ranges on demand (base64,
// position+length) so multi-hundred-MB disc images are never loaded whole into
// memory. DocumentPicker copies picks to cache as file:// URIs, which support
// ranged reads; SAF content:// URIs generally do too via the legacy reader.
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
  const res = await hashDisc(fileRandomReader(uri, size), name);
  if (!res) return null;
  return { name, ext: extOf(name), rule: `disc:${res.system}`, consoleId: res.consoleId, md5: res.md5 };
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
    out.push(hashBytes(`${archiveName} › ${base}`, base, data));
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
