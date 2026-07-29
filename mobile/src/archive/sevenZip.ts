// Pure-JS 7-Zip (.7z) reader — enough to list entries and extract one.
//
// ROM sets are very commonly distributed as .7z, and Android has no way to shell
// out to a native decoder, so this implements the container format directly on
// top of our LZMA/LZMA2 decoder (src/lzma/decoder.ts).
//
// Supported coders: Copy (00), LZMA (030101) and LZMA2 (21) — what 7-Zip
// produces for ordinary data. Filter chains (BCJ/Delta/BCJ2), PPMd and encrypted
// archives are reported as unsupported rather than silently mis-decoded.
//
// Format reference: the DOC/7zFormat.txt specification shipped with the LZMA SDK.
import { RandomReader } from '../disc/reader';
import { ByteSink, lzma1Decode, LzmaDecoder } from '../lzma/decoder';

const SIGNATURE = [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c];
const SIGNATURE_HEADER_SIZE = 32;

// Property IDs (7zFormat.txt).
const kEnd = 0x00, kHeader = 0x01, kArchiveProperties = 0x02, kAdditionalStreamsInfo = 0x03,
  kMainStreamsInfo = 0x04, kFilesInfo = 0x05, kPackInfo = 0x06, kUnPackInfo = 0x07,
  kSubStreamsInfo = 0x08, kSize = 0x09, kCRC = 0x0a, kFolder = 0x0b, kCodersUnPackSize = 0x0c,
  kNumUnPackStream = 0x0d, kEmptyStream = 0x0e, kEmptyFile = 0x0f, kAnti = 0x10, kName = 0x11,
  kEncodedHeader = 0x17, kDummy = 0x19;

const CODER_COPY = '00';
const CODER_LZMA = '030101';
const CODER_LZMA2 = '21';

export class SevenZipError extends Error {}

// Sequential reader over a byte buffer with 7z's variable-length number encoding.
class ByteReader {
  pos = 0;
  constructor(public data: Uint8Array) {}
  get eof(): boolean { return this.pos >= this.data.length; }
  byte(): number {
    if (this.pos >= this.data.length) throw new SevenZipError('7z: truncated header');
    return this.data[this.pos++];
  }
  bytes(n: number): Uint8Array {
    const out = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }
  u32(): number {
    return (this.byte() | (this.byte() << 8) | (this.byte() << 16) | (this.byte() * 0x1000000)) >>> 0;
  }
  u64(): number {
    let v = 0;
    for (let i = 0; i < 8; i++) v += this.byte() * Math.pow(2, 8 * i);
    return v;
  }
  // 7z "ReadNumber": a first byte whose high bits say how many extra bytes follow.
  number(): number {
    const first = this.byte();
    let mask = 0x80;
    let value = 0;
    for (let i = 0; i < 8; i++) {
      if ((first & mask) === 0) {
        const high = first & (mask - 1);
        return value + high * Math.pow(2, 8 * i);
      }
      value += this.byte() * Math.pow(2, 8 * i);
      mask >>= 1;
    }
    return value;
  }
  bitVector(n: number): boolean[] {
    const out: boolean[] = [];
    let b = 0, mask = 0;
    for (let i = 0; i < n; i++) {
      if (mask === 0) { b = this.byte(); mask = 0x80; }
      out.push((b & mask) !== 0);
      mask >>= 1;
    }
    return out;
  }
  // A bit vector preceded by an "all true" shortcut byte.
  optionalBitVector(n: number): boolean[] {
    const allDefined = this.byte();
    if (allDefined !== 0) return new Array(n).fill(true);
    return this.bitVector(n);
  }
  skipTo(end: number): void { this.pos = end; }
}

type Coder = { id: string; numInStreams: number; numOutStreams: number; props: Uint8Array };
type Folder = {
  coders: Coder[];
  bindPairs: { inIndex: number; outIndex: number }[];
  packedIndices: number[];
  unpackSizes: number[];
  numUnpackSubStreams: number;
  subStreamSizes: number[];
  packStreamIndex: number;
  packStreamCount: number;
};

type StreamsInfo = {
  packPos: number;
  packSizes: number[];
  folders: Folder[];
};

function readFolder(r: ByteReader): Folder {
  const numCoders = r.number();
  const coders: Coder[] = [];
  let totalIn = 0, totalOut = 0;
  for (let i = 0; i < numCoders; i++) {
    const flags = r.byte();
    const idSize = flags & 0x0f;
    const isComplex = (flags & 0x10) !== 0;
    const hasAttrs = (flags & 0x20) !== 0;
    const idBytes = r.bytes(idSize);
    let id = '';
    for (const b of idBytes) id += b.toString(16).padStart(2, '0');
    const numIn = isComplex ? r.number() : 1;
    const numOut = isComplex ? r.number() : 1;
    let props: Uint8Array = new Uint8Array(0);
    if (hasAttrs) props = r.bytes(r.number()).slice();
    coders.push({ id, numInStreams: numIn, numOutStreams: numOut, props });
    totalIn += numIn;
    totalOut += numOut;
  }
  const bindPairs: { inIndex: number; outIndex: number }[] = [];
  for (let i = 0; i < totalOut - 1; i++) bindPairs.push({ inIndex: r.number(), outIndex: r.number() });

  const numPacked = totalIn - bindPairs.length;
  const packedIndices: number[] = [];
  if (numPacked === 1) {
    let idx = 0;
    for (let i = 0; i < totalIn; i++) if (!bindPairs.some((bp) => bp.inIndex === i)) { idx = i; break; }
    packedIndices.push(idx);
  } else {
    for (let i = 0; i < numPacked; i++) packedIndices.push(r.number());
  }
  return {
    coders, bindPairs, packedIndices, unpackSizes: [],
    numUnpackSubStreams: 1, subStreamSizes: [], packStreamIndex: 0, packStreamCount: numPacked,
  };
}

function readStreamsInfo(r: ByteReader): StreamsInfo {
  let packPos = 0;
  let packSizes: number[] = [];
  let folders: Folder[] = [];

  for (;;) {
    const type = r.number();
    if (type === kEnd) break;

    if (type === kPackInfo) {
      packPos = r.number();
      const numPackStreams = r.number();
      for (;;) {
        const t = r.number();
        if (t === kEnd) break;
        if (t === kSize) {
          packSizes = [];
          for (let i = 0; i < numPackStreams; i++) packSizes.push(r.number());
        } else if (t === kCRC) {
          r.optionalBitVector(numPackStreams);
          // CRCs are 4 bytes each for the defined entries; we don't verify them.
          for (let i = 0; i < numPackStreams; i++) r.u32();
        } else {
          throw new SevenZipError(`7z: unexpected PackInfo property ${t}`);
        }
      }
    } else if (type === kUnPackInfo) {
      for (;;) {
        const t = r.number();
        if (t === kEnd) break;
        if (t === kFolder) {
          const numFolders = r.number();
          const external = r.byte();
          if (external !== 0) throw new SevenZipError('7z: external folder data is not supported');
          folders = [];
          for (let i = 0; i < numFolders; i++) folders.push(readFolder(r));
        } else if (t === kCodersUnPackSize) {
          for (const f of folders) {
            const totalOut = f.coders.reduce((s, c) => s + c.numOutStreams, 0);
            f.unpackSizes = [];
            for (let i = 0; i < totalOut; i++) f.unpackSizes.push(r.number());
          }
        } else if (t === kCRC) {
          const defined = r.optionalBitVector(folders.length);
          for (let i = 0; i < folders.length; i++) if (defined[i]) r.u32();
        } else {
          throw new SevenZipError(`7z: unexpected UnPackInfo property ${t}`);
        }
      }
      // assign packed-stream ranges to folders in order
      let idx = 0;
      for (const f of folders) { f.packStreamIndex = idx; idx += f.packStreamCount; }
    } else if (type === kSubStreamsInfo) {
      let numUnpackStreams = folders.map(() => 1);
      for (;;) {
        const t = r.number();
        if (t === kEnd) break;
        if (t === kNumUnPackStream) {
          numUnpackStreams = folders.map(() => r.number());
          folders.forEach((f, i) => { f.numUnpackSubStreams = numUnpackStreams[i]; });
        } else if (t === kSize) {
          folders.forEach((f, i) => {
            const n = numUnpackStreams[i];
            if (n === 0) { f.subStreamSizes = []; return; }
            const sizes: number[] = [];
            let sum = 0;
            for (let j = 0; j < n - 1; j++) { const s = r.number(); sizes.push(s); sum += s; }
            sizes.push(folderOutputSize(f) - sum);
            f.subStreamSizes = sizes;
          });
        } else if (t === kCRC) {
          // CRCs for sub-streams whose value isn't already known; skip them.
          const total = folders.reduce((s, f) => s + f.numUnpackSubStreams, 0);
          const defined = r.optionalBitVector(total);
          for (let i = 0; i < total; i++) if (defined[i]) r.u32();
        } else {
          throw new SevenZipError(`7z: unexpected SubStreamsInfo property ${t}`);
        }
      }
      for (const f of folders) {
        f.numUnpackSubStreams = f.numUnpackSubStreams || 1;
        if (!f.subStreamSizes.length) f.subStreamSizes = [folderOutputSize(f)];
      }
    } else {
      throw new SevenZipError(`7z: unexpected StreamsInfo property ${type}`);
    }
  }
  for (const f of folders) if (!f.subStreamSizes.length) f.subStreamSizes = [folderOutputSize(f)];
  return { packPos, packSizes, folders };
}

// A folder's final output = the output stream that no bind pair consumes.
function folderOutputSize(f: Folder): number {
  let outIndex = 0, seen = 0;
  for (let c = 0; c < f.coders.length; c++) {
    for (let o = 0; o < f.coders[c].numOutStreams; o++, seen++) {
      if (!f.bindPairs.some((bp) => bp.outIndex === seen)) outIndex = seen;
    }
  }
  return f.unpackSizes[outIndex] ?? f.unpackSizes[f.unpackSizes.length - 1] ?? 0;
}

export type SevenZipEntry = {
  name: string;
  size: number;
  isDir: boolean;
  folderIndex: number;
  /** Byte offset of this entry inside its folder's decoded output. */
  offsetInFolder: number;
};

type Archive = { entries: SevenZipEntry[]; streams: StreamsInfo; baseOffset: number };

function parseHeader(r: ByteReader, streams: StreamsInfo | null): { entries: SevenZipEntry[]; streams: StreamsInfo } {
  let info: StreamsInfo = streams ?? { packPos: 0, packSizes: [], folders: [] };
  const entries: SevenZipEntry[] = [];

  for (;;) {
    if (r.eof) break;
    const type = r.number();
    if (type === kEnd) break;

    if (type === kMainStreamsInfo) {
      info = readStreamsInfo(r);
    } else if (type === kArchiveProperties) {
      for (;;) {
        const t = r.number();
        if (t === kEnd) break;
        r.bytes(r.number());
      }
    } else if (type === kAdditionalStreamsInfo) {
      throw new SevenZipError('7z: archives with additional streams are not supported');
    } else if (type === kFilesInfo) {
      const numFiles = r.number();
      let emptyStream: boolean[] = new Array(numFiles).fill(false);
      let emptyFile: boolean[] = [];
      let names: string[] = [];

      for (;;) {
        const propType = r.number();
        if (propType === kEnd) break;
        const size = r.number();
        const end = r.pos + size;
        if (propType === kEmptyStream) {
          emptyStream = r.bitVector(numFiles);
        } else if (propType === kEmptyFile) {
          const numEmpty = emptyStream.filter(Boolean).length;
          emptyFile = r.bitVector(numEmpty);
        } else if (propType === kName) {
          const external = r.byte();
          if (external !== 0) throw new SevenZipError('7z: external file names are not supported');
          names = [];
          let cur = '';
          while (r.pos + 1 < end) {
            const code = r.byte() | (r.byte() << 8);
            if (code === 0) { names.push(cur); cur = ''; }
            else cur += String.fromCharCode(code);
          }
          if (cur) names.push(cur);
        } else if (propType === kDummy) {
          r.skipTo(end);
        } else {
          r.skipTo(end);
        }
        r.skipTo(end);
      }

      // Map files to sub-streams: every file with a stream consumes the next
      // sub-stream, walking folders in order.
      let folderIdx = 0, subIdx = 0, offsetInFolder = 0, emptyIdx = 0;
      for (let i = 0; i < numFiles; i++) {
        const name = names[i] ?? `file${i}`;
        if (emptyStream[i]) {
          // No stream: either an empty file or a directory.
          const isEmptyFile = emptyFile[emptyIdx++] ?? false;
          entries.push({ name, size: 0, isDir: !isEmptyFile, folderIndex: -1, offsetInFolder: 0 });
          continue;
        }
        while (folderIdx < info.folders.length && subIdx >= info.folders[folderIdx].numUnpackSubStreams) {
          folderIdx++; subIdx = 0; offsetInFolder = 0;
        }
        const folder = info.folders[folderIdx];
        const size = folder ? (folder.subStreamSizes[subIdx] ?? 0) : 0;
        entries.push({ name, size, isDir: false, folderIndex: folderIdx, offsetInFolder });
        offsetInFolder += size;
        subIdx++;
      }
    } else {
      throw new SevenZipError(`7z: unexpected header property ${type}`);
    }
  }
  return { entries, streams: info };
}

// Read the archive's header (decoding it first when it is itself compressed).
export async function openSevenZip(reader: RandomReader): Promise<Archive> {
  const sig = await reader.read(0, SIGNATURE_HEADER_SIZE);
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (sig[i] !== SIGNATURE[i]) throw new SevenZipError('Not a 7z archive');
  }
  const sr = new ByteReader(sig);
  sr.pos = 12;
  const nextHeaderOffset = sr.u64();
  const nextHeaderSize = sr.u64();
  if (nextHeaderSize === 0) return { entries: [], streams: { packPos: 0, packSizes: [], folders: [] }, baseOffset: SIGNATURE_HEADER_SIZE };

  let headerBytes = await reader.read(SIGNATURE_HEADER_SIZE + nextHeaderOffset, nextHeaderSize);
  let r = new ByteReader(headerBytes);
  let type = r.number();

  if (type === kEncodedHeader) {
    // The header itself is compressed: decode its single folder, then re-parse.
    const info = readStreamsInfo(r);
    if (!info.folders.length) throw new SevenZipError('7z: encoded header without data');
    const chunks: Uint8Array[] = [];
    await decodeFolder(reader, info, 0, SIGNATURE_HEADER_SIZE, (b) => chunks.push(b.slice()));
    headerBytes = concat(chunks);
    r = new ByteReader(headerBytes);
    type = r.number();
  }
  if (type !== kHeader) throw new SevenZipError('7z: unsupported header format');

  const { entries, streams } = parseHeader(r, null);
  return { entries, streams, baseOffset: SIGNATURE_HEADER_SIZE };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// Decode one folder's output, pushing decoded bytes to `sink`.
async function decodeFolder(
  reader: RandomReader, info: StreamsInfo, folderIndex: number, baseOffset: number, sink: ByteSink,
): Promise<void> {
  const folder = info.folders[folderIndex];
  if (!folder) throw new SevenZipError('7z: folder out of range');
  if (folder.coders.length !== 1) {
    throw new SevenZipError('7z: this archive uses a filter chain (e.g. BCJ) that is not supported here');
  }
  const coder = folder.coders[0];
  const outSize = folderOutputSize(folder);

  // Where this folder's packed data starts.
  let packOffset = baseOffset + info.packPos;
  for (let i = 0; i < folder.packStreamIndex; i++) packOffset += info.packSizes[i];
  const packSize = info.packSizes[folder.packStreamIndex] ?? 0;

  if (coder.id === CODER_COPY) {
    const CHUNK = 1 << 20;
    for (let off = 0; off < packSize; off += CHUNK) {
      sink(await reader.read(packOffset + off, Math.min(CHUNK, packSize - off)));
    }
    return;
  }
  if (coder.id === CODER_LZMA2) {
    await lzma2DecodeStreamed(coder.props, reader, packOffset, packSize, outSize, sink);
    return;
  }
  if (coder.id === CODER_LZMA) {
    // LZMA1 has no chunk framing, so the decoder consumes one continuous stream.
    // Reading that whole stream up front would mean a single multi-hundred-MB
    // allocation — the thing that makes a big archive crawl or die on a phone.
    // With a synchronous reader we feed it in slices instead, at constant memory.
    const SLICE = 4 * 1024 * 1024;
    if (reader.readSync) {
      const readSync = reader.readSync.bind(reader);
      let pos = packOffset;
      const end = packOffset + packSize;
      const first = readSync(pos, Math.min(SLICE, end - pos));
      pos += first.length;
      lzma1Decode(coder.props, first, outSize, sink, () => {
        if (pos >= end) return null;
        const next = readSync(pos, Math.min(SLICE, end - pos));
        pos += next.length;
        return next.length ? next : null;
      });
      return;
    }
    // No synchronous reader (unusual providers): fall back to a bounded whole read.
    const MAX_LZMA1 = 96 * 1024 * 1024;
    if (packSize > MAX_LZMA1) {
      throw new SevenZipError('7z: this archive is too large to unpack on this device (its compressed block cannot be streamed here)');
    }
    const src = await reader.read(packOffset, packSize);
    lzma1Decode(coder.props, src, outSize, sink);
    return;
  }
  throw new SevenZipError(`7z: unsupported compression method (coder ${coder.id}) — PPMd/BCJ2 and encrypted archives need the desktop app`);
}

// LZMA2 stores its data as small chunks (at most 2 MiB unpacked, 64 KiB packed),
// so the compressed input can be pulled in piece by piece instead of held whole.
async function lzma2DecodeStreamed(
  props: Uint8Array, reader: RandomReader, packOffset: number, packSize: number, outSize: number, sink: ByteSink,
): Promise<void> {
  const dictSize = lzma2DictSizeFromByte(props[0] ?? 40);
  const dec = new LzmaDecoder(Math.min(Math.max(dictSize, 4096), Math.max(outSize, 4096) + 4096), sink);
  let p = 0;
  let produced = 0;
  let needStateReset = true;

  while (p < packSize && produced < outSize) {
    const head = await reader.read(packOffset + p, Math.min(6, packSize - p));
    if (!head.length) break;
    const control = head[0];
    if (control === 0) break;

    if (control === 1 || control === 2) {
      const size = ((head[1] << 8) | head[2]) + 1;
      const body = await reader.read(packOffset + p + 3, size);
      if (control === 1) dec.resetDict();
      dec.putRaw(body);
      p += 3 + size;
      produced += size;
      needStateReset = true;
      continue;
    }
    if (control < 0x80) throw new SevenZipError(`7z/LZMA2: bad control byte 0x${control.toString(16)}`);

    const unpackSize = (((control & 0x1f) << 16) | (head[1] << 8) | head[2]) + 1;
    const chunkPackSize = ((head[3] << 8) | head[4]) + 1;
    const mode = (control >> 5) & 0x3;
    let headerLen = 5;
    if (mode >= 2) { dec.setPropsByte(head[5]); headerLen = 6; }
    if (mode >= 1 || needStateReset) dec.resetState();
    if (mode === 3) dec.resetDict();
    needStateReset = false;

    const body = await reader.read(packOffset + p + headerLen, chunkPackSize);
    dec.decodeChunk(body, unpackSize);
    p += headerLen + chunkPackSize;
    produced += unpackSize;
  }
  dec.flush();
}

function lzma2DictSizeFromByte(b: number): number {
  if (b > 40) return 1 << 24;
  if (b === 40) return 0xffffffff;
  return (2 | (b & 1)) << (b / 2 + 11);
}

// Extract one entry, streaming its bytes to `sink`. Bytes before and after the
// entry inside a solid block are decoded but discarded.
export async function extractSevenZipEntry(
  reader: RandomReader, archive: Archive, entry: SevenZipEntry, sink: ByteSink,
): Promise<void> {
  if (entry.isDir || entry.folderIndex < 0) return;
  let pos = 0;
  const start = entry.offsetInFolder;
  const end = start + entry.size;
  await decodeFolder(reader, archive.streams, entry.folderIndex, archive.baseOffset, (bytes) => {
    const chunkStart = pos;
    const chunkEnd = pos + bytes.length;
    pos = chunkEnd;
    if (chunkEnd <= start || chunkStart >= end) return;
    const from = Math.max(0, start - chunkStart);
    const to = Math.min(bytes.length, end - chunkStart);
    if (to > from) sink(bytes.subarray(from, to));
  });
}
