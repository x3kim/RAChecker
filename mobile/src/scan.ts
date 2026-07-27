// Scan orchestration: pick ROM files (multi-select) or a folder (Android SAF,
// recursive), hash each on-device via the shared core, and match against the
// synced hash DB. Green = earns achievements, red = no match.
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { hashTarget, hashZip, hashDiscFile, extOf, isScannable, DISC_EXTS, HASHABLE_DISC_EXTS, Hashed } from './hashFile';
import { lookupHash, MatchGame } from './db';
import { tt } from './i18n';

export type Target = { uri: string; name: string };
export type ScanRow = Hashed & { match: MatchGame | null; error?: string };

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
  return res.assets.map((a) => ({ uri: a.uri, name: a.name }));
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

export async function scanTargets(
  targets: Target[],
  onProgress: (p: { done: number; total: number; current: string }) => void,
): Promise<ScanRow[]> {
  const rows: ScanRow[] = [];
  const total = targets.length;
  let done = 0;
  let discCount = 0; // disc images found — reported once as a summary row
  for (const t of targets) {
    onProgress({ done, total, current: t.name });
    const ext = extOf(t.name);
    try {
      if (ext === '.zip') {
        const inners = await hashZip(t.uri, t.name);
        if (!inners.length) {
          rows.push(noteRow(t.name, ext, tt('scan.zipEmpty')));
        } else {
          for (const h of inners) rows.push({ ...h, match: await lookupHash(h.md5) });
        }
      } else if (HASHABLE_DISC_EXTS.has(ext)) {
        // On-device disc hashing (.chd/.iso/.pbp). If a supported disc can't be
        // recognised/decoded it counts toward the desktop-only note instead.
        const h = await hashDiscFile(t.uri, t.name);
        if (h) rows.push({ ...h, match: await lookupHash(h.md5) });
        else discCount++;
      } else if (DISC_EXTS.has(ext)) {
        discCount++;
      } else {
        const h = await hashTarget(t.uri, t.name);
        rows.push({ ...h, match: await lookupHash(h.md5) });
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
  return { name, ext, rule: null, consoleId: null, md5: '', match: null, error };
}
