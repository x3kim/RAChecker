// Scan orchestration: pick ROM files (multi-select) or a folder (Android SAF,
// recursive), hash each on-device via the shared core, and match against the
// synced hash DB. Green = earns achievements, red = no match.
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { hashTarget, hashZip, hashSevenZip, hashDiscFile, extOf, isScannable, DISC_EXTS, HASHABLE_DISC_EXTS, UNSUPPORTED_ARCHIVE_EXTS, Hashed, HashProgress } from './hashFile';
import { lookupHash, getSyncedConsoles, MatchGame } from './db';
import { tt } from './i18n';

// `size` comes from the document picker when available. Passing it along matters:
// SAF content:// URIs don't always report a size, and without one the disc hasher
// used to bail out and claim the image needed the desktop app.
export type Target = { uri: string; name: string; size?: number };

// What came of a file, so the UI can give a reason instead of one catch-all
// message. `noset` is a real RetroAchievements game that simply has no
// achievement set yet — that used to be indistinguishable from a wrong/unknown
// dump, which is exactly what testers complained about.
export type ScanStatus = 'match' | 'noset' | 'nomatch' | 'unsynced' | 'note';
export type ScanRow = Hashed & { match: MatchGame | null; error?: string; status: ScanStatus };

function nameFromUri(uri: string): string {
  try {
    const seg = decodeURIComponent(uri).split(/[/\\]/).pop() || uri;
    return seg;
  } catch {
    return uri;
  }
}

export async function pickFiles(): Promise<Target[]> {
  const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
  if (res.canceled || !res.assets?.length) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, size: typeof a.size === 'number' ? a.size : undefined }));
}

// Ask for a folder (persisted SAF permission). Returns the tree URI or null.
export async function pickFolder(): Promise<string | null> {
  const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
  return perm.granted ? perm.directoryUri : null;
}

// Recursively collect cart-ROM file URIs under a SAF directory (bounded, best
// effort — SAF can't cheaply tell files from folders, so non-ROM children are
// probed as directories).
export async function enumerateFolder(dirUri: string, max = 5000): Promise<Target[]> {
  const out: Target[] = [];
  const queue: string[] = [dirUri];
  let guard = 0;
  while (queue.length && out.length < max && guard < 20000) {
    guard++;
    const cur = queue.shift() as string;
    let children: string[] = [];
    try { children = await StorageAccessFramework.readDirectoryAsync(cur); } catch { continue; }
    for (const child of children) {
      const name = nameFromUri(child);
      const ext = extOf(name);
      if (ext && isScannable(ext)) {
        out.push({ uri: child, name });
        if (out.length >= max) break;
        continue;
      }
      // Not a known ROM — probe as a subdirectory (throws for plain files).
      try {
        await StorageAccessFramework.readDirectoryAsync(child);
        queue.push(child);
      } catch {
        /* a non-ROM file — skip */
      }
    }
  }
  return out;
}

// Resolve a hashed file against the local hash DB. Every candidate hash is tried
// (see hashCandidates.ts) — the first one present in the DB identifies the game
// and its console for certain, which is why scanning no longer depends on how the
// user organises their folders.
async function resolve(h: Hashed, synced: Set<number>, dbEmpty: boolean): Promise<ScanRow> {
  for (const c of h.candidates.length ? h.candidates : [{ rule: h.rule ?? 'raw', md5: h.md5 }]) {
    if (!c.md5) continue;
    const match = await lookupHash(c.md5);
    if (match) {
      // The hash DB also holds games with no achievement set, so a match isn't
      // automatically playable for points — say which it is.
      const status: ScanStatus = match.num_achievements > 0 ? 'match' : 'noset';
      return { ...h, md5: c.md5, rule: c.rule, match, status };
    }
  }
  // No candidate matched. Say *why*, so the row is actionable: a system the user
  // never synced can still match later, an unknown dump never will.
  const consoleUnsynced = h.consoleId != null && !synced.has(h.consoleId);
  const status: ScanStatus = dbEmpty || consoleUnsynced ? 'unsynced' : 'nomatch';
  return { ...h, match: null, status };
}

export async function scanTargets(
  targets: Target[],
  onProgress: (p: { done: number; total: number; current: string; detail?: string }) => void,
): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  const total = targets.length;
  let done = 0;
  let discCount = 0; // disc images we can't hash here — reported once as a summary row
  const synced = await getSyncedConsoles();
  const dbEmpty = synced.size === 0;
  for (const t of targets) {
    onProgress({ done, total, current: t.name });
    const ext = extOf(t.name);
    try {
      if (UNSUPPORTED_ARCHIVE_EXTS.has(ext)) {
        // 7z/RAR need native decoders that don't exist on the device. Say so
        // plainly instead of attempting a huge read that fails cryptically.
        rows.push(noteRow(t.name, ext, tt('scan.archiveUnsupported', { ext: ext.replace('.', '').toUpperCase() })));
      } else if (ext === '.zip' || ext === '.7z') {
        // Unpacking a multi-GB archive takes minutes on a phone; report bytes as
        // they come out so the scan visibly progresses instead of looking stuck.
        const report: HashProgress = ({ done, total }) => {
          const pct = total > 0 ? Math.floor((done / total) * 100) : 0;
          onProgress({ done, total: targets.length, current: t.name, detail: tt('scan.unpacking', { p: pct, mb: Math.round(done / 1048576) }) });
        };
        const inners = ext === '.7z' ? await hashSevenZip(t.uri, t.name, report) : await hashZip(t.uri, t.name);
        if (!inners.length) {
          rows.push(noteRow(t.name, ext, tt('scan.zipEmpty')));
        } else {
          for (const h of inners) rows.push(await resolve(h, synced, dbEmpty));
        }
      } else if (HASHABLE_DISC_EXTS.has(ext)) {
        // On-device disc hashing (.chd/.iso/.pbp). A null result means no disc
        // system's signature was found — say that plainly instead of lumping the
        // file into the generic "needs the desktop app" note, which was
        // misleading for images we genuinely can read.
        const h = await hashDiscFile(t.uri, t.name, t.size);
        if (h) rows.push(await resolve(h, synced, dbEmpty));
        else rows.push(noteRow(t.name, ext, tt('scan.discUnrecognised')));
      } else if (DISC_EXTS.has(ext)) {
        discCount++;
      } else {
        const h = await hashTarget(t.uri, t.name, t.size);
        // `.bin` is genuinely ambiguous: a Mega Drive cartridge *or* a raw CD
        // track (PSX/Sega CD/3DO…). rcheevos tries both; so do we, and the DB
        // lookup decides. Best-effort — a cart .bin simply fails the disc probe.
        if (ext === '.bin') {
          try {
            const d = await hashDiscFile(t.uri, t.name, t.size);
            if (d) h.candidates = [...h.candidates, ...d.candidates];
          } catch { /* not a disc image — the cartridge hash still stands */ }
        }
        rows.push(await resolve(h, synced, dbEmpty));
      }
    } catch (e: any) {
      rows.push(noteRow(t.name, ext, String(e?.message || e)));
    }
    done++;
    onProgress({ done, total, current: t.name });
  }
  if (discCount > 0) {
    rows.push(noteRow(tt('scan.discSummary', { n: discCount }), '', tt('scan.discNote')));
  }
  return rows;
}

// A non-hashable informational row (empty ZIP, read error, disc-image note).
// md5 is empty so it is never persisted into the collection.
function noteRow(name: string, ext: string, error: string): ScanRow {
  return { name, ext, rule: null, consoleId: null, md5: '', candidates: [], match: null, error, status: 'note' };
}
