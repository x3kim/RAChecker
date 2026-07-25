// Integration with RAHasher.exe — the official RetroAchievements CLI hasher
// (from RetroAchievements/RALibretro). Needed for disc-based systems (PSX,
// Saturn, Dreamcast, Sega CD, PCE-CD, 3DO, PSP, PS2, GC/Wii, DS, ...) and for
// .chd images. The prebuilt Windows binary supports CHD out of the box.
//
// We never require it: if absent, those systems are reported as
// 'needs_rahasher' and the UI offers a one-click download.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, readdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, ROOT } from '../config.js';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Downloads land in RA_BIN_DIR when set (the desktop app points it at a
// writable per-user dir — the install dir is read-only); the bundled
// ROOT/bin copy keeps working as a read-only fallback.
const BIN_DIR = process.env.RA_BIN_DIR ? process.env.RA_BIN_DIR : join(ROOT, 'bin');
const BUNDLED_BIN_DIR = join(ROOT, 'bin');
const HASH_RE = /\b([0-9a-fA-F]{32})\b/;

let cachedPath = null;
let cachedChecked = false;

export function locateRAHasher() {
  if (cachedChecked) return cachedPath;
  cachedChecked = true;
  const candidates = [
    config.rahasherPath,
    join(BIN_DIR, 'RAHasher.exe'),
    join(BIN_DIR, 'RAHasher'),
    join(BUNDLED_BIN_DIR, 'RAHasher.exe'),
    join(BUNDLED_BIN_DIR, 'RAHasher'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) { cachedPath = c; return c; }
  }
  // Fall back to PATH (let the OS resolve it on first invocation).
  cachedPath = process.platform === 'win32' ? 'RAHasher.exe' : 'RAHasher';
  return cachedPath;
}

export function resetRAHasherCache() {
  cachedChecked = false; cachedPath = null; availCache = null;
}

let availCache = null; // { value, at }
const AVAIL_TTL = 30000;

export async function isRAHasherAvailable() {
  if (availCache && Date.now() - availCache.at < AVAIL_TTL) return availCache.value;
  const p = locateRAHasher();
  let value;
  if (p !== 'RAHasher' && p !== 'RAHasher.exe') {
    value = existsSync(p);
  } else {
    try {
      await execFileAsync(p, [], { timeout: 8000, windowsHide: true });
      value = true;
    } catch (e) {
      // RAHasher with no args prints usage and exits non-zero; that still proves
      // it exists. ENOENT means it is genuinely missing.
      value = e.code !== 'ENOENT' && !/ENOENT/.test(String(e.message));
    }
  }
  availCache = { value, at: Date.now() };
  return value;
}

// Hash a disc/special file. Returns { md5, raw } or { error }.
// `signal` (AbortSignal) kills the RAHasher child process when a scan is
// cancelled, so no work keeps running in the background after "cancel".
export async function hashWithRAHasher(consoleId, filePath, { timeoutMs = 180000, signal } = {}) {
  const bin = locateRAHasher();
  try {
    const { stdout } = await execFileAsync(bin, [String(consoleId), filePath], {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      signal,
    });
    const text = String(stdout).trim();
    if (/^\?{32}$/.test(text.split(/\s+/)[0] || '')) {
      return { error: 'RAHasher konnte die Datei nicht hashen — evtl. getrimmtes, verschlüsseltes oder Homebrew-ROM (kein Standard-Dump).' };
    }
    const m = text.match(HASH_RE);
    if (!m) return { error: `RAHasher lieferte keinen Hash. Ausgabe: ${text.slice(0, 200) || '(leer)'}` };
    return { md5: m[1].toLowerCase(), raw: text };
  } catch (e) {
    if (/ENOENT/.test(String(e.message)) || e.code === 'ENOENT') {
      return { error: 'RAHasher not installed.', missing: true };
    }
    // Surface RAHasher's own stderr/stdout so the real reason is visible, not a
    // generic "failed". execFile rejection carries .stderr / .stdout.
    const detail = [e.stderr, e.stdout].map((s) => String(s || '').trim()).filter(Boolean).join(' | ').slice(0, 220);
    return { error: `RAHasher-Fehler: ${detail || String(e.message).slice(0, 200)}` };
  }
}

// ---- on-demand download of the official prebuilt Windows binary -----------
const RELEASES_API = 'https://api.github.com/repos/RetroAchievements/RALibretro/releases/latest';

export async function downloadRAHasher(onProgress = () => {}) {
  if (process.platform !== 'win32') {
    throw new Error('Auto-download supports Windows only. Build RAHasher from RALibretro on this OS.');
  }
  onProgress({ phase: 'lookup', message: 'Looking up latest RALibretro release…' });
  const rel = await fetch(RELEASES_API, {
    headers: { 'User-Agent': 'RAChecker', Accept: 'application/vnd.github+json' },
  }).then((r) => {
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    return r.json();
  });
  const asset = (rel.assets || []).find((a) => /RAHasher-x64-Windows-.*\.zip$/i.test(a.name))
    || (rel.assets || []).find((a) => /RAHasher-x86-Windows-.*\.zip$/i.test(a.name));
  if (!asset) throw new Error('No RAHasher Windows asset found in latest release.');

  onProgress({ phase: 'download', message: `Downloading ${asset.name}…`, version: rel.tag_name });
  await mkdir(BIN_DIR, { recursive: true });
  const tmpZip = join(BIN_DIR, '_rahasher.zip');
  const buf = Buffer.from(await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'RAChecker' },
  }).then((r) => {
    if (!r.ok) throw new Error(`Download ${r.status}`);
    return r.arrayBuffer();
  }));
  await writeFile(tmpZip, buf);

  onProgress({ phase: 'extract', message: 'Extracting RAHasher.exe…' });
  const { default: StreamZip } = await import('node-stream-zip');
  const zip = new StreamZip.async({ file: tmpZip });
  try {
    const entries = Object.values(await zip.entries());
    const exe = entries.find((e) => /RAHasher\.exe$/i.test(e.name));
    if (!exe) throw new Error('RAHasher.exe not found inside the downloaded zip.');
    await zip.extract(exe.name, join(BIN_DIR, 'RAHasher.exe'));
  } finally {
    await zip.close();
    await rm(tmpZip, { force: true });
  }
  resetRAHasherCache();
  onProgress({ phase: 'done', message: 'RAHasher installed.', version: rel.tag_name });
  return { path: join(BIN_DIR, 'RAHasher.exe'), version: rel.tag_name };
}
