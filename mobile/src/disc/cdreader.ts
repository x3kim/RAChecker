// Unified CD sector reader used by the disc hash rules. Two backends:
//   - ChdCdReader   — .chd (self-contained: has full track metadata, all systems)
//   - BinCdReader   — a single raw .bin/.iso image (track 1 only)
// Both expose the small rcheevos cdreader surface the rules call.
import { RandomReader } from './reader';
import { ChdFile, ChdTrack } from './chd';

export interface CdReader {
  openTrack(track: number): Promise<unknown | null>;
  readSector(handle: unknown, sector: number, out: Uint8Array, bytes: number): Promise<number>;
  firstTrackSector(handle: unknown): number;
}

export class ChdCdReader implements CdReader {
  private constructor(private chd: ChdFile) {}
  static async open(reader: RandomReader): Promise<ChdCdReader> {
    const chd = new ChdFile(reader);
    await chd.open();
    return new ChdCdReader(chd);
  }
  openTrack(track: number) { return this.chd.openTrack(track); }
  readSector(handle: unknown, sector: number, out: Uint8Array, bytes: number) { return this.chd.readSector(handle as ChdTrack, sector, out, bytes); }
  firstTrackSector(handle: unknown) { return this.chd.firstTrackSector(handle as ChdTrack); }
}

type BinTrack = {
  sectorSize: number;
  sectorHeaderSize: number;
  rawDataSize: number;
  trackFirstSector: number;
  trackPregapSectors: number;
  fileTrackOffset: number;
};

const SYNC = new Uint8Array([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x00]);
function matches(buf: Uint8Array, pat: Uint8Array, len: number): boolean {
  for (let i = 0; i < len; i++) if (buf[i] !== pat[i]) return false;
  return true;
}
function isCd001(buf: Uint8Array, o: number): boolean {
  return buf[o] === 0x43 && buf[o + 1] === 0x44 && buf[o + 2] === 0x30 && buf[o + 3] === 0x30 && buf[o + 4] === 0x31;
}
function getSectorFromHeader(h: Uint8Array): number {
  const bcd = (b: number) => (b >> 4) * 10 + (b & 0x0f);
  return (bcd(h[12]) * 60 + bcd(h[13])) * 75 + bcd(h[14]) - 150;
}

// A single raw .bin / .iso (track 1). Port of cdreader.c's bin-track path.
export class BinCdReader implements CdReader {
  private constructor(private reader: RandomReader, private track: BinTrack) {}

  static async open(reader: RandomReader): Promise<BinCdReader | null> {
    const t: BinTrack = { sectorSize: 0, sectorHeaderSize: 0, rawDataSize: 2048, trackFirstSector: 0, trackPregapSectors: 0, fileTrackOffset: 0 };
    const tocSector = 16 + t.trackPregapSectors;

    // determine sector size by looking for the sync pattern / CD001 at sector 16
    let header = await reader.read(tocSector * 2352, 32);
    if (header.length >= 32 && matches(header, SYNC, 12)) {
      t.sectorSize = 2352;
      t.sectorHeaderSize = isCd001(header, 25) ? 24 : 16;
      t.trackFirstSector = getSectorFromHeader(header) - tocSector;
    } else {
      header = await reader.read(tocSector * 2336, 32);
      if (header.length >= 32 && matches(header, SYNC, 12)) {
        t.sectorSize = 2336;
        t.sectorHeaderSize = isCd001(header, 25) ? 24 : 16;
        t.trackFirstSector = getSectorFromHeader(header) - tocSector;
      } else {
        header = await reader.read(tocSector * 2048, 32);
        if (header.length >= 6 && isCd001(header, 1)) { t.sectorSize = 2048; t.sectorHeaderSize = 0; }
      }
    }

    // fall back to guessing from the file size
    if (t.sectorSize === 0) {
      const size = reader.size;
      if (size % 2352 === 0) { t.sectorSize = 2352; t.sectorHeaderSize = 24; }
      else if (size % 2048 === 0) { t.sectorSize = 2048; t.sectorHeaderSize = 0; }
      else if (size % 2336 === 0) { t.sectorSize = 2336; t.sectorHeaderSize = 8; }
      else return null;
    }
    return new BinCdReader(reader, t);
  }

  async openTrack(track: number): Promise<BinTrack | null> {
    // Only track 1 (or the special "first data" selector) is available in a
    // single raw image — secondary tracks need a cue sheet / a CHD.
    if (typeof track === 'number' && track > 1 && track < 0xfffffffc) return null;
    return this.track;
  }

  firstTrackSector(handle: unknown): number {
    const t = handle as BinTrack;
    return t.trackFirstSector + t.trackPregapSectors;
  }

  async readSector(handle: unknown, sector: number, out: Uint8Array, requested: number): Promise<number> {
    const t = handle as BinTrack;
    if (sector < t.trackFirstSector) return 0;
    let sectorStart = (sector - t.trackFirstSector) * t.sectorSize + t.sectorHeaderSize + t.fileTrackOffset;
    let total = 0;
    while (requested > t.rawDataSize) {
      const data = await this.reader.read(sectorStart, t.rawDataSize);
      out.set(data, total);
      total += data.length;
      if (data.length < t.rawDataSize) return total;
      sectorStart += t.sectorSize;
      requested -= t.rawDataSize;
    }
    const data = await this.reader.read(sectorStart, requested);
    out.set(data.subarray(0, requested), total);
    total += Math.min(data.length, requested);
    return total;
  }
}
