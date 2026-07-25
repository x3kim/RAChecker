// Server-side directory browser for the folder picker. The browser can't pick
// a server/network path, so the UI navigates the filesystem through this.
import { readdir, stat, access } from 'node:fs/promises';
import { join, dirname, parse } from 'node:path';

export async function listDrives() {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
  const drives = [];
  for (let i = 67; i <= 90; i++) { // C..Z
    const letter = String.fromCharCode(i);
    const root = `${letter}:\\`;
    try { await access(root); drives.push({ name: `${letter}:`, path: root }); }
    catch { /* not present */ }
  }
  return drives;
}

// `opts.files` also returns files (for picking an .exe etc.); `opts.ext` is a
// lowercase extension allow-list (e.g. ['.exe']). Defaults keep the old
// dirs-only behaviour for the folder picker.
export async function listDir(path, opts = {}) {
  const wantFiles = !!opts.files;
  const ext = Array.isArray(opts.ext) ? opts.ext.map((x) => String(x).toLowerCase()) : null;
  if (!path) {
    return { path: '', parent: null, isRoot: true, drives: await listDrives(), dirs: [], files: [] };
  }
  const entries = await readdir(path, { withFileTypes: true });
  const dirs = [];
  const files = [];
  for (const e of entries) {
    if (e.name.startsWith('$') || e.name.startsWith('.')) continue;
    if (e.isDirectory()) { dirs.push({ name: e.name, path: join(path, e.name) }); continue; }
    if (wantFiles && e.isFile()) {
      const lower = e.name.toLowerCase();
      if (ext && !ext.some((x) => lower.endsWith(x))) continue;
      files.push({ name: e.name, path: join(path, e.name) });
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));
  const parent = dirname(path);
  const atDriveRoot = parse(path).root === path || parent === path;
  return { path, parent: atDriveRoot ? '' : parent, isRoot: false, drives: [], dirs, files };
}

export async function pathInfo(path) {
  try {
    const s = await stat(path);
    return { exists: true, isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size };
  } catch (e) {
    return { exists: false, error: e.code };
  }
}
