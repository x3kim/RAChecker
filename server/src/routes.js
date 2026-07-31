// HTTP + SSE API routes.
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, rm, access, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { openSSE } from './sse.js';
import { config, ROOT } from './config.js';
import {
  getConsoles, getSyncState, getScan, listScans, getScanItems,
  createScan, finishScan, totalHashCount, totalGameCount, getSetting, setSetting,
  getLibrary, libraryStats, clearLibrary, resetCollection, resetHashDb, getGamesByConsole, countGamesByConsole,
  insertDat, listDats, deleteDat, datCoverage, datCrcStatus, datExtras, getLibraryRowsWithoutCrc, setLibraryHashes,
  searchGames, getDuplicates, getDuplicateFiles, libraryInsights, suggestPlayable,
  getPlayableGames,
  getApiCache, setApiCache, clearApiCache, getCacheTtls, setCacheTtls,
  upsertLibraryItem, backupTo, autoBackup, listBackups, stageRestore,
  snapshotLibraryBaseline, getCollectionDiff,
  getLibraryPaths, countLibraryRowsForPaths, deleteLibraryByPaths,
  getLibraryFilesForGame, getOwnedGameIdSet, getGameById, findGamesByTitle,
  getCoverageStats, getRecentSessions, getPlaytimeByGame, playtimeTotals, clearSessions,
  exportSessions, importSessions, libraryTagFacets,
} from './db.js';
import { syncAll, enrichGameHashes, consoleNeedsSync, newlySupportedSystems } from './sync.js';
import { Scanner, checkSingleFile, resolveMatch } from './scanner.js';
import { hashTarget } from './hashing/index.js';
import { getCachedImage } from './images.js';
import {
  getGameExtended, mediaUrl, getUserProfile, getGameInfoAndUserProgress, getUserCompletionProgress,
  getAchievementOfTheWeek, getActiveClaims, getRecentGameAwards, getUserSetRequests,
  getUserWantToPlayList, getGameLeaderboards, getUserGameLeaderboards, getLeaderboardEntries,
} from './ra-api.js';
import {
  getPresenceConfig, setPresenceConfig, presenceStatus, pollPresence,
} from './presence.js';
import { getEmulatorConfig, setEmulatorConfig, emulatorStatus, resolveCore, launchRom, detectEmulator } from './launch.js';
import { offlineReadiness, exportOfflinePackage, importOfflinePackage, sevenZipCmd } from './offline.js';
import { isRAHasherAvailable, downloadRAHasher, locateRAHasher, resetRAHasherCache } from './hashing/rahasher.js';
import { listDir, pathInfo } from './fs-browse.js';
import { startWatch, stopWatch, watchStatus, getWatchConfig, setWatchConfig } from './watcher.js';
import { setScheduleConfig, scheduleStatus } from './scheduler.js';
import { acquireScanLock, releaseScanLock, scanLockHolder } from './scan-lock.js';
import { CONSOLE_BY_ID } from './consoles.js';
import { statSync, readdirSync, readFileSync } from 'node:fs';
import { parseDat, guessConsole, hashFileAll } from './dat.js';
import { listEntriesWithCrc } from './hashing/archive.js';
import { extname as extnameFn } from 'node:path';

// Single version source = root package.json (web/src/lib/version.ts mirrors it).
const APP_VERSION = (() => {
  try { return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version || '0.0.0'; }
  catch { return '0.0.0'; }
})();

// Persisted "systems I care about" filter. null => all systems.
function getEnabledConsoles() {
  const v = getSetting('enabledConsoles', null);
  return Array.isArray(v) && v.length ? v.map(Number).filter(Number.isFinite) : null;
}
// Ordered region/language preference, e.g. ['JP','L:ja','EU']. Empty = none set,
// in which case nothing anywhere changes its ordering.
function getRegionPriority() {
  const v = getSetting('regionPriority', null);
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}
// Bytes threshold for copying a big file to local temp before hashing (0=off).
function bigFileCopyBytes() {
  const c = config.bigFileCopy || {};
  return c.enabled ? Math.max(0, Number(c.thresholdMB) || 0) * 1024 * 1024 : 0;
}
// Upper byte cap — files larger than this are never copied (0=no cap).
function bigFileMaxBytes() {
  const c = config.bigFileCopy || {};
  return Math.max(0, Number(c.maxThresholdMB) || 0) * 1024 * 1024;
}
// Recursively sum the byte size of a directory (best effort; ignores errors).
function dirSize(dir) {
  let total = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return 0; }
  for (const e of entries) {
    const full = join(dir, e.name);
    try {
      if (e.isDirectory()) total += dirSize(full);
      else total += statSync(full).size;
    } catch { /* skip unreadable */ }
  }
  return total;
}

// Tag a temp entry by its name prefix so the UI can say what it is.
function tempKind(name) {
  if (name.startsWith('upload-')) return 'upload';     // drag&drop quick-test scratch
  if (name.startsWith('bigcopy-')) return 'bigcopy';   // big-file local-copy scratch
  if (name.startsWith('backup-')) return 'backup';     // backup-download scratch
  if (name.startsWith('rom7z-') || name.startsWith('romzip-')
    || name.startsWith('ra-extract') || name.startsWith('extract')) return 'extract'; // archive extraction
  return 'other';
}

// Top-level temp entries with sizes + age, largest first, for the storage panel.
function tempBreakdown() {
  let entries;
  try { entries = readdirSync(config.tempDir, { withFileTypes: true }); } catch { return []; }
  return entries.map((e) => {
    const full = join(config.tempDir, e.name);
    let size = 0; let mtime = 0;
    try { const s = statSync(full); mtime = s.mtimeMs; size = e.isDirectory() ? dirSize(full) : s.size; } catch { /* skip */ }
    return { name: e.name, size, mtime, dir: e.isDirectory(), kind: tempKind(e.name) };
  }).sort((a, b) => b.size - a.size);
}

// ---- shared mutable state -------------------------------------------------
let activeScan = null;   // { id, controller, rootPath }
let activeSync = false;
let credCheckInFlight = false; // serialize credential validation (mutates shared config)
let activeRecheck = false;      // serialize the RAHasher re-check pass
let activeImageWarm = false;    // serialize the badge/box-art pre-cache pass

// Build the full game-detail object (achievements, box art, compatible hashes),
// caching it under `game:<id>`. Shared by the /api/game/:id route and the image
// pre-cache warmer. Returns the cached value untouched when fresh.
async function buildGameDetail(id, { force = false } = {}) {
  const ttlMs = getCacheTtls().gameDetailDays * 24 * 60 * 60 * 1000;
  if (!force) {
    const cached = getApiCache(`game:${id}`, ttlMs || null);
    if (cached) return { ...cached.value, _cachedAt: cached.cachedAt };
  }
  const ext = await getGameExtended(id);
  const hashes = await enrichGameHashes(id).catch(() => []);
  const achRaw = ext.Achievements || {};
  const achievements = Object.values(achRaw)
    .map((a) => ({
      id: a.ID,
      title: a.Title,
      description: a.Description,
      points: a.Points,
      badgeUrl: a.BadgeName ? `https://media.retroachievements.org/Badge/${a.BadgeName}.png` : null,
      displayOrder: a.DisplayOrder ?? 0,
    }))
    .sort((x, y) => x.displayOrder - y.displayOrder);
  const out = {
    ...ext,
    ImageIconURL: mediaUrl(ext.ImageIcon),
    ImageBoxArtURL: mediaUrl(ext.ImageBoxArt),
    ImageTitleURL: mediaUrl(ext.ImageTitle),
    ImageIngameURL: mediaUrl(ext.ImageIngame),
    achievements,
    hashes,
  };
  setApiCache(`game:${id}`, out);
  return out;
}

// ---- unmatched-ROM → RA game guessing ("Versions-Report") -----------------
// For every "no_match" file, guess which RA game it most likely is, so the user
// knows which supported version to obtain. Pure local work against the cached
// games DB — no RA API calls. Also reused by the claim radar to answer "is a
// set being built for a ROM I already have?".
function cleanRomName(file) {
  let n = (String(file).split(/[\\/]/).pop() || file).replace(/\.[^.]+$/, '');
  n = n.replace(/[([][^)\]]*[)\]]/g, ' ');     // strip (USA), [!], …
  n = n.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n;
}
function buildVersionReport() {
  // Hacks/subsets/homebrew aren't what a user's standard ROM is — and they
  // carry high point totals that would otherwise dominate the ranking. Skip
  // them so a guess is a plausible base game or nothing.
  const isDerivative = (t) => /(~Hack~|~Homebrew~|~Demo~|~Prototype~|~Unlicensed~|\[Subset)/i.test(t || '');
  const numsIn = (s) => [...String(s).matchAll(/\b(\d{1,2})\b/g)].map((m) => m[1]);
  const items = getLibrary({ status: 'no_match', limit: 500 });
  const groups = new Map();
  let unresolved = 0;
  for (const it of items) {
    const name = it.inner_path || it.path;
    const query = cleanRomName(name);
    if (query.length < 2) { unresolved++; continue; }
    let hits = searchGames(query, { limit: 10 }).filter((h) => h.num_achievements && !isDerivative(h.title));
    // Require the same console the file was classified as (avoids confident
    // cross-console mismatches). Only the unknown-console case keeps all hits.
    if (it.console_id != null) hits = hits.filter((h) => h.console_id === it.console_id);
    if (!hits.length) { unresolved++; continue; }
    // searchGames drops 1-char tokens, so "Mario Party 2" and "Mario Party 3"
    // are indistinguishable to it. Re-rank by the sequel number: a numbered
    // file must map to a title carrying the same number; a base (no number)
    // prefers the title without one.
    const qn = numsIn(query);
    const score = (h) => {
      const tn = numsIn(h.title);
      if (qn.length) return qn.every((n) => tn.includes(n)) ? 2 : 0;
      return tn.length === 0 ? 1 : 0;
    };
    const ranked = hits.map((h, i) => ({ h, i, s: score(h) })).sort((a, b) => b.s - a.s || a.i - b.i);
    // score 0 == numbered query without a number-matching title, OR a base
    // (unnumbered) query whose only candidates are numbered sequels. Both are
    // too risky to present as a confident guess.
    if (ranked[0].s === 0) { unresolved++; continue; }
    const hit = ranked[0].h;
    const g = groups.get(hit.id) || {
      id: hit.id, title: hit.title, consoleId: hit.console_id, consoleName: hit.console_name,
      consoleShort: hit.console_short, icon: hit.image_icon, achievements: hit.num_achievements,
      points: hit.points, files: [],
    };
    g.files.push({ name: String(name).split(/[\\/]/).pop(), path: it.path, inner: it.inner_path || null });
    groups.set(hit.id, g);
  }
  const list = [...groups.values()].sort((a, b) => b.files.length - a.files.length || a.title.localeCompare(b.title));
  return { scanned: items.length, resolved: list.length, unresolved, groups: list };
}

// Generic cached RA fetch: serve from api_cache while fresh, otherwise refetch
// and fall back to the stale copy when the network fails.
async function cachedRa(key, maxAgeMs, fetcher, { force = false } = {}) {
  if (!force) {
    const hit = getApiCache(key, maxAgeMs);
    if (hit) return { value: hit.value, cachedAt: hit.cachedAt, stale: false };
  }
  try {
    const value = await fetcher();
    setApiCache(key, value);
    return { value, cachedAt: Date.now(), stale: false };
  } catch (e) {
    const stale = getApiCache(key, null);
    if (stale) return { value: stale.value, cachedAt: stale.cachedAt, stale: true, error: String(e.message) };
    throw e;
  }
}

// data/cores.js is generated data — load it lazily so a missing file degrades
// gracefully instead of breaking the server at import time.
let coresModule = null;
async function coresData() {
  if (coresModule === null) {
    try { coresModule = await import('./data/cores.js'); } catch { coresModule = false; }
  }
  return coresModule || null;
}
let freeGamesModule = null;
async function freeGamesData() {
  if (freeGamesModule === null) {
    try { freeGamesModule = await import('./data/free-games.js'); } catch { freeGamesModule = false; }
  }
  return freeGamesModule || null;
}
let frontendsModule = null;
async function frontendsData() {
  if (frontendsModule === null) {
    try { frontendsModule = await import('./data/frontends.js'); } catch { frontendsModule = false; }
  }
  return frontendsModule || null;
}

// ---- launcher-export helpers ----------------------------------------------
const xmlEscape = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// Longest directory prefix shared by all paths, as a forward-slash string.
// Used to turn absolute ROM paths into the relative ones ES-DE expects.
function commonDirPrefix(paths) {
  const split = paths.map((p) => String(p).replace(/\\/g, '/').split('/'));
  if (!split.length) return '';
  const first = split[0];
  let n = first.length - 1; // never include the file name itself
  for (const parts of split) {
    n = Math.min(n, parts.length - 1);
    for (let i = 0; i < n; i++) {
      // Windows paths are case-insensitive; compare accordingly.
      if (parts[i].toLowerCase() !== first[i].toLowerCase()) { n = i; break; }
    }
  }
  return first.slice(0, n).join('/');
}
function relativeFrom(base, p) {
  const norm = String(p).replace(/\\/g, '/');
  if (base && norm.toLowerCase().startsWith(base.toLowerCase() + '/')) return norm.slice(base.length + 1);
  return norm;
}

export async function registerRoutes(app) {
  // ---- status / meta ------------------------------------------------------
  app.get('/api/health', async () => ({ ok: true, version: APP_VERSION }));

  // ---- update check (GitHub latest release) -------------------------------
  // Powers the footer "update available" chip. The Electron shell does the real
  // download/install via electron-updater; the web/.bat build just links out.
  let updateCache = null;
  // Compare version cores (major.minor.patch); on a tie a build WITHOUT a
  // prerelease tag is newer than the same core WITH one (1.0.0 > 1.0.0-rc.1).
  // Build metadata (+…) is ignored. Good enough for GitHub release tags without
  // pulling in a full semver dependency.
  const semverGt = (a, b) => {
    const parse = (v) => {
      const [core, pre = ''] = String(v).replace(/^v/i, '').split('+')[0].split('-');
      return { nums: core.split('.').map((n) => parseInt(n, 10) || 0), pre };
    };
    const A = parse(a); const B = parse(b);
    for (let i = 0; i < 3; i++) { const d = (A.nums[i] || 0) - (B.nums[i] || 0); if (d) return d > 0; }
    if (A.pre === B.pre) return false;
    if (!A.pre) return true;    // a = release, b = prerelease of the same core
    if (!B.pre) return false;   // b = release → a (prerelease) is not newer
    return A.pre > B.pre;       // both prereleases → lexical fallback
  };
  const pickInstaller = (assets) => {
    if (!Array.isArray(assets)) return null;
    const exes = assets.filter((a) => /\.exe$/i.test(a.name));
    const setup = exes.find((a) => /setup/i.test(a.name)) || exes[0];
    return setup ? { name: setup.name, url: setup.browser_download_url, size: setup.size } : null;
  };
  app.get('/api/update/check', async (req) => {
    const fresh = req.query.fresh === '1';
    if (!fresh && updateCache && Date.now() - updateCache.at < 60 * 60 * 1000) return updateCache.value;
    try {
      const res = await fetch('https://api.github.com/repos/x3kim/RAChecker/releases/latest', {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'RAChecker' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error('GitHub HTTP ' + res.status);
      const j = await res.json();
      const latest = String(j.tag_name || '').replace(/^v/i, '');
      const value = {
        ok: true, current: APP_VERSION, latest,
        newer: latest ? semverGt(latest, APP_VERSION) : false,
        url: j.html_url, notes: String(j.body || '').slice(0, 4000), asset: pickInstaller(j.assets),
      };
      updateCache = { at: Date.now(), value };
      return value;
    } catch (e) {
      return { ok: false, current: APP_VERSION, error: String(e.message) };
    }
  });

  app.get('/api/status', async () => {
    const consoles = getConsoles();
    const sync = getSyncState();
    const syncById = new Map(sync.map((s) => [s.console_id, s]));
    const w = watchStatus();
    // Surface the most recent matches the watcher auto-found so the UI can toast
    // them. Only matches are interesting for a notification.
    const recentMatches = (w.recent || [])
      .filter((r) => r.status === 'match')
      .slice(0, 10)
      .map((r) => ({ gameId: r.matchGameId ?? null, title: r.matchTitle || (String(r.innerPath || r.filePath || '').split(/[\\/]/).pop()), at: r.at }));
    return {
      ra: { username: config.raUsername, hasKey: Boolean(config.raApiKey) },
      romRoot: getSetting('romRoot', config.romRoot),
      totals: { games: totalGameCount(), hashes: totalHashCount() },
      consolesSyncedAt: getSetting('consolesSyncedAt', null),
      lastFullSyncAt: getSetting('lastFullSyncAt', null),
      rahasher: { available: await isRAHasherAvailable(), path: locateRAHasher() },
      watch: {
        active: w.active, enabled: w.enabled, mode: w.mode, intervalMin: w.intervalMin,
        root: w.root, processed: w.processed, scanning: w.scanning,
        lastRunAt: w.lastRunAt, nextRunAt: w.nextRunAt, recentMatches,
      },
      activeScan: activeScan ? { id: activeScan.id, rootPath: activeScan.rootPath } : null,
      activeSync,
      consoles: consoles.map((c) => {
        const s = syncById.get(c.id);
        return {
          ...c,
          syncedAt: s?.synced_at ?? null,
          gameCount: s?.game_count ?? 0,
          hashCount: s?.hash_count ?? 0,
          stale: consoleNeedsSync(c.id),
          syncStatus: s?.status ?? null,
        };
      }),
    };
  });

  app.get('/api/consoles', async () => getConsoles());

  // ---- settings -----------------------------------------------------------
  // Merge a patch into the persisted `serverConfig` and mirror it onto the live
  // in-memory config so the change takes effect immediately (no restart).
  function persistServerConfig(patch) {
    const saved = getSetting('serverConfig', {}) || {};
    const next = { ...saved, ...patch };
    setSetting('serverConfig', next);
  }

  const settingsPayload = () => ({
    romRoot: getSetting('romRoot', config.romRoot),
    hashCacheTtlDays: config.hashCacheTtlDays,
    raUsername: config.raUsername,
    cacheTtls: getCacheTtls(),
    scanFileTimeoutSec: Number(getSetting('scanFileTimeoutSec', 600)),
    scanConcurrency: Math.max(1, Math.min(16, Number(getSetting('scanConcurrency', 1)) || 1)),
    skipCollected: !!getSetting('skipCollected', false),
    enabledConsoles: getEnabledConsoles(),
    bigFileCopy: config.bigFileCopy,
    rateLimit: config.rateLimit,
    rahasherPath: config.rahasherPath,
    downloadDir: getSetting('downloadDir', ''),
    regionPriority: getRegionPriority(),
  });

  app.get('/api/settings', async () => settingsPayload());
  app.post('/api/settings', async (req) => {
    const body = req.body || {};
    if (typeof body.romRoot === 'string') setSetting('romRoot', body.romRoot);
    if (body.cacheTtls && typeof body.cacheTtls === 'object') setCacheTtls(body.cacheTtls);
    if (body.scanFileTimeoutSec != null) {
      setSetting('scanFileTimeoutSec', Math.max(10, Number(body.scanFileTimeoutSec) || 600));
    }
    if (body.scanConcurrency != null) {
      setSetting('scanConcurrency', Math.max(1, Math.min(16, Number(body.scanConcurrency) || 1)));
    }
    if (body.skipCollected != null) setSetting('skipCollected', !!body.skipCollected);
    // "Systems I care about": array of console ids, or null/[] to mean "all".
    if ('enabledConsoles' in body) {
      const ids = Array.isArray(body.enabledConsoles)
        ? body.enabledConsoles.map(Number).filter(Number.isFinite) : [];
      setSetting('enabledConsoles', ids.length ? ids : null);
    }
    // Big-file local-copy threshold + upper cap (advanced).
    if (body.bigFileCopy && typeof body.bigFileCopy === 'object') {
      const cur = config.bigFileCopy || {};
      const thresholdMB = Math.max(1, Math.round(Number(body.bigFileCopy.thresholdMB) || cur.thresholdMB));
      let maxThresholdMB = body.bigFileCopy.maxThresholdMB != null
        ? Math.max(0, Math.round(Number(body.bigFileCopy.maxThresholdMB) || 0))
        : (cur.maxThresholdMB ?? 0);
      // A non-zero cap below the threshold would disable copying entirely; lift it.
      if (maxThresholdMB > 0 && maxThresholdMB < thresholdMB) maxThresholdMB = thresholdMB;
      const next = { enabled: !!body.bigFileCopy.enabled, thresholdMB, maxThresholdMB };
      config.bigFileCopy = next;
      persistServerConfig({ bigFileCopy: next });
    }
    // RA API politeness throttle (advanced).
    if (body.rateLimit && typeof body.rateLimit === 'object') {
      const next = { ...config.rateLimit };
      if (body.rateLimit.minIntervalMs != null) next.minIntervalMs = Math.max(0, Number(body.rateLimit.minIntervalMs) || 0);
      if (body.rateLimit.maxRetries != null) next.maxRetries = Math.max(0, Math.round(Number(body.rateLimit.maxRetries) || 0));
      config.rateLimit = next;
      persistServerConfig({ rateLimit: next });
    }
    if (typeof body.rahasherPath === 'string') {
      config.rahasherPath = body.rahasherPath.trim();
      persistServerConfig({ rahasherPath: config.rahasherPath });
      resetRAHasherCache(); // otherwise the old (cached) location wins until restart
    }
    // Where the user drops free-game ROMs they downloaded from external pages
    // (the app can't fetch those pages itself — see /api/open-folder).
    if (typeof body.downloadDir === 'string') setSetting('downloadDir', body.downloadDir.trim());
    // Ordered region/language preference ("JP" before "EU", "L:de" before "L:en").
    // An empty list means "no preference" and leaves every sort order untouched.
    if ('regionPriority' in body) {
      const list = Array.isArray(body.regionPriority)
        ? body.regionPriority.map((s) => String(s).trim()).filter(Boolean).slice(0, 64) : [];
      setSetting('regionPriority', [...new Set(list)]);
    }
    return { ok: true, ...settingsPayload() };
  });

  // Open a configured folder in the OS file manager. Only opens paths stored
  // server-side (never a client-supplied path). `which`: 'download' | 'rom'.
  app.post('/api/open-folder', async (req) => {
    const which = (req.body && req.body.which) || 'download';
    let dir = String((which === 'rom' ? getSetting('romRoot', config.romRoot) : getSetting('downloadDir', '')) || '').trim();
    if (!dir) return { error: 'not_set' };
    try {
      if (which !== 'rom') await mkdir(dir, { recursive: true }); // create the download target if needed
      if (!existsSync(dir)) return { error: 'missing' };
      const plat = process.platform;
      const cmd = plat === 'win32' ? 'explorer.exe' : plat === 'darwin' ? 'open' : 'xdg-open';
      execFile(cmd, [dir], () => {}); // fire-and-forget (explorer.exe exits non-zero even on success)
      return { ok: true, path: dir };
    } catch (e) {
      return { error: String(e.message).slice(0, 200) };
    }
  });

  // ---- storage usage ------------------------------------------------------
  // Computing dir sizes walks thousands of image files, so cache the result
  // briefly (the panel refetches on mount + manual refresh; ?fresh=1 bypasses).
  let storageCache = null; // { at, value }
  const computeStorage = () => {
    const sizeOf = (p) => { try { return statSync(p).size; } catch { return 0; } };
    const countFiles = (dir) => { try { return readdirSync(dir).length; } catch { return 0; } };
    const dbBytes = sizeOf(config.dbPath);
    const wal = sizeOf(config.dbPath + '-wal') + sizeOf(config.dbPath + '-shm');
    const images = dirSize(config.imageCacheDir);
    const backupsDir = join(config.dataDir, 'backups');
    const backups = dirSize(backupsDir);
    const tempItems = tempBreakdown();
    const temp = tempItems.reduce((n, i) => n + i.size, 0);
    const dataDir = dirSize(config.dataDir); // whole data dir (includes the above + WAL)
    return {
      dataDir: config.dataDir,
      db: dbBytes, wal, images, backups, temp,
      total: dataDir,
      imageCount: countFiles(config.imageCacheDir),
      backupCount: countFiles(backupsDir),
      tempItems: tempItems.slice(0, 12),
      tempCount: tempItems.length,
    };
  };
  app.get('/api/storage', async (req) => {
    const fresh = req.query.fresh === '1';
    if (!fresh && storageCache && Date.now() - storageCache.at < 30000) return storageCache.value;
    const value = computeStorage();
    storageCache = { at: Date.now(), value };
    return value;
  });

  // Clear the scratch temp directory (uploads, big-file copies, extraction
  // leftovers). Refused while a scan is running so we don't delete files it's
  // mid-hash on.
  app.post('/api/storage/clear-temp', async () => {
    if (activeScan) return { ok: false, error: 'Während eines Scans nicht möglich.' };
    let entries;
    try { entries = readdirSync(config.tempDir, { withFileTypes: true }); }
    catch { return { ok: true, removed: 0, freed: 0 }; }
    let removed = 0; let freed = 0;
    for (const e of entries) {
      const full = join(config.tempDir, e.name);
      try {
        const sz = e.isDirectory() ? dirSize(full) : statSync(full).size;
        await rm(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        removed++; freed += sz;
      } catch { /* in use — skip */ }
    }
    storageCache = null; // reflect freed space immediately
    return { ok: true, removed, freed };
  });

  // Delete the local image cache (badges/box art). Fully re-downloadable via a
  // re-open or the badge pre-cache; does not touch the database.
  app.post('/api/data/clear-images', async () => {
    let entries;
    try { entries = readdirSync(config.imageCacheDir, { withFileTypes: true }); }
    catch { return { ok: true, removed: 0, freed: 0 }; }
    let removed = 0; let freed = 0;
    for (const e of entries) {
      const full = join(config.imageCacheDir, e.name);
      try {
        const sz = e.isDirectory() ? dirSize(full) : statSync(full).size;
        await rm(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        removed++; freed += sz;
      } catch { /* in use — skip */ }
    }
    storageCache = null;
    return { ok: true, removed, freed };
  });

  // Wipe the collection + scan history + per-file hash cache (keeps the synced
  // hash DB and the RA login). Refused mid-scan.
  app.post('/api/data/reset-collection', async () => {
    if (activeScan) return { ok: false, error: 'Während eines Scans nicht möglich.' };
    const counts = resetCollection();
    storageCache = null;
    return { ok: true, counts };
  });

  // Wipe the synced RetroAchievements hash database (forces a fresh sync next
  // time). Keeps the RA login and console metadata. Refused mid-scan.
  app.post('/api/data/reset-hashdb', async () => {
    if (activeScan) return { ok: false, error: 'Während eines Scans nicht möglich.' };
    const counts = resetHashDb();
    storageCache = null;
    return { ok: true, counts };
  });

  // ---- database backups ---------------------------------------------------
  app.get('/api/backups', async () => ({ backups: listBackups() }));

  app.post('/api/backup/now', async () => {
    try { const r = autoBackup({ minIntervalMs: 0 }); return { ok: true, ...r, backups: listBackups() }; }
    catch (e) { return { ok: false, error: String(e.message) }; }
  });

  app.post('/api/backup/restore', async (req) => {
    const name = (req.body && req.body.name) || '';
    try {
      autoBackup({ minIntervalMs: 0 });        // snapshot current state first (undo path)
      stageRestore(name);                       // applied on next start by config.js
      return { ok: true, needsRestart: true };
    } catch (e) {
      return { ok: false, error: String(e.message) };
    }
  });

  app.get('/api/backup/download', async (req, reply) => {
    const tmp = join(config.tempDir, `backup-${Date.now()}.db`);
    try {
      backupTo(tmp);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '');
      reply.header('content-type', 'application/octet-stream');
      reply.header('content-disposition', `attachment; filename="ra-checker-backup-${stamp}.db"`);
      const stream = createReadStream(tmp);
      stream.on('close', () => { rm(tmp, { force: true }).catch(() => {}); });
      return reply.send(stream);
    } catch (e) {
      rm(tmp, { force: true }).catch(() => {});
      return reply.code(500).send({ error: String(e.message) });
    }
  });

  // Drop cached RA data so the next request re-fetches fresh from the network.
  app.post('/api/cache/clear', async (req) => {
    const what = (req.body && req.body.what) || 'all';
    if (what === 'all' || what === 'games') clearApiCache('game:');
    if (what === 'all' || what === 'profile') { setSetting('userProfile', null); setSetting('userCompletion', null); }
    return { ok: true };
  });

  // ---- RetroAchievements account (login / switch user / logout) ------------
  // Credentials are persisted in the DB settings and override the config
  // defaults at startup (see applySavedCredentials in db.js).
  app.post('/api/settings/credentials', async (req) => {
    const body = req.body || {};
    const username = String(body.username || '').trim();
    const apiKey = String(body.apiKey || '').trim();
    if (!username || !apiKey) return { ok: false, error: 'Benutzername und API-Key erforderlich.' };

    // Validation temporarily swaps the candidate creds into the shared, mutable
    // config and reverts on failure. Serialize so two concurrent attempts can't
    // interleave their swap/revert and corrupt each other's state.
    if (credCheckInFlight) return { ok: false, error: 'Eine Anmeldung läuft bereits — kurz warten.' };
    credCheckInFlight = true;
    const prev = { u: config.raUsername, k: config.raApiKey };
    config.raUsername = username;
    config.raApiKey = apiKey;
    try {
      const p = await getUserProfile(username);
      if (!p || p.User == null) throw new Error('Profil nicht gefunden');
      setSetting('raCreds', { username, apiKey });
      setSetting('userProfile', null);      // drop cached data of the old user
      setSetting('userCompletion', null);
      return { ok: true, username: p.User };
    } catch (e) {
      config.raUsername = prev.u;
      config.raApiKey = prev.k;
      return { ok: false, error: 'Anmeldung fehlgeschlagen — Benutzername/API-Key prüfen. (' + String(e.message) + ')' };
    } finally {
      credCheckInFlight = false;
    }
  });

  app.post('/api/settings/logout', async () => {
    // Persist an explicit logged-out state so the config defaults don't silently
    // log the user back in on the next restart.
    setSetting('raCreds', { username: '', apiKey: '' });
    setSetting('userProfile', null);
    setSetting('userCompletion', null);
    config.raUsername = '';
    config.raApiKey = '';
    return { ok: true };
  });

  // ---- filesystem browse (folder picker) ----------------------------------
  app.get('/api/fs/list', async (req) => {
    const path = req.query.path || '';
    const files = req.query.files === '1';
    const ext = typeof req.query.ext === 'string' && req.query.ext ? req.query.ext.split(',') : null;
    try { return await listDir(path, { files, ext }); }
    catch (e) { return { error: e.message, path, dirs: [], drives: [], files: [] }; }
  });
  app.get('/api/fs/info', async (req) => pathInfo(req.query.path || ''));

  // ---- hash DB sync (SSE) -------------------------------------------------
  app.get('/api/sync/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    const force = req.query.force === '1' || req.query.force === 'true';
    const consoleIds = req.query.consoles
      ? String(req.query.consoles).split(',').map((n) => Number(n)).filter(Boolean)
      : getEnabledConsoles(); // fall back to the user's "systems I care about" set
    if (activeSync) { send('error', { message: 'A sync is already running.' }); return void close(); }
    activeSync = true;
    syncAll({ force, consoleIds, onProgress: (p) => send(p.phase === 'done' ? 'done' : 'progress', p) })
      .then((summary) => send('summary', summary))
      .catch((e) => send('error', { message: String(e.message) }))
      .finally(() => { activeSync = false; close(); });
  });

  // ---- library scan (SSE) -------------------------------------------------
  app.get('/api/scan/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    const rootPath = req.query.path || getSetting('romRoot', config.romRoot);
    if (activeScan) { send('error', { message: 'A scan is already running.' }); return void close(); }
    if (!acquireScanLock('scan')) {
      send('error', { message: `A ${scanLockHolder() === 'schedule' ? 'scheduled' : 'watch'} scan is already running — try again in a moment.` });
      return void close();
    }

    const controller = new AbortController();
    // Snapshot the collection before the scan mutates it, so afterwards we can
    // diff and show what changed (Sammlung-Diff). Non-fatal if it fails.
    try { snapshotLibraryBaseline(); } catch { /* diff just won't be available */ }
    const scanId = createScan(rootPath, Date.now());
    activeScan = { id: scanId, controller, rootPath };
    send('init', { scanId, rootPath });

    const onlyConsole = req.query.console ? Number(req.query.console) : null;
    const scanner = new Scanner({
      rootPath, scanId, signal: controller.signal,
      onlyConsole: Number.isFinite(onlyConsole) ? onlyConsole : null,
      fileTimeoutMs: Math.max(10, Number(getSetting('scanFileTimeoutSec', 600))) * 1000,
      enabledConsoles: onlyConsole ? null : getEnabledConsoles(),
      bigFileCopyBytes: bigFileCopyBytes(),
      bigFileMaxBytes: bigFileMaxBytes(),
      skipCollected: !!getSetting('skipCollected', false),
      emit: (ev, data) => send(ev, data),
    });
    const concurrency = Number(req.query.concurrency) || Math.max(1, Math.min(16, Number(getSetting('scanConcurrency', 1)) || 1));
    scanner.run({ concurrency })
      .then((r) => finishScan(scanId, r.status, { totals: r.totals, bySystem: r.bySystem }, Date.now()))
      .catch((e) => { send('error', { message: String(e.message) }); finishScan(scanId, 'error', { error: String(e.message) }, Date.now()); })
      .finally(() => {
        activeScan = null;
        releaseScanLock('scan');
        try { autoBackup({ minIntervalMs: 30 * 60 * 1000 }); } catch { /* non-fatal */ }
        close();
      });
  });

  app.post('/api/scan/cancel', async () => {
    if (!activeScan) return { ok: false, message: 'No active scan.' };
    activeScan.controller.abort();
    return { ok: true, scanId: activeScan.id };
  });

  // ---- scan history + results ---------------------------------------------
  app.get('/api/scans', async () => listScans(50));
  app.get('/api/scan/:id', async (req) => {
    const scan = getScan(Number(req.params.id));
    if (!scan) return { error: 'not found' };
    return scan;
  });
  app.get('/api/scan/:id/items', async (req) => {
    const id = Number(req.params.id);
    const { status, console_id, limit, offset } = req.query;
    return getScanItems(id, {
      status: status || undefined,
      console_id: console_id != null ? Number(console_id) : undefined,
      limit: limit ? Number(limit) : 5000,
      offset: offset ? Number(offset) : 0,
    });
  });

  // ---- single-file check --------------------------------------------------
  app.post('/api/check-file', async (req) => {
    const { path } = req.body || {};
    if (!path) return { error: 'path required' };
    const info = await pathInfo(path);
    if (!info.exists) return { error: 'file not found', path };
    try {
      const results = await checkSingleFile(path, { rootForFolder: req.body.root });
      return { path, results };
    } catch (e) {
      return { error: String(e.message), path };
    }
  });

  // ---- persistent collection (library) ------------------------------------
  app.get('/api/library', async (req) => {
    const { status, console_id, q, tag, limit, offset } = req.query;
    return getLibrary({
      status: status || undefined,
      console_id: console_id != null ? Number(console_id) : undefined,
      q: q || undefined,
      tag: tag || undefined,
      limit: limit ? Number(limit) : 1000,
      offset: offset ? Number(offset) : 0,
    });
  });
  // Region/language chips for the collection filter — only what is actually owned.
  app.get('/api/library/tags', async (req) => {
    const { status, console_id } = req.query;
    return libraryTagFacets({
      status: status || undefined,
      console_id: console_id != null ? Number(console_id) : undefined,
    });
  });
  app.get('/api/library/stats', async () => libraryStats());
  app.get('/api/library/insights', async () => libraryInsights());
  app.get('/api/library/suggest', async () => {
    const g = suggestPlayable();
    return g || { empty: true };
  });
  app.post('/api/library/clear', async () => { clearLibrary(); return { ok: true }; });

  // ---- "Quick Wins": owned & playable games cross-referenced with progress -
  // Surfaces games closest to mastery (already started, < 100%) and easy fresh
  // starts (owned, playable, small set, not yet touched). Uses the cached
  // completion data so it stays offline-friendly and rate-limit safe.
  app.get('/api/library/quickwins', async () => {
    const loggedIn = Boolean(config.raUsername && config.raApiKey);
    const owned = getPlayableGames();
    const comp = getSetting('userCompletion', null);
    const progress = new Map();
    if (comp?.games) for (const g of comp.games) progress.set(g.GameID, g);

    const nearMastery = [];
    const freshStarts = [];
    for (const g of owned) {
      const p = progress.get(g.id);
      const total = Number(p?.MaxPossible ?? g.num_achievements) || 0;
      const awarded = Number(p?.NumAwarded ?? 0) || 0;
      if (total <= 0 || awarded >= total) continue; // skip unsupported / mastered
      const item = {
        id: g.id, title: g.title, consoleId: g.console_id, icon: g.image_icon,
        points: g.points || 0, total, awarded, remaining: total - awarded,
        pct: Math.round((awarded / total) * 100),
        consoleName: g.console_name, consoleShort: g.console_short,
      };
      (awarded > 0 ? nearMastery : freshStarts).push(item);
    }
    nearMastery.sort((a, b) => a.remaining - b.remaining || b.pct - a.pct);
    freshStarts.sort((a, b) => a.total - b.total || b.points - a.points);
    return {
      loggedIn,
      hasProgress: Boolean(comp?.games?.length),
      total: owned.length,
      nearMastery: nearMastery.slice(0, 8),
      freshStarts: freshStarts.slice(0, 8),
    };
  });

  // ---- Version report: for every "no_match" file, guess the RA game it most
  // likely is, so the user knows which supported version to obtain. Runs fully
  // against the local cached games DB — no RA API calls.
  app.get('/api/library/version-report', async () => buildVersionReport());

  // ---- re-hash the needs_rahasher backlog now that RAHasher is installed ---
  // Streams progress. Only touches library rows still marked needs_rahasher, so
  // it's far cheaper than a full re-scan.
  app.get('/api/library/recheck-rahasher/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    (async () => {
      if (activeRecheck) { send('error', { message: 'Eine Prüfung läuft bereits.' }); return void close(); }
      if (!(await isRAHasherAvailable())) { send('error', { message: 'RAHasher ist nicht installiert.' }); return void close(); }
      activeRecheck = true;
      try {
        const items = getLibrary({ status: 'needs_rahasher', limit: 100000 });
        send('init', { total: items.length });
        let checked = 0, nowMatch = 0, noMatch = 0, errors = 0;
        for (const it of items) {
          send('progress', { checked, total: items.length, file: String(it.inner_path || it.path).split(/[\\/]/).pop() });
          try {
            const entry = it.inner_path ? { name: it.inner_path, size: it.size } : undefined;
            const res = await hashTarget({ filePath: it.path, consoleId: it.console_id, entry });
            if (res.md5) {
              const m = resolveMatch(res.md5, it.console_id);
              upsertLibraryItem({
                path: it.path, inner_path: it.inner_path, size: it.size, mtime: it.mtime, ext: it.ext,
                console_id: m.consoleId ?? it.console_id, md5: res.md5,
                status: m.status, match_game_id: m.matchGameId, scanned_at: Date.now(),
              });
              if (m.status === 'match') nowMatch++; else noMatch++;
            } else {
              errors++; // still needs_rahasher / unsupported / file gone
            }
          } catch { errors++; }
          checked++;
        }
        send('done', { checked, nowMatch, noMatch, errors });
      } catch (e) {
        send('error', { message: String(e.message) });
      } finally {
        activeRecheck = false;
        close();
      }
    })();
  });

  // ---- browse cached games by console -------------------------------------
  app.get('/api/console/:id/games', async (req) => {
    const id = Number(req.params.id);
    const { q, limit, offset, sort } = req.query;
    const opts = { q: q || undefined, limit: limit ? Number(limit) : 120, offset: offset ? Number(offset) : 0, sort: sort || undefined };
    return { total: countGamesByConsole(id, opts), games: getGamesByConsole(id, opts) };
  });

  // ---- game detail (lazy enrich) ------------------------------------------
  app.get('/api/game/:id', async (req) => {
    const id = Number(req.params.id);
    const force = req.query.refresh === '1';
    try {
      return await buildGameDetail(id, { force });
    } catch (e) {
      // On a network failure fall back to any stale cache rather than erroring.
      const stale = getApiCache(`game:${id}`, null);
      if (stale) return { ...stale.value, _cachedAt: stale.cachedAt, _stale: true };
      return { error: String(e.message) };
    }
  });

  // ---- do I own this game? (files in the collection matching a RA game) ----
  app.get('/api/library/for-game/:id', async (req) => {
    const files = getLibraryFilesForGame(Number(req.params.id));
    return { owned: files.length > 0, count: files.length, files };
  });

  // ---- collection diff (what changed since the last scan) -----------------
  app.get('/api/library/diff', async () => getCollectionDiff({ limit: 100 }));

  // ---- pre-cache achievement badges + box art for the whole collection ----
  // The game modal already caches images lazily on first open; this warms them
  // all up front so every modal loads instantly and fully offline. Streams
  // progress. Game details are pulled from cache where possible (no network).
  app.get('/api/cache/images/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    let closed = false;
    req.raw.on('close', () => { closed = true; });
    const safeClose = () => { closed = true; close(); };
    (async () => {
      if (activeImageWarm) { send('error', { message: 'Läuft bereits.' }); return void safeClose(); }
      activeImageWarm = true;
      try {
        const games = getPlayableGames();
        send('init', { total: games.length });
        let done = 0, images = 0, errors = 0;
        for (const g of games) {
          if (closed) break;
          send('progress', { done, total: games.length, title: g.title, images });
          try {
            const detail = await buildGameDetail(g.id).catch(() => null);
            const urls = new Set();
            if (g.image_icon) urls.add(g.image_icon);
            if (detail?.ImageBoxArt) urls.add(detail.ImageBoxArt);
            if (detail?.ImageIcon) urls.add(detail.ImageIcon);
            for (const a of detail?.achievements || []) if (a.badgeUrl) urls.add(a.badgeUrl);
            for (const u of urls) {
              if (closed) break;
              const f = await getCachedImage(u);
              if (f) images++; else errors++;
            }
          } catch { errors++; }
          done++;
        }
        send('done', { done, images, errors });
      } catch (e) {
        send('error', { message: String(e.message) });
      } finally {
        activeImageWarm = false;
        safeClose();
      }
    })();
  });

  // ---- reveal a file in the OS file manager -------------------------------
  app.get('/api/reveal', async (req) => {
    const path = req.query.path;
    if (!path) return { ok: false, error: 'path required' };
    return await new Promise((resolve) => {
      if (process.platform === 'win32') {
        // explorer.exe needs backslashes and its own non-standard "/select,"
        // comma parsing. Node would normally wrap an arg containing spaces in
        // double-quotes, which breaks that parsing and makes explorer silently
        // fall back to the Documents folder. windowsVerbatimArguments passes the
        // argument through untouched so paths with spaces resolve correctly.
        // explorer.exe also returns exit code 1 even on success -> ignore error.
        const winPath = String(path).replace(/\//g, '\\');
        execFile('explorer.exe', [`/select,${winPath}`], { windowsVerbatimArguments: true }, () => resolve({ ok: true }));
      } else if (process.platform === 'darwin') {
        execFile('open', ['-R', path], (e) => resolve({ ok: !e }));
      } else {
        execFile('xdg-open', [dirname(path)], (e) => resolve({ ok: !e }));
      }
    });
  });

  // ---- global game search (across all consoles, cached) -------------------
  app.get('/api/games/search', async (req) => {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return [];
    return searchGames(q, { limit: Number(req.query.limit) || 60 });
  });

  // ---- your RetroAchievements progress ------------------------------------
  app.get('/api/user/profile', async (req) => {
    if (!config.raUsername || !config.raApiKey) return { error: 'not_logged_in', loggedOut: true };
    const force = req.query.refresh === '1';
    const ttlMs = (getCacheTtls().profileHours * 60 * 60 * 1000) || Infinity; // 0 = never auto-refetch
    const cached = getSetting('userProfile', null);
    if (!force && cached && Date.now() - (cached._at || 0) < ttlMs) return cached;
    try {
      const p = await getUserProfile(config.raUsername);
      const out = { ...p, avatarUrl: mediaUrl(`/UserPic/${config.raUsername}.png`), _at: Date.now() };
      setSetting('userProfile', out);
      return out;
    } catch (e) { return cached || { error: String(e.message) }; }
  });

  app.get('/api/user/game/:id', async (req) => {
    try {
      const d = await getGameInfoAndUserProgress(config.raUsername, Number(req.params.id));
      const earned = {};
      for (const a of Object.values(d.Achievements || {})) {
        if (a.DateEarned || a.DateEarnedHardcore) {
          earned[a.ID] = { date: a.DateEarnedHardcore || a.DateEarned, hardcore: !!a.DateEarnedHardcore };
        }
      }
      return {
        numAwarded: d.NumAwardedToUser ?? 0,
        numAwardedHardcore: d.NumAwardedToUserHardcore ?? 0,
        total: d.NumAchievements ?? 0,
        completion: d.UserCompletion ?? null,
        earned,
      };
    } catch (e) { return { error: String(e.message) }; }
  });

  app.get('/api/user/completion', async (req) => {
    if (!config.raUsername || !config.raApiKey) return { error: 'not_logged_in', loggedOut: true, games: [] };
    const force = req.query.refresh === '1';
    const ttlMs = (getCacheTtls().completionHours * 60 * 60 * 1000) || Infinity; // 0 = never auto-refetch
    const cached = getSetting('userCompletion', null);
    if (!force && cached && Date.now() - (cached._at || 0) < ttlMs) return cached;
    try {
      const list = await getUserCompletionProgress(config.raUsername);
      const out = { _at: Date.now(), games: list };
      setSetting('userCompletion', out);
      return out;
    } catch (e) { return cached || { error: String(e.message), games: [] }; }
  });

  // ---- drag&drop upload quick-test ----------------------------------------
  app.post('/api/upload-check', async (req) => {
    const dir = await mkdtemp(join(config.tempDir, 'upload-'));
    const results = [];
    try {
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        const safe = basename(part.filename || 'rom.bin');
        const dest = join(dir, safe);
        await pipeline(part.file, createWriteStream(dest));
        const r = await checkSingleFile(dest, { rootForFolder: dir });
        for (const item of r) results.push({ ...item, filePath: safe, uploaded: true });
      }
      return { results };
    } catch (e) {
      return { error: String(e.message), results };
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 }).catch(() => {});
    }
  });

  // ---- DAT completeness (No-Intro/Redump/logiqx catalogs) -----------------
  // Import DAT files, then match them against the collection by raw CRC32 —
  // "which of this curated set do I have / am I missing", RomVault-style.
  app.post('/api/dat/import', async (req) => {
    const imported = [];
    const errors = [];
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const fname = basename(part.filename || 'dat.dat');
      try {
        const buf = await part.toBuffer();
        const { header, entries } = parseDat(buf.toString('utf8'));
        if (!entries.length) { errors.push({ file: fname, error: 'no ROM entries found' }); continue; }
        const name = (header.name || header.description || fname).trim();
        const consoleId = guessConsole(name) ?? guessConsole(header.description);
        const r = insertDat({ name, description: header.description, version: header.version, console_id: consoleId, entries });
        imported.push({ file: fname, name, console_id: consoleId, ...r });
      } catch (e) {
        errors.push({ file: fname, error: String(e.message).slice(0, 200) });
      }
    }
    return { ok: errors.length === 0, imported, errors };
  });

  app.get('/api/dat/list', async () => {
    const dats = listDats().map((d) => ({ ...d, console_name: d.console_id != null ? (CONSOLE_BY_ID.get(d.console_id)?.name || null) : null }));
    return { dats, crc: datCrcStatus() };
  });

  app.get('/api/dat/crc-status', async () => datCrcStatus());

  app.get('/api/dat/:id/coverage', async (req) => {
    const cov = datCoverage(Number(req.params.id));
    if (!cov) return { error: 'not found' };
    return { ...cov, console_name: cov.dat.console_id != null ? (CONSOLE_BY_ID.get(cov.dat.console_id)?.name || null) : null };
  });

  app.delete('/api/dat/:id', async (req) => { deleteDat(Number(req.params.id)); return { ok: true }; });

  // Compute hashes for collection files that don't have them yet (required
  // before DAT matching). Loose files stream once for crc+md5+sha1; archive
  // members (.zip/.7z/.rar) read their CRC straight from the container's
  // directory/headers — no decompression. Rows are ordered by path, so each
  // archive is listed once and its members filled from that single listing.
  // SSE progress.
  const normEntry = (s) => String(s || '').replace(/\\/g, '/');
  app.get('/api/dat/scan-crc/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    let closed = false;
    req.raw.on('close', () => { closed = true; });
    (async () => {
      const rows = getLibraryRowsWithoutCrc();
      send('init', { total: rows.length });
      let done = 0; let computed = 0; let skipped = 0;
      let archPath = null; let archMap = null; // cached listing for the current archive
      for (const row of rows) {
        if (closed) break;
        const inner = row.inner_path || '';
        try {
          if (inner) {
            if (archPath !== row.path) {
              archPath = row.path;
              try {
                const list = await listEntriesWithCrc(row.path);
                archMap = new Map(list.map((e) => [normEntry(e.name), e.crc]));
              } catch { archMap = new Map(); }
            }
            const crc = archMap.get(normEntry(inner)) || null;
            if (crc) { setLibraryHashes(row.path, inner, { crc }); computed++; }
            else skipped++;
          } else {
            const h = await hashFileAll(row.path);
            setLibraryHashes(row.path, '', h); computed++;
          }
        } catch { skipped++; }
        done++;
        if ((done & 15) === 0 || done === rows.length) send('progress', { done, total: rows.length, computed, skipped });
      }
      send('done', { done, computed, skipped, ...datCrcStatus() });
      close();
    })().catch(() => { try { close(); } catch { /* already closed */ } });
  });

  // Collection files whose hash is in no imported DAT (bad dumps / hacks /
  // systems without a DAT). Powers the DAT view's "Extra / unknown" panel.
  app.get('/api/dat/extras', async (req) => {
    const limit = Math.min(20000, Math.max(1, Number(req.query.limit) || 5000));
    return datExtras({ limit });
  });

  // ---- duplicates (1G1R helper) -------------------------------------------
  app.get('/api/library/duplicates', async () => {
    return getDuplicates().map((d) => ({ ...d, files: getDuplicateFiles(d.game_id) }));
  });

  // ---- collection health: find rows whose ROM file is gone (moved/deleted) -
  // async access() with bounded parallelism — a sync existsSync() loop over
  // UNC paths on an unreachable NAS would freeze the whole event loop for
  // minutes (each SMB miss blocks for seconds).
  async function findMissingPaths(paths, concurrency = 16) {
    const missing = [];
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, async () => {
      while (next < paths.length) {
        const p = paths[next++];
        try { await access(p); } catch { missing.push(p); }
      }
    }));
    return missing;
  }

  app.get('/api/library/health', async () => {
    const paths = getLibraryPaths();
    const missing = await findMissingPaths(paths);
    return {
      total: paths.length,
      missingFiles: missing.length,
      missingRows: countLibraryRowsForPaths(missing),
      missingPaths: missing.slice(0, 1000),
    };
  });

  // Remove collection rows for missing files. Without an explicit `paths` list,
  // recomputes which files are gone and prunes those.
  app.post('/api/library/prune', async (req) => {
    const body = req.body || {};
    let paths = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string') : null;
    if (!paths) paths = await findMissingPaths(getLibraryPaths());
    try { return { ok: true, removed: deleteLibraryByPaths(paths) }; }
    catch (e) { return { ok: false, error: String(e.message) }; }
  });

  // Delete the actual ROM files (1G1R cleanup of duplicate copies) AND their
  // collection rows. DESTRUCTIVE — the UI confirms first. Only paths already in
  // the collection may be deleted (never an arbitrary filesystem path).
  app.post('/api/library/delete-files', async (req) => {
    const body = req.body || {};
    const wanted = Array.isArray(body.paths) ? body.paths.filter((p) => typeof p === 'string') : [];
    if (!wanted.length) return { ok: false, error: 'Keine Pfade angegeben.' };
    const known = new Set(getLibraryPaths());
    const targets = wanted.filter((p) => known.has(p));
    let deleted = 0; let freed = 0; const errors = []; const removed = [];
    for (const p of targets) {
      try {
        let sz = 0; try { sz = statSync(p).size; } catch { /* size unknown */ }
        await rm(p, { force: true });
        freed += sz; deleted++; removed.push(p);
      } catch (e) { errors.push(`${basename(p)}: ${String(e.message).slice(0, 120)}`); }
    }
    // Only drop collection rows for files that are really gone — a locked file
    // (EBUSY/EPERM) must stay visible, or it becomes undeletable until a rescan.
    const rows = removed.length ? deleteLibraryByPaths(removed) : 0;
    return { ok: true, deleted, freed, rows, skipped: wanted.length - targets.length, errors };
  });

  // ---- folder watch -------------------------------------------------------
  app.post('/api/watch/start', async (req) => {
    const path = (req.body && req.body.path) || getSetting('romRoot', config.romRoot);
    try { return startWatch(path); }
    catch (e) { return { active: false, error: String(e.message) }; }
  });
  app.post('/api/watch/stop', async () => { stopWatch(); return watchStatus(); });
  app.get('/api/watch/status', async () => watchStatus());

  // ---- scheduled daily scan ----------------------------------------------
  app.get('/api/schedule', async () => scheduleStatus());
  app.post('/api/schedule', async (req) => {
    const b = req.body || {};
    const patch = {};
    if (b.enabled != null) patch.enabled = !!b.enabled;
    if (typeof b.time === 'string') patch.time = b.time;
    setScheduleConfig(patch);
    return scheduleStatus();
  });

  // Set watch mode/interval and enable/disable in one call. Restarts the live
  // watcher so a new mode/interval takes effect immediately.
  app.post('/api/watch/config', async (req) => {
    const body = req.body || {};
    const patch = {};
    if (body.mode != null) patch.mode = body.mode;
    if (body.intervalMin != null) patch.intervalMin = body.intervalMin;
    setWatchConfig(patch); // enabled is managed by start/stop below
    const root = body.path || getSetting('romRoot', config.romRoot);
    const wantEnabled = body.enabled != null ? !!body.enabled : getWatchConfig().enabled;
    try {
      if (wantEnabled) startWatch(root); else stopWatch();
    } catch (e) { return { ...watchStatus(), error: String(e.message) }; }
    return watchStatus();
  });

  // ---- image proxy/cache --------------------------------------------------
  app.get('/api/image', async (req, reply) => {
    const path = req.query.path;
    if (!path) return reply.code(400).send({ error: 'path required' });
    const file = await getCachedImage(path);
    if (!file) return reply.code(404).send({ error: 'image unavailable' });
    reply.header('Cache-Control', 'public, max-age=2592000');
    reply.type(file.endsWith('.jpg') || file.endsWith('.jpeg') ? 'image/jpeg' : 'image/png');
    return reply.send(createReadStream(file));
  });

  // ---- RAHasher install (SSE) ---------------------------------------------
  app.get('/api/rahasher/download/stream', (req, reply) => {
    const { send, close } = openSSE(req, reply);
    downloadRAHasher((p) => send('progress', p))
      .then((r) => send('done', r))
      .catch((e) => send('error', { message: String(e.message) }))
      .finally(() => close());
  });
  app.get('/api/rahasher/status', async () => ({
    available: await isRAHasherAvailable(),
    path: locateRAHasher(),
    platform: process.platform,
  }));

  // =========================================================================
  // Community & discovery (RA feed endpoints, cross-referenced with YOUR ROMs)
  // =========================================================================

  // Achievement of the Week — plus whether the game is in the collection.
  app.get('/api/community/aotw', async (req) => {
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa('ra:aotw', 6 * 60 * 60 * 1000, getAchievementOfTheWeek, { force });
      const gameId = Number(value?.Game?.ID) || null;
      const owned = gameId ? getLibraryFilesForGame(gameId) : [];
      const local = gameId ? getGameById(gameId) : null;
      return {
        ...value,
        gameId,
        owned: owned.length > 0,
        ownedFiles: owned.slice(0, 5),
        localGame: local || null,
        _cachedAt: cachedAt, _stale: stale,
      };
    } catch (e) { return { error: String(e.message) }; }
  });

  // Site-wide recent masteries/completions, flagged with what you own.
  app.get('/api/community/recent-awards', async (req) => {
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa('ra:awards', 30 * 60 * 1000,
        () => getRecentGameAwards({ count: 40 }), { force });
      const ownedIds = getOwnedGameIdSet();
      const results = (value?.Results || []).map((r) => ({ ...r, owned: ownedIds.has(Number(r.GameID)) }));
      return { total: value?.Total ?? results.length, results, _cachedAt: cachedAt, _stale: stale };
    } catch (e) { return { error: String(e.message), results: [] }; }
  });

  // Set-Radar: every active claim on the site, split by how it relates to your
  // collection — a claim on a game you own means new/revised achievements are
  // coming for a ROM you already have.
  app.get('/api/community/claims', async (req) => {
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa('ra:claims', 60 * 60 * 1000, getActiveClaims, { force });
      const claims = Array.isArray(value) ? value : (value?.Results || []);
      const ownedIds = getOwnedGameIdSet();
      // Games we *probably* own but couldn't hash-match (wrong ROM version):
      // the version report already guesses those, so a claim on such a game is
      // still relevant to the user.
      const guessed = new Map(buildVersionReport().groups.map((g) => [g.id, g]));
      const owned = []; const likely = []; const other = [];
      for (const c of claims) {
        const gameId = Number(c.GameID) || null;
        const local = gameId ? getGameById(gameId) : null;
        const row = {
          ...c,
          gameId,
          consoleId: local?.console_id ?? null,
          icon: local?.image_icon ?? c.GameIcon ?? null,
          knownLocally: Boolean(local),
          achievements: local?.num_achievements ?? null,
        };
        if (gameId && ownedIds.has(gameId)) owned.push({ ...row, relation: 'owned' });
        else if (gameId && guessed.has(gameId)) {
          likely.push({ ...row, relation: 'likely', files: guessed.get(gameId).files.slice(0, 3) });
        } else other.push({ ...row, relation: 'other' });
      }
      return {
        counts: { total: claims.length, owned: owned.length, likely: likely.length, other: other.length },
        owned, likely, other: other.slice(0, 120),
        _cachedAt: cachedAt, _stale: stale,
      };
    } catch (e) { return { error: String(e.message), owned: [], likely: [], other: [], counts: { total: 0, owned: 0, likely: 0, other: 0 } }; }
  });

  // Your own set requests (RA "request a set" quota) + ownership.
  app.get('/api/user/set-requests', async (req) => {
    if (!config.raUsername || !config.raApiKey) return { error: 'not_logged_in', loggedOut: true, games: [] };
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa(`ra:setreq:${config.raUsername}`, 6 * 60 * 60 * 1000,
        () => getUserSetRequests(config.raUsername), { force });
      const ownedIds = getOwnedGameIdSet();
      // RA returns the list as `RequestedSets`; older docs/wrappers say
      // `RequestedGames`, so accept both. TotalRequests is the user's *allowance*
      // (grows with points), not the number used.
      const requested = value?.RequestedSets || value?.RequestedGames || [];
      const games = requested.map((g) => {
        const id = Number(g.GameID) || null;
        const local = id ? getGameById(id) : null;
        return {
          ...g, gameId: id, owned: id ? ownedIds.has(id) : false,
          icon: local?.image_icon ?? null, consoleId: local?.console_id ?? null,
          achievements: local?.num_achievements ?? 0,
        };
      });
      return {
        games,
        used: games.length,
        totalRequests: value?.TotalRequests ?? games.length,
        pointsForNext: value?.PointsForNext ?? null,
        _cachedAt: cachedAt, _stale: stale,
      };
    } catch (e) { return { error: String(e.message), games: [] }; }
  });

  // Your RA "Want to Play" list, cross-referenced with the collection: do you
  // already have the ROM for the games you bookmarked?
  app.get('/api/user/want-to-play', async (req) => {
    if (!config.raUsername || !config.raApiKey) return { error: 'not_logged_in', loggedOut: true, games: [] };
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa(`ra:wtp:${config.raUsername}`, 6 * 60 * 60 * 1000,
        () => getUserWantToPlayList(config.raUsername, { count: 500 }), { force });
      const ownedIds = getOwnedGameIdSet();
      const games = (value?.Results || []).map((g) => {
        const id = Number(g.ID) || null;
        return { ...g, gameId: id, owned: id ? ownedIds.has(id) : false };
      });
      return {
        total: value?.Total ?? games.length,
        owned: games.filter((g) => g.owned).length,
        games,
        _cachedAt: cachedAt, _stale: stale,
      };
    } catch (e) { return { error: String(e.message), games: [] }; }
  });

  // ---- Hardcore gap -------------------------------------------------------
  // The article's point: every softcore unlock can be earned again in hardcore,
  // and only hardcore counts for leaderboards/mastery badges. This lists the
  // games where your hardcore progress trails your softcore progress, owned
  // ROMs first, straight from the cached completion data (no extra API calls).
  app.get('/api/user/hardcore-gap', async () => {
    const loggedIn = Boolean(config.raUsername && config.raApiKey);
    const comp = getSetting('userCompletion', null);
    const ownedIds = getOwnedGameIdSet();
    const games = [];
    let softcoreOnly = 0; let hardcoreMastered = 0; let softcoreMastered = 0;
    for (const g of comp?.games || []) {
      const max = Number(g.MaxPossible) || 0;
      const soft = Number(g.NumAwarded) || 0;
      const hard = Number(g.NumAwardedHardcore) || 0;
      if (max > 0 && hard >= max) hardcoreMastered++;
      else if (max > 0 && soft >= max) softcoreMastered++;
      const gap = Math.max(0, soft - hard);
      if (gap > 0) softcoreOnly += gap;
      if (gap <= 0) continue;
      const id = Number(g.GameID);
      games.push({
        id,
        title: g.Title,
        consoleId: Number(g.ConsoleID) || null,
        consoleName: g.ConsoleName || null,
        icon: g.ImageIcon || null,
        max,
        softcore: soft,
        hardcore: hard,
        gap,
        pctHardcore: max ? Math.round((hard / max) * 100) : 0,
        owned: ownedIds.has(id),
        lastAt: g.MostRecentAwardedDate || null,
      });
    }
    games.sort((a, b) => Number(b.owned) - Number(a.owned) || b.gap - a.gap);
    return {
      loggedIn,
      hasProgress: Boolean(comp?.games?.length),
      cachedAt: comp?._at ?? null,
      totals: {
        games: games.length,
        ownedGames: games.filter((g) => g.owned).length,
        softcoreOnly,
        hardcoreMastered,
        softcoreMastered,
      },
      games,
    };
  });

  // ---- leaderboards for one game -----------------------------------------
  // Leaderboards are hardcore-only on RA; we show the board list plus your own
  // entries side by side.
  app.get('/api/game/:id/leaderboards', async (req) => {
    const id = Number(req.params.id);
    const force = req.query.refresh === '1';
    try {
      const { value, cachedAt, stale } = await cachedRa(`lb:${id}`, 12 * 60 * 60 * 1000,
        () => getGameLeaderboards(id, { count: 100 }), { force });
      const boards = value?.Results || [];
      let mine = [];
      if (config.raUsername && config.raApiKey && boards.length) {
        try {
          const own = await getUserGameLeaderboards(id, config.raUsername, { count: 100 });
          mine = own?.Results || [];
        } catch { /* user simply has no entries / network hiccup */ }
      }
      const byId = new Map(mine.map((m) => [Number(m.ID), m.UserEntry || null]));
      return {
        total: value?.Total ?? boards.length,
        boards: boards.map((b) => ({ ...b, userEntry: byId.get(Number(b.ID)) ?? null })),
        _cachedAt: cachedAt, _stale: stale,
      };
    } catch (e) { return { error: String(e.message), boards: [] }; }
  });

  // Entries of a single leaderboard (opened on demand from the game modal).
  app.get('/api/leaderboard/:id/entries', async (req) => {
    const id = Number(req.params.id);
    try {
      const { value, cachedAt } = await cachedRa(`lbe:${id}`, 60 * 60 * 1000,
        () => getLeaderboardEntries(id, { count: 25 }), { force: req.query.refresh === '1' });
      return { total: value?.Total ?? 0, results: value?.Results || [], _cachedAt: cachedAt };
    } catch (e) { return { error: String(e.message), results: [] }; }
  });

  // ---- free & legal games catalog ----------------------------------------
  // Bundled from RA's "Free Games" docs page: homebrew/freeware you may legally
  // download. We resolve each entry against the local games DB (so we can show
  // its achievement count) and flag the ones you already own.
  app.get('/api/free-games', async (req) => {
    const mod = await freeGamesData();
    if (!mod) return { error: 'catalog_unavailable', games: [], systems: [] };
    const ownedIds = getOwnedGameIdSet();
    const wantConsole = req.query.console != null ? Number(req.query.console) : null;
    const entries = (mod.FREE_GAMES || []).filter((g) => wantConsole == null || g.consoleId === wantConsole);
    const games = entries.map((g) => {
      // Homebrew sets on RA carry prefixes like "~Homebrew~ Project Blue", so an
      // exact title match usually fails — fall back to the token search.
      let hit = findGamesByTitle(g.title, g.consoleId)[0] || null;
      if (!hit) {
        const hits = searchGames(g.title, { limit: 8 })
          .filter((h) => g.consoleId == null || h.console_id === g.consoleId);
        hit = hits.sort((a, b) => a.title.length - b.title.length)[0] || null;
      }
      return {
        ...g,
        raGameId: hit?.id ?? null,
        raTitle: hit?.title ?? null,
        achievements: hit?.num_achievements ?? 0,
        points: hit?.points ?? 0,
        icon: hit?.image_icon ?? null,
        owned: hit ? ownedIds.has(hit.id) : false,
      };
    });
    const systems = [...new Map(games.map((g) => [g.consoleId, { consoleId: g.consoleId, label: g.systemLabel }])).values()]
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
    return {
      source: mod.FREE_GAMES_SOURCE ?? null,
      updated: mod.FREE_GAMES_UPDATED ?? null,
      counts: {
        total: games.length,
        withSet: games.filter((g) => g.achievements > 0).length,
        owned: games.filter((g) => g.owned).length,
      },
      systems, games,
    };
  });

  // ---- RA world coverage --------------------------------------------------
  // "How much of RetroAchievements does my collection actually cover?" Local
  // numbers only; the reference block is the site-wide total for context.
  app.get('/api/coverage', async () => {
    const s = getCoverageStats();
    return {
      ...s,
      reference: { games: 11075, achievements: 614361, players: 1788000, asOf: '2026-06' },
    };
  });

  // ---- emulator cores per system -----------------------------------------
  app.get('/api/cores', async () => {
    const mod = await coresData();
    if (!mod) return { error: 'cores_unavailable', cores: {}, frontends: [] };
    return {
      source: mod.CORES_SOURCE ?? null,
      cores: mod.CORES_BY_CONSOLE ?? {},
      frontends: mod.RA_FRONTENDS ?? [],
    };
  });
  app.get('/api/cores/:consoleId', async (req) => {
    const mod = await coresData();
    const id = Number(req.params.consoleId);
    if (!mod) return { consoleId: id, cores: [], standalone: [] };
    const r = mod.coresFor ? mod.coresFor(id) : { cores: [], standalone: [] };
    const resolved = await resolveCore(id);
    return { consoleId: id, ...r, resolved };
  });

  // ---- newly supported systems -------------------------------------------
  app.get('/api/systems/new', async () => newlySupportedSystems({ sinceDays: 365 }));

  // ---- launcher platform names (ES-DE / LaunchBox) -----------------------
  app.get('/api/frontends/platforms', async () => {
    const mod = await frontendsData();
    return mod?.FRONTEND_PLATFORMS ?? {};
  });

  // ---- ES-DE / EmulationStation export ------------------------------------
  // ES-DE wants ONE gamelist.xml per system, with <path> relative to that
  // system's ROM folder — so a single flat file with absolute paths is useless
  // to it. We therefore build the real folder structure, derive each system's
  // ROM root from the common prefix of its files, and ship the result as a zip.
  app.get('/api/export/esde', async (req, reply) => {
    const mod = await frontendsData();
    if (!mod) return reply.code(500).send({ error: 'platform table unavailable' });
    const rows = getLibrary({
      status: 'match',
      console_id: req.query.console != null && req.query.console !== 'all' ? Number(req.query.console) : undefined,
      q: req.query.q || undefined,
      limit: 100000,
    });
    if (!rows.length) return reply.code(404).send({ error: 'no matched ROMs' });

    // Archive members (`inner_path`) collapse onto their container: ES-DE lists
    // the .zip itself and lets the emulator pick the entry.
    const byConsole = new Map();
    for (const r of rows) {
      if (r.console_id == null) continue;
      const system = mod.esdeSystem(r.console_id);
      if (!system) continue;                      // ES-DE has no folder for it
      if (!byConsole.has(system)) byConsole.set(system, { system, consoleName: r.console_name, files: new Map() });
      const g = byConsole.get(system);
      if (!g.files.has(r.path)) g.files.set(r.path, r);
    }
    if (!byConsole.size) return reply.code(404).send({ error: 'no exportable systems' });

    const dir = await mkdtemp(join(config.tempDir, 'esde-'));
    const archive = join(dir, 'ra-checker-esde.zip');
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const stage = join(dir, 'gamelists');
      await mkdir(stage, { recursive: true });
      const readme = [
        'RAChecker — ES-DE / EmulationStation export',
        '',
        'One gamelist.xml per system, <path> relative to that system\'s ROM folder.',
        'Copy each <system>/gamelist.xml either to',
        '  <your ROMs folder>/<system>/gamelist.xml',
        'or to',
        '  ~/ES-DE/gamelists/<system>/gamelist.xml   (Windows: %userprofile%\\ES-DE\\gamelists\\<system>\\)',
        '',
        'Paths were made relative to the folder listed below per system.',
        'If your ES-DE ROM folder differs, move the files there or adjust the paths.',
        '',
      ];
      for (const g of byConsole.values()) {
        const files = [...g.files.values()];
        const base = commonDirPrefix(files.map((f) => f.path));
        const body = files.map((f) => {
          const rel = relativeFrom(base, f.path);
          const title = f.match_title || basename(f.inner_path || f.path);
          const desc = `RetroAchievements: ${f.match_achievements ?? 0} achievements, ${f.match_points ?? 0} points`;
          return `  <game>\n    <path>./${xmlEscape(rel)}</path>\n    <name>${xmlEscape(title)}</name>\n    <desc>${xmlEscape(desc)}</desc>\n  </game>`;
        }).join('\n');
        await mkdir(join(stage, g.system), { recursive: true });
        await writeFile(
          join(stage, g.system, 'gamelist.xml'),
          `<?xml version="1.0"?>\n<gameList>\n${body}\n</gameList>\n`,
          'utf8',
        );
        readme.push(`${g.system.padEnd(16)} ${files.length} ROM(s)   base: ${base}`);
      }
      await writeFile(join(stage, 'README.txt'), readme.join('\r\n'), 'utf8');
      await sevenZipCmd(['a', '-tzip', archive, join(stage, '*'), '-y']);
      const stamp = new Date().toISOString().slice(0, 10);
      reply.header('content-type', 'application/zip');
      reply.header('content-disposition', `attachment; filename="ra-checker-esde-${stamp}.zip"`);
      const stream = createReadStream(archive);
      stream.on('close', () => { rm(dir, { recursive: true, force: true }).catch(() => {}); });
      return reply.send(stream);
    } catch (e) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      return reply.code(500).send({ error: String(e.message) });
    }
  });

  // ---- rich presence / play sessions -------------------------------------
  app.get('/api/presence', async () => presenceStatus());
  app.post('/api/presence/config', async (req) => {
    const b = req.body || {};
    setPresenceConfig({ enabled: b.enabled, intervalMin: b.intervalMin, staleMin: b.staleMin });
    return presenceStatus();
  });
  app.post('/api/presence/poll', async () => {
    if (!config.raUsername || !config.raApiKey) return { error: 'not_logged_in' };
    return await pollPresence();
  });
  app.get('/api/presence/sessions', async (req) => ({
    sessions: getRecentSessions(Math.min(200, Number(req.query.limit) || 40)),
    totals: playtimeTotals(),
  }));
  app.get('/api/presence/playtime', async (req) => ({
    games: getPlaytimeByGame(Math.min(200, Number(req.query.limit) || 50)),
    totals: playtimeTotals(),
    config: getPresenceConfig(),
  }));
  app.post('/api/presence/clear', async () => { clearSessions(); return { ok: true }; });
  // Portable playtime backup: export the local session history as JSON and
  // re-import it (idempotent merge — skips sessions that already exist).
  app.get('/api/presence/export', async (req, reply) => {
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('content-type', 'application/json; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="ra-checker-playtime-${stamp}.json"`);
    return { app: 'ra-checker', kind: 'playtime', version: 1, exportedAt: Date.now(), sessions: exportSessions() };
  });
  app.post('/api/presence/import', async (req) => {
    const b = req.body || {};
    const rows = Array.isArray(b) ? b : (Array.isArray(b.sessions) ? b.sessions : null);
    if (!rows) return { error: 'no_sessions' };
    try {
      const r = importSessions(rows);
      return { ok: true, ...r, totals: playtimeTotals() };
    } catch (e) {
      return { error: String(e.message).slice(0, 200) };
    }
  });

  // ---- launch in emulator -------------------------------------------------
  app.get('/api/emulator', async () => emulatorStatus());
  // Opt-in auto-detection. `save=1` writes found paths into the config; without
  // it, just report what was found so the UI can preview before saving.
  app.post('/api/emulator/detect', async (req) => {
    const found = detectEmulator();
    if ((req.body && req.body.save) && (found.retroarchPath || found.coreDir)) {
      const patch = {};
      if (found.retroarchPath) patch.retroarchPath = found.retroarchPath;
      if (found.coreDir) patch.coreDir = found.coreDir;
      setEmulatorConfig(patch);
    }
    return { ...found, saved: Boolean(req.body && req.body.save) };
  });
  // Auto-locate an existing RAHasher (bundled bin/ or PATH). Does not download.
  app.post('/api/rahasher/detect', async () => {
    const path = locateRAHasher();
    return { path: path || '', found: Boolean(path && existsSync(path)) };
  });
  app.post('/api/emulator', async (req) => {
    const b = req.body || {};
    setEmulatorConfig({
      retroarchPath: b.retroarchPath, coreDir: b.coreDir,
      extraArgs: b.extraArgs, coreOverrides: b.coreOverrides,
    });
    return emulatorStatus();
  });
  app.post('/api/launch', async (req) => {
    const b = req.body || {};
    return await launchRom({
      path: String(b.path || ''),
      inner: String(b.inner || ''),
      consoleId: b.consoleId != null ? Number(b.consoleId) : null,
    });
  });

  // ---- offline package ----------------------------------------------------
  app.get('/api/offline/readiness', async () => await offlineReadiness());

  app.get('/api/offline/export', async (req, reply) => {
    let pkg;
    try {
      pkg = await exportOfflinePackage({ includeImages: req.query.images !== '0' });
    } catch (e) {
      return reply.code(500).send({ error: String(e.message) });
    }
    const stamp = new Date().toISOString().slice(0, 10);
    reply.header('content-type', 'application/x-7z-compressed');
    reply.header('content-disposition', `attachment; filename="ra-checker-offline-${stamp}.7z"`);
    const stream = createReadStream(pkg.file);
    stream.on('close', () => { pkg.cleanup(); });
    return reply.send(stream);
  });

  app.post('/api/offline/import', async (req) => {
    if (activeScan) return { ok: false, error: 'Während eines Scans nicht möglich.' };
    const dir = await mkdtemp(join(config.tempDir, 'offline-up-'));
    try {
      let saved = null;
      for await (const part of req.parts()) {
        if (part.type !== 'file') continue;
        saved = join(dir, basename(part.filename || 'package.7z'));
        await pipeline(part.file, createWriteStream(saved));
        break;
      }
      if (!saved) return { ok: false, error: 'Keine Datei empfangen.' };
      autoBackup({ minIntervalMs: 0 });          // undo path before we stage a restore
      return await importOfflinePackage(saved);
    } catch (e) {
      return { ok: false, error: String(e.message) };
    } finally {
      await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 }).catch(() => {});
    }
  });

  // ---- console icon helper ------------------------------------------------
  app.get('/api/console/:id/icon', async (req, reply) => {
    const c = CONSOLE_BY_ID.get(Number(req.params.id));
    const url = c?.short ? `https://static.retroachievements.org/assets/images/system/${c.short}.png` : null;
    if (!url) return reply.code(404).send();
    const file = await getCachedImage(url);
    if (!file) return reply.code(404).send();
    reply.header('Cache-Control', 'public, max-age=2592000').type('image/png');
    return reply.send(createReadStream(file));
  });
}
