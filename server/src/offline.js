// Offline package: bundle everything the app needs to run without network
// (hash database, cached game details, images) into one archive, and restore
// such a bundle on another machine.
//
// RA is building its own offline achievement mode; this is the equivalent for
// the checker: the app is already local-first, this just makes the local state
// portable.
import { mkdtemp, rm, readdir, copyFile, stat } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';
import {
  backupTo, totalGameCount, totalHashCount, countApiCache, getSetting, libraryInsights, getConsoles,
} from './db.js';
import { isRAHasherAvailable } from './hashing/rahasher.js';
import { consoleNeedsSync } from './sync.js';

// Same 7za invocation style as hashing/archive.js: the bundled binary handles
// both callback and promise flavours depending on the installed version.
// Exported because the ES-DE export builds a zip the same way.
export async function sevenZipCmd(args) {
  const mod = await import('7zip-min');
  const cmd = mod.cmd ?? mod.default?.cmd;
  if (!cmd) throw new Error('7za not available');
  const r = cmd(args);
  if (r && typeof r.then === 'function') return void (await r);
  await new Promise((resolve, reject) => { cmd(args, (err) => (err ? reject(err) : resolve())); });
}

function dirCount(dir) {
  try { return readdirSync(dir).length; } catch { return 0; }
}
function dirBytes(dir) {
  let total = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = join(dir, e.name);
    try { total += e.isDirectory() ? dirBytes(full) : statSync(full).size; } catch { /* skip */ }
  }
  return total;
}

// What works offline right now, and what is still missing.
export async function offlineReadiness() {
  const consoles = getConsoles().filter((c) => c.is_game_system);
  const stale = consoles.filter((c) => consoleNeedsSync(c.id)).length;
  const ins = libraryInsights();
  const gameDetails = countApiCache('game:');
  const images = dirCount(config.imageCacheDir);
  const profile = Boolean(getSetting('userProfile', null));
  const completion = Boolean(getSetting('userCompletion', null)?.games?.length);
  const playable = ins.playableGames || 0;
  const checks = [
    { id: 'hashdb', ok: totalHashCount() > 0, value: totalHashCount() },
    { id: 'sync', ok: stale === 0, value: stale },
    { id: 'details', ok: playable > 0 && gameDetails >= playable, value: gameDetails, need: playable },
    { id: 'images', ok: images > 0, value: images },
    { id: 'rahasher', ok: await isRAHasherAvailable(), value: null },
    { id: 'profile', ok: profile, value: null },
    { id: 'completion', ok: completion, value: null },
  ];
  return {
    ready: checks.every((c) => c.ok),
    checks,
    games: totalGameCount(),
    hashes: totalHashCount(),
    playable,
    gameDetails,
    images,
    imageBytes: dirBytes(config.imageCacheDir),
    lastFullSyncAt: getSetting('lastFullSyncAt', null),
  };
}

// Build a .7z containing a consistent DB snapshot + the image cache. Caller
// streams the file and must call cleanup() afterwards.
export async function exportOfflinePackage({ includeImages = true } = {}) {
  const dir = await mkdtemp(join(config.tempDir, 'offline-'));
  const stage = join(dir, 'ra-checker-offline');
  const archive = join(dir, 'ra-checker-offline.7z');
  try {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(stage, { recursive: true });
    backupTo(join(stage, 'ra-checker.db'));       // VACUUM INTO = consistent copy
    if (includeImages && existsSync(config.imageCacheDir)) {
      const imgOut = join(stage, 'images');
      await mkdir(imgOut, { recursive: true });
      for (const name of await readdir(config.imageCacheDir)) {
        const src = join(config.imageCacheDir, name);
        try { if ((await stat(src)).isFile()) await copyFile(src, join(imgOut, name)); }
        catch { /* skip unreadable */ }
      }
    }
    // "a <archive> <dir>/*" so the archive has no extra top-level folder.
    await sevenZipCmd(['a', '-t7z', archive, join(stage, '*'), '-y']);
    const size = (await stat(archive)).size;
    return { file: archive, size, cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}) };
  } catch (e) {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

// Restore a package: the DB is staged for the next start (config.js swaps it in
// before anything opens it), images are copied straight into the cache.
export async function importOfflinePackage(archivePath) {
  const dir = await mkdtemp(join(config.tempDir, 'offline-in-'));
  try {
    await sevenZipCmd(['x', archivePath, `-o${dir}`, '-y']);
    const dbSrc = join(dir, 'ra-checker.db');
    if (!existsSync(dbSrc)) throw new Error('Paket enthält keine ra-checker.db');
    await copyFile(dbSrc, join(config.dataDir, 'ra-checker.restore.db'));
    let images = 0;
    const imgSrc = join(dir, 'images');
    if (existsSync(imgSrc)) {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(config.imageCacheDir, { recursive: true });
      for (const name of await readdir(imgSrc)) {
        try { await copyFile(join(imgSrc, name), join(config.imageCacheDir, name)); images++; }
        catch { /* skip */ }
      }
    }
    return { ok: true, needsRestart: true, images };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
