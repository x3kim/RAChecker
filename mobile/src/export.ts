// Export the collection as CSV and hand it to the OS share sheet.
import * as Sharing from 'expo-sharing';
import { writeAsStringAsync, cacheDirectory, EncodingType } from 'expo-file-system/legacy';
import { getLibrary } from './db';
import { consoleName } from './consoles';

function csv(v: string | number | null | undefined): string {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function shareCollectionCsv(): Promise<{ ok: boolean; count: number; error?: string }> {
  try {
    const rows = await getLibrary();
    if (!rows.length) return { ok: false, count: 0, error: 'Your collection is empty — scan some ROMs first.' };
    const header = 'name,md5,earns_achievements,game,system,points,achievements';
    const body = rows.map((r) => {
      const g = r.match;
      return [csv(r.name), csv(r.md5), g ? 'yes' : 'no', csv(g?.title ?? ''), csv(g ? consoleName(g.console_id) ?? '' : ''), csv(g?.points ?? ''), csv(g?.num_achievements ?? '')].join(',');
    });
    const content = [header, ...body].join('\r\n') + '\r\n';
    const uri = (cacheDirectory ?? '') + 'rachecker-collection.csv';
    await writeAsStringAsync(uri, content, { encoding: EncodingType.UTF8 });
    if (!(await Sharing.isAvailableAsync())) return { ok: false, count: rows.length, error: 'Sharing is not available on this device.' };
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: 'RAChecker collection' });
    return { ok: true, count: rows.length };
  } catch (e: any) {
    return { ok: false, count: 0, error: String(e?.message || e) };
  }
}
