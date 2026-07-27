// Pure-JS CHD (Compressed Hunks of Data) reader, scoped to what RetroAchievements
// disc hashing needs: read decoded CD sectors out of a v5 CHD. Ports the parts of
// libchdr (header, compressed v5 hunk map, hunk decode) and RALibretro's
// HashCHD.cpp (CD track → CHD-frame mapping, per-track sector layout).
//
// Codecs: none, zlib (raw deflate via fflate), lzma, cdzl (CD zlib), cdlz (CD lzma).
// FLAC/zstd codecs (cdfl/cdzs) are audio-track only and never carry the boot
// executable we hash, so they're intentionally unsupported and throw.
//
// Hashing only ever reads the 2048/2336/2352-byte sector *payload* (never the
// sync/header/ECC), and libchdr's CD codecs keep that payload intact in the base
// (lzma/zlib) stream — so we decode only the base stream per hunk and skip the
// subcode + ECC/sync reconstruction entirely.
import { inflateSync } from 'fflate';
import { BitStream } from './bitstream';
import { HuffmanDecoder } from './huffman';
import { lzmaRawDecode } from './lzma';
import { RandomReader } from './reader';

const CD_FRAME_SIZE = 2448;
const CD_MAX_SECTOR_DATA = 2352;

const makeTag = (s: string) => ((s.charCodeAt(0) << 24) | (s.charCodeAt(1) << 16) | (s.charCodeAt(2) << 8) | s.charCodeAt(3)) >>> 0;
const CODEC_NONE = 0;
const CODEC_ZLIB = makeTag('zlib');
const CODEC_LZMA = makeTag('lzma');
const CODEC_CD_ZLIB = makeTag('cdzl');
const CODEC_CD_LZMA = makeTag('cdlz');

const TAG_CHTR = makeTag('CHTR'); // CDROM_TRACK_METADATA
const TAG_CHT2 = makeTag('CHT2'); // CDROM_TRACK_METADATA2
const TAG_CHGD = makeTag('CHGD'); // GDROM_TRACK_METADATA
const TAG_DVD = makeTag('DVD ');

// V5 compressed-map hunk types.
const COMPRESSION_TYPE_0 = 0;
const COMPRESSION_NONE = 4;
const COMPRESSION_SELF = 5;
const COMPRESSION_PARENT = 6;
const COMPRESSION_RLE_SMALL = 7;
const COMPRESSION_RLE_LARGE = 8;
const COMPRESSION_SELF_0 = 9;
const COMPRESSION_SELF_1 = 10;
const COMPRESSION_PARENT_SELF = 11;
const COMPRESSION_PARENT_0 = 12;
const COMPRESSION_PARENT_1 = 13;

// Special track selectors (match rcheevos RC_HASH_CDTRACK_*).
export const CDTRACK_FIRST_DATA = 0xffffffff;
export const CDTRACK_LAST = 0xfffffffe;
export const CDTRACK_LARGEST = 0xfffffffd;
export const CDTRACK_FIRST_OF_SECOND_SESSION = 0xfffffffc;

const u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u24 = (b: Uint8Array, o: number) => (b[o] << 16) | (b[o + 1] << 8) | b[o + 2];
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u48 = (b: Uint8Array, o: number) => u16(b, o) * 0x1_0000_0000 + u32(b, o + 2);
const u64 = (b: Uint8Array, o: number) => u32(b, o) * 0x1_0000_0000 + u32(b, o + 4);

// CRC-16/CCITT (poly 0x1021, init 0xffff) matching libchdr's crc16 — used to
// verify the decompressed v5 map, which also validates our huffman/bitstream port.
const CRC16_TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();
function crc16(data: Uint8Array, length: number): number {
  let crc = 0xffff;
  for (let i = 0; i < length; i++) crc = ((crc << 8) ^ CRC16_TABLE[((crc >> 8) ^ data[i]) & 0xff]) & 0xffff;
  return crc;
}

function inflateRaw(src: Uint8Array, size: number): Uint8Array {
  return inflateSync(src, { out: new Uint8Array(size) });
}

export interface ChdTrack {
  firstSector: number;
  frameOffset: number;
  framesInTrack: number;
  sectorDataSize: number;
  sectorHeaderSize: number;
}

type Metadata = { track: number; type: string; frames: number; pregap: number; sectorOffset: number; frameOffset: number };

export class ChdFile {
  private version = 0;
  private compression = [0, 0, 0, 0];
  private hunkBytes = 0;
  private unitBytes = 0;
  private hunkCount = 0;
  private logicalBytes = 0;
  private mapOffset = 0;
  private metaOffset = 0;
  private mapEntryBytes = 0;
  private rawmap!: Uint8Array;
  private compressed = false;
  // one-entry hunk cache (sector reads within a track are sequential)
  private cacheHunk = -1;
  private cacheData: Uint8Array | null = null;

  constructor(private reader: RandomReader) {}

  get hunkbytes() { return this.hunkBytes; }
  get unitbytes() { return this.unitBytes; }
  get framesPerHunk() { return Math.floor(this.hunkBytes / this.unitBytes); }

  async open(): Promise<void> {
    const head = await this.reader.read(0, 16);
    for (let i = 0; i < 8; i++) if (head[i] !== 'MComprHD'.charCodeAt(i)) throw new Error('Not a CHD file');
    const length = u32(head, 8);
    this.version = u32(head, 12);
    if (this.version !== 5) throw new Error(`Unsupported CHD version ${this.version} (only v5)`);
    const raw = await this.reader.read(0, length);
    this.compression = [u32(raw, 16), u32(raw, 20), u32(raw, 24), u32(raw, 28)];
    this.logicalBytes = u64(raw, 32);
    this.mapOffset = u64(raw, 40);
    this.metaOffset = u64(raw, 48);
    this.hunkBytes = u32(raw, 56);
    this.unitBytes = u32(raw, 60);
    if (this.hunkBytes === 0 || this.unitBytes === 0) throw new Error('Invalid CHD header');
    this.hunkCount = Math.floor((this.logicalBytes + this.hunkBytes - 1) / this.hunkBytes);
    this.compressed = this.compression[0] !== CODEC_NONE;
    this.mapEntryBytes = this.compressed ? 12 : 4;
    await this.readMap();
  }

  private async readMap(): Promise<void> {
    const rawMapSize = this.hunkCount * this.mapEntryBytes;
    if (!this.compressed) {
      this.rawmap = await this.reader.read(this.mapOffset, rawMapSize);
      return;
    }
    // decompress_v5_map
    const rawbuf = await this.reader.read(this.mapOffset, 16);
    const mapBytes = u32(rawbuf, 0);
    const firstOffs = u48(rawbuf, 4);
    const mapCrc = u16(rawbuf, 10);
    const lengthBits = rawbuf[12];
    const selfBits = rawbuf[13];
    const parentBits = rawbuf[14];
    const compressed = await this.reader.read(this.mapOffset + 16, mapBytes);
    const bitbuf = new BitStream(compressed, mapBytes);
    const rawmap = new Uint8Array(rawMapSize);

    const decoder = new HuffmanDecoder(16, 8);
    if (!decoder.importTreeRle(bitbuf)) throw new Error('CHD map: huffman tree import failed');

    // first decode the compression type for each hunk
    let lastComp = 0, repCount = 0;
    for (let h = 0; h < this.hunkCount; h++) {
      const p = h * 12;
      if (repCount > 0) { rawmap[p] = lastComp; repCount--; }
      else {
        const val = decoder.decodeOne(bitbuf);
        if (val === COMPRESSION_RLE_SMALL) { rawmap[p] = lastComp; repCount = 2 + decoder.decodeOne(bitbuf); }
        else if (val === COMPRESSION_RLE_LARGE) { rawmap[p] = lastComp; repCount = 2 + 16 + (decoder.decodeOne(bitbuf) << 4); repCount += decoder.decodeOne(bitbuf); }
        else { rawmap[p] = lastComp = val; }
      }
    }

    // then extract per-hunk length/offset/crc
    let curOffset = firstOffs, lastSelf = 0, lastParent = 0;
    for (let h = 0; h < this.hunkCount; h++) {
      const p = h * 12;
      let offset = curOffset, length = 0, crc = 0;
      switch (rawmap[p]) {
        case COMPRESSION_TYPE_0: case 1: case 2: case 3:
          length = bitbuf.read(lengthBits); curOffset += length; crc = bitbuf.read(16); break;
        case COMPRESSION_NONE:
          length = this.hunkBytes; curOffset += length; crc = bitbuf.read(16); break;
        case COMPRESSION_SELF:
          offset = bitbuf.read(selfBits); lastSelf = offset; break;
        case COMPRESSION_PARENT:
          offset = bitbuf.read(parentBits); lastParent = offset; break;
        case COMPRESSION_SELF_1: lastSelf++; /* fallthrough */
        case COMPRESSION_SELF_0: rawmap[p] = COMPRESSION_SELF; offset = lastSelf; break;
        case COMPRESSION_PARENT_SELF:
          rawmap[p] = COMPRESSION_PARENT; offset = Math.floor((h * this.hunkBytes) / this.unitBytes); lastParent = offset; break;
        case COMPRESSION_PARENT_1: lastParent += Math.floor(this.hunkBytes / this.unitBytes); /* fallthrough */
        case COMPRESSION_PARENT_0: rawmap[p] = COMPRESSION_PARENT; offset = lastParent; break;
      }
      // write UINT24 length, UINT48 offset, UINT16 crc
      rawmap[p + 1] = (length >> 16) & 0xff; rawmap[p + 2] = (length >> 8) & 0xff; rawmap[p + 3] = length & 0xff;
      const hi = Math.floor(offset / 0x1_0000_0000), lo = offset >>> 0;
      rawmap[p + 4] = (hi >> 8) & 0xff; rawmap[p + 5] = hi & 0xff;
      rawmap[p + 6] = (lo >>> 24) & 0xff; rawmap[p + 7] = (lo >>> 16) & 0xff; rawmap[p + 8] = (lo >>> 8) & 0xff; rawmap[p + 9] = lo & 0xff;
      rawmap[p + 10] = (crc >> 8) & 0xff; rawmap[p + 11] = crc & 0xff;
    }
    if (crc16(rawmap, this.hunkCount * 12) !== mapCrc) throw new Error('CHD map CRC mismatch (decode error or corrupt file)');
    this.rawmap = rawmap;
  }

  async readHunk(hunknum: number): Promise<Uint8Array> {
    if (hunknum === this.cacheHunk && this.cacheData) return this.cacheData;
    const data = await this.decodeHunk(hunknum, 0);
    this.cacheHunk = hunknum;
    this.cacheData = data;
    return data;
  }

  private async decodeHunk(hunknum: number, depth: number): Promise<Uint8Array> {
    if (depth > 16) throw new Error('CHD: self-reference loop');
    if (hunknum >= this.hunkCount) throw new Error('CHD: hunk out of range');
    const p = hunknum * this.mapEntryBytes;

    if (!this.compressed) {
      const blockOffs = u32(this.rawmap, p) * this.hunkBytes;
      if (blockOffs !== 0) return this.reader.read(blockOffs, this.hunkBytes);
      return new Uint8Array(this.hunkBytes); // zero-filled hole
    }

    const type = this.rawmap[p];
    const blockLen = u24(this.rawmap, p + 1);
    const blockOffs = u48(this.rawmap, p + 4);
    if (type <= 3) {
      const comp = await this.reader.read(blockOffs, blockLen);
      return this.decodeCodec(this.compression[type], comp, this.hunkBytes);
    }
    if (type === COMPRESSION_NONE) return this.reader.read(blockOffs, this.hunkBytes);
    if (type === COMPRESSION_SELF) return this.decodeHunk(blockOffs, depth + 1);
    throw new Error('CHD: parent-referenced hunks are not supported');
  }

  private decodeCodec(tag: number, comp: Uint8Array, destLen: number): Uint8Array {
    if (tag === CODEC_ZLIB) return inflateRaw(comp, destLen);
    if (tag === CODEC_LZMA) return lzmaRawDecode(comp, 3, 0, 2, destLen, destLen);
    if (tag === CODEC_CD_ZLIB || tag === CODEC_CD_LZMA) return this.decodeCdCodec(tag, comp, destLen);
    throw new Error(`CHD: unsupported codec 0x${tag.toString(16)} (FLAC/zstd data tracks are not supported)`);
  }

  // cd_codec_decompress (base stream only). We rebuild each frame's 2352-byte
  // sector region from the base codec; subcode + ECC/sync are not needed for hashing.
  private decodeCdCodec(tag: number, src: Uint8Array, destLen: number): Uint8Array {
    const frames = Math.floor(destLen / CD_FRAME_SIZE);
    const complenBytes = destLen < 65536 ? 2 : 3;
    const eccBytes = (frames + 7) >> 3;
    const headerBytes = eccBytes + complenBytes;
    let complenBase = (src[eccBytes] << 8) | src[eccBytes + 1];
    if (complenBytes > 2) complenBase = (complenBase << 8) | src[eccBytes + 2];
    const baseSize = frames * CD_MAX_SECTOR_DATA;
    const baseComp = src.subarray(headerBytes, headerBytes + complenBase);
    const base = tag === CODEC_CD_LZMA
      ? lzmaRawDecode(baseComp, 3, 0, 2, baseSize, baseSize)
      : inflateRaw(baseComp, baseSize);
    const dest = new Uint8Array(destLen);
    for (let f = 0; f < frames; f++) dest.set(base.subarray(f * CD_MAX_SECTOR_DATA, (f + 1) * CD_MAX_SECTOR_DATA), f * CD_FRAME_SIZE);
    return dest;
  }

  // --- metadata / tracks (mirrors RALibretro HashCHD.cpp) ---

  private async readMetadata(tag: number, index: number): Promise<string | null> {
    let offset = this.metaOffset, iter = 0;
    while (offset !== 0) {
      if (++iter > 65536) return null;
      const head = await this.reader.read(offset, 16);
      const metatag = u32(head, 0);
      let length = u32(head, 4);
      const next = u64(head, 8);
      length &= 0x00ffffff;
      if (metatag === tag) {
        if (index-- === 0) {
          const data = await this.reader.read(offset + 16, length);
          let s = '';
          for (let i = 0; i < data.length && data[i] !== 0; i++) s += String.fromCharCode(data[i]);
          return s;
        }
      }
      offset = next;
    }
    return null;
  }

  private async getTrackMetadata(index: number): Promise<Metadata | null> {
    const parse = (s: string): Metadata => {
      const get = (re: RegExp, def = 0) => { const m = s.match(re); return m ? parseInt(m[1], 10) : def; };
      const typeM = s.match(/TYPE:(\S+)/);
      return { track: get(/TRACK:(\d+)/), type: typeM ? typeM[1] : '', frames: get(/FRAMES:(\d+)/), pregap: get(/PREGAP:(\d+)/), sectorOffset: 0, frameOffset: 0 };
    };
    let s = await this.readMetadata(TAG_CHT2, index);
    if (s !== null) return parse(s);
    s = await this.readMetadata(TAG_CHTR, index);
    if (s !== null) return parse(s);
    s = await this.readMetadata(TAG_CHGD, index);
    if (s !== null) return parse(s);
    if (index === 0) {
      const dvd = await this.readMetadata(TAG_DVD, 0);
      if (dvd !== null) {
        const unitCount = Math.floor((this.logicalBytes + this.unitBytes - 1) / this.unitBytes);
        return { track: 1, type: 'MODE1', frames: unitCount, pregap: 0, sectorOffset: 0, frameOffset: 0 };
      }
    }
    return null;
  }

  private async findTrack(track: number): Promise<Metadata | null> {
    if (track === CDTRACK_FIRST_OF_SECOND_SESSION) track = 2;
    let sectorOffset = 0, frameOffset = 0, largestSize = 0, largestIdx = 0, idx = 0;
    for (; ; idx++) {
      const md = await this.getTrackMetadata(idx);
      if (!md) break;
      md.sectorOffset = sectorOffset;
      sectorOffset += md.frames;
      frameOffset += md.pregap;
      md.frameOffset = frameOffset;
      const padding = ((md.frames + 3) & ~3) - md.frames;
      frameOffset += md.frames + padding;

      if (md.track === track) return md;
      if (md.type === 'AUDIO') continue;
      if (track === CDTRACK_FIRST_DATA) return md;
      if (md.frames > largestSize) { largestSize = md.frames; largestIdx = idx; }
    }
    if (track === CDTRACK_LAST) {
      // re-fetch the last track (idx-1)
      return idx > 0 ? this.rebuild(idx - 1) : null;
    }
    if (track === CDTRACK_LARGEST) return this.rebuild(largestIdx);
    return null;
  }

  // Recompute sector/frame offsets up to a given track index (for LAST/LARGEST,
  // which are only known after the full scan).
  private async rebuild(targetIdx: number): Promise<Metadata | null> {
    let sectorOffset = 0, frameOffset = 0;
    for (let idx = 0; ; idx++) {
      const md = await this.getTrackMetadata(idx);
      if (!md) return null;
      md.sectorOffset = sectorOffset;
      sectorOffset += md.frames;
      frameOffset += md.pregap;
      md.frameOffset = frameOffset;
      const padding = ((md.frames + 3) & ~3) - md.frames;
      frameOffset += md.frames + padding;
      if (idx === targetIdx) return md;
    }
  }

  async openTrack(track: number): Promise<ChdTrack | null> {
    const md = await this.findTrack(track);
    if (!md) return null;
    const t: ChdTrack = {
      firstSector: md.sectorOffset,
      frameOffset: md.frameOffset,
      framesInTrack: md.frames,
      sectorDataSize: 2352,
      sectorHeaderSize: 0,
    };
    if (md.type === 'MODE1_RAW') { t.sectorDataSize = 2048; t.sectorHeaderSize = 16; return t; }
    if (md.type === 'MODE1') { t.sectorDataSize = 2048; t.sectorHeaderSize = 0; return t; }
    if (md.type === 'AUDIO') { t.sectorDataSize = 2352; t.sectorHeaderSize = 0; return t; }
    if (md.type === 'MODE2_RAW') { t.sectorDataSize = 2336; t.sectorHeaderSize = 0; }
    else { t.sectorDataSize = 2352; t.sectorHeaderSize = 0; }

    // probe the TOC (sector 16) to refine the sector layout
    const buffer = new Uint8Array(32);
    if (await this.readSector(t, t.firstSector + 16, buffer, 32) !== 32) return null;
    const cd001 = (o: number) => buffer[o] === 0x43 && buffer[o + 1] === 0x44 && buffer[o + 2] === 0x30 && buffer[o + 3] === 0x30 && buffer[o + 4] === 0x31;
    if (cd001(25)) { t.sectorDataSize = (buffer[16 + 2] & 0x20) ? 2324 : 2048; t.sectorHeaderSize = 24; }
    else if (cd001(17)) { t.sectorDataSize = ((buffer[15] & 3) === 1) ? 2048 : 2336; t.sectorHeaderSize = 16; }
    else if (cd001(1)) { t.sectorDataSize = 2048; t.sectorHeaderSize = 0; }
    else if (buffer[0] === 0x00 && buffer[11] === 0x00 && buffer[1] === 0xff) { t.sectorDataSize = ((buffer[15] & 3) === 1) ? 2048 : 2336; t.sectorHeaderSize = 16; }
    else { t.sectorDataSize = 2048; t.sectorHeaderSize = 0; }
    return t;
  }

  firstTrackSector(t: ChdTrack): number { return t.firstSector; }

  async readSector(t: ChdTrack, sector: number, out: Uint8Array, requested: number): Promise<number> {
    if (sector < t.firstSector) return 0;
    let chdFrame = sector - t.firstSector;
    if (chdFrame > t.framesInTrack) return 0;
    chdFrame += t.frameOffset;
    let hunk = Math.floor(chdFrame / this.framesPerHunk);
    let offset = (chdFrame % this.framesPerHunk) * this.unitBytes + t.sectorHeaderSize;
    let bytesRead = 0;
    for (;;) {
      const hunkData = await this.readHunk(hunk);
      if (requested <= t.sectorDataSize) {
        out.set(hunkData.subarray(offset, offset + requested), bytesRead);
        bytesRead += requested;
        break;
      }
      out.set(hunkData.subarray(offset, offset + t.sectorDataSize), bytesRead);
      bytesRead += t.sectorDataSize;
      requested -= t.sectorDataSize;
      offset += this.unitBytes;
      if (offset > this.hunkBytes) { offset = t.sectorHeaderSize; hunk++; }
    }
    return bytesRead;
  }
}
