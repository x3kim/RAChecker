// ISO-9660 file locator — async port of rcheevos' rc_cd_find_file_sector
// (hash_disc.c). Walks the directory records by hand (no external FS lib) to map
// a "DIR\\FILE" path to its start sector + size, exactly as the disc hash rules do.
import { CdReader } from './cdreader';

const readSector = async (reader: CdReader, handle: unknown, sector: number, len: number): Promise<Uint8Array | null> => {
  const buf = new Uint8Array(len);
  const n = await reader.readSector(handle, sector, buf, len);
  return n >= len ? buf : (n > 0 ? buf : null);
};

function strncasecmpEq(buf: Uint8Array, off: number, path: string, len: number): boolean {
  for (let i = 0; i < len; i++) {
    const a = buf[off + i];
    const b = path.charCodeAt(i);
    const al = a >= 65 && a <= 90 ? a + 32 : a;
    const bl = b >= 65 && b <= 90 ? b + 32 : b;
    if (al !== bl) return false;
  }
  return true;
}

export type FoundFile = { sector: number; size: number };

// Returns the file's start sector (>0) and size, or null if not found.
export async function findFileSector(reader: CdReader, handle: unknown, pathIn: string): Promise<FoundFile | null> {
  let path = pathIn;
  if (path[0] === '\\') path = path.slice(1);

  let filenameLength = path.length;
  let sector: number;
  let numSectors = 0;

  const slash = path.lastIndexOf('\\');
  if (slash >= 0) {
    const dir = await findFileSector(reader, handle, path.slice(0, slash));
    if (!dir) return null;
    sector = dir.sector;
    path = path.slice(slash + 1);
    filenameLength = path.length;
  } else {
    const buffer = await readSector(reader, handle, reader.firstTrackSector(handle) + 16, 256);
    if (!buffer) return null;
    sector = buffer[156 + 2] | (buffer[156 + 3] << 8) | (buffer[156 + 4] << 16);
    const lbs = buffer[128] | (buffer[128 + 1] << 8);
    if (lbs === 0) numSectors = 1;
    else numSectors = Math.floor((buffer[156 + 10] | (buffer[156 + 11] << 8) | (buffer[156 + 12] << 16) | (buffer[156 + 13] << 24)) / lbs);
  }

  let buffer = await readSector(reader, handle, sector, 2048);
  if (!buffer) return null;

  let pos = 0;
  for (;;) {
    if (pos >= 2048 || buffer[pos] === 0) {
      if (numSectors > 1) {
        numSectors--;
        const nb = await readSector(reader, handle, ++sector, 2048);
        if (nb) { buffer = nb; pos = 0; continue; }
      }
      break;
    }
    // filename is 33 bytes into the record; format "FILENAME;version" or "DIRECTORY"
    if ((buffer[pos + 32] === filenameLength || buffer[pos + 33 + filenameLength] === 0x3b /* ';' */) &&
        strncasecmpEq(buffer, pos + 33, path, filenameLength)) {
      const foundSector = buffer[pos + 2] | (buffer[pos + 3] << 8) | (buffer[pos + 4] << 16);
      const size = (buffer[pos + 10] | (buffer[pos + 11] << 8) | (buffer[pos + 12] << 16) | (buffer[pos + 13] << 24)) >>> 0;
      return { sector: foundSector, size };
    }
    pos += buffer[pos];
  }
  return null;
}
