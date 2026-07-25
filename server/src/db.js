// SQLite persistence using Node's built-in node:sqlite (no native deps).
// Holds the cached RetroAchievements hash database + scan results + settings.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbPath);

// Pragmas: WAL for concurrent reads during long scans, FK enforcement.
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS consoles (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    short_code    TEXT,
    icon_url      TEXT,
    active        INTEGER DEFAULT 1,
    is_game_system INTEGER DEFAULT 1,
    hash_method   TEXT DEFAULT 'unknown'   -- file | cd | arcade | unsupported | unknown
  );

  CREATE TABLE IF NOT EXISTS games (
    id             INTEGER PRIMARY KEY,
    console_id     INTEGER NOT NULL,
    title          TEXT NOT NULL,
    image_icon     TEXT,
    num_achievements INTEGER DEFAULT 0,
    num_leaderboards INTEGER DEFAULT 0,
    points         INTEGER DEFAULT 0,
    date_modified  TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_games_console ON games(console_id);

  CREATE TABLE IF NOT EXISTS hashes (
    md5         TEXT NOT NULL,
    game_id     INTEGER NOT NULL,
    console_id  INTEGER NOT NULL,
    rom_name    TEXT,
    labels      TEXT,                 -- JSON array
    patch_url   TEXT,
    PRIMARY KEY (md5, game_id)
  );
  CREATE INDEX IF NOT EXISTS idx_hashes_md5 ON hashes(md5);
  CREATE INDEX IF NOT EXISTS idx_hashes_console ON hashes(console_id);

  CREATE TABLE IF NOT EXISTS console_sync (
    console_id  INTEGER PRIMARY KEY,
    synced_at   INTEGER,             -- epoch ms
    game_count  INTEGER DEFAULT 0,
    hash_count  INTEGER DEFAULT 0,
    status      TEXT DEFAULT 'ok',
    message     TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS scans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    root_path   TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    finished_at INTEGER,
    status      TEXT DEFAULT 'running',  -- running | done | cancelled | error
    totals      TEXT                     -- JSON summary
  );

  CREATE TABLE IF NOT EXISTS scan_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    scan_id       INTEGER NOT NULL,
    file_path     TEXT NOT NULL,
    inner_path    TEXT,                 -- entry name when inside an archive
    size          INTEGER,
    ext           TEXT,
    console_id    INTEGER,
    md5           TEXT,
    match_game_id INTEGER,
    status        TEXT,                 -- match | no_match | unsupported | error | skipped | needs_rahasher
    message       TEXT,
    hash_method   TEXT,
    duration_ms   INTEGER,
    created_at    INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_scan_items_scan ON scan_items(scan_id);
  CREATE INDEX IF NOT EXISTS idx_scan_items_status ON scan_items(status);

  -- Cache of computed hashes keyed by file signature (path+size+mtime) so a
  -- re-scan of unchanged files is instant and needs zero re-hashing.
  CREATE TABLE IF NOT EXISTS file_hash_cache (
    sig         TEXT PRIMARY KEY,     -- path|size|mtimeMs|innerPath
    md5         TEXT,
    console_id  INTEGER,
    hash_method TEXT,
    computed_at INTEGER
  );

  -- Persistent collection: the latest known result for every scanned ROM,
  -- across all scans. Powers the "Sammlung" view and lets unchanged files be
  -- reused without re-hashing.
  CREATE TABLE IF NOT EXISTS library (
    path          TEXT NOT NULL,
    inner_path    TEXT NOT NULL DEFAULT '',
    size          INTEGER,
    mtime         INTEGER,
    ext           TEXT,
    console_id    INTEGER,
    md5           TEXT,
    status        TEXT,
    match_game_id INTEGER,
    scanned_at    INTEGER,
    PRIMARY KEY (path, inner_path)
  );
  CREATE INDEX IF NOT EXISTS idx_library_status ON library(status);
  CREATE INDEX IF NOT EXISTS idx_library_console ON library(console_id);

  -- Generic cache for RA API responses (game details, etc.) so we don't re-hit
  -- the network on every view. Keyed by an arbitrary string; TTL is applied at
  -- read time so the same row can serve different freshness policies.
  CREATE TABLE IF NOT EXISTS api_cache (
    key       TEXT PRIMARY KEY,
    value     TEXT,                  -- JSON
    cached_at INTEGER                -- epoch ms
  );

  -- Snapshot of the library taken at the start of a scan, so we can diff the
  -- post-scan state against it and tell the user what changed ("Sammlung-Diff").
  CREATE TABLE IF NOT EXISTS scan_baseline (
    path          TEXT NOT NULL,
    inner_path    TEXT NOT NULL DEFAULT '',
    status        TEXT,
    match_game_id INTEGER,
    PRIMARY KEY (path, inner_path)
  );

  -- Local play-session log, derived from Rich Presence polling. RA only keeps
  -- the current presence string; we keep the history, so the app can show
  -- playtime per game and a session timeline that the site itself doesn't have.
  CREATE TABLE IF NOT EXISTS play_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id       INTEGER,
    console_id    INTEGER,
    title         TEXT,
    started_at    INTEGER NOT NULL,   -- epoch ms of the first sample
    last_seen_at  INTEGER NOT NULL,   -- epoch ms of the most recent sample
    samples       INTEGER DEFAULT 1,
    rich_presence TEXT                -- last presence string of the session
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_game ON play_sessions(game_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_seen ON play_sessions(last_seen_at);
`);

// ---- migrations (additive) ------------------------------------------------
function addColumn(table, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${def}`); } catch { /* already exists */ }
}
addColumn('games', 'title_norm TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_games_title_norm ON games(title_norm)');
addColumn('library', 'message TEXT'); // persist scan error/skip reason for the collection view
addColumn('library', 'crc TEXT');     // raw file CRC32 (lowercase hex) for DAT completeness matching

// ---- DAT completeness (No-Intro/Redump/logiqx catalogs) -------------------
// Imported DAT files + their ROM entries. Matching is by raw-file CRC32 (what
// DATs universally carry), stored on the library row — this is a different
// dimension from the RetroAchievements hash (which strips headers etc.).
db.exec(`
  CREATE TABLE IF NOT EXISTS dat_files (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT,
    description  TEXT,
    version      TEXT,
    console_id   INTEGER,             -- guessed RA console (nullable)
    game_count   INTEGER DEFAULT 0,
    imported_at  INTEGER
  );
  CREATE TABLE IF NOT EXISTS dat_entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    dat_id     INTEGER NOT NULL,
    game_name  TEXT,
    rom_name   TEXT,
    size       INTEGER,
    crc        TEXT,                  -- lowercase hex
    md5        TEXT,
    sha1       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_dat_entries_dat ON dat_entries(dat_id);
  CREATE INDEX IF NOT EXISTS idx_dat_entries_crc ON dat_entries(crc);
  CREATE INDEX IF NOT EXISTS idx_library_crc ON library(crc);
`);

// Normalize a title for accent/diacritic-insensitive search:
// "Pokémon Crystal Version" -> "pokemon crystal version".
const NORM_VERSION = 2;
export function normalizeTitle(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/['’`]/g, '')                 // drop apostrophes (yoshi's -> yoshis)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ---- settings helpers -----------------------------------------------------
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
export function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}
export function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}

// ---- generic API response cache ------------------------------------------
const getApiCacheStmt = db.prepare('SELECT value, cached_at FROM api_cache WHERE key = ?');
const setApiCacheStmt = db.prepare(
  'INSERT INTO api_cache(key, value, cached_at) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, cached_at = excluded.cached_at'
);

// Returns { value, cachedAt } if a fresh entry exists, else null. maxAgeMs=null
// means "any age" (never expires unless explicitly cleared).
export function getApiCache(key, maxAgeMs) {
  const row = getApiCacheStmt.get(key);
  if (!row) return null;
  if (maxAgeMs != null && Date.now() - row.cached_at > maxAgeMs) return null;
  try { return { value: JSON.parse(row.value), cachedAt: row.cached_at }; } catch { return null; }
}
export function setApiCache(key, value) {
  setApiCacheStmt.run(key, JSON.stringify(value), Date.now());
}
// How many cached entries share a key prefix (e.g. 'game:') — used by the
// offline-readiness check to report how much detail data is already local.
export function countApiCache(prefix = '') {
  return db.prepare('SELECT COUNT(*) AS n FROM api_cache WHERE key LIKE ?').get(prefix + '%').n;
}
export function clearApiCache(prefix) {
  if (prefix) db.prepare('DELETE FROM api_cache WHERE key LIKE ?').run(prefix + '%');
  else db.prepare('DELETE FROM api_cache').run();
}

// ---- user-configurable cache freshness ------------------------------------
// Long defaults on purpose: RA data rarely changes and manual refresh is always
// available. Users tune these in Settings.
export const DEFAULT_CACHE_TTLS = { gameDetailDays: 30, profileHours: 24, completionHours: 24 };
export function getCacheTtls() {
  const saved = getSetting('cacheTtls', null);
  return { ...DEFAULT_CACHE_TTLS, ...(saved && typeof saved === 'object' ? saved : {}) };
}
export function setCacheTtls(patch) {
  const next = { ...getCacheTtls() };
  for (const k of Object.keys(DEFAULT_CACHE_TTLS)) {
    const v = Number(patch?.[k]);
    if (Number.isFinite(v) && v >= 0) next[k] = v;
  }
  setSetting('cacheTtls', next);
  return next;
}

// ---- database backups -----------------------------------------------------
const BACKUP_DIR = join(config.dataDir, 'backups');
mkdirSync(BACKUP_DIR, { recursive: true });

export function backupsDir() { return BACKUP_DIR; }

function stampString(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// VACUUM INTO writes a consistent single-file snapshot of the whole DB, safe to
// run while the DB is open in WAL mode (unlike a raw file copy).
export function backupTo(absPath) {
  db.exec(`VACUUM INTO '${absPath.replace(/'/g, "''")}'`);
  return absPath;
}

export function listBackups() {
  try {
    return readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => { const s = statSync(join(BACKUP_DIR, f)); return { name: f, size: s.size, at: s.mtimeMs }; })
      .sort((a, b) => b.at - a.at);
  } catch { return []; }
}

// Create a timestamped backup, keeping only the newest `keep`. Skips if a
// backup younger than `minIntervalMs` already exists (pass 0 to force).
export function autoBackup({ keep = 5, minIntervalMs = 6 * 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  const existing = listBackups();
  if (minIntervalMs && existing[0] && now - existing[0].at < minIntervalMs) {
    return { skipped: true, latest: existing[0] };
  }
  const file = `ra-checker-${stampString(now)}.db`;
  backupTo(join(BACKUP_DIR, file));
  for (const old of listBackups().slice(keep)) {
    try { unlinkSync(join(BACKUP_DIR, old.name)); } catch { /* ignore */ }
  }
  return { skipped: false, file };
}

// Stage a backup to be restored on the next server start (config.js swaps it in
// before the DB opens). Returns the staged path. Name is validated to stay
// inside the backups dir.
export function stageRestore(name) {
  if (!/^[\w.\-]+\.db$/.test(name)) throw new Error('Ungültiger Backup-Name');
  const src = join(BACKUP_DIR, name);
  if (!existsSync(src)) throw new Error('Backup nicht gefunden');
  const staged = join(config.dataDir, 'ra-checker.restore.db');
  copyFileSync(src, staged);
  return staged;
}

// Overlay advanced server settings saved via the Settings UI onto the in-memory
// config (rate limit, RAHasher path, big-file-copy). Called once at startup so
// UI-tuned values survive a restart without editing config.local.json.
export function applySavedConfig() {
  const saved = getSetting('serverConfig', null);
  if (!saved || typeof saved !== 'object') return;
  if (saved.rateLimit && typeof saved.rateLimit === 'object') {
    config.rateLimit = { ...config.rateLimit, ...saved.rateLimit };
  }
  if (typeof saved.rahasherPath === 'string') config.rahasherPath = saved.rahasherPath;
  if (saved.bigFileCopy && typeof saved.bigFileCopy === 'object') {
    config.bigFileCopy = { ...config.bigFileCopy, ...saved.bigFileCopy };
  }
}

// Apply RA credentials saved via the Settings UI over the config defaults.
// Called once at startup. An explicit { username: '', apiKey: '' } means the
// user logged out and should stay logged out.
export function applySavedCredentials() {
  const saved = getSetting('raCreds', null);
  if (saved && typeof saved === 'object') {
    config.raUsername = saved.username || '';
    config.raApiKey = saved.apiKey || '';
  }
}

// ---- consoles -------------------------------------------------------------
const upsertConsoleStmt = db.prepare(`
  INSERT INTO consoles(id, name, short_code, icon_url, active, is_game_system, hash_method)
  VALUES(@id, @name, @short_code, @icon_url, @active, @is_game_system, @hash_method)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    short_code = COALESCE(excluded.short_code, consoles.short_code),
    icon_url = excluded.icon_url,
    active = excluded.active,
    is_game_system = excluded.is_game_system,
    hash_method = excluded.hash_method
`);
export function upsertConsole(c) {
  upsertConsoleStmt.run({
    id: c.id,
    name: c.name,
    short_code: c.short_code ?? null,
    icon_url: c.icon_url ?? null,
    active: c.active ? 1 : 0,
    is_game_system: c.is_game_system ? 1 : 0,
    hash_method: c.hash_method ?? 'unknown',
  });
}
export function getConsoles() {
  return db.prepare('SELECT * FROM consoles ORDER BY name').all();
}
export function getConsole(id) {
  return db.prepare('SELECT * FROM consoles WHERE id = ?').get(id);
}

// ---- games + hashes (bulk upsert per console) -----------------------------
const upsertGameStmt = db.prepare(`
  INSERT INTO games(id, console_id, title, title_norm, image_icon, num_achievements, num_leaderboards, points, date_modified)
  VALUES(@id, @console_id, @title, @title_norm, @image_icon, @num_achievements, @num_leaderboards, @points, @date_modified)
  ON CONFLICT(id) DO UPDATE SET
    title = excluded.title,
    title_norm = excluded.title_norm,
    image_icon = excluded.image_icon,
    num_achievements = excluded.num_achievements,
    num_leaderboards = excluded.num_leaderboards,
    points = excluded.points,
    date_modified = excluded.date_modified
`);
const insertHashStmt = db.prepare(`
  INSERT INTO hashes(md5, game_id, console_id, rom_name, labels, patch_url)
  VALUES(@md5, @game_id, @console_id, @rom_name, @labels, @patch_url)
  ON CONFLICT(md5, game_id) DO UPDATE SET
    rom_name = excluded.rom_name,
    labels = excluded.labels,
    patch_url = excluded.patch_url
`);

// Replace the full game+hash set for a console inside one transaction.
export function replaceConsoleGames(consoleId, games) {
  const tx = db.prepare('BEGIN');
  tx.run();
  try {
    db.prepare('DELETE FROM hashes WHERE console_id = ?').run(consoleId);
    db.prepare('DELETE FROM games WHERE console_id = ?').run(consoleId);
    let hashCount = 0;
    for (const g of games) {
      upsertGameStmt.run({
        id: g.ID,
        console_id: consoleId,
        title: g.Title ?? '',
        title_norm: normalizeTitle(g.Title ?? ''),
        image_icon: g.ImageIcon ?? null,
        num_achievements: g.NumAchievements ?? 0,
        num_leaderboards: g.NumLeaderboards ?? 0,
        points: g.Points ?? 0,
        date_modified: g.DateModified ?? null,
      });
      for (const h of g.Hashes || []) {
        insertHashStmt.run({
          md5: String(h).toLowerCase(),
          game_id: g.ID,
          console_id: consoleId,
          rom_name: null,
          labels: null,
          patch_url: null,
        });
        hashCount++;
      }
    }
    db.prepare('COMMIT').run();
    return { gameCount: games.length, hashCount };
  } catch (e) {
    db.prepare('ROLLBACK').run();
    throw e;
  }
}

// Enrich hash rows with rom_name/labels from API_GetGameHashes (optional).
const enrichHashStmt = db.prepare(
  'UPDATE hashes SET rom_name = @rom_name, labels = @labels, patch_url = @patch_url WHERE md5 = @md5'
);
export function enrichHash({ md5, rom_name, labels, patch_url }) {
  enrichHashStmt.run({
    md5: String(md5).toLowerCase(),
    rom_name: rom_name ?? null,
    labels: labels ? JSON.stringify(labels) : null,
    patch_url: patch_url ?? null,
  });
}

// ---- hash lookup (the hot path during a scan) -----------------------------
const lookupHashStmt = db.prepare(`
  SELECT h.md5, h.game_id, h.console_id, h.rom_name, h.labels, h.patch_url,
         g.title, g.image_icon, g.num_achievements, g.points, g.num_leaderboards
  FROM hashes h JOIN games g ON g.id = h.game_id
  WHERE h.md5 = ?
`);
export function lookupHash(md5) {
  return lookupHashStmt.all(String(md5).toLowerCase());
}

// ---- sync bookkeeping -----------------------------------------------------
const upsertSyncStmt = db.prepare(`
  INSERT INTO console_sync(console_id, synced_at, game_count, hash_count, status, message)
  VALUES(@console_id, @synced_at, @game_count, @hash_count, @status, @message)
  ON CONFLICT(console_id) DO UPDATE SET
    synced_at = excluded.synced_at, game_count = excluded.game_count,
    hash_count = excluded.hash_count, status = excluded.status, message = excluded.message
`);
export function recordSync(s) {
  upsertSyncStmt.run({
    console_id: s.consoleId,
    synced_at: s.syncedAt,
    game_count: s.gameCount ?? 0,
    hash_count: s.hashCount ?? 0,
    status: s.status ?? 'ok',
    message: s.message ?? null,
  });
}
export function getSyncState() {
  return db.prepare('SELECT * FROM console_sync').all();
}
export function getConsoleSync(consoleId) {
  return db.prepare('SELECT * FROM console_sync WHERE console_id = ?').get(consoleId);
}

// ---- file hash cache ------------------------------------------------------
const getFileCacheStmt = db.prepare('SELECT * FROM file_hash_cache WHERE sig = ?');
const setFileCacheStmt = db.prepare(`
  INSERT INTO file_hash_cache(sig, md5, console_id, hash_method, computed_at)
  VALUES(@sig, @md5, @console_id, @hash_method, @computed_at)
  ON CONFLICT(sig) DO UPDATE SET
    md5 = excluded.md5, console_id = excluded.console_id,
    hash_method = excluded.hash_method, computed_at = excluded.computed_at
`);
export function getCachedFileHash(sig) { return getFileCacheStmt.get(sig); }
export function setCachedFileHash(row) { setFileCacheStmt.run(row); }

// ---- scans ----------------------------------------------------------------
export function createScan(rootPath, startedAt) {
  const info = db.prepare('INSERT INTO scans(root_path, started_at, status) VALUES(?, ?, ?)')
    .run(rootPath, startedAt, 'running');
  return Number(info.lastInsertRowid);
}
export function finishScan(scanId, status, totals, finishedAt) {
  db.prepare('UPDATE scans SET status = ?, totals = ?, finished_at = ? WHERE id = ?')
    .run(status, JSON.stringify(totals), finishedAt, scanId);
}
export function getScan(scanId) {
  const s = db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId);
  if (s && s.totals) { try { s.totals = JSON.parse(s.totals); } catch { /* ignore */ } }
  return s;
}
export function listScans(limit = 25) {
  return db.prepare('SELECT * FROM scans ORDER BY id DESC LIMIT ?').all(limit);
}
const insertScanItemStmt = db.prepare(`
  INSERT INTO scan_items(scan_id, file_path, inner_path, size, ext, console_id, md5,
                         match_game_id, status, message, hash_method, duration_ms, created_at)
  VALUES(@scan_id, @file_path, @inner_path, @size, @ext, @console_id, @md5,
         @match_game_id, @status, @message, @hash_method, @duration_ms, @created_at)
`);
export function insertScanItem(item) {
  const info = insertScanItemStmt.run({
    scan_id: item.scanId,
    file_path: item.filePath,
    inner_path: item.innerPath ?? null,
    size: item.size ?? null,
    ext: item.ext ?? null,
    console_id: item.consoleId ?? null,
    md5: item.md5 ?? null,
    match_game_id: item.matchGameId ?? null,
    status: item.status,
    message: item.message ?? null,
    hash_method: item.hashMethod ?? null,
    duration_ms: item.durationMs ?? null,
    created_at: item.createdAt,
  });
  return Number(info.lastInsertRowid);
}
export function getScanItems(scanId, { status, console_id, limit = 5000, offset = 0 } = {}) {
  let sql = `
    SELECT si.*, g.title AS match_title, g.image_icon AS match_image,
           g.num_achievements AS match_achievements, g.points AS match_points
    FROM scan_items si LEFT JOIN games g ON g.id = si.match_game_id
    WHERE si.scan_id = ?`;
  const params = [scanId];
  if (status) { sql += ' AND si.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND si.console_id = ?'; params.push(console_id); }
  sql += ' ORDER BY si.id LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

export function totalHashCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM hashes').get().n;
}
export function totalGameCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
}

// ---- persistent library (collection) --------------------------------------
const upsertLibraryStmt = db.prepare(`
  INSERT INTO library(path, inner_path, size, mtime, ext, console_id, md5, status, match_game_id, scanned_at, message)
  VALUES(@path, @inner_path, @size, @mtime, @ext, @console_id, @md5, @status, @match_game_id, @scanned_at, @message)
  ON CONFLICT(path, inner_path) DO UPDATE SET
    size = excluded.size, mtime = excluded.mtime, ext = excluded.ext,
    console_id = excluded.console_id, md5 = excluded.md5, status = excluded.status,
    match_game_id = excluded.match_game_id, scanned_at = excluded.scanned_at, message = excluded.message
`);
export function upsertLibraryItem(row) {
  upsertLibraryStmt.run({
    path: row.path,
    inner_path: row.inner_path ?? '',
    size: row.size ?? null,
    mtime: row.mtime ?? null,
    ext: row.ext ?? null,
    console_id: row.console_id ?? null,
    md5: row.md5 ?? null,
    status: row.status ?? null,
    match_game_id: row.match_game_id ?? null,
    scanned_at: row.scanned_at ?? Date.now(),
    message: row.message ?? null,
  });
}
const getLibraryItemStmt = db.prepare('SELECT * FROM library WHERE path = ? AND inner_path = ?');
export function getLibraryItem(path, inner = '') { return getLibraryItemStmt.get(path, inner); }

export function getLibrary({ status, console_id, q, limit = 1000, offset = 0 } = {}) {
  let sql = `
    SELECT l.*, g.title AS match_title, g.image_icon AS match_image,
           g.num_achievements AS match_achievements, g.points AS match_points,
           c.name AS console_name, c.short_code AS console_short
    FROM library l
    LEFT JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND l.console_id = ?'; params.push(console_id); }
  if (q) { sql += ' AND (l.path LIKE ? OR l.inner_path LIKE ? OR g.title LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
  sql += ' ORDER BY l.scanned_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}
export function libraryStats() {
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM library GROUP BY status').all();
  const byConsole = db.prepare(`
    SELECT l.console_id AS id, c.name, c.short_code AS short,
           COUNT(*) AS total, SUM(CASE WHEN l.status='match' THEN 1 ELSE 0 END) AS matched
    FROM library l LEFT JOIN consoles c ON c.id = l.console_id
    GROUP BY l.console_id ORDER BY total DESC`).all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM library').get().n;
  return { total, byStatus, byConsole };
}
export function clearLibrary() { db.prepare('DELETE FROM library').run(); }

// Destructive resets exposed in Settings → Data. Each returns the row counts it
// removed so the UI can report what happened. Credentials/settings are never
// touched here.
function wipeTables(tables) {
  const counts = {};
  for (const tbl of tables) {
    try {
      counts[tbl] = db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get().n;
      db.prepare(`DELETE FROM ${tbl}`).run();
    } catch { counts[tbl] = 0; }
  }
  return counts;
}
// Collection + scan history + per-file hash cache. Keeps the synced hash DB and
// the RA login, so the next scan just re-populates from disk.
export function resetCollection() {
  return wipeTables(['library', 'scans', 'scan_items', 'file_hash_cache', 'scan_baseline', 'play_sessions']);
}
// The synced RetroAchievements hash database (games/hashes) — forces a fresh
// sync. Console metadata rows are kept so the systems list still renders.
export function resetHashDb() {
  const counts = wipeTables(['games', 'hashes', 'console_sync']);
  clearApiCache('game:');
  // No synchronous VACUUM here — it can be very slow on a large DB and would
  // block the reset endpoint. Freed pages go to the freelist and are reclaimed
  // by the next backup (VACUUM INTO) / checkpoint.
  return counts;
}

// ---- DAT completeness ------------------------------------------------------
const insertDatFileStmt = db.prepare('INSERT INTO dat_files(name, description, version, console_id, game_count, imported_at) VALUES(?,?,?,?,?,?)');
const insertDatEntryStmt = db.prepare('INSERT INTO dat_entries(dat_id, game_name, rom_name, size, crc, md5, sha1) VALUES(?,?,?,?,?,?,?)');

// Store a parsed DAT and all its rom entries in one transaction.
export function insertDat({ name, description, version, console_id, entries }) {
  const games = new Set();
  db.exec('BEGIN');
  try {
    const info = insertDatFileStmt.run(name || 'DAT', description || null, version || null, console_id ?? null, 0, Date.now());
    const datId = Number(info.lastInsertRowid);
    for (const e of entries) {
      games.add(e.game_name || e.rom_name || '');
      insertDatEntryStmt.run(datId, e.game_name || null, e.rom_name || null, e.size ?? null,
        e.crc ? String(e.crc).toLowerCase() : null,
        e.md5 ? String(e.md5).toLowerCase() : null,
        e.sha1 ? String(e.sha1).toLowerCase() : null);
    }
    db.prepare('UPDATE dat_files SET game_count = ? WHERE id = ?').run(games.size, datId);
    db.exec('COMMIT');
    return { id: datId, entries: entries.length, games: games.size };
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// One row per DAT with a live "have" count against the collection's CRC set.
export function listDats() {
  const rows = db.prepare('SELECT id, name, description, version, console_id, game_count, imported_at FROM dat_files ORDER BY imported_at DESC').all();
  const haveStmt = db.prepare(`
    SELECT COUNT(*) AS n FROM dat_entries e
    WHERE e.dat_id = ? AND e.crc IS NOT NULL
      AND e.crc IN (SELECT crc FROM library WHERE crc IS NOT NULL)`);
  const totalStmt = db.prepare('SELECT COUNT(*) AS n FROM dat_entries WHERE dat_id = ?');
  return rows.map((r) => ({
    ...r,
    total: totalStmt.get(r.id).n,
    have: haveStmt.get(r.id).n,
  }));
}

export function deleteDat(id) {
  db.prepare('DELETE FROM dat_entries WHERE dat_id = ?').run(id);
  db.prepare('DELETE FROM dat_files WHERE id = ?').run(id);
}

// Detailed coverage for one DAT: which rom entries are present in the
// collection (by CRC) and which are missing.
export function datCoverage(id, { missingLimit = 5000 } = {}) {
  const dat = db.prepare('SELECT id, name, description, version, console_id, game_count FROM dat_files WHERE id = ?').get(id);
  if (!dat) return null;
  const entries = db.prepare('SELECT game_name, rom_name, size, crc FROM dat_entries WHERE dat_id = ?').all(id);
  const owned = new Set(db.prepare('SELECT DISTINCT crc FROM library WHERE crc IS NOT NULL').all().map((r) => r.crc));
  let have = 0;
  const missing = [];
  for (const e of entries) {
    const hit = e.crc && owned.has(e.crc);
    if (hit) have++;
    else if (missing.length < missingLimit) missing.push({ game: e.game_name, rom: e.rom_name, crc: e.crc, size: e.size });
  }
  return { dat, total: entries.length, have, missing, missingTotal: entries.length - have, collectionCrcCount: owned.size };
}

// Progress of the raw-CRC pass over the collection (needed before matching).
export function datCrcStatus() {
  const total = db.prepare("SELECT COUNT(*) AS n FROM library WHERE status IN ('match','no_match')").get().n;
  const withCrc = db.prepare("SELECT COUNT(*) AS n FROM library WHERE crc IS NOT NULL").get().n;
  return { total, withCrc, without: Math.max(0, total - withCrc) };
}

// Library rows still lacking a raw CRC (candidates for the CRC pass). Only rows
// that represent a real ROM (match/no_match) — skip errors/skips/rahasher.
export function getLibraryRowsWithoutCrc(limit = 100000) {
  return db.prepare("SELECT path, inner_path, size, ext FROM library WHERE crc IS NULL AND status IN ('match','no_match') ORDER BY path LIMIT ?").all(limit);
}
export function setLibraryCrc(path, inner, crc) {
  db.prepare('UPDATE library SET crc = ? WHERE path = ? AND inner_path = ?').run(crc, path, inner ?? '');
}

// Distinct on-disk file paths in the collection (one archive may back many
// rows via inner_path). Used by the health check to test file existence.
export function getLibraryPaths() {
  return db.prepare('SELECT DISTINCT path FROM library').all().map((r) => r.path);
}
// How many collection rows belong to each of the given paths (for reporting).
export function countLibraryRowsForPaths(paths) {
  if (!paths.length) return 0;
  let n = 0;
  const stmt = db.prepare('SELECT COUNT(*) AS n FROM library WHERE path = ?');
  for (const p of paths) n += stmt.get(p).n;
  return n;
}
// Remove every collection row whose file path is in `paths` (cleanup of moved
// or deleted ROMs). Returns the number of rows deleted.
export function deleteLibraryByPaths(paths) {
  if (!paths.length) return 0;
  const stmt = db.prepare('DELETE FROM library WHERE path = ?');
  let n = 0;
  db.prepare('BEGIN').run();
  try {
    for (const p of paths) n += stmt.run(p).changes;
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  return n;
}

// ---- cached games browse --------------------------------------------------
// Whitelisted ORDER BY clauses — never interpolate a raw `sort` value into SQL.
const GAME_SORTS = {
  points: 'points DESC, title',
  achievements: 'num_achievements DESC, title',
  title: 'title COLLATE NOCASE, points DESC',
};
export function getGamesByConsole(consoleId, { q, limit = 120, offset = 0, sort } = {}) {
  let sql = 'SELECT id, console_id, title, image_icon, num_achievements, points, num_leaderboards FROM games WHERE console_id = ?';
  const params = [consoleId];
  if (q) { sql += ' AND title LIKE ?'; params.push(`%${q}%`); }
  sql += ' ORDER BY ' + (GAME_SORTS[sort] || GAME_SORTS.points) + ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}
export function countGamesByConsole(consoleId, { q } = {}) {
  let sql = 'SELECT COUNT(*) AS n FROM games WHERE console_id = ?';
  const params = [consoleId];
  if (q) { sql += ' AND title LIKE ?'; params.push(`%${q}%`); }
  return db.prepare(sql).get(...params).n;
}

// Stopwords drop out of matching: they appear in hundreds of titles ("of" is in
// "Legend OF Mana"), so an OR over them used to flood results with junk. They're
// still kept if a query is *only* stopwords (so "the" can still find something).
const SEARCH_STOPWORDS = new Set([
  'of', 'the', 'and', 'a', 'an', 'to', 'in', 'on', 'at', 'vs', 'for', 'with',
  'de', 'la', 'le', 'el', 'der', 'die', 'das', 'und', 'no',
]);

// Global game search: accent-insensitive, token-based. Requires ALL meaningful
// query words to appear in a title (AND) so "oracle of ages" no longer matches
// "Legend of Mana"; falls back to an OR match only when AND finds nothing (typos
// / extra words). Ranked by how many words matched, then points.
export function searchGames(q, { limit = 60 } = {}) {
  const norm = normalizeTitle(q);
  if (!norm) return [];
  const all = [...new Set(norm.split(' ').filter((t) => t.length >= 2))].slice(0, 10);
  if (!all.length) return [];
  let tokens = all.filter((t) => !SEARCH_STOPWORDS.has(t));
  if (!tokens.length) tokens = all; // query was all stopwords — match on them anyway
  tokens = tokens.slice(0, 8);

  const scoreExpr = tokens.map(() => '(CASE WHEN g.title_norm LIKE ? THEN 1 ELSE 0 END)').join(' + ');
  const likes = tokens.map((t) => `%${t}%`);
  const run = (connective) => {
    const whereExpr = tokens.map(() => 'g.title_norm LIKE ?').join(` ${connective} `);
    // params: score likes..., where likes..., limit
    return db.prepare(`
      SELECT g.id, g.console_id, g.title, g.image_icon, g.num_achievements, g.points,
             c.name AS console_name, c.short_code AS console_short,
             (${scoreExpr}) AS score
      FROM games g JOIN consoles c ON c.id = g.console_id
      WHERE ${whereExpr}
      ORDER BY score DESC, g.points DESC, g.title
      LIMIT ?`).all(...likes, ...likes, limit);
  };

  const strict = run('AND');
  if (strict.length || tokens.length === 1) return strict;
  return run('OR'); // nothing matched all words — widen so the user sees near-hits
}

// Backfill title_norm. Recomputes everything when the normalization version
// changes (so algorithm fixes propagate), else only fills NULL rows.
export function backfillTitleNorm() {
  const ver = getSetting('titleNormV', 0);
  const full = ver !== NORM_VERSION;
  const rows = full
    ? db.prepare('SELECT id, title FROM games').all()
    : db.prepare('SELECT id, title FROM games WHERE title_norm IS NULL').all();
  if (!rows.length) { if (full) setSetting('titleNormV', NORM_VERSION); return 0; }
  const upd = db.prepare('UPDATE games SET title_norm = ? WHERE id = ?');
  db.prepare('BEGIN').run();
  try {
    for (const r of rows) upd.run(normalizeTitle(r.title), r.id);
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  setSetting('titleNormV', NORM_VERSION);
  return rows.length;
}

// Collection insights: what's playable + obtainable achievements/points.
export function libraryInsights() {
  const playable = db.prepare(`
    SELECT COUNT(DISTINCT l.match_game_id) AS games,
           COUNT(*) AS files
    FROM library l WHERE l.status = 'match' AND l.match_game_id IS NOT NULL`).get();
  const totals = db.prepare(`
    SELECT COALESCE(SUM(g.num_achievements),0) AS achievements, COALESCE(SUM(g.points),0) AS points
    FROM (SELECT DISTINCT match_game_id FROM library WHERE status='match' AND match_game_id IS NOT NULL) d
    JOIN games g ON g.id = d.match_game_id`).get();
  const byStatus = db.prepare('SELECT status, COUNT(*) AS n FROM library GROUP BY status').all();
  const total = db.prepare('SELECT COUNT(*) AS n FROM library').get().n;
  return {
    total,
    playableGames: playable.games || 0,
    playableFiles: playable.files || 0,
    obtainableAchievements: totals.achievements || 0,
    obtainablePoints: totals.points || 0,
    byStatus,
  };
}

// All distinct playable (matched) games in the collection, with RA meta.
// Used by the Quick-Wins feature to cross-reference with the user's progress.
export function getPlayableGames() {
  return db.prepare(`
    SELECT g.id, g.title, g.console_id, g.image_icon, g.num_achievements, g.points,
           c.name AS console_name, c.short_code AS console_short
    FROM (SELECT DISTINCT match_game_id FROM library WHERE status='match' AND match_game_id IS NOT NULL) d
    JOIN games g ON g.id = d.match_game_id
    LEFT JOIN consoles c ON c.id = g.console_id`).all();
}

// Pick a random playable game (for "what should I play?").
export function suggestPlayable() {
  return db.prepare(`
    SELECT g.id, g.title, g.console_id, g.image_icon, g.num_achievements, g.points,
           c.name AS console_name, c.short_code AS console_short,
           l.path, l.inner_path
    FROM library l
    JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE l.status='match' AND l.match_game_id IS NOT NULL
    ORDER BY RANDOM() LIMIT 1`).get();
}

// Duplicate detection: games matched by more than one file in the collection.
export function getDuplicates() {
  return db.prepare(`
    SELECT l.match_game_id AS game_id, g.title, g.image_icon, l.console_id,
           c.name AS console_name, c.short_code AS console_short,
           COUNT(*) AS copies
    FROM library l
    JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE l.status = 'match' AND l.match_game_id IS NOT NULL
    GROUP BY l.match_game_id
    HAVING copies > 1
    ORDER BY copies DESC, g.title`).all();
}
export function getDuplicateFiles(gameId) {
  return db.prepare(`SELECT path, inner_path, size, md5 FROM library WHERE match_game_id = ? AND status='match' ORDER BY path`).all(gameId);
}

// Every RA game id the collection hash-matches, as a Set — the cheap way to
// answer "do I own this?" for a whole list (claims, wishlists, free games).
export function getOwnedGameIdSet() {
  const rows = db.prepare(
    "SELECT DISTINCT match_game_id AS id FROM library WHERE status='match' AND match_game_id IS NOT NULL"
  ).all();
  return new Set(rows.map((r) => r.id));
}

// A single cached game row (no network) — used to enrich claims/wishlist items.
export function getGameById(id) {
  return db.prepare(`
    SELECT g.id, g.console_id, g.title, g.image_icon, g.num_achievements, g.points, g.num_leaderboards,
           c.name AS console_name, c.short_code AS console_short
    FROM games g LEFT JOIN consoles c ON c.id = g.console_id
    WHERE g.id = ?`).get(id);
}

// Exact (normalized) title lookup, optionally pinned to one console. Used to
// map catalog entries (free games) onto RA game ids without an API call.
export function findGamesByTitle(title, consoleId = null) {
  const norm = normalizeTitle(title);
  if (!norm) return [];
  const params = [norm];
  let sql = `
    SELECT g.id, g.console_id, g.title, g.image_icon, g.num_achievements, g.points,
           c.name AS console_name, c.short_code AS console_short
    FROM games g LEFT JOIN consoles c ON c.id = g.console_id
    WHERE g.title_norm = ?`;
  if (consoleId != null) { sql += ' AND g.console_id = ?'; params.push(consoleId); }
  sql += ' ORDER BY g.num_achievements DESC LIMIT 5';
  return db.prepare(sql).all(...params);
}

// ---- RA world coverage ("how much of RetroAchievements do I own?") ---------
// Compares the collection against the full synced hash database. Everything is
// local; no API calls. `owned*` counts distinct matched games only.
export function getCoverageStats() {
  const all = db.prepare(`
    SELECT COUNT(*) AS games,
           COALESCE(SUM(num_achievements),0) AS achievements,
           COALESCE(SUM(points),0) AS points
    FROM games`).get();
  const owned = db.prepare(`
    SELECT COUNT(*) AS games,
           COALESCE(SUM(g.num_achievements),0) AS achievements,
           COALESCE(SUM(g.points),0) AS points
    FROM (SELECT DISTINCT match_game_id FROM library WHERE status='match' AND match_game_id IS NOT NULL) d
    JOIN games g ON g.id = d.match_game_id`).get();
  const byConsole = db.prepare(`
    SELECT c.id, c.name, c.short_code AS short,
           COUNT(g.id) AS games,
           COALESCE(SUM(g.num_achievements),0) AS achievements,
           (SELECT COUNT(*) FROM (SELECT DISTINCT l.match_game_id AS mid FROM library l
                                  WHERE l.status='match' AND l.match_game_id IS NOT NULL) d
            JOIN games g2 ON g2.id = d.mid WHERE g2.console_id = c.id) AS ownedGames
    FROM consoles c LEFT JOIN games g ON g.console_id = c.id
    GROUP BY c.id HAVING games > 0
    ORDER BY games DESC`).all();
  return { all, owned, byConsole };
}

// ---- play sessions (rich-presence derived) --------------------------------
// A session is "open" while presence keeps naming the same game; a gap longer
// than `maxGapMs` starts a new one.
export function findOpenSession(gameId, since) {
  return db.prepare(
    `SELECT * FROM play_sessions
     WHERE (game_id IS ? OR (game_id IS NULL AND ? IS NULL)) AND last_seen_at >= ?
     ORDER BY last_seen_at DESC LIMIT 1`
  ).get(gameId ?? null, gameId ?? null, since);
}
export function startSession({ gameId, consoleId, title, at, rich }) {
  const info = db.prepare(`
    INSERT INTO play_sessions(game_id, console_id, title, started_at, last_seen_at, samples, rich_presence)
    VALUES(?, ?, ?, ?, ?, 1, ?)`).run(gameId ?? null, consoleId ?? null, title ?? null, at, at, rich ?? null);
  return Number(info.lastInsertRowid);
}
export function touchSession(id, at, rich) {
  db.prepare('UPDATE play_sessions SET last_seen_at = ?, samples = samples + 1, rich_presence = COALESCE(?, rich_presence) WHERE id = ?')
    .run(at, rich ?? null, id);
}
export function getRecentSessions(limit = 30) {
  return db.prepare(`
    SELECT s.*, g.image_icon, c.short_code AS console_short, c.name AS console_name
    FROM play_sessions s
    LEFT JOIN games g ON g.id = s.game_id
    LEFT JOIN consoles c ON c.id = s.console_id
    ORDER BY s.last_seen_at DESC LIMIT ?`).all(limit);
}
// Aggregated playtime per game. `ms` is wall time between first and last
// sample of every session, so a single-sample session counts as 0 (correct:
// we only know the user was there at one instant).
export function getPlaytimeByGame(limit = 50) {
  return db.prepare(`
    SELECT s.game_id, COALESCE(s.title, g.title) AS title, s.console_id,
           g.image_icon, c.short_code AS console_short,
           SUM(s.last_seen_at - s.started_at) AS ms,
           COUNT(*) AS sessions,
           MAX(s.last_seen_at) AS lastAt
    FROM play_sessions s
    LEFT JOIN games g ON g.id = s.game_id
    LEFT JOIN consoles c ON c.id = s.console_id
    GROUP BY s.game_id, COALESCE(s.title, g.title)
    ORDER BY ms DESC LIMIT ?`).all(limit);
}
export function getSessionsForGame(gameId, limit = 50) {
  return db.prepare('SELECT * FROM play_sessions WHERE game_id = ? ORDER BY last_seen_at DESC LIMIT ?')
    .all(gameId, limit);
}
export function playtimeTotals() {
  const r = db.prepare('SELECT COUNT(*) AS sessions, COALESCE(SUM(last_seen_at - started_at),0) AS ms, COUNT(DISTINCT game_id) AS games FROM play_sessions').get();
  return { sessions: r.sessions || 0, ms: r.ms || 0, games: r.games || 0 };
}
export function clearSessions() { db.prepare('DELETE FROM play_sessions').run(); }

// ---- playtime export / import (portable JSON, survives outside a DB backup) --
export function exportSessions() {
  return db.prepare(
    'SELECT game_id, console_id, title, started_at, last_seen_at, samples, rich_presence FROM play_sessions ORDER BY started_at'
  ).all();
}
// Merge imported sessions, skipping any that already exist (same game + start
// time). Never overwrites — a re-import is idempotent.
export function importSessions(rows) {
  if (!Array.isArray(rows)) return { added: 0, skipped: 0 };
  const exists = db.prepare(
    'SELECT 1 FROM play_sessions WHERE started_at = ? AND (game_id IS ? OR (game_id IS NULL AND ? IS NULL)) LIMIT 1'
  );
  const ins = db.prepare(`INSERT INTO play_sessions(game_id, console_id, title, started_at, last_seen_at, samples, rich_presence)
    VALUES(?, ?, ?, ?, ?, ?, ?)`);
  let added = 0, skipped = 0;
  db.prepare('BEGIN').run();
  try {
    for (const r of rows) {
      const started = Number(r?.started_at);
      const last = Number(r?.last_seen_at);
      if (!Number.isFinite(started) || !Number.isFinite(last)) { skipped++; continue; }
      const gid = r.game_id != null ? Number(r.game_id) : null;
      if (exists.get(started, gid, gid)) { skipped++; continue; }
      ins.run(gid, r.console_id != null ? Number(r.console_id) : null, r.title ?? null,
        started, last, Number(r.samples) || 1, r.rich_presence ?? null);
      added++;
    }
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  return { added, skipped };
}

// Files in the collection that hash-match a given RA game. Powers the
// "do I own this ROM?" hint in the game-detail modal.
export function getLibraryFilesForGame(gameId) {
  return db.prepare(
    `SELECT path, inner_path, size, md5, scanned_at FROM library
     WHERE match_game_id = ? AND status = 'match' ORDER BY path`
  ).all(gameId);
}

// ---- collection diff (Sammlung-Diff) --------------------------------------
// Snapshot the current library so the next scan's result can be diffed against
// it. Called at the start of every scan; the baseline therefore always reflects
// the state *before* the most recent scan ("seit letztem Scan").
export function snapshotLibraryBaseline() {
  db.prepare('BEGIN').run();
  try {
    db.prepare('DELETE FROM scan_baseline').run();
    db.prepare(`INSERT INTO scan_baseline(path, inner_path, status, match_game_id)
                SELECT path, inner_path, status, match_game_id FROM library`).run();
    db.prepare('COMMIT').run();
  } catch (e) { db.prepare('ROLLBACK').run(); throw e; }
  setSetting('baselineAt', Date.now());
}

// Compare the live library against the baseline snapshot. Returns four buckets:
//   added        — files in the collection now that weren't in the baseline
//   newlyMatched — files that gained achievements (status -> match)
//   lost         — files that lost their match (match -> something else)
//   removed      — baseline files no longer present in the collection
const DIFF_SELECT = `
  l.path, l.inner_path, l.status, l.match_game_id, l.console_id, l.scanned_at,
  g.title AS match_title, g.image_icon AS match_image,
  g.num_achievements AS match_achievements, g.points AS match_points,
  c.short_code AS console_short, c.name AS console_name`;
export function getCollectionDiff({ limit = 100 } = {}) {
  const at = getSetting('baselineAt', null);
  const hasBaseline = db.prepare('SELECT COUNT(*) AS n FROM scan_baseline').get().n > 0;

  const added = db.prepare(`
    SELECT ${DIFF_SELECT}
    FROM library l
    LEFT JOIN scan_baseline b ON b.path = l.path AND b.inner_path = l.inner_path
    LEFT JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE b.path IS NULL
    ORDER BY l.scanned_at DESC LIMIT ?`).all(limit);

  const newlyMatched = db.prepare(`
    SELECT ${DIFF_SELECT}
    FROM library l
    JOIN scan_baseline b ON b.path = l.path AND b.inner_path = l.inner_path
    LEFT JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE l.status = 'match' AND b.status IS NOT 'match'
    ORDER BY l.scanned_at DESC LIMIT ?`).all(limit);

  const lost = db.prepare(`
    SELECT ${DIFF_SELECT}, bg.title AS prev_title, b.status AS prev_status
    FROM library l
    JOIN scan_baseline b ON b.path = l.path AND b.inner_path = l.inner_path
    LEFT JOIN games g ON g.id = l.match_game_id
    LEFT JOIN games bg ON bg.id = b.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    WHERE b.status = 'match' AND l.status IS NOT 'match'
    ORDER BY l.scanned_at DESC LIMIT ?`).all(limit);

  const removed = db.prepare(`
    SELECT b.path, b.inner_path, b.status, b.match_game_id,
           bg.title AS match_title, bg.image_icon AS match_image
    FROM scan_baseline b
    LEFT JOIN library l ON l.path = b.path AND l.inner_path = b.inner_path
    LEFT JOIN games bg ON bg.id = b.match_game_id
    WHERE l.path IS NULL
    ORDER BY b.path LIMIT ?`).all(limit);

  const count = (sql, ...p) => db.prepare(sql).get(...p).n;
  const counts = {
    added: count('SELECT COUNT(*) AS n FROM library l LEFT JOIN scan_baseline b ON b.path=l.path AND b.inner_path=l.inner_path WHERE b.path IS NULL'),
    newlyMatched: count("SELECT COUNT(*) AS n FROM library l JOIN scan_baseline b ON b.path=l.path AND b.inner_path=l.inner_path WHERE l.status='match' AND b.status IS NOT 'match'"),
    lost: count("SELECT COUNT(*) AS n FROM library l JOIN scan_baseline b ON b.path=l.path AND b.inner_path=l.inner_path WHERE b.status='match' AND l.status IS NOT 'match'"),
    removed: count('SELECT COUNT(*) AS n FROM scan_baseline b LEFT JOIN library l ON l.path=b.path AND l.inner_path=b.inner_path WHERE l.path IS NULL'),
  };
  return { at, hasBaseline, counts, added, newlyMatched, lost, removed };
}
