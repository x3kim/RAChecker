// rcheevos disc hash rules — async ports of the per-system functions in
// hash_disc.c. Each returns the lowercase MD5 hex (identical to RAHasher's) or
// null if the disc isn't that system. Byte offsets mirror the C source exactly.
import { CdReader, ChdCdReader, BinCdReader } from './cdreader';
import { CDTRACK_FIRST_DATA, CDTRACK_LARGEST, CDTRACK_LAST, CDTRACK_FIRST_OF_SECOND_SESSION } from './chd';
import { findFileSector } from './iso9660';
import { md5Create, md5Bytes } from '../md5';

const MAX_BUFFER_SIZE = 64 * 1024 * 1024;

const isspace = (c: number) => c === 32 || (c >= 9 && c <= 13);

async function readSec(reader: CdReader, handle: unknown, sector: number, len: number): Promise<{ buf: Uint8Array; n: number }> {
  const buf = new Uint8Array(len);
  const n = await reader.readSector(handle, sector, buf, len);
  return { buf, n };
}

function ascii(buf: Uint8Array, off: number, len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) s += String.fromCharCode(buf[off + i]);
  return s;
}
function memcmpStr(buf: Uint8Array, off: number, str: string): boolean {
  for (let i = 0; i < str.length; i++) if (buf[off + i] !== str.charCodeAt(i)) return false;
  return true;
}

// rc_hash_cd_file: hash `size` bytes of file contents starting at `sector`.
async function cdFile(reader: CdReader, handle: unknown, md5: ReturnType<typeof md5Create>, sector: number, size: number): Promise<boolean> {
  const buf = new Uint8Array(2048);
  let numRead = await reader.readSector(handle, sector, buf, 2048);
  if (numRead < 2048) return false;
  if (size > MAX_BUFFER_SIZE) size = MAX_BUFFER_SIZE;
  if (size < numRead) numRead = size;
  for (;;) {
    md5.update(buf.subarray(0, numRead));
    if (size <= numRead) break;
    size -= numRead;
    sector++;
    numRead = await reader.readSector(handle, sector, buf, size >= 2048 ? 2048 : size);
    if (numRead <= 0) break;
  }
  return true;
}

// --- PlayStation / PlayStation 2 ---

async function findPlaystationExe(reader: CdReader, handle: unknown, bootKey: string, cdromPrefix: string): Promise<{ sector: number; size: number; name: string }> {
  const cnf = await findFileSector(reader, handle, 'SYSTEM.CNF');
  if (!cnf) return { sector: 0, size: 0, name: '' };
  const { buf, n } = await readSec(reader, handle, cnf.sector, 2048);
  const text = ascii(buf, 0, Math.min(n, 2047));
  for (let ptr = 0; ptr < text.length; ptr++) {
    if (text.startsWith(bootKey, ptr)) {
      let i = ptr + bootKey.length;
      while (i < text.length && isspace(text.charCodeAt(i))) i++;
      if (text[i] === '=') {
        i++;
        while (i < text.length && isspace(text.charCodeAt(i))) i++;
        if (text.startsWith(cdromPrefix, i)) i += cdromPrefix.length;
        while (text[i] === '\\') i++;
        const start = i;
        while (i < text.length && !isspace(text.charCodeAt(i)) && text[i] !== ';') i++;
        const name = text.slice(start, i).slice(0, 63);
        const found = await findFileSector(reader, handle, name);
        return { sector: found ? found.sector : 0, size: found ? found.size : 0, name };
      }
    }
    while (ptr < text.length && text[ptr] !== '\n') ptr++;
  }
  return { sector: 0, size: 0, name: '' };
}

export async function hashPsx(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  let { sector, size, name } = await findPlaystationExe(reader, handle, 'BOOT', 'cdrom:');
  if (!sector) {
    const psx = await findFileSector(reader, handle, 'PSX.EXE');
    if (psx) { sector = psx.sector; size = psx.size; name = 'PSX.EXE'; }
  }
  if (!sector) return null;
  const { buf, n } = await readSec(reader, handle, sector, 32);
  if (n < 32) return null;
  if (memcmpStr(buf, 0, 'PS-X EXE')) {
    size = ((buf[31] << 24) | (buf[30] << 16) | (buf[29] << 8) | buf[28]) + 2048;
  }
  const md5 = md5Create();
  md5.update(strBytes(name));
  if (!await cdFile(reader, handle, md5, sector, size)) return null;
  return md5.hex();
}

export async function hashPs2(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  const { sector, size, name } = await findPlaystationExe(reader, handle, 'BOOT2', 'cdrom0:');
  if (!sector) return null;
  const { n } = await readSec(reader, handle, sector, 4);
  if (n < 4) return null;
  const md5 = md5Create();
  md5.update(strBytes(name));
  if (!await cdFile(reader, handle, md5, sector, size)) return null;
  return md5.hex();
}

// --- PSP (disc / EBOOT path; .pbp is whole-file, handled by the orchestrator) ---

export async function hashPsp(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  const param = await findFileSector(reader, handle, 'PSP_GAME\\PARAM.SFO');
  if (!param) return null;
  const md5 = md5Create();
  if (!await cdFile(reader, handle, md5, param.sector, param.size)) return null;
  const eboot = await findFileSector(reader, handle, 'PSP_GAME\\SYSDIR\\EBOOT.BIN');
  if (!eboot) return null;
  if (!await cdFile(reader, handle, md5, eboot.sector, eboot.size)) return null;
  return md5.hex();
}

// --- Sega CD / Saturn (identical rule; the hash-DB lookup picks the console) ---

export async function hashSegaCd(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  const { buf } = await readSec(reader, handle, 0, 512);
  if (!memcmpStr(buf, 0, 'SEGADISCSYSTEM  ') && !memcmpStr(buf, 0, 'SEGA SEGASATURN ')) return null;
  return md5Bytes(buf);
}

// --- Dreamcast ---

export async function hashDreamcast(reader: CdReader): Promise<string | null> {
  let handle = await reader.openTrack(3);
  let buf = new Uint8Array(256);
  if (handle) {
    await reader.readSector(handle, reader.firstTrackSector(handle), buf, 256);
  }
  if (!memcmpStr(buf, 0, 'SEGA SEGAKATANA ')) {
    handle = await reader.openTrack(CDTRACK_FIRST_DATA);
    if (!handle) return null;
    buf = new Uint8Array(256);
    await reader.readSector(handle, reader.firstTrackSector(handle), buf, 256);
    if (!memcmpStr(buf, 0, 'SEGA SEGAKATANA ')) return null;
  }
  const md5 = md5Create();
  md5.update(buf.subarray(0, 256));

  // boot filename is 96 bytes into the meta info, up to 16 bytes, trimmed at whitespace
  let i = 0;
  while (i < 16 && !isspace(buf[96 + i])) i++;
  if (i === 0) return null;
  const exeFile = ascii(buf, 96, i);

  const found = await findFileSector(reader, handle, exeFile);
  if (!found) return null;
  // the boot exe is normally in the last track; if it isn't in the current track, switch
  const probe = new Uint8Array(1);
  if (await reader.readSector(handle, found.sector, probe, 1) === 0) {
    handle = await reader.openTrack(CDTRACK_LAST);
    if (!handle) return null;
  }
  if (!await cdFile(reader, handle, md5, found.sector, found.size)) return null;
  return md5.hex();
}

// --- PC Engine CD ---

async function pceTrack(reader: CdReader, handle: unknown): Promise<string | null> {
  const first = reader.firstTrackSector(handle);
  const { buf, n } = await readSec(reader, handle, first + 1, 128);
  if (n < 128) return null;
  if (memcmpStr(buf, 32, 'PC Engine CD-ROM SYSTEM')) {
    const md5 = md5Create();
    md5.update(buf.subarray(106, 128));
    let sector = (buf[0] << 16) + (buf[1] << 8) + buf[2];
    let numSectors = buf[3];
    sector += first;
    const sbuf = new Uint8Array(2048);
    while (numSectors > 0) {
      await reader.readSector(handle, sector, sbuf, 2048);
      md5.update(sbuf);
      sector++; numSectors--;
    }
    return md5.hex();
  }
  const boot = await findFileSector(reader, handle, 'BOOT.BIN');
  if (boot && boot.size < MAX_BUFFER_SIZE) {
    const md5 = md5Create();
    if (!await cdFile(reader, handle, md5, boot.sector, boot.size)) return null;
    return md5.hex();
  }
  return null;
}

export async function hashPceCd(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(CDTRACK_FIRST_DATA);
  if (!handle) return null;
  return pceTrack(reader, handle);
}

// --- PC-FX ---

export async function hashPcfx(reader: CdReader): Promise<string | null> {
  let handle = await reader.openTrack(CDTRACK_LARGEST);
  if (!handle) return null;
  let first = reader.firstTrackSector(handle);
  let probe = (await readSec(reader, handle, first, 32)).buf;
  if (!memcmpStr(probe, 0, 'PC-FX:Hu_CD-ROM')) {
    handle = await reader.openTrack(2);
    if (!handle) return null;
    first = reader.firstTrackSector(handle);
    probe = (await readSec(reader, handle, first, 32)).buf;
  }
  if (memcmpStr(probe, 0, 'PC-FX:Hu_CD-ROM')) {
    const { buf } = await readSec(reader, handle, first + 1, 128);
    const md5 = md5Create();
    md5.update(buf.subarray(0, 128));
    let sector = (buf[34] << 16) + (buf[33] << 8) + buf[32];
    let numSectors = (buf[38] << 16) + (buf[37] << 8) + buf[36];
    sector += first;
    const sbuf = new Uint8Array(2048);
    while (numSectors > 0) {
      await reader.readSector(handle, sector, sbuf, 2048);
      md5.update(sbuf);
      sector++; numSectors--;
    }
    return md5.hex();
  }
  // some PC-FX discs still identify as PCE CDs
  const second = (await readSec(reader, handle, first + 1, 128)).buf;
  if (memcmpStr(second, 32, 'PC Engine CD-ROM SYSTEM')) return pceTrack(reader, handle);
  return null;
}

// --- 3DO ---

export async function hash3do(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  const OPERA = [0x01, 0x5a, 0x5a, 0x5a, 0x5a, 0x5a, 0x01];
  const first = await readSec(reader, handle, 0, 2048);
  if (first.n < 132) return null;
  for (let i = 0; i < OPERA.length; i++) if (first.buf[i] !== OPERA[i]) return null;

  const md5 = md5Create();
  md5.update(first.buf.subarray(0, 132));
  let blockSize = first.buf[0x4d] * 65536 + first.buf[0x4e] * 256 + first.buf[0x4f];
  let blockLocation = first.buf[0x65] * 65536 + first.buf[0x66] * 256 + first.buf[0x67];
  blockLocation *= blockSize;
  let sector = Math.floor(blockLocation / 2048);
  let size = 0;

  for (;;) {
    const { buf } = await readSec(reader, handle, sector, 2048);
    let offset = buf[0x12] * 256 + buf[0x13];
    const stop = buf[0x0d] * 65536 + buf[0x0e] * 256 + buf[0x0f];
    while (offset < stop) {
      if (buf[offset + 0x03] === 0x02 && ascii(buf, offset + 0x20, 8).toUpperCase() === 'LAUNCHME') {
        blockSize = buf[offset + 0x0d] * 65536 + buf[offset + 0x0e] * 256 + buf[offset + 0x0f];
        blockLocation = buf[offset + 0x45] * 65536 + buf[offset + 0x46] * 256 + buf[offset + 0x47];
        blockLocation *= blockSize;
        size = buf[offset + 0x11] * 65536 + buf[offset + 0x12] * 256 + buf[offset + 0x13];
        break;
      }
      offset += 0x48 + buf[offset + 0x43] * 4;
    }
    if (size !== 0) break;
    offset = buf[0x02] * 256 + buf[0x03];
    if (offset === 0xffff) break;
    offset *= blockSize;
    sector = Math.floor((blockLocation + offset) / 2048);
  }
  if (size === 0) return null;

  sector = Math.floor(blockLocation / 2048);
  const sbuf = new Uint8Array(2048);
  while (size > 2048) {
    await reader.readSector(handle, sector, sbuf, 2048);
    md5.update(sbuf);
    sector++; size -= 2048;
  }
  const last = new Uint8Array(size);
  await reader.readSector(handle, sector, last, size);
  md5.update(last);
  return md5.hex();
}

// --- Neo Geo CD ---

export async function hashNeoGeoCd(reader: CdReader): Promise<string | null> {
  const handle = await reader.openTrack(1);
  if (!handle) return null;
  const ipl = await findFileSector(reader, handle, 'IPL.TXT');
  if (!ipl) return null;
  const { buf, n } = await readSec(reader, handle, ipl.sector, 1024);
  if (n === 0) return null;
  const text = ascii(buf, 0, 1024);
  const md5 = md5Create();
  let anyPrg = false;
  for (const line of text.split(/[\r\n]+/)) {
    const dot = line.indexOf('.');
    if (dot < 0) continue;
    if (line.slice(dot, dot + 4).toUpperCase() === '.PRG') {
      const fname = line.slice(0, dot + 4);
      const found = await findFileSector(reader, handle, fname);
      if (!found || !await cdFile(reader, handle, md5, found.sector, found.size)) return null;
      anyPrg = true;
    }
    if (line.charCodeAt(0) === 0x1a) break;
  }
  if (!anyPrg) return null;
  return md5.hex();
}

// --- Atari Jaguar CD ---

export async function hashJaguarCd(reader: CdReader): Promise<string | null> {
  let handle = await reader.openTrack(CDTRACK_FIRST_OF_SECOND_SESSION);
  if (!handle) return null;
  let sector = reader.firstTrackSector(handle);
  let buf = (await readSec(reader, handle, sector, 2352)).buf;
  let byteswapped = false, offset = 0, size = 0;
  for (let i = 64; i < 2352 - 32 - 12; i++) {
    if (memcmpStr(buf, i, 'TARA IPARPVODED TA AEHDAREA RT I')) {
      byteswapped = true; offset = i + 32 + 4;
      size = (buf[offset] << 16) | (buf[offset + 1] << 24) | buf[offset + 2] | (buf[offset + 3] << 8);
      break;
    }
    if (memcmpStr(buf, i, 'ATARI APPROVED DATA HEADER ATRI ')) {
      byteswapped = false; offset = i + 32 + 4;
      size = (buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3];
      break;
    }
  }
  if (size === 0) return null;

  let loop = 0;
  for (;;) {
    const md5 = md5Create();
    offset += 4;
    if (size > MAX_BUFFER_SIZE) size = MAX_BUFFER_SIZE;
    let done = false;
    for (;;) {
      if (byteswapped) byteswap16(buf);
      const remaining = 2352 - offset;
      if (remaining >= size) { md5.update(buf.subarray(offset, offset + size)); size = 0; done = true; break; }
      md5.update(buf.subarray(offset, offset + remaining));
      size -= remaining;
      offset = 0;
      sector++;
      const r = await readSec(reader, handle, sector, 2352);
      if (r.n !== 2352) break;
      buf = r.buf;
    }
    if (size > 0 && !done) return null;
    const hash = md5.hex();
    if (hash !== '254487b59ab21bc005338e85cbf9fd2f' || !byteswapped) return hash;
    if (loop === 1) return hash;
    loop++;
    // potential homebrew: check track 2 for KART data
    handle = await reader.openTrack(2);
    if (!handle) return null;
    sector = reader.firstTrackSector(handle);
    buf = (await readSec(reader, handle, sector, 2352)).buf;
    if (!memcmpStr(buf, 0x5e, 'RT!IRTKA')) return null;
    offset = 0xa6;
    size = (buf[offset] << 16) | (buf[offset + 1] << 24) | buf[offset + 2] | (buf[offset + 3] << 8);
  }
}

function byteswap16(buf: Uint8Array): void {
  for (let i = 0; i + 1 < buf.length; i += 2) { const t = buf[i]; buf[i] = buf[i + 1]; buf[i + 1] = t; }
}
function strBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// A disc hash rule: given a CD reader, produce the MD5 or null if not that system.
export type DiscRule = { consoleId: number; name: string; run: (r: CdReader) => Promise<string | null> };

// Ordered so the most specific / marker-based rules run first. Each self-validates
// against a system marker, so the first that returns a hash identifies the disc.
export const DISC_RULES: DiscRule[] = [
  { consoleId: 40, name: 'Dreamcast', run: hashDreamcast },
  { consoleId: 43, name: '3DO', run: hash3do },
  { consoleId: 77, name: 'Atari Jaguar CD', run: hashJaguarCd },
  { consoleId: 56, name: 'Neo Geo CD', run: hashNeoGeoCd },
  { consoleId: 49, name: 'PC-FX', run: hashPcfx },
  { consoleId: 76, name: 'PC Engine CD', run: hashPceCd },
  { consoleId: 9, name: 'Sega CD / Saturn', run: hashSegaCd },
  { consoleId: 21, name: 'PlayStation 2', run: hashPs2 },
  { consoleId: 41, name: 'PSP', run: hashPsp },
  { consoleId: 12, name: 'PlayStation', run: hashPsx },
];

export { ChdCdReader, BinCdReader };
