// File access for hashing. Prefers expo-file-system's `FileHandle`, which wraps a
// native RandomAccessFile: binary, seekable and far cheaper than the base64 path
// (no 4/3 size blow-up, no atob). Falls back to base64 ranged reads, then to a
// single whole-file read, so an unusual content:// provider still works.
import { File, Paths } from 'expo-file-system';
import { readAsStringAsync, EncodingType, getInfoAsync, deleteAsync } from 'expo-file-system/legacy';
import { RandomReader } from './disc/reader';

export type ClosableReader = RandomReader & { close(): void };

function base64ToBytes(b64: string): Uint8Array {
  const bin = (globalThis as any).atob(b64) as string;
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// `open()` is provided by the native module; the published typings don't declare
// it, so reach for it through a narrow structural type instead of `any`.
type NativeHandle = { readBytes(n: number): Uint8Array; writeBytes(b: Uint8Array): void; close(): void; offset: number | null; size: number | null };
type OpenableFile = { open(mode?: string): NativeHandle };

// Modes are expo's FileMode values. Read-only ('r') is passed explicitly: the
// native default is read/write for plain files, which needlessly asks for write
// access to ROMs we only ever read.
function openHandle(uri: string, mode: 'r' | 'w' = 'r'): NativeHandle | null {
  try {
    const f = new File(uri) as unknown as OpenableFile;
    if (typeof f.open !== 'function') return null;
    return f.open(mode);
  } catch {
    return null;
  }
}

// Byte size of a file. Tries the cheap sources first and only then probes the
// file by reading, which is what makes SAF content:// URIs work — `getInfoAsync`
// does not always report a size for them, and returning 0 used to make callers
// give up (a disc image would be reported as "needs the desktop app").
export async function fileSizeOf(uri: string, hint?: number): Promise<number> {
  if (hint && hint > 0) return hint;

  const h = openHandle(uri);
  if (h) {
    try {
      const s = h.size;
      if (typeof s === 'number' && s > 0) return s;
    } finally { try { h.close(); } catch { /* already closed */ } }
  }
  try {
    const info = await getInfoAsync(uri);
    if (info.exists && typeof info.size === 'number' && info.size > 0) return info.size;
  } catch { /* not available for this URI */ }
  try {
    const s = (new File(uri) as unknown as { size?: number }).size;
    if (typeof s === 'number' && s > 0) return s;
  } catch { /* not available for this URI */ }

  return probeSize(uri);
}

// Last resort: find the size by reading. Grows an offset until a read comes back
// empty, then binary-searches the boundary. ~40 one-byte reads for any size.
async function probeSize(uri: string): Promise<number> {
  const canRead = async (offset: number): Promise<boolean> => {
    try {
      const b = await readAsStringAsync(uri, { encoding: EncodingType.Base64, position: offset, length: 1 });
      return base64ToBytes(b).length > 0;
    } catch {
      return false;
    }
  };
  if (!(await canRead(0))) return 0;
  let lo = 0;
  let hi = 1;
  while (hi < 0x40000000 && await canRead(hi)) { lo = hi; hi *= 2; }
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await canRead(mid)) lo = mid; else hi = mid;
  }
  return lo + 1;
}

// Largest file we will pull entirely into memory when neither handle reads nor
// ranged reads work. A whole-file base64 read of anything bigger is what made
// the native reader reject large archives.
const MAX_BUFFERED_BYTES = 96 * 1024 * 1024;

export async function openFileReader(uri: string, sizeHint?: number): Promise<ClosableReader> {
  const size = await fileSizeOf(uri, sizeHint);
  if (!size) throw new Error('Could not determine the size of this file.');

  // 1. Native handle: binary + seekable.
  const handle = openHandle(uri);
  if (handle) {
    try {
      handle.offset = 0;
      const probe = handle.readBytes(Math.min(16, size));
      if (probe && probe.length) {
        const readSync = (offset: number, length: number): Uint8Array => {
          if (length <= 0 || offset >= size) return new Uint8Array(0);
          handle.offset = offset;
          return handle.readBytes(Math.min(length, size - offset));
        };
        return {
          size,
          readSync,
          async read(offset: number, length: number): Promise<Uint8Array> { return readSync(offset, length); },
          close() { try { handle.close(); } catch { /* already closed */ } },
        };
      }
    } catch { /* fall through to the base64 reader */ }
    try { handle.close(); } catch { /* already closed */ }
  }

  // 2. Base64 ranged reads.
  try {
    const probe = await readAsStringAsync(uri, { encoding: EncodingType.Base64, position: 0, length: Math.min(16, size) });
    if (base64ToBytes(probe).length) {
      return {
        size,
        async read(offset: number, length: number): Promise<Uint8Array> {
          if (length <= 0 || offset >= size) return new Uint8Array(0);
          const b64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64, position: offset, length: Math.min(length, size - offset) });
          return base64ToBytes(b64);
        },
        close() { /* nothing to release */ },
      };
    }
  } catch { /* fall through to a whole-file read */ }

  // 3. Whole file in memory.
  if (size > MAX_BUFFERED_BYTES) {
    throw new Error(`This file can only be read as a whole and is too large for that (${Math.round(size / 1048576)} MB). Use the desktop app for it.`);
  }
  const bytes = base64ToBytes(await readAsStringAsync(uri, { encoding: EncodingType.Base64 }));
  return {
    size: bytes.length,
    async read(offset: number, length: number) { return bytes.subarray(offset, Math.min(bytes.length, offset + length)); },
    close() { /* nothing to release */ },
  };
}

// Scratch file in the app's cache directory — used to unpack an archived disc
// image, which is far too large to hold in memory. Always delete() when done.
export type TempFile = { uri: string; write(bytes: Uint8Array): void; close(): void; delete(): Promise<void> };

export function createTempFile(name: string): TempFile {
  const dir = Paths.cache;
  const file = new File(dir, name);
  try { (file as unknown as { create(opts?: unknown): void }).create({ overwrite: true }); } catch { /* may already exist */ }
  const handle = openHandle(file.uri, 'w');
  if (!handle) throw new Error('Cannot create a temporary file for unpacking on this device.');
  return {
    uri: file.uri,
    write(bytes: Uint8Array) { handle.writeBytes(bytes); },
    close() { try { handle.close(); } catch { /* already closed */ } },
    async delete() {
      try { handle.close(); } catch { /* already closed */ }
      try { await deleteAsync(file.uri, { idempotent: true }); } catch { /* best effort */ }
    },
  };
}

// Free space in the cache directory, or null when it can't be determined.
export async function freeSpaceBytes(): Promise<number | null> {
  try {
    const v = (Paths as unknown as { availableDiskSpace?: number }).availableDiskSpace;
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}
