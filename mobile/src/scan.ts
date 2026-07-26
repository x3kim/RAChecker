// Scan orchestration: pick ROM files (multi-select) or a folder (Android SAF,
// recursive), hash each on-device via the shared core, and match against the
// synced hash DB. Green = earns achievements, red = no match.
import * as DocumentPicker from 'expo-document-picker';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { hashTarget, extOf, CART_EXTS, Hashed } from './hashFile';
import { lookupHash, MatchGame } from './db';

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
      if (ext && CART_EXTS.has(ext)) {
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
  let done = 0;
  for (const t of targets) {
    onProgress({ done, total: targets.length, current: t.name });
    try {
      const h = await hashTarget(t.uri, t.name);
      const match = await lookupHash(h.md5);
      rows.push({ ...h, match });
    } catch (e: any) {
      rows.push({ name: t.name, ext: extOf(t.name), rule: null, consoleId: null, md5: '', match: null, error: String(e?.message || e) });
    }
    done++;
    onProgress({ done, total: targets.length, current: t.name });
  }
  return rows;
}
