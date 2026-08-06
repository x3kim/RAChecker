// CSO / ZSO (compressed ISO) reader.
//
// A CSO is an ISO cut into fixed-size blocks, each stored raw or compressed,
// plus a table of block offsets. That makes it randomly readable: the disc rules
// only ever want a few sectors (PARAM.SFO, EBOOT.BIN, a volume descriptor), so
// only the blocks those sectors live in are ever decompressed. The whole image
// is never expanded — which matters on a phone.
//
// Layout (little endian):
//   0  magic       "CISO" (deflate blocks) or "ZISO" (LZ4 blocks)
//   4  header size 0x18, though some writers leave it 0
//   8  total bytes size of the original ISO (u64)
//   16 block size  usually 2048
//   20 version     1 or 2
//   21 index shift block offsets are shifted left by this many bits
//   24 index       (blocks + 1) u32 entries; bit 31 marks a stored block, the
//                  rest is that block's offset
import { inflateSync } from 'fflate';
import { RandomReader } from './reader';

export const CSO_EXTS = new Set(['.cso', '.zso', '.ciso']);

const MAX_BLOCK_SIZE = 1 << 16;
// Enough to cover an ISO9660 directory walk without holding much: 64 blocks of
// 2 KB is 128 KB.
const CACHE_BLOCKS = 64;

type CsoHeader = {
  magic: string; totalBytes: number; blockSize: number;
  indexShift: number; blocks: number; index: Uint32Array;
};

function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

/** LZ4 block format (no frame header) — used by ZSO and by LZ4 blocks in a CSO v2. */
export function lz4DecompressBlock(src: Uint8Array, outLength: number): Uint8Array {
  const out = new Uint8Array(outLength);
  let i = 0, o = 0;
  while (i < src.length) {
    const token = src[i++];
    let litLen = token >> 4;
    if (litLen === 15) {
      let b: number;
      do { b = src[i++]; litLen += b; } while (b === 255 && i < src.length);
    }
    if (litLen > 0) {
      if (i + litLen > src.length || o + litLen > outLength) throw new Error('LZ4 literal run out of bounds');
      out.set(src.subarray(i, i + litLen), o);
      i += litLen; o += litLen;
    }
    if (i >= src.length) break;              // the last sequence is literals only
    const offset = src[i++] | (src[i++] << 8);
    if (offset === 0 || offset > o) throw new Error('LZ4 match offset out of bounds');
    let matchLen = token & 15;
    if (matchLen === 15) {
      let b: number;
      do { b = src[i++]; matchLen += b; } while (b === 255 && i < src.length);
    }
    matchLen += 4;
    if (o + matchLen > outLength) throw new Error('LZ4 match run out of bounds');
    let from = o - offset;
    for (let n = 0; n < matchLen; n++) out[o++] = out[from++];   // may overlap
  }
  if (o !== outLength) throw new Error(`LZ4 produced ${o} of ${outLength} bytes`);
  return out;
}

// Read the header + index table, or return null when this is not a PSP-style
// CSO — notably GameCube/Wii ".ciso", which reuses the magic for a different
// layout (a 32 KB byte map, no index table).
async function readHeader(reader: RandomReader): Promise<CsoHeader | null> {
  if (reader.size < 24) return null;
  const head = await reader.read(0, 24);
  if (head.length < 24) return null;

  const magic = String.fromCharCode(head[0], head[1], head[2], head[3]);
  if (magic !== 'CISO' && magic !== 'ZISO') return null;

  const lo = u32(head, 8), hi = u32(head, 12);
  const totalBytes = hi * 4294967296 + lo;
  const blockSize = u32(head, 16);
  const version = head[20];
  const indexShift = head[21];

  const powerOfTwo = blockSize >= 512 && blockSize <= MAX_BLOCK_SIZE && (blockSize & (blockSize - 1)) === 0;
  if (!powerOfTwo || version < 1 || version > 2) return null;
  if (!Number.isSafeInteger(totalBytes) || totalBytes <= 0) return null;
  if (indexShift > 31) return null;

  const blocks = Math.ceil(totalBytes / blockSize);
  const bytes = await reader.read(24, (blocks + 1) * 4);
  if (bytes.length < (blocks + 1) * 4) return null;
  const index = new Uint32Array(blocks + 1);
  for (let i = 0; i <= blocks; i++) index[i] = u32(bytes, i * 4);

  return { magic, totalBytes, blockSize, indexShift, blocks, index };
}

/**
 * Wrap a .cso/.zso in a reader that behaves like the plain .iso inside it.
 * Returns null when the file is not a CSO, so the caller can fall back.
 */
export async function openCsoReader(inner: RandomReader): Promise<RandomReader | null> {
  const h = await readHeader(inner);
  if (!h) return null;

  const preferLz4 = h.magic === 'ZISO';
  const align = 1 << h.indexShift;
  const cache = new Map<number, Uint8Array>();

  const readBlock = async (i: number): Promise<Uint8Array> => {
    const hit = cache.get(i);
    if (hit) return hit;

    const start = (h.index[i] & 0x7fffffff) * align;
    const end = (h.index[i + 1] & 0x7fffffff) * align;
    const stored = (h.index[i] & 0x80000000) !== 0;
    if (end <= start) throw new Error(`CSO index entry ${i} is invalid`);

    const packed = await inner.read(start, Math.min(end - start, inner.size - start));
    let plain: Uint8Array;
    if (stored) {
      plain = packed.subarray(0, h.blockSize);
    } else {
      // The magic says which codec to expect; a CSO v2 may still mix deflate and
      // LZ4, so the other one is tried as a fallback. A block decoded with the
      // wrong codec throws or comes out the wrong length — it never passes
      // silently.
      const order = preferLz4 ? ['lz4', 'deflate'] : ['deflate', 'lz4'];
      let firstError: any = null;
      let out: Uint8Array | null = null;
      for (const codec of order) {
        try {
          out = codec === 'lz4' ? lz4DecompressBlock(packed, h.blockSize) : inflateSync(packed);
          break;
        } catch (e) { if (!firstError) firstError = e; }
      }
      if (!out) throw firstError || new Error(`CSO block ${i} could not be decompressed`);
      if (out.length < h.blockSize && i < h.blocks - 1) {
        throw new Error(`CSO block ${i} decompressed to ${out.length} of ${h.blockSize} bytes`);
      }
      plain = out;
    }

    // Bounded LRU: Map preserves insertion order, so the oldest key is first.
    cache.set(i, plain);
    if (cache.size > CACHE_BLOCKS) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    return plain;
  };

  return {
    size: h.totalBytes,
    async read(offset: number, length: number): Promise<Uint8Array> {
      const start = Math.max(0, Math.min(offset, h.totalBytes));
      const end = Math.min(h.totalBytes, start + Math.max(0, length));
      if (end <= start) return new Uint8Array(0);

      const first = Math.floor(start / h.blockSize);
      const last = Math.floor((end - 1) / h.blockSize);
      const out = new Uint8Array(end - start);
      let written = 0;
      for (let i = first; i <= last; i++) {
        const block = await readBlock(i);
        const blockStart = i * h.blockSize;
        const from = Math.max(0, start - blockStart);
        const to = Math.min(block.length, end - blockStart);
        if (to > from) { out.set(block.subarray(from, to), written); written += to - from; }
      }
      return written === out.length ? out : out.subarray(0, written);
    },
  };
}
