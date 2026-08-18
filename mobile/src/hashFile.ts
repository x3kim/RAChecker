// On-device hashing: read a file (streamed, never whole-file) and compute the
// RetroAchievements hash through the shared core, the disc rules, or an archive.
import { unzipSync } from 'fflate';
// Vendored shared core (source of truth: packages/core).
import { consoleForExt, hashNds, NDS_EXTS } from './core';
import { hashDisc, HASHABLE_DISC_EXTS } from './disc';
import { RandomReader, bufferReader } from './disc/reader';
import { hashCartCandidates, rulesForExt, Candidate } from './hashCandidates';
import { md5Create } from './md5';
import { openFileReader, createTempFile } from './fileIO';
import { openSevenZip, extractSevenZipEntry, SevenZipError } from './archive/sevenZip';
import { lzma1Decode } from './lzma/decoder';

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

// Read a whole file into memory. Only for inputs known to be small (ZIP central
// directories, archive members); large files always go through a reader.
export async function readBytes(uri: string): Promise<Uint8Array> {
  const reader = await openFileReader(uri);
  try {
    return await reader.read(0, reader.size);
  } finally {
    reader.close();
  }
}

// `md5` is the primary hash (used for the collection); `candidates` holds every
// plausible hash for the file, which the scanner looks up in turn — that's how a
// ROM is identified without relying on the folder name or one extension guess.
export type Hashed = {
  name: string; ext: string; rule: string | null;
  consoleId: number | null; md5: string; candidates: Candidate[];
};

// Archives that still need a native decoder we can't ship (RAR has its own
// algorithm; tar-family streams aren't seekable containers we can index).
// `.7z` is NOT here: we decode it ourselves — see src/archive/sevenZip.ts.
export const UNSUPPORTED_ARCHIVE_EXTS = new Set(['.rar', '.tar', '.gz', '.bz2', '.xz']);
export const ARCHIVE_EXTS = new Set(['.zip', '.7z']);

// Every plausible hash for a cartridge file.
//
// A Nintendo DS ROM is a container rather than a flat image: RetroAchievements
// hashes its header plus the ARM9/ARM7 code and icon blocks the header points
// at (see core/nds.js). A whole-file MD5 of a .nds therefore never matches,
// which is why DS ROMs used to come back as "no match" on the phone even though
// the desktop identified them.
async function cartCandidates(reader: RandomReader, ext: string): Promise<Candidate[]> {
  let nds: Candidate | null = null;
  if (NDS_EXTS.has(ext)) {
    try {
      const md5 = await hashNds(reader, md5Create);
      if (md5) nds = { rule: 'nds', md5 };
    } catch { /* not a DS ROM after all — the cartridge rules below still apply */ }
  }
  // For a DS-only extension the whole-file pass is dead weight: it cannot match
  // anything, and skipping it turns a 128 MB read on the phone into about 1 MB.
  // `.srl` is shared with Game Boy Advance, so there both hashes are wanted.
  if (nds && ext !== '.srl') return [nds];

  const rest = await hashCartCandidates(reader, reader.size, rulesForExt(ext));
  return nds ? [...rest, nds] : rest;
}

async function hashBytesCandidates(displayName: string, extName: string, bytes: Uint8Array): Promise<Hashed> {
  const ext = extOf(extName);
  const meta = consoleForExt(ext);
  const candidates = await cartCandidates(bufferReader(bytes), ext);
  return {
    name: displayName, ext, rule: meta?.headerRule ?? null,
    consoleId: meta?.consoleId ?? null,
    md5: candidates[0]?.md5 ?? '', candidates,
  };
}

export async function hashTarget(uri: string, name: string, sizeHint?: number): Promise<Hashed> {
  const reader = await openFileReader(uri, sizeHint);
  try {
    return await hashReader(reader, name);
  } finally {
    reader.close();
  }
}

// Cartridge hashing from an already-open reader (also used for archive members
// that were unpacked to a scratch file).
async function hashReader(reader: RandomReader, name: string): Promise<Hashed> {
  const ext = extOf(name);
  const candidates = await cartCandidates(reader, ext);
  const meta = consoleForExt(ext);
  return {
    name, ext, rule: meta?.headerRule ?? null,
    consoleId: meta?.consoleId ?? null,
    md5: candidates[0]?.md5 ?? '', candidates,
  };
}

// Hash a disc image (.chd/.iso/.pbp) with the ported rcheevos disc rules.
// Returns null when no system's signature was found in the image — the caller
// turns that into a specific message rather than a generic "use the desktop app".
export async function hashDiscFile(uri: string, name: string, sizeHint?: number): Promise<Hashed | null> {
  const reader = await openFileReader(uri, sizeHint);
  try {
    return await hashDiscReader(reader, name);
  } finally {
    reader.close();
  }
}

async function hashDiscReader(reader: RandomReader, name: string): Promise<Hashed | null> {
  const res = await hashDisc(reader, name);
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
  const out: Hashed[] = [];
  let files: Record<string, Uint8Array> = {};
  let fflateFailed = false;
  try {
    files = unzipSync(bytes, { filter: (f) => isRomInnerName(f.name) });
  } catch {
    // fflate only implements store + deflate. Some ROM sites pack with LZMA to
    // save space, which lands here — fall back to our own reader below.
    fflateFailed = true;
  }
  for (const [inner, data] of Object.entries(files)) {
    if (!data || !data.length) continue;
    const base = inner.split(/[\\/]/).pop() || inner;
    out.push(await hashBytesCandidates(`${archiveName} › ${base}`, base, data));
  }
  if (out.length) return out;

  // Nothing came back: either the archive uses a compression method fflate can't
  // read, or it holds no recognisable ROM. Try the LZMA-capable reader.
  const extra = await hashZipLzmaMembers(bytes, archiveName);
  if (extra.length) return extra;
  if (fflateFailed) throw new Error('ZIP: unsupported compression in this archive.');
  return out;
}

// Handle ZIP entries stored with method 14 (LZMA), which fflate rejects. Walks
// the central directory ourselves and decodes those entries with our LZMA code.
async function hashZipLzmaMembers(bytes: Uint8Array, archiveName: string): Promise<Hashed[]> {
  const out: Hashed[] = [];
  for (const e of listZipEntries(bytes)) {
    if (e.method !== 14 || !isRomInnerName(e.name)) continue;
    const base = e.name.split(/[\\/]/).pop() || e.name;
    try {
      // ZIP's LZMA entry: 4-byte header (version + props size) then the 5-byte
      // LZMA properties, then the stream. Output size is known from the entry.
      const body = bytes.subarray(e.dataOffset, e.dataOffset + e.compressedSize);
      const propsSize = body[2] | (body[3] << 8);
      const props = body.subarray(4, 4 + propsSize);
      const stream = body.subarray(4 + propsSize);
      const parts: Uint8Array[] = [];
      lzma1Decode(props, stream, e.uncompressedSize, (b) => parts.push(b.slice()));
      const data = concatBytes(parts);
      if (data.length) out.push(await hashBytesCandidates(`${archiveName} › ${base}`, base, data));
    } catch {
      /* entry unreadable — skip it and try the rest */
    }
  }
  return out;
}

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; dataOffset: number };

// Minimal ZIP central-directory walk. Only what's needed to locate an entry's
// compressed bytes; fflate handles the common methods.
function listZipEntries(b: Uint8Array): ZipEntry[] {
  const u16 = (o: number) => b[o] | (b[o + 1] << 8);
  const u32 = (o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] * 0x1000000)) >>> 0;

  // End of central directory: scan backwards for its signature.
  let eocd = -1;
  for (let i = b.length - 22; i >= 0 && i > b.length - 22 - 65536; i--) {
    if (u32(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return [];
  const count = u16(eocd + 10);
  let p = u32(eocd + 16);
  const out: ZipEntry[] = [];
  for (let i = 0; i < count && p + 46 <= b.length; i++) {
    if (u32(p) !== 0x02014b50) break;
    const method = u16(p + 10);
    const compressedSize = u32(p + 20);
    const uncompressedSize = u32(p + 24);
    const nameLen = u16(p + 28);
    const extraLen = u16(p + 30);
    const commentLen = u16(p + 32);
    const localOffset = u32(p + 42);
    let name = '';
    for (let j = 0; j < nameLen; j++) name += String.fromCharCode(b[p + 46 + j]);
    // Local header: name/extra lengths there can differ from the central copy.
    let dataOffset = 0;
    if (u32(localOffset) === 0x04034b50) {
      dataOffset = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
    }
    if (dataOffset) out.push({ name, method, compressedSize, uncompressedSize, dataOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// Read a .7z and hash every ROM inside it. Decoding is our own (src/archive),
// built on the same LZMA decoder the CHD reader uses.
//
// Cartridge members are small enough to unpack into memory. A disc image inside
// an archive is not — those are unpacked to a scratch file in the cache and
// hashed from there with ranged reads, then deleted. That's the only way to hash
// a compressed disc image, because disc rules seek around the image rather than
// reading it front to back.
// Reports progress while a single file is being processed, so a slow unpack shows
// movement instead of looking frozen.
export type HashProgress = (info: { phase: 'unpack' | 'hash'; done: number; total: number }) => void;

export async function hashSevenZip(uri: string, archiveName: string, onProgress?: HashProgress): Promise<Hashed[]> {
  const reader = await openFileReader(uri);
  const out: Hashed[] = [];
  try {
    const archive = await openSevenZip(reader);
    const members = archive.entries.filter((e) => !e.isDir && e.size > 0 && isHashableInnerName(e.name));
    for (const entry of members) {
      const base = entry.name.split(/[\\/]/).pop() || entry.name;
      const display = `${archiveName} › ${base}`;
      const innerExt = extOf(base);

      if (HASHABLE_DISC_EXTS.has(innerExt) || entry.size > MAX_INLINE_MEMBER_BYTES) {
        const temp = createTempFile(`ra-unpack-${Date.now()}-${base}`);
        try {
          let written = 0;
          await extractSevenZipEntry(reader, archive, entry, (b) => {
            temp.write(b);
            written += b.length;
            onProgress?.({ phase: 'unpack', done: written, total: entry.size });
          });
          temp.close();
          const hashed = HASHABLE_DISC_EXTS.has(innerExt)
            ? await hashDiscFile(temp.uri, base, entry.size)
            : await hashTarget(temp.uri, base, entry.size);
          if (hashed) out.push({ ...hashed, name: display });
        } finally {
          await temp.delete();
        }
        continue;
      }

      const parts: Uint8Array[] = [];
      let got = 0;
      await extractSevenZipEntry(reader, archive, entry, (b) => {
        parts.push(b.slice());
        got += b.length;
        onProgress?.({ phase: 'unpack', done: got, total: entry.size });
      });
      const data = concatBytes(parts);
      if (data.length) out.push(await hashBytesCandidates(display, base, data));
    }
  } catch (e: any) {
    if (e instanceof SevenZipError) throw e;
    throw new Error(`7z: ${String(e?.message || e).slice(0, 160)}`);
  } finally {
    reader.close();
  }
  return out;
}

// Members bigger than this are unpacked to a scratch file instead of memory.
const MAX_INLINE_MEMBER_BYTES = 64 * 1024 * 1024;

function isHashableInnerName(name: string): boolean {
  const base = name.split(/[\\/]/).pop() || name;
  if (!base || base.startsWith('._') || base.startsWith('.')) return false;
  const ext = extOf(base);
  return CART_EXTS.has(ext) || HASHABLE_DISC_EXTS.has(ext);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
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
  // Nintendo DS/DSi. Hashed by the container rule in core/nds.js, not by a
  // whole-file MD5 — without these the scanner skipped DS ROMs entirely.
  '.nds', '.dsi', '.ids',
]);

// Disc-image formats we recognise. The ones in HASHABLE_DISC_EXTS are hashed
// right here; the rest are DETECTED and flagged clearly (Scan shows a "use the
// desktop app" note) instead of being silently ignored. `.bin` is intentionally
// absent: it's a Mega Drive cart ext (in CART_EXTS) and hashing it raw is
// harmless when it's a disc track.
export const DISC_EXTS = new Set([
  '.chd', '.cue', '.iso', '.pbp', '.cso', '.zso', '.ciso', '.rvz', '.gcz', '.wbfs', '.wia',
  '.gdi', '.cdi', '.nrg', '.mds', '.ccd', '.m3u',
]);

// Everything the folder scanner should surface: cart ROMs, archives we can open
// (.zip/.7z) and disc images.
export function isScannable(ext: string): boolean {
  return ARCHIVE_EXTS.has(ext) || CART_EXTS.has(ext) || DISC_EXTS.has(ext);
}
