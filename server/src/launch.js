// Launch a ROM in RetroArch (or any configured emulator command).
//
// Only files that are already in the collection may be launched — never an
// arbitrary path from the request. The emulator path itself is user-configured
// in Settings, so this is a local convenience wrapper, not a remote exec.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { getSetting, setSetting, getLibraryPaths } from './db.js';

export const DEFAULT_EMULATOR = { retroarchPath: '', coreDir: '', extraArgs: '', coreOverrides: {} };

// cores.js is generated data; load it lazily so a missing/broken file degrades
// to "no core recommendation" instead of taking the server down.
let coresMod = null;
async function cores() {
  if (coresMod === null) {
    try { coresMod = await import('./data/cores.js'); }
    catch { coresMod = false; }
  }
  return coresMod || null;
}

export function getEmulatorConfig() {
  const saved = getSetting('emulatorConfig', null);
  const c = { ...DEFAULT_EMULATOR, ...(saved && typeof saved === 'object' ? saved : {}) };
  c.retroarchPath = String(c.retroarchPath || '');
  c.coreDir = String(c.coreDir || '');
  c.extraArgs = String(c.extraArgs || '');
  c.coreOverrides = (c.coreOverrides && typeof c.coreOverrides === 'object') ? c.coreOverrides : {};
  return c;
}

export function setEmulatorConfig(patch = {}) {
  const next = { ...getEmulatorConfig() };
  if (typeof patch.retroarchPath === 'string') next.retroarchPath = patch.retroarchPath.trim();
  if (typeof patch.coreDir === 'string') next.coreDir = patch.coreDir.trim();
  if (typeof patch.extraArgs === 'string') next.extraArgs = patch.extraArgs.trim();
  if (patch.coreOverrides && typeof patch.coreOverrides === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(patch.coreOverrides)) {
      const id = Number(k);
      if (Number.isFinite(id) && typeof v === 'string' && v.trim()) clean[id] = v.trim();
    }
    next.coreOverrides = clean;
  }
  setSetting('emulatorConfig', next);
  return next;
}

// Resolve the libretro core to use for a system: user override wins, else the
// first recommended core from the bundled table.
export async function resolveCore(consoleId) {
  const cfg = getEmulatorConfig();
  const override = cfg.coreOverrides?.[consoleId];
  const mod = await cores();
  const rec = mod?.recommendedCore?.(consoleId) ?? null;
  const coreId = override || rec?.id || null;
  if (!coreId) return { coreId: null, corePath: null, name: rec?.name ?? null, source: null };
  const file = mod?.coreFileName ? mod.coreFileName(coreId) : `${coreId}${process.platform === 'win32' ? '.dll' : '.so'}`;
  const corePath = cfg.coreDir ? join(cfg.coreDir, file) : null;
  return {
    coreId, corePath, file,
    name: override ? coreId : (rec?.name ?? coreId),
    source: override ? 'override' : 'recommended',
  };
}

// Best-effort auto-detection of a local RetroArch install. Opt-in only — the
// UI calls this when the user asks ("search automatically"). Returns '' if not
// found; never throws.
export function detectRetroArch() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    'C:\\RetroArch-Win64\\retroarch.exe', 'C:\\RetroArch\\retroarch.exe',
    'D:\\RetroArch-Win64\\retroarch.exe', 'D:\\RetroArch\\retroarch.exe',
    'C:\\Program Files\\RetroArch\\retroarch.exe', 'C:\\Program Files (x86)\\RetroArch\\retroarch.exe',
    home && join(home, 'scoop\\apps\\retroarch\\current\\retroarch.exe'),
    local && join(local, 'Programs\\RetroArch\\retroarch.exe'),
    // Linux / macOS
    '/usr/bin/retroarch', '/usr/local/bin/retroarch', '/var/lib/flatpak/exports/bin/org.libretro.RetroArch',
    home && join(home, '.local/share/flatpak/exports/bin/org.libretro.RetroArch'),
    '/Applications/RetroArch.app/Contents/MacOS/RetroArch',
  ].filter(Boolean);
  for (const p of candidates) { try { if (existsSync(p)) return p; } catch { /* ignore */ } }
  return '';
}

// Guess the libretro core folder — next to retroarch first, then the usual
// per-user config locations.
export function detectCoreDir(raPath) {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const appData = process.env.APPDATA || '';
  const guesses = [
    raPath && join(dirname(raPath), 'cores'),
    appData && join(appData, 'RetroArch\\cores'),
    home && join(home, 'AppData\\Roaming\\RetroArch\\cores'),
    home && join(home, '.config/retroarch/cores'),
    home && join(home, '.var/app/org.libretro.RetroArch/config/retroarch/cores'),
    '/Applications/RetroArch.app/Contents/Resources/cores',
  ].filter(Boolean);
  for (const p of guesses) { try { if (existsSync(p)) return p; } catch { /* ignore */ } }
  return '';
}

export function detectEmulator() {
  const retroarchPath = detectRetroArch();
  return { retroarchPath, coreDir: detectCoreDir(retroarchPath) };
}

export async function emulatorStatus() {
  const cfg = getEmulatorConfig();
  return {
    ...cfg,
    retroarchFound: Boolean(cfg.retroarchPath && existsSync(cfg.retroarchPath)),
    coreDirFound: Boolean(cfg.coreDir && existsSync(cfg.coreDir)),
  };
}

// Split the user's extra-args string on spaces, honouring "quoted groups".
function splitArgs(s) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(s || '')) !== null) out.push(m[1] ?? m[2]);
  return out;
}

// Start the emulator detached so it outlives this request (and the app).
export async function launchRom({ path, inner = '', consoleId = null }) {
  const cfg = getEmulatorConfig();
  if (!cfg.retroarchPath) return { ok: false, error: 'no_emulator', message: 'Kein Emulator-Pfad konfiguriert (Einstellungen → Emulator).' };
  if (!existsSync(cfg.retroarchPath)) return { ok: false, error: 'emulator_missing', message: `Emulator nicht gefunden: ${cfg.retroarchPath}` };
  if (!path) return { ok: false, error: 'no_path', message: 'Kein Pfad angegeben.' };
  // Only ROMs the scanner already knows may be launched.
  if (!new Set(getLibraryPaths()).has(path)) {
    return { ok: false, error: 'not_in_library', message: 'Datei gehört nicht zur Sammlung.' };
  }
  if (!existsSync(path)) return { ok: false, error: 'file_missing', message: 'Datei existiert nicht mehr.' };

  const core = consoleId != null ? await resolveCore(consoleId) : { coreId: null, corePath: null };
  const args = [];
  if (core.corePath) {
    if (!existsSync(core.corePath)) {
      return { ok: false, error: 'core_missing', message: `Core nicht gefunden: ${core.corePath}`, core };
    }
    args.push('-L', core.corePath);
  }
  args.push(...splitArgs(cfg.extraArgs));
  // RetroArch addresses an entry inside an archive as "archive.zip#entry".
  args.push(inner ? `${path}#${inner}` : path);

  try {
    const child = spawn(cfg.retroarchPath, args, { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true, core, args };
  } catch (e) {
    return { ok: false, error: 'spawn_failed', message: String(e.message) };
  }
}
