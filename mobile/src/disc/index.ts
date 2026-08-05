// On-device disc hashing entry point. Given a random-access reader over a disc
// image and its filename, produce the RetroAchievements MD5 (same as the desktop
// RAHasher). Auto-detects the system by trying each marker-gated rule in order.
import { RandomReader } from './reader';
import { ChdCdReader, BinCdReader, DISC_RULES } from './rules';
import { ChdError } from './chd';
import { openCsoReader, CSO_EXTS } from './cso';
import { md5Create } from '../md5';

export type DiscHashResult = { md5: string; consoleId: number; system: string };

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

// Extensions we hash on-device. `.chd` (self-contained, all systems) is the main
// path; `.iso` covers single-track data discs; `.pbp` is a whole-file PSP hash;
// `.cso`/`.zso` are compressed ISOs, decompressed block by block as they are read.
export const HASHABLE_DISC_EXTS = new Set(['.chd', '.iso', '.pbp', '.cso', '.zso', '.ciso']);

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

  // A compressed ISO is read through a wrapper that expands only the blocks the
  // rules actually touch — from there it is an ordinary single-track image.
  let source = reader;
  if (CSO_EXTS.has(ext)) {
    const expanded = await openCsoReader(reader);
    if (!expanded) return null;   // ".ciso" from GameCube, or not a CSO at all
    source = expanded;
  }

  const cd = ext === '.chd' ? await ChdCdReader.open(source) : await BinCdReader.open(source);
  if (!cd) return null;

  // A rule that throws usually just means "this isn't that system" — but a
  // container-level failure (an unsupported CHD codec, a corrupt file) throws the
  // same way, and silently reporting that as "not a recognised disc image" hides
  // the real cause. Remember the first container error and surface it if no rule
  // ends up matching.
  let containerError: Error | null = null;
  for (const rule of DISC_RULES) {
    try {
      const md5 = await rule.run(cd);
      if (md5) return { md5, consoleId: rule.consoleId, system: rule.name };
    } catch (e: any) {
      if (!containerError && e instanceof ChdError && e.fatal) containerError = e;
    }
  }
  if (containerError) throw containerError;
  return null;
}
