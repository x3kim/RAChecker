// Candidate hashing — the reliable way to identify a ROM without trusting the
// folder name or a single extension guess.
//
// rcheevos itself does this (`rc_hash_iterate` in hash.c): one file extension can
// belong to several consoles, so it tries each candidate in turn. We go one step
// further: because the full RetroAchievements hash list is already on the device,
// we compute *every* plausible hash for a file and look each one up. The first
// hash that exists in the DB identifies the game AND its console definitively —
// no guessing from directory layout.
//
// Cost is kept to a single read pass: all the cartridge rules are either "hash
// the file from byte N" (header strips) or a byte-order swap, so we run several
// incremental MD5 accumulators over the same stream at once.
import { md5Create } from './md5';
import { RandomReader } from './disc/reader';
// Vendored shared core (source of truth: packages/core).
import { MAGIC, n64Mode, byteswap16InPlace, byteswap32InPlace } from './core';

// Read in 4 MiB slices — a multiple of 4, so the N64 byte-swaps stay aligned
// across chunk boundaries, and small enough that a base64 read never spikes memory.
const CHUNK = 4 * 1024 * 1024;

export type Candidate = { rule: string; md5: string };

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i++) if (buf[offset + i] !== bytes[i]) return false;
  return true;
}

// Header-strip rules: each is "skip N bytes, hash the rest", where N applies only
// when the file's magic/size says the header is really there. Mirrors
// rules.js stripBytes(), but expressed so several can share one read pass.
function stripFor(rule: string, size: number, head: Uint8Array): number {
  switch (rule) {
    case 'nes':   return size > 16 && (startsWith(head, MAGIC.NES) || startsWith(head, MAGIC.FDS)) ? 16 : 0;
    case 'snes':  return size - Math.floor(size / 0x2000) * 0x2000 === 512 ? 512 : 0;
    case 'lynx':  return size > 64 && startsWith(head, MAGIC.LYNX) ? 64 : 0;
    case 'a7800': return size > 128 && startsWith(head, MAGIC.ATARI7800, 1) ? 128 : 0;
    case 'pce':   return (size & 512) ? 512 : 0;
    case 'scv':   return size > 32 && startsWith(head, MAGIC.EMUSCV) ? 32 : 0;
    default:      return 0;
  }
}

const STRIP_RULES = ['nes', 'snes', 'lynx', 'a7800', 'pce', 'scv'] as const;

// Which rules are worth trying for a given extension. Derived from rcheevos'
// extension → console table; an extension we don't know falls back to "try
// everything cheap", which still costs a single read pass.
const EXT_RULES: Record<string, string[]> = {
  // Nintendo
  '.nes': ['nes'], '.fds': ['nes'], '.unf': ['nes'], '.unif': ['nes'],
  '.sfc': ['snes'], '.smc': ['snes'], '.swc': ['snes'], '.fig': ['snes'], '.bs': ['snes'],
  '.n64': ['n64'], '.v64': ['n64'], '.z64': ['n64'], '.ndd': ['n64'],
  '.gb': [], '.gbc': [], '.cgb': [], '.gba': [], '.agb': [], '.srl': [], '.nds': [],
  // Sega
  '.md': [], '.gen': [], '.smd': [], '.mdx': [], '.32x': [], '.sms': [], '.gg': [], '.sg': [], '.sc': [],
  // NEC
  '.pce': ['pce'], '.sgx': ['pce'],
  // Atari
  '.a26': [], '.a78': ['a7800'], '.lnx': ['lynx'], '.lyx': ['lynx'], '.j64': [], '.jag': [],
  // handhelds / others
  '.ngp': [], '.ngc': [], '.npc': [], '.ws': [], '.wsc': [], '.vb': [], '.vboy': [], '.min': [],
  '.col': [], '.cv': [], '.int': [], '.itv': [], '.vec': [], '.gam': [], '.sv': [], '.uze': [],
  '.chf': ['scv'], '.pc2': [], '.mx1': [], '.mx2': [], '.wasm': [],
  '.hex': ['arduboy'], '.arduboy': ['arduboy'],
  // ambiguous: could be a Mega Drive cart or a raw disc track — the disc pipeline
  // is tried separately; here we only need the cart interpretation.
  '.bin': [], '.rom': [],
};

// The rules to attempt for an extension: always the plain whole-file hash (most
// consoles use it), plus the extension's specific rules. Unknown extensions get
// every strip rule — they're free to compute in the same pass and each only
// applies if the file actually carries that header.
export function rulesForExt(ext: string): string[] {
  const known = EXT_RULES[ext.toLowerCase()];
  if (known) return known;
  return [...STRIP_RULES];
}

// Hash a cartridge ROM under every candidate rule in ONE streamed pass.
// Never loads the whole file: reads 4 MiB at a time and feeds each accumulator.
export async function hashCartCandidates(reader: RandomReader, size: number, rules: string[]): Promise<Candidate[]> {
  if (size <= 0) return [];
  const head = await reader.read(0, Math.min(size, 4096));

  // Arduboy .hex/.arduboy files are text that must be normalized as a whole —
  // they're tiny, so handle them with a plain read instead of the streaming path.
  if (rules.includes('arduboy')) {
    const { applyHeaderRule } = await import('./core');
    const bytes = await reader.read(0, size);
    const md5 = md5Create();
    md5.update(applyHeaderRule(bytes, 'arduboy'));
    return [{ rule: 'arduboy', md5: md5.hex() }];
  }

  // Build the accumulator set: one per distinct starting offset, plus N64.
  // A strip rule whose header isn't present collapses onto the raw hash, so
  // dedupe by offset to avoid hashing the same bytes twice.
  const byOffset = new Map<number, { rule: string; md5: ReturnType<typeof md5Create> }>();
  byOffset.set(0, { rule: 'raw', md5: md5Create() });
  for (const rule of rules) {
    if (rule === 'n64') continue;
    const off = stripFor(rule, size, head);
    if (off > 0 && off < size && !byOffset.has(off)) byOffset.set(off, { rule, md5: md5Create() });
  }

  const wantN64 = rules.includes('n64');
  const swapMode = wantN64 ? n64Mode(head[0]) : 1;
  const n64Md5 = wantN64 && swapMode !== 1 ? md5Create() : null;

  for (let off = 0; off < size; off += CHUNK) {
    const len = Math.min(CHUNK, size - off);
    const chunk = await reader.read(off, len);
    if (!chunk.length) break;

    for (const [start, acc] of byOffset) {
      if (off + chunk.length <= start) continue; // this accumulator hasn't started yet
      acc.md5.update(start > off ? chunk.subarray(start - off) : chunk);
    }
    if (n64Md5) {
      const swapped = chunk.slice(); // copy: never mutate the reader's buffer
      if (swapMode === 2) byteswap16InPlace(swapped);
      else byteswap32InPlace(swapped);
      n64Md5.update(swapped);
    }
  }

  const out: Candidate[] = [];
  for (const [, acc] of byOffset) out.push({ rule: acc.rule, md5: acc.md5.hex() });
  // An unswapped .z64 is already covered by the raw accumulator above.
  if (n64Md5) out.push({ rule: 'n64', md5: n64Md5.hex() });
  return out;
}
