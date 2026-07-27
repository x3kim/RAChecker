// On-device disc hashing entry point. Given a random-access reader over a disc
// image and its filename, produce the RetroAchievements MD5 (same as the desktop
// RAHasher). Auto-detects the system by trying each marker-gated rule in order.
import { RandomReader } from './reader';
import { ChdCdReader, BinCdReader, DISC_RULES } from './rules';
import { md5Create } from '../md5';

export type DiscHashResult = { md5: string; consoleId: number; system: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

// Extensions we hash on-device. `.chd` (self-contained, all systems) is the main
// path; `.iso` covers single-track data discs; `.pbp` is a whole-file PSP hash.
export const HASHABLE_DISC_EXTS = new Set(['.chd', '.iso', '.pbp']);

async function wholeFileMd5(reader: RandomReader): Promise<string> {
  const md5 = md5Create();
  const CHUNK = 1 << 20;
  for (let off = 0; off < reader.size; off += CHUNK) {
    md5.update(await reader.read(off, Math.min(CHUNK, reader.size - off)));
  }
  return md5.hex();
}

// Returns the hash + a best-guess console, or null if no rule recognised the disc.
// CHD-open / codec errors propagate so the caller can surface the reason.
export async function hashDisc(reader: RandomReader, name: string): Promise<DiscHashResult | null> {
  const ext = extOf(name);

  // PSP .pbp: hash the whole file (rc_hash_psp pbp path).
  if (ext === '.pbp') return { md5: await wholeFileMd5(reader), consoleId: 41, system: 'PSP' };

  const cd = ext === '.chd' ? await ChdCdReader.open(reader) : await BinCdReader.open(reader);
  if (!cd) return null;

  for (const rule of DISC_RULES) {
    try {
      const md5 = await rule.run(cd);
      if (md5) return { md5, consoleId: rule.consoleId, system: rule.name };
    } catch {
      /* rule didn't apply / read error — try the next system */
    }
  }
  return null;
}
