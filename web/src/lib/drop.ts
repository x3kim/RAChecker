// Collect File objects from a drag&drop DataTransfer, recursing into folders.
// Browsers don't expose absolute paths, so the files are uploaded by content.
const ROM_RE = /\.(nes|fds|unf|sfc|smc|swc|fig|n64|v64|z64|gb|gbc|gba|md|gen|smd|bin|32x|sms|gg|sg|pce|sgx|lnx|a78|a26|j64|jag|ngp|ngc|ws|wsc|vb|min|col|int|vec|chf|sv|uze|wasm|cue|chd|iso|pbp|m3u|gdi|cdi|nds|zip|7z|rar)$/i;

const MAX_FILES = 120;
const MAX_TOTAL = 3 * 1024 * 1024 * 1024; // 3 GB safety cap

export interface DropResult { files: File[]; skipped: number; tooBig: boolean; }

function readEntry(entry: any, out: File[], skipped: { n: number }): Promise<void> {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f: File) => {
        if (ROM_RE.test(f.name)) out.push(f); else skipped.n++;
        resolve();
      }, () => resolve());
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const all: any[] = [];
      const readBatch = () => reader.readEntries(async (batch: any[]) => {
        if (!batch.length) {
          for (const e of all) { if (out.length >= MAX_FILES) break; await readEntry(e, out, skipped); }
          resolve();
        } else { all.push(...batch); readBatch(); }
      }, () => resolve());
      readBatch();
    } else resolve();
  });
}

export async function collectDroppedFiles(dt: DataTransfer): Promise<DropResult> {
  const out: File[] = [];
  const skipped = { n: 0 };
  const items = Array.from(dt.items || []);
  const entries = items.map((it) => (it.webkitGetAsEntry ? it.webkitGetAsEntry() : null)).filter(Boolean);

  if (entries.length) {
    for (const e of entries) { if (out.length >= MAX_FILES) break; await readEntry(e, out, skipped); }
  } else {
    for (const f of Array.from(dt.files || [])) {
      if (out.length >= MAX_FILES) break;
      if (ROM_RE.test(f.name)) out.push(f); else skipped.n++;
    }
  }

  let total = 0; const capped: File[] = [];
  let tooBig = false;
  for (const f of out) {
    if (total + f.size > MAX_TOTAL) { tooBig = true; break; }
    total += f.size; capped.push(f);
  }
  return { files: capped, skipped: skipped.n, tooBig };
}
