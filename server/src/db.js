// SQLite persistence using Node's built-in node:sqlite (no native deps).
// Holds the cached RetroAchievements hash database + scan results + settings.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, statSync, unlinkSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseRomTags, packTags, TAG_PARSER_VERSION } from 'ra-core/region.js';
import { majorGenre, isMajorGenre, GENRE_MAP_VERSION } from './genres.js';
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
// RetroAchievements genre string (comma-joined when a game carries several),
// see https://docs.retroachievements.org/guidelines/content/genre-definitions.html
addColumn('games', 'genre TEXT');
// The raw string mixes genres and subgenres; genre_major is the normalized one
// of the 19 documented genres that everything sorts and filters by.
addColumn('games', 'genre_major TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_games_genre ON games(genre)');
db.exec('CREATE INDEX IF NOT EXISTS idx_games_genre_major ON games(genre_major)');
addColumn('library', 'message TEXT'); // persist scan error/skip reason for the collection view
addColumn('library', 'crc TEXT');     // raw file CRC32 (lowercase hex) for DAT completeness matching
// NOTE: library.md5 is the RetroAchievements hash (rcheevos), NOT the raw file
// md5 — so the DAT raw-file hashes live in their own columns.
addColumn('library', 'raw_md5 TEXT');  // raw file md5 — fallback match for DATs that carry no CRC
addColumn('library', 'raw_sha1 TEXT'); // raw file sha1 — Redump CHD / MAME <disk> carry only this
// Region/language parsed out of the filename (No-Intro/GoodTools/TOSEC tags).
// Comma-joined codes; '' means "parsed, nothing found", NULL means "not parsed
// yet" — which is what backfillLibraryTags() looks for after an upgrade.
addColumn('library', 'region TEXT');
addColumn('library', 'langs TEXT');
db.exec('CREATE INDEX IF NOT EXISTS idx_library_region ON library(region)');

// Canonical ROM names from API_GetGameHashes, keyed by hash and kept OUTSIDE
// the `hashes` table — a console re-sync rebuilds that table from scratch and
// would otherwise discard every name we ever fetched. This is the authoritative
// region source: a matched file is the exact dump RetroAchievements names here,
// no matter what the user called the file on disk.
db.exec(`
  CREATE TABLE IF NOT EXISTS hash_names (
    md5        TEXT PRIMARY KEY,
    rom_name   TEXT,
    labels     TEXT,          -- JSON array
    patch_url  TEXT,
    region     TEXT,          -- parsed from rom_name, comma-joined codes
    langs      TEXT,
    fetched_at INTEGER
  );

  -- One row per game already asked about, so the enrichment job is resumable
  -- and never re-requests a game (including ones that returned no hashes).
  CREATE TABLE IF NOT EXISTS game_hash_sync (
    game_id    INTEGER PRIMARY KEY,
    fetched_at INTEGER,
    hash_count INTEGER
  );

  -- Durable genre store, kept outside the games table for the same reason as
  -- hash_names: a console re-sync rebuilds it from scratch. A row with genre
  -- NULL means "asked, RA has no genre" so the job never requests it again.
  CREATE TABLE IF NOT EXISTS game_genres (
    game_id    INTEGER PRIMARY KEY,
    genre      TEXT,
    fetched_at INTEGER
  );
`);

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
  CREATE INDEX IF NOT EXISTS idx_dat_entries_md5 ON dat_entries(md5);
  CREATE INDEX IF NOT EXISTS idx_dat_entries_sha1 ON dat_entries(sha1);
  CREATE INDEX IF NOT EXISTS idx_library_crc ON library(crc);
  CREATE INDEX IF NOT EXISTS idx_library_raw_md5 ON library(raw_md5);
  CREATE INDEX IF NOT EXISTS idx_library_raw_sha1 ON library(raw_sha1);
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
// The durable copy. `hashes` is wiped and rebuilt whenever a console re-syncs,
// which would throw away hours of enrichment — hash_names survives that and is
// replayed back onto `hashes` afterwards (restoreHashNames).
const upsertHashNameStmt = db.prepare(`
  INSERT INTO hash_names(md5, rom_name, labels, patch_url, region, langs, fetched_at)
  VALUES(@md5, @rom_name, @labels, @patch_url, @region, @langs, @fetched_at)
  ON CONFLICT(md5) DO UPDATE SET
    rom_name = excluded.rom_name, labels = excluded.labels, patch_url = excluded.patch_url,
    region = excluded.region, langs = excluded.langs, fetched_at = excluded.fetched_at
`);
export function enrichHash({ md5, rom_name, labels, patch_url }) {
  const key = String(md5).toLowerCase();
  // RetroAchievements names its hash entries the No-Intro way, so the region of
  // the actual dump is right there — independent of what the user called the file.
  const tags = packTags(parseRomTags(rom_name || ''));
  enrichHashStmt.run({
    md5: key,
    rom_name: rom_name ?? null,
    labels: labels ? JSON.stringify(labels) : null,
    patch_url: patch_url ?? null,
  });
  upsertHashNameStmt.run({
    md5: key,
    rom_name: rom_name ?? null,
    labels: labels ? JSON.stringify(labels) : null,
    patch_url: patch_url ?? null,
    region: tags.region,
    langs: tags.langs,
    fetched_at: Date.now(),
  });
}

// Re-derive region/langs on every stored ROM name after a parser change. No
// network and no re-scan — the names are already here, only our reading of them
// improved. Returns how many rows were rewritten.
export function reparseHashNames() {
  if (Number(getSetting('tagParserVersion', 0)) === TAG_PARSER_VERSION) return 0;
  const rows = db.prepare('SELECT md5, rom_name FROM hash_names').all();
  const upd = db.prepare('UPDATE hash_names SET region = ?, langs = ? WHERE md5 = ?');
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const tags = packTags(parseRomTags(r.rom_name || ''));
      upd.run(tags.region, tags.langs, r.md5);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}

// Call once both reparse passes have run, so the next boot skips them.
export function markTagParserVersion() {
  setSetting('tagParserVersion', TAG_PARSER_VERSION);
}

// One-time seed for installs that enriched hashes before hash_names existed:
// lift those names into the durable table (and parse their regions) so the work
// isn't repeated. Cheap and idempotent — only rows missing from hash_names.
export function seedHashNames() {
  const rows = db.prepare(`
    SELECT md5, rom_name, labels, patch_url FROM hashes
    WHERE rom_name IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM hash_names n WHERE n.md5 = hashes.md5)
  `).all();
  if (!rows.length) return 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const tags = packTags(parseRomTags(r.rom_name || ''));
      upsertHashNameStmt.run({
        md5: r.md5, rom_name: r.rom_name, labels: r.labels, patch_url: r.patch_url,
        region: tags.region, langs: tags.langs, fetched_at: Date.now(),
      });
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}

// Replay stored names onto the `hashes` table — called at boot and after every
// console sync, since replaceConsoleGames() rebuilds those rows from scratch.
export function restoreHashNames() {
  const info = db.prepare(`
    UPDATE hashes SET
      rom_name  = (SELECT n.rom_name  FROM hash_names n WHERE n.md5 = hashes.md5),
      labels    = (SELECT n.labels    FROM hash_names n WHERE n.md5 = hashes.md5),
      patch_url = (SELECT n.patch_url FROM hash_names n WHERE n.md5 = hashes.md5)
    WHERE rom_name IS NULL AND EXISTS (SELECT 1 FROM hash_names n WHERE n.md5 = hashes.md5)
  `).run();
  return Number(info.changes ?? 0);
}

// ---- hash-name enrichment bookkeeping -------------------------------------
// One row per game we already asked API_GetGameHashes about, so the job is
// resumable and never re-requests a game (including ones that returned nothing).
const markGameHashesStmt = db.prepare(
  'INSERT INTO game_hash_sync(game_id, fetched_at, hash_count) VALUES(?,?,?) ON CONFLICT(game_id) DO UPDATE SET fetched_at = excluded.fetched_at, hash_count = excluded.hash_count',
);
export function markGameHashesFetched(gameId, hashCount) {
  markGameHashesStmt.run(gameId, Date.now(), hashCount ?? 0);
}

/**
 * Games still to enrich, newest-value-first.
 * @param {'collection'|'all'} scope  'collection' = only games you own a file for
 */
export function gamesNeedingHashNames(scope = 'collection') {
  const sql = scope === 'all'
    ? `SELECT g.id FROM games g
       WHERE g.num_achievements > 0
         AND NOT EXISTS (SELECT 1 FROM game_hash_sync s WHERE s.game_id = g.id)
       ORDER BY g.id`
    : `SELECT DISTINCT l.match_game_id AS id FROM library l
       WHERE l.status = 'match' AND l.match_game_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM game_hash_sync s WHERE s.game_id = l.match_game_id)
       ORDER BY l.match_game_id`;
  return db.prepare(sql).all().map((r) => r.id);
}

// How far the enrichment has come — drives the Settings panel.
export function hashNameStats() {
  const games = db.prepare('SELECT COUNT(*) AS n FROM games WHERE num_achievements > 0').get().n;
  const fetched = db.prepare('SELECT COUNT(*) AS n FROM game_hash_sync').get().n;
  const named = db.prepare('SELECT COUNT(*) AS n FROM hash_names').get().n;
  const owned = db.prepare(
    "SELECT COUNT(DISTINCT match_game_id) AS n FROM library WHERE status='match' AND match_game_id IS NOT NULL",
  ).get().n;
  const ownedFetched = db.prepare(`
    SELECT COUNT(DISTINCT l.match_game_id) AS n FROM library l
    JOIN game_hash_sync s ON s.game_id = l.match_game_id
    WHERE l.status='match' AND l.match_game_id IS NOT NULL`).get().n;
  return { games, fetched, named, owned, ownedFetched };
}

// ---- game genres ----------------------------------------------------------
// Source: API_GetGame / API_GetGameExtended (`Genre`). Values follow RA's genre
// definitions; multiple genres arrive comma-separated in one string.
const upsertGameGenreStmt = db.prepare(`
  INSERT INTO game_genres(game_id, genre, fetched_at) VALUES(?, ?, ?)
  ON CONFLICT(game_id) DO UPDATE SET genre = excluded.genre, fetched_at = excluded.fetched_at
`);
const setGamesGenreStmt = db.prepare('UPDATE games SET genre = ?, genre_major = ? WHERE id = ?');

function normalizeGenre(genre) {
  const s = String(genre ?? '').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').trim();
  return s ? s : null;
}

export function setGameGenre(gameId, genre) {
  const value = normalizeGenre(genre);
  upsertGameGenreStmt.run(gameId, value, Date.now());
  setGamesGenreStmt.run(value, majorGenre(value), gameId);
  return value;
}

// Replay stored genres onto `games` — called after every console sync, which
// rebuilds those rows and would otherwise drop the genre.
export function restoreGameGenres() {
  const info = db.prepare(`
    UPDATE games SET genre = (SELECT gg.genre FROM game_genres gg WHERE gg.game_id = games.id)
    WHERE genre IS NULL AND EXISTS (SELECT 1 FROM game_genres gg WHERE gg.game_id = games.id)
  `).run();
  backfillGenreMajor();
  return Number(info.changes ?? 0);
}

// Derive genre_major wherever it is still missing — and re-derive everything
// after a mapping change. Network-free, so it just runs at boot.
export function backfillGenreMajor() {
  const full = Number(getSetting('genreMapV', 0)) !== GENRE_MAP_VERSION;
  const rows = db.prepare(
    full
      ? "SELECT id, genre FROM games WHERE genre IS NOT NULL AND genre <> ''"
      : "SELECT id, genre FROM games WHERE genre IS NOT NULL AND genre <> '' AND genre_major IS NULL",
  ).all();
  if (!rows.length) { if (full) setSetting('genreMapV', GENRE_MAP_VERSION); return 0; }
  const upd = db.prepare('UPDATE games SET genre_major = ? WHERE id = ?');
  db.exec('BEGIN');
  try {
    for (const r of rows) upd.run(majorGenre(r.genre), r.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  if (full) setSetting('genreMapV', GENRE_MAP_VERSION);
  return rows.length;
}

/**
 * Games whose genre has not been fetched yet.
 * @param {'collection'|'all'} scope 'collection' = only games you own a file for
 */
export function gamesNeedingGenre(scope = 'collection') {
  const sql = scope === 'all'
    ? `SELECT g.id FROM games g
       WHERE NOT EXISTS (SELECT 1 FROM game_genres gg WHERE gg.game_id = g.id)
       ORDER BY g.id`
    : `SELECT DISTINCT l.match_game_id AS id FROM library l
       WHERE l.status = 'match' AND l.match_game_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM game_genres gg WHERE gg.game_id = l.match_game_id)
       ORDER BY l.match_game_id`;
  return db.prepare(sql).all().map((r) => r.id);
}

export function genreStats() {
  const games = db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
  const fetched = db.prepare('SELECT COUNT(*) AS n FROM game_genres').get().n;
  const withGenre = db.prepare('SELECT COUNT(*) AS n FROM game_genres WHERE genre IS NOT NULL').get().n;
  const owned = db.prepare(
    "SELECT COUNT(DISTINCT match_game_id) AS n FROM library WHERE status='match' AND match_game_id IS NOT NULL",
  ).get().n;
  const ownedFetched = db.prepare(`
    SELECT COUNT(DISTINCT l.match_game_id) AS n FROM library l
    JOIN game_genres gg ON gg.game_id = l.match_game_id
    WHERE l.status='match' AND l.match_game_id IS NOT NULL`).get().n;
  return { games, fetched, withGenre, owned, ownedFetched };
}

// Major-genre chips with counts. `owned` restricts to games in the collection.
export function genreFacets({ owned = false } = {}) {
  const rows = owned
    ? db.prepare(`
        SELECT g.genre_major AS genre, COUNT(DISTINCT g.id) AS n FROM games g
        JOIN library l ON l.match_game_id = g.id AND l.status = 'match'
        WHERE g.genre_major IS NOT NULL GROUP BY g.genre_major`).all()
    : db.prepare('SELECT genre_major AS genre, COUNT(*) AS n FROM games WHERE genre_major IS NOT NULL GROUP BY genre_major').all();
  return rows.map((r) => ({ genre: r.genre, count: r.n })).sort((a, b) => b.count - a.count);
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
  INSERT INTO library(path, inner_path, size, mtime, ext, console_id, md5, status, match_game_id, scanned_at, message, region, langs)
  VALUES(@path, @inner_path, @size, @mtime, @ext, @console_id, @md5, @status, @match_game_id, @scanned_at, @message, @region, @langs)
  ON CONFLICT(path, inner_path) DO UPDATE SET
    size = excluded.size, mtime = excluded.mtime, ext = excluded.ext,
    console_id = excluded.console_id, md5 = excluded.md5, status = excluded.status,
    match_game_id = excluded.match_game_id, scanned_at = excluded.scanned_at, message = excluded.message,
    region = excluded.region, langs = excluded.langs
`);

// The region/language tags describe the ROM, so an archive member is judged by
// its own entry name — "pack.zip" says nothing, "Sonic (Japan).md" does.
export function tagsForLibraryRow(path, innerPath) {
  return packTags(parseRomTags(innerPath || path || ''));
}

export function upsertLibraryItem(row) {
  const tags = tagsForLibraryRow(row.path, row.inner_path);
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
    region: tags.region,
    langs: tags.langs,
  });
}

// Fill in region/langs for rows written before this feature existed. Pure string
// work over names we already have, so it is cheap enough to run at boot — but
// only for rows that were never parsed (region IS NULL), unless the parser
// itself changed, in which case every stored value is re-derived.
export function backfillLibraryTags({ limit = 200000 } = {}) {
  const stale = Number(getSetting('tagParserVersion', 0)) !== TAG_PARSER_VERSION;
  const where = stale ? '' : 'WHERE region IS NULL ';
  const rows = db.prepare(`SELECT path, inner_path FROM library ${where}LIMIT ?`).all(limit);
  if (!rows.length) return 0;
  const upd = db.prepare('UPDATE library SET region = ?, langs = ? WHERE path = ? AND inner_path = ?');
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const tags = tagsForLibraryRow(r.path, r.inner_path);
      upd.run(tags.region, tags.langs, r.path, r.inner_path);
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.length;
}
const getLibraryItemStmt = db.prepare('SELECT * FROM library WHERE path = ? AND inner_path = ?');
export function getLibraryItem(path, inner = '') { return getLibraryItemStmt.get(path, inner); }

// Is this archive already fully scanned and unchanged? All its members share the
// archive's mtime, so one persisted row at the same mtime means the container
// hasn't changed since — used by the "skip already-collected files" scan option
// to avoid re-listing untouched archives.
const archiveUnchangedStmt = db.prepare(
  "SELECT 1 FROM library WHERE path = ? AND mtime = ? AND status IN ('match','no_match','needs_rahasher','unsupported','ambiguous','error') LIMIT 1",
);
export function libraryArchiveUnchanged(path, mtime) {
  return !!archiveUnchangedStmt.get(path, Math.round(mtime));
}

// The effective region/language of a collection row. RetroAchievements' own ROM
// name wins whenever we have it: the file matched by hash, so it IS that dump —
// however the user named the file. The filename is only the fallback, which is
// all there is for a file RetroAchievements does not know at all. The two fields
// fall back independently, so an RA name without a language list can still be
// complemented by the languages stated in the filename.
const EFF_REGION = "COALESCE(NULLIF(hn.region,''), COALESCE(l.region,''))";
const EFF_LANGS = "COALESCE(NULLIF(hn.langs,''), COALESCE(l.langs,''))";
const HN_JOIN = 'LEFT JOIN hash_names hn ON hn.md5 = l.md5';

// A priority token ("JP" or "L:ja") against the comma-joined values. The
// sentinel 'NONE' selects rows with no tags at all — exactly the ones a region
// filter would otherwise hide without explanation.
const NO_TAGS = 'NONE';
function tagFilterSql(token) {
  if (token === NO_TAGS) return { sql: ` AND ${EFF_REGION} = '' AND ${EFF_LANGS} = ''`, params: [] };
  if (String(token).startsWith('L:')) {
    return { sql: ` AND (',' || ${EFF_LANGS} || ',') LIKE ?`, params: [`%,${String(token).slice(2)},%`] };
  }
  return { sql: ` AND (',' || ${EFF_REGION} || ',') LIKE ?`, params: [`%,${token},%`] };
}

// A genre token against the comma-joined `games.genre` of the matched game.
function genreFilterSql(genre) {
  return { sql: " AND (', ' || COALESCE(g.genre,'') || ', ') LIKE ?", params: [`%, ${genre}, %`] };
}

export function getLibrary({ status, console_id, q, tag, genre, major, limit = 1000, offset = 0 } = {}) {
  let sql = `
    SELECT l.*, g.title AS match_title, g.image_icon AS match_image,
           g.num_achievements AS match_achievements, g.points AS match_points,
           g.genre AS match_genre, g.genre_major AS match_genre_major,
           c.name AS console_name, c.short_code AS console_short,
           hn.region AS ra_region, hn.langs AS ra_langs, hn.rom_name AS ra_rom_name
    FROM library l
    LEFT JOIN games g ON g.id = l.match_game_id
    LEFT JOIN consoles c ON c.id = l.console_id
    ${HN_JOIN}
    WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND l.console_id = ?'; params.push(console_id); }
  if (q) { sql += ' AND (l.path LIKE ? OR l.inner_path LIKE ? OR g.title LIKE ?)'; const like = `%${q}%`; params.push(like, like, like); }
  if (tag) { const f = tagFilterSql(tag); sql += f.sql; params.push(...f.params); }
  if (genre) { const f = genreFilterSql(genre); sql += f.sql; params.push(...f.params); }
  if (major) { sql += ' AND g.genre_major = ?'; params.push(major); }
  sql += ' ORDER BY l.scanned_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  return db.prepare(sql).all(...params);
}

// Which region/language tokens actually occur in the collection, with counts —
// the filter chips are built from this, so nobody is offered a region they don't
// own. Honours the same status/system filters as the list itself. `verified`
// counts the rows whose tags come from RetroAchievements rather than a filename.
export function libraryTagFacets({ status, console_id } = {}) {
  // Aliases must NOT be called region/langs — both `library` and `hash_names`
  // have columns of those names, and SQLite would call the GROUP BY ambiguous.
  let sql = `SELECT ${EFF_REGION} AS eff_region, ${EFF_LANGS} AS eff_langs,
                    CASE WHEN NULLIF(hn.region,'') IS NOT NULL OR NULLIF(hn.langs,'') IS NOT NULL THEN 1 ELSE 0 END AS verified,
                    COUNT(*) AS n
             FROM library l ${HN_JOIN} WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND l.console_id = ?'; params.push(console_id); }
  sql += ' GROUP BY eff_region, eff_langs, verified';

  const regions = new Map();
  const languages = new Map();
  let untagged = 0;
  let verified = 0;
  let total = 0;
  for (const row of db.prepare(sql).all(...params)) {
    const n = row.n;
    total += n;
    if (row.verified) verified += n;
    const rs = row.eff_region ? row.eff_region.split(',').filter(Boolean) : [];
    const ls = row.eff_langs ? row.eff_langs.split(',').filter(Boolean) : [];
    if (!rs.length && !ls.length) untagged += n;
    for (const r of rs) regions.set(r, (regions.get(r) ?? 0) + n);
    for (const l of ls) languages.set(l, (languages.get(l) ?? 0) + n);
  }
  const sort = (m) => [...m.entries()].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n || a.code.localeCompare(b.code));
  return { regions: sort(regions), languages: sort(languages), untagged, verified, total };
}

// Sub-genre chips: the raw RetroAchievements tokens minus the ones that are a
// major genre themselves (those are the BY GENRE box). `major` narrows the list
// to the subgenres of the currently selected major genre.
export function libraryGenreFacets({ status, console_id, major } = {}) {
  // The alias must NOT be called `genre` — `games.genre` exists, and SQLite
  // resolves GROUP BY against the table column first, which would group by the
  // raw string instead of the expression.
  let sql = `SELECT COALESCE(g.genre,'') AS sub_genre, COUNT(*) AS n
             FROM library l LEFT JOIN games g ON g.id = l.match_game_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND l.console_id = ?'; params.push(console_id); }
  if (major) { sql += ' AND g.genre_major = ?'; params.push(major); }
  sql += ' GROUP BY sub_genre';

  const counts = new Map();
  let unknown = 0;
  let total = 0;
  for (const row of db.prepare(sql).all(...params)) {
    total += row.n;
    const list = String(row.sub_genre).split(',').map((s) => s.trim())
      .filter((s) => s && !isMajorGenre(s));
    if (!list.length) { unknown += row.n; continue; }
    for (const gname of list) counts.set(gname, (counts.get(gname) ?? 0) + row.n);
  }
  const genres = [...counts.entries()].map(([genre, n]) => ({ genre, n }))
    .sort((a, b) => a.genre.localeCompare(b.genre));
  return { genres, unknown, total };
}

// The same, on the normalized major genre — one chip per documented genre.
export function libraryMajorGenreFacets({ status, console_id } = {}) {
  let sql = `SELECT COALESCE(g.genre_major,'') AS major_genre, COUNT(*) AS n
             FROM library l LEFT JOIN games g ON g.id = l.match_game_id
             WHERE 1=1`;
  const params = [];
  if (status) { sql += ' AND l.status = ?'; params.push(status); }
  if (console_id != null) { sql += ' AND l.console_id = ?'; params.push(console_id); }
  sql += ' GROUP BY major_genre';

  const genres = [];
  let unknown = 0;
  let total = 0;
  for (const row of db.prepare(sql).all(...params)) {
    total += row.n;
    if (!row.major_genre) { unknown += row.n; continue; }
    genres.push({ genre: row.major_genre, n: row.n });
  }
  genres.sort((a, b) => a.genre.localeCompare(b.genre));
  return { genres, unknown, total };
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
  // hash_names/game_hash_sync go too: this is the explicit "clean slate" action,
  // and leaving fetched ROM names behind would mean regions still shown for a
  // database the user just emptied. They are re-fetched by the enrichment job.
  const counts = wipeTables(['games', 'hashes', 'console_sync', 'hash_names', 'game_hash_sync', 'game_genres']);
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

// Basename of a DAT rom_name (they occasionally carry a subfolder prefix).
function romBase(name) {
  if (!name) return '';
  const s = String(name);
  const i = Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'));
  return (i >= 0 ? s.slice(i + 1) : s).toLowerCase();
}

// Snapshot the collection's hashes as membership sets. A DAT entry counts as
// "have" if ANY of its hashes matches (crc primary, md5/sha1 fallback for DATs
// that carry only those), and as a last resort by rom filename + exact size.
export function libraryHashSets() {
  const crc = new Set(), md5 = new Set(), sha1 = new Set(), nameSize = new Set();
  const rows = db.prepare(
    'SELECT path, inner_path, size, crc, raw_md5, raw_sha1 FROM library WHERE crc IS NOT NULL OR raw_md5 IS NOT NULL OR raw_sha1 IS NOT NULL',
  ).all();
  for (const r of rows) {
    if (r.crc) crc.add(r.crc);
    if (r.raw_md5) md5.add(r.raw_md5);
    if (r.raw_sha1) sha1.add(r.raw_sha1);
    if (r.size != null) nameSize.add(romBase(r.inner_path || r.path) + '|' + r.size);
  }
  return { crc, md5, sha1, nameSize };
}

export function entryMatches(e, sets) {
  if (e.crc && sets.crc.has(e.crc)) return true;
  if (e.md5 && sets.md5.has(e.md5)) return true;
  if (e.sha1 && sets.sha1.has(e.sha1)) return true;
  // Name+size fallback only for entries with no usable hash of their own.
  if (!e.crc && !e.md5 && !e.sha1 && e.rom_name && e.size != null) {
    return sets.nameSize.has(romBase(e.rom_name) + '|' + e.size);
  }
  return false;
}

// One row per DAT with a live "have" count against the collection (crc + md5 +
// sha1 + name/size fallback).
export function listDats() {
  const rows = db.prepare('SELECT id, name, description, version, console_id, game_count, imported_at FROM dat_files ORDER BY imported_at DESC').all();
  const sets = libraryHashSets();
  const entryStmt = db.prepare('SELECT rom_name, size, crc, md5, sha1 FROM dat_entries WHERE dat_id = ?');
  return rows.map((r) => {
    const entries = entryStmt.all(r.id);
    let have = 0;
    for (const e of entries) if (entryMatches(e, sets)) have++;
    return { ...r, total: entries.length, have };
  });
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
  const entries = db.prepare('SELECT game_name, rom_name, size, crc, md5, sha1 FROM dat_entries WHERE dat_id = ?').all(id);
  const sets = libraryHashSets();
  let have = 0;
  const missing = [];
  for (const e of entries) {
    if (entryMatches(e, sets)) have++;
    else if (missing.length < missingLimit) missing.push({ game: e.game_name, rom: e.rom_name, crc: e.crc, sha1: e.sha1, size: e.size });
  }
  return { dat, total: entries.length, have, missing, missingTotal: entries.length - have, collectionCrcCount: sets.crc.size };
}

// "Extra / unknown" dumps: collection files whose hash is in NO imported DAT —
// bad dumps, hacks, or systems you haven't imported a DAT for yet. Only files
// that actually carry a hash (ran through the CRC pass) are considered.
export function datExtras({ limit = 5000 } = {}) {
  const datCrc = new Set(db.prepare('SELECT DISTINCT crc FROM dat_entries WHERE crc IS NOT NULL').all().map((r) => r.crc));
  const datMd5 = new Set(db.prepare('SELECT DISTINCT md5 FROM dat_entries WHERE md5 IS NOT NULL').all().map((r) => r.md5));
  const datSha1 = new Set(db.prepare('SELECT DISTINCT sha1 FROM dat_entries WHERE sha1 IS NOT NULL').all().map((r) => r.sha1));
  const rows = db.prepare(
    "SELECT path, inner_path, size, crc, raw_md5, raw_sha1 FROM library WHERE (crc IS NOT NULL OR raw_md5 IS NOT NULL OR raw_sha1 IS NOT NULL) AND status IN ('match','no_match') ORDER BY path",
  ).all();
  const extras = [];
  let total = 0;
  for (const r of rows) {
    const known = (r.crc && datCrc.has(r.crc)) || (r.raw_md5 && datMd5.has(r.raw_md5)) || (r.raw_sha1 && datSha1.has(r.raw_sha1));
    if (known) continue;
    total++;
    if (extras.length < limit) extras.push({ path: r.path, inner: r.inner_path || '', size: r.size, crc: r.crc, sha1: r.raw_sha1 });
  }
  return { extras, total, datCount: db.prepare('SELECT COUNT(*) AS n FROM dat_files').get().n };
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
  // Loose files also need md5/sha1 for the fallback match, so pick them up when
  // those are still missing even if a CRC was computed by an earlier pass.
  return db.prepare(`SELECT path, inner_path, size, ext FROM library
    WHERE status IN ('match','no_match')
      AND (crc IS NULL OR ((inner_path IS NULL OR inner_path = '') AND (raw_md5 IS NULL OR raw_sha1 IS NULL)))
    ORDER BY path LIMIT ?`).all(limit);
}
export function setLibraryCrc(path, inner, crc) {
  db.prepare('UPDATE library SET crc = ? WHERE path = ? AND inner_path = ?').run(crc, path, inner ?? '');
}
// Store whichever of crc/md5/sha1 were computed (loose files get all three;
// archive members get crc only, read from the container directory). The raw
// md5/sha1 go to raw_md5/raw_sha1 — library.md5 is the RA hash, not this.
export function setLibraryHashes(path, inner, { crc = null, md5 = null, sha1 = null } = {}) {
  db.prepare(`UPDATE library SET
      crc      = COALESCE(?, crc),
      raw_md5  = COALESCE(?, raw_md5),
      raw_sha1 = COALESCE(?, raw_sha1)
    WHERE path = ? AND inner_path = ?`).run(crc, md5, sha1, path, inner ?? '');
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
  // Games without a fetched genre go last instead of leading the list.
  genre: "CASE WHEN genre_major IS NULL OR genre_major = '' THEN 1 ELSE 0 END, genre_major COLLATE NOCASE, title COLLATE NOCASE",
};
export function getGamesByConsole(consoleId, { q, limit = 120, offset = 0, sort } = {}) {
  let sql = 'SELECT id, console_id, title, image_icon, num_achievements, points, num_leaderboards, genre, genre_major FROM games WHERE console_id = ?';
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
      SELECT g.id, g.console_id, g.title, g.image_icon, g.num_achievements, g.points, g.genre, g.genre_major,
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
  return db.prepare(`
    SELECT l.path, l.inner_path, l.size, l.md5, l.region, l.langs,
           hn.region AS ra_region, hn.langs AS ra_langs, hn.rom_name AS ra_rom_name
    FROM library l ${HN_JOIN}
    WHERE l.match_game_id = ? AND l.status='match' ORDER BY l.path`).all(gameId);
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
