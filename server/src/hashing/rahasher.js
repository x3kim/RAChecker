// Integration with RAHasher — the official RetroAchievements CLI hasher (from
// RetroAchievements/RALibretro). Needed for disc-based systems (PSX, Saturn,
// Dreamcast, Sega CD, PCE-CD, 3DO, PSP, PS2, GC/Wii, DS, ...) and for .chd
// images. RALibretro publishes prebuilt Windows and Linux binaries (x64/x86),
// both with CHD support; there is no macOS or ARM build.
//
// We never require it: if absent, those systems are reported as
// 'needs_rahasher' and the UI offers a one-click download.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile, chmod, open } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { config, ROOT } from '../config.js';

const execFileAsync = promisify(execFile);

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
  // Only this platform's file name: a RAHasher.exe left in bin/ on Linux would
  // otherwise be found first and shadow the Linux binary sitting next to it.
  const name = process.platform === 'win32' ? 'RAHasher.exe' : 'RAHasher';
  const candidates = [
    config.rahasherPath,
    join(BIN_DIR, name),
    join(BUNDLED_BIN_DIR, name),
  ].filter(Boolean);
  for (const c of candidates) {
    if (existsSync(c)) { cachedPath = c; return c; }
  }
  // Fall back to PATH (let the OS resolve it on first invocation).
  cachedPath = process.platform === 'win32' ? 'RAHasher.exe' : 'RAHasher';
  return cachedPath;
}

export function resetRAHasherCache() {
  cachedChecked = false; cachedPath = null; probeCache = null;
}

// ---- is the RAHasher we found one that actually runs here? -----------------
// A file existing is not enough. The case that prompted this (#46): on a Steam
// Deck the Windows RAHasher.exe was entered as the path, Settings said
// "installed", and every disc file then failed to hash. So the binary is
// checked for the right platform and then really started.

// What an executable is, from its first four bytes.
export function binaryFormat(head) {
  if (!head || head.length < 2) return 'unknown';
  if (head[0] === 0x4d && head[1] === 0x5a) return 'pe';                           // "MZ"
  if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return 'elf';
  if (head.length >= 4) {
    const be = head.readUInt32BE(0);
    if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(be)) return 'macho';
  }
  if (head[0] === 0x23 && head[1] === 0x21) return 'script';                       // "#!"
  return 'unknown';
}

const NATIVE_FORMAT = { win32: 'pe', linux: 'elf', darwin: 'macho' };
export const FORMAT_OS = { pe: 'Windows', elf: 'Linux', macho: 'macOS' };

// Spawn failures, as opposed to RAHasher running and exiting non-zero (which
// it does on purpose when called without arguments).
const SPAWN_FAILURES = new Set(['ENOENT', 'EACCES', 'ENOEXEC', 'EPERM', 'UNKNOWN']);

// Turns the outcome of `RAHasher` (no arguments) into a status. Without
// arguments it prints "RAHasher 1.8.4 / ==== / Usage: …" and exits 1 — that
// output is the proof it runs. Anything else (the dynamic loader complaining
// about a missing GLIBC_2.38, say) is the reason it does not.
export function interpretProbe({ error, stdout = '', stderr = '' }) {
  const code = error?.code;
  if (typeof code === 'string' && SPAWN_FAILURES.has(code)) {
    if (code === 'ENOENT') return { available: false, problem: 'missing' };
    if (code === 'EACCES') return { available: false, problem: 'not-executable' };
    return { available: false, problem: 'wont-run', detail: String(error.message || code).slice(0, 200) };
  }
  const out = String(stdout);
  const m = out.match(/RAHasher\s+(v?\d[\w.-]*)/);
  if (m && /Usage:/.test(out)) return { available: true, version: m[1] };
  const detail = [stderr, stdout, error?.killed ? 'timed out' : '']
    .map((s) => String(s || '').trim()).filter(Boolean).join(' | ').slice(0, 200);
  return { available: false, problem: 'wont-run', detail: detail || 'no output' };
}

let probeCache = null; // { value, at }
const PROBE_TTL = 30000;

// { available, path, version?, problem?: 'missing'|'wrong-platform'|'not-executable'|'wont-run', detail?, format? }
export async function probeRAHasher() {
  if (probeCache && Date.now() - probeCache.at < PROBE_TTL) return probeCache.value;
  const path = locateRAHasher();
  const onPath = path === 'RAHasher' || path === 'RAHasher.exe';
  let value;
  if (!onPath && !existsSync(path)) {
    value = { available: false, problem: 'missing' };
  } else {
    const format = onPath ? 'unknown' : await readFormat(path);
    const native = NATIVE_FORMAT[process.platform];
    if (native && FORMAT_OS[format] && format !== native) {
      // Checked before running: a PE file with the exec bit set on Linux may be
      // handed to /bin/sh, which then reports gibberish instead of the reason.
      value = { available: false, problem: 'wrong-platform', format };
    } else {
      let error = null, stdout = '', stderr = '';
      try {
        ({ stdout, stderr } = await execFileAsync(path, [], { timeout: 8000, windowsHide: true }));
      } catch (e) {
        error = e; stdout = e.stdout ?? ''; stderr = e.stderr ?? '';
      }
      // A bare name that is not on PATH comes back as ENOENT → 'missing'.
      value = interpretProbe({ error, stdout, stderr });
    }
  }
  value = { ...value, path };
  probeCache = { value, at: Date.now() };
  return value;
}

async function readFormat(path) {
  let fh;
  try {
    fh = await open(path, 'r');
    const head = Buffer.alloc(4);
    const { bytesRead } = await fh.read(head, 0, 4, 0);
    return binaryFormat(head.subarray(0, bytesRead));
  } catch {
    return 'unknown';
  } finally {
    await fh?.close();
  }
}

export async function isRAHasherAvailable() {
  return (await probeRAHasher()).available;
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
    // RAHasher could not even start (gone, not executable, wrong platform):
    // that is the tool's fault, not the file's. Report it as missing so the
    // file stays needs_rahasher and "Re-check pending disc files" picks it up
    // once a working RAHasher is in place — instead of a permanent error.
    if (typeof e.code === 'string' && SPAWN_FAILURES.has(e.code)) {
      resetRAHasherCache();
      return { error: `RAHasher cannot run (${e.code}).`, missing: true };
    }
    // Surface RAHasher's own stderr/stdout so the real reason is visible, not a
    // generic "failed". execFile rejection carries .stderr / .stdout.
    const detail = [e.stderr, e.stdout].map((s) => String(s || '').trim()).filter(Boolean).join(' | ').slice(0, 220);
    return { error: `RAHasher-Fehler: ${detail || String(e.message).slice(0, 200)}` };
  }
}

// ---- on-demand download of the official prebuilt binary -------------------
const RELEASES_API = 'https://api.github.com/repos/RetroAchievements/RALibretro/releases/latest';

// The release asset for this machine, or null when RALibretro builds none:
// "RAHasher-x64-Windows-1.8.4.zip", "RAHasher-x86-Linux-1.8.4.zip", ...
export function pickRAHasherAsset(assets, platform = process.platform, arch = process.arch) {
  const os = { win32: 'Windows', linux: 'Linux' }[platform];
  if (!os) return null;
  // x86 runs on x64 Windows; on Linux a 32-bit binary needs multilib, so x64 only.
  const archs = arch === 'x64' ? (platform === 'win32' ? ['x64', 'x86'] : ['x64'])
    : arch === 'ia32' ? ['x86']
      : [];
  for (const a of archs) {
    const re = new RegExp(`^RAHasher-${a}-${os}-.*\\.zip$`, 'i');
    const hit = (assets || []).find((x) => re.test(x.name));
    if (hit) return hit;
  }
  return null;
}

// What the download button fetches here, for its label — "Linux x64" —
// or null when there is no build for this machine.
export function rahasherDownloadTarget(platform = process.platform, arch = process.arch) {
  const a = pickRAHasherAsset([
    { name: 'RAHasher-x64-Windows-0.zip' }, { name: 'RAHasher-x86-Windows-0.zip' },
    { name: 'RAHasher-x64-Linux-0.zip' }, { name: 'RAHasher-x86-Linux-0.zip' },
  ], platform, arch);
  const m = a && /^RAHasher-(x64|x86)-(Windows|Linux)-/.exec(a.name);
  return m ? `${m[2]} ${m[1]}` : null;
}

// Whether the one-click download can serve this machine at all.
export function canDownloadRAHasher(platform = process.platform, arch = process.arch) {
  return rahasherDownloadTarget(platform, arch) !== null;
}

export async function downloadRAHasher(onProgress = () => {}) {
  if (!canDownloadRAHasher()) {
    throw new Error(`RetroAchievements publishes no RAHasher build for ${process.platform}/${process.arch}. `
      + 'Build it from RALibretro (make -f Makefile.RAHasher) and set its path in Settings.');
  }
  onProgress({ phase: 'lookup', message: 'Looking up latest RALibretro release…' });
  const rel = await fetch(RELEASES_API, {
    headers: { 'User-Agent': 'RAChecker', Accept: 'application/vnd.github+json' },
  }).then((r) => {
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    return r.json();
  });
  const asset = pickRAHasherAsset(rel.assets);
  if (!asset) throw new Error(`No RAHasher asset for ${process.platform}/${process.arch} in RALibretro ${rel.tag_name}.`);

  onProgress({ phase: 'download', message: `Downloading ${asset.name}…`, version: rel.tag_name });
  const buf = Buffer.from(await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'RAChecker' },
  }).then((r) => {
    if (!r.ok) throw new Error(`Download ${r.status}`);
    return r.arrayBuffer();
  }));
  // GitHub publishes a SHA-256 per release asset; a truncated or altered
  // download must not end up as an executable we then run on every scan.
  const want = /^sha256:([0-9a-f]{64})$/i.exec(asset.digest || '')?.[1]?.toLowerCase();
  if (want) {
    const got = createHash('sha256').update(buf).digest('hex');
    if (got !== want) throw new Error(`Checksum mismatch for ${asset.name} — download discarded.`);
  }

  const windows = process.platform === 'win32';
  const exeName = windows ? 'RAHasher.exe' : 'RAHasher';
  const dest = join(BIN_DIR, exeName);
  await mkdir(BIN_DIR, { recursive: true });
  const tmpZip = join(BIN_DIR, '_rahasher.zip');
  await writeFile(tmpZip, buf);

  onProgress({ phase: 'extract', message: `Extracting ${exeName}…` });
  const { default: StreamZip } = await import('node-stream-zip');
  const zip = new StreamZip.async({ file: tmpZip });
  try {
    // The Linux zip nests the binary under its build dir ("bin64/RAHasher").
    const entries = Object.values(await zip.entries());
    const exe = entries.find((e) => !e.isDirectory && basename(e.name).toLowerCase() === exeName.toLowerCase());
    if (!exe) throw new Error(`${exeName} not found inside ${asset.name}.`);
    await zip.extract(exe.name, dest);
  } finally {
    await zip.close();
    await rm(tmpZip, { force: true });
  }
  // Zip extraction does not carry the Unix mode over.
  if (!windows) await chmod(dest, 0o755);
  resetRAHasherCache();

  // Only claim success for a binary that runs here — the Linux build is linked
  // against the glibc of the CI image, and an older system cannot load it.
  const probe = await probeRAHasherAt(dest);
  if (!probe.available) {
    throw new Error(`Downloaded ${asset.name}, but it does not run on this system: ${probe.detail || probe.problem}`);
  }
  onProgress({ phase: 'done', message: 'RAHasher installed.', version: rel.tag_name });
  return { path: dest, version: rel.tag_name };
}

// Probe one specific file, bypassing the configured-path lookup — used right
// after a download, when a saved path override may still point elsewhere.
async function probeRAHasherAt(path) {
  let error = null, stdout = '', stderr = '';
  try {
    ({ stdout, stderr } = await execFileAsync(path, [], { timeout: 8000, windowsHide: true }));
  } catch (e) {
    error = e; stdout = e.stdout ?? ''; stderr = e.stderr ?? '';
  }
  return interpretProbe({ error, stdout, stderr });
}
