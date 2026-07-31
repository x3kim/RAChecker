// On-device hash database (expo-sqlite). Synced from the RA Web API: games +
// their MD5 hashes per console. Scanning matches a ROM's md5 against this — the
// standalone equivalent of the desktop's local hash DB.
import * as SQLite from 'expo-sqlite';

let dbP: Promise<SQLite.SQLiteDatabase> | null = null;

// Open + ensure the schema exists on the very first access, so any query (scan
// match, stats) is safe even before the user has visited the Hash DB tab.
async function open(): Promise<SQLite.SQLiteDatabase> {
  const d = await SQLite.openDatabaseAsync('rachecker.db');
  await d.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY,
      console_id INTEGER,
      title TEXT,
      points INTEGER,
      num_achievements INTEGER,
      image_icon TEXT
    );
    CREATE TABLE IF NOT EXISTS hashes (
      md5 TEXT PRIMARY KEY,
      game_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_hashes_game ON hashes(game_id);
    CREATE TABLE IF NOT EXISTS sync_state (
      console_id INTEGER PRIMARY KEY,
      synced_at INTEGER,
      game_count INTEGER,
      hash_count INTEGER
    );
    CREATE TABLE IF NOT EXISTS library (
      md5 TEXT PRIMARY KEY,
      name TEXT,
      game_id INTEGER,
      console_id INTEGER,
      scanned_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_library_scanned ON library(scanned_at);

    -- Official ROM names from API_GetGameHashes, keyed by hash. A file that
    -- matched IS the dump named here, so this beats the phone's filename for
    -- region/language. Kept in its own table so a console re-sync (which wipes
    -- the hashes table) does not throw the names away.
    CREATE TABLE IF NOT EXISTS hash_names (
      md5 TEXT PRIMARY KEY,
      rom_name TEXT,
      region TEXT,
      langs TEXT,
      fetched_at INTEGER
    );
    -- One row per game already asked about, so the job never repeats itself.
    CREATE TABLE IF NOT EXISTS game_hash_sync (
      game_id INTEGER PRIMARY KEY,
      fetched_at INTEGER
    );
  `);
  return d;
}

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbP) dbP = open();
  return dbP;
}

export async function initDb(): Promise<void> { await db(); }

// The hash DB also stores games that have no achievement set (so a scan can tell
// "no set yet" from "unknown dump"). Everywhere the UI talks about *games*, it
// means games you can earn achievements in — hence the num_achievements filter.
const HAS_ACHIEVEMENTS = 'num_achievements > 0';


// Replace all games+hashes for one console (a fresh sync of that system).
export async function replaceConsole(consoleId: number, games: any[]): Promise<{ gameCount: number; hashCount: number }> {
  const d = await db();
  let hashCount = 0;
  await d.withTransactionAsync(async () => {
    await d.runAsync('DELETE FROM hashes WHERE game_id IN (SELECT id FROM games WHERE console_id = ?)', consoleId);
    await d.runAsync('DELETE FROM games WHERE console_id = ?', consoleId);
    const gStmt = await d.prepareAsync('INSERT OR REPLACE INTO games(id,console_id,title,points,num_achievements,image_icon) VALUES(?,?,?,?,?,?)');
    const hStmt = await d.prepareAsync('INSERT OR REPLACE INTO hashes(md5,game_id) VALUES(?,?)');
    try {
      for (const g of games) {
        await gStmt.executeAsync([g.ID, consoleId, g.Title ?? '', g.Points ?? 0, g.NumAchievements ?? 0, g.ImageIcon ?? null]);
        for (const h of g.Hashes || []) {
          await hStmt.executeAsync([String(h).toLowerCase(), g.ID]);
          hashCount++;
        }
      }
    } finally {
      await gStmt.finalizeAsync();
      await hStmt.finalizeAsync();
    }
    await d.runAsync('INSERT OR REPLACE INTO sync_state(console_id,synced_at,game_count,hash_count) VALUES(?,?,?,?)',
      consoleId, Date.now(), games.length, hashCount);
  });
  return { gameCount: games.length, hashCount };
}

export type MatchGame = { id: number; title: string; points: number; num_achievements: number; image_icon: string | null; console_id: number };

export async function lookupHash(md5: string): Promise<MatchGame | null> {
  const d = await db();
  const row = await d.getFirstAsync<MatchGame>(
    `SELECT g.id, g.title, g.points, g.num_achievements, g.image_icon, g.console_id
       FROM hashes h JOIN games g ON g.id = h.game_id WHERE h.md5 = ?`,
    md5.toLowerCase(),
  );
  return row ?? null;
}

// Consoles whose hash list has been pulled at least once. Lets the scanner say
// "this system isn't synced yet" instead of the misleading "no match".
export async function getSyncedConsoles(): Promise<Set<number>> {
  const d = await db();
  const rows = await d.getAllAsync<{ console_id: number }>('SELECT console_id FROM sync_state');
  return new Set(rows.map((r) => r.console_id));
}

// Counts shown in the UI. The DB also stores games that have no achievement set
// (that's what lets a scan say "no set yet"), but those are not what a user means
// by "games" — and counting them made the phone's numbers disagree with the
// desktop's for the same account. Both now report games you can earn achievements
// in, and the hashes belonging to them.
export async function dbStats(): Promise<{ games: number; hashes: number; consoles: number }> {
  const d = await db();
  const g = await d.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM games WHERE ${HAS_ACHIEVEMENTS}`);
  const h = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM hashes h JOIN games g ON g.id = h.game_id WHERE g.num_achievements > 0`);
  const c = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_state');
  return { games: g?.n ?? 0, hashes: h?.n ?? 0, consoles: c?.n ?? 0 };
}

export async function clearDb(): Promise<void> {
  const d = await db();
  // hash_names/game_hash_sync go too — this is the explicit "clean slate", and
  // keeping fetched ROM names would still show regions for an emptied database.
  await d.execAsync('DELETE FROM hashes; DELETE FROM games; DELETE FROM sync_state; DELETE FROM hash_names; DELETE FROM game_hash_sync;');
}

// ---- games browser --------------------------------------------------------
export async function searchGames(q: string, limit = 150): Promise<MatchGame[]> {
  const d = await db();
  const sel = `SELECT id, title, points, num_achievements, image_icon, console_id FROM games WHERE ${HAS_ACHIEVEMENTS}`;
  if (q.trim()) {
    return d.getAllAsync<MatchGame>(`${sel} AND title LIKE ? ORDER BY points DESC LIMIT ?`, `%${q.trim()}%`, limit);
  }
  return d.getAllAsync<MatchGame>(`${sel} ORDER BY points DESC LIMIT ?`, limit);
}

// Systems that have synced games, with a game count each (drives the Games
// system picker, desktop-style).
export async function getConsolesWithCounts(): Promise<{ console_id: number; count: number }[]> {
  const d = await db();
  return d.getAllAsync<{ console_id: number; count: number }>(
    `SELECT console_id, COUNT(*) AS count FROM games WHERE ${HAS_ACHIEVEMENTS} GROUP BY console_id ORDER BY count DESC`);
}

const GAME_SORTS: Record<string, string> = {
  points: 'points DESC, title ASC',
  achievements: 'num_achievements DESC, title ASC',
  title: 'title ASC',
};
export async function getGamesByConsole(consoleId: number, opts: { q?: string; sort?: string; limit?: number } = {}): Promise<MatchGame[]> {
  const d = await db();
  const order = GAME_SORTS[opts.sort ?? 'points'] ?? GAME_SORTS.points;
  const sel = `SELECT id, title, points, num_achievements, image_icon, console_id FROM games WHERE ${HAS_ACHIEVEMENTS} AND console_id = ?`;
  const limit = opts.limit ?? 800;
  if (opts.q?.trim()) {
    return d.getAllAsync<MatchGame>(`${sel} AND title LIKE ? ORDER BY ${order} LIMIT ?`, consoleId, `%${opts.q.trim()}%`, limit);
  }
  return d.getAllAsync<MatchGame>(`${sel} ORDER BY ${order} LIMIT ?`, consoleId, limit);
}

// Bulk-load every synced game for a set of consoles (for the Discover free-games
// resolver — one query instead of hundreds).
export async function getGamesForConsoles(ids: number[]): Promise<MatchGame[]> {
  if (!ids.length) return [];
  const d = await db();
  const ph = ids.map(() => '?').join(',');
  return d.getAllAsync<MatchGame>(
    `SELECT id, title, points, num_achievements, image_icon, console_id FROM games WHERE ${HAS_ACHIEVEMENTS} AND console_id IN (${ph})`,
    ...ids);
}

// Resolve a free/homebrew game (title + console) to a synced RA game so Discover
// can show its artwork/achievements and open the detail modal, like the desktop.
export async function resolveGameByTitle(title: string, consoleId: number): Promise<MatchGame | null> {
  const d = await db();
  const sel = `SELECT id, title, points, num_achievements, image_icon, console_id FROM games WHERE ${HAS_ACHIEVEMENTS} AND console_id = ?`;
  const exact = await d.getFirstAsync<MatchGame>(`${sel} AND lower(title) = lower(?) LIMIT 1`, consoleId, title);
  if (exact) return exact;
  return d.getFirstAsync<MatchGame>(`${sel} AND title LIKE ? ORDER BY num_achievements DESC LIMIT 1`, consoleId, `${title}%`);
}

// ---- collection insights (coverage) ---------------------------------------
export type CollectionInsights = {
  files: number; matched: number; achievements: number; points: number;
  bySystem: { console_id: number; files: number; matched: number }[];
};
export async function collectionInsights(): Promise<CollectionInsights> {
  const d = await db();
  // "matched" means the file earns achievements — a hash that resolves to a game
  // with no set doesn't count towards coverage.
  const tot = await d.getFirstAsync<{ files: number; matched: number }>(
    `SELECT COUNT(*) AS files,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM games g WHERE g.id = l.game_id AND g.num_achievements > 0) THEN 1 ELSE 0 END) AS matched
       FROM library l`);
  const sums = await d.getFirstAsync<{ ach: number; pts: number }>(
    `SELECT COALESCE(SUM(g.num_achievements),0) AS ach, COALESCE(SUM(g.points),0) AS pts
       FROM (SELECT DISTINCT game_id FROM library WHERE game_id IS NOT NULL) dg
       JOIN games g ON g.id = dg.game_id`);
  const bySystem = await d.getAllAsync<{ console_id: number; files: number; matched: number }>(
    `SELECT l.console_id, COUNT(*) AS files,
            SUM(CASE WHEN EXISTS (SELECT 1 FROM games g WHERE g.id = l.game_id AND g.num_achievements > 0) THEN 1 ELSE 0 END) AS matched
       FROM library l WHERE l.console_id IS NOT NULL GROUP BY l.console_id ORDER BY files DESC`);
  return {
    files: tot?.files ?? 0, matched: tot?.matched ?? 0,
    achievements: sums?.ach ?? 0, points: sums?.pts ?? 0, bySystem,
  };
}

// ---- official ROM names (authoritative region source) ---------------------
export type HashName = { md5: string; rom_name: string | null; region: string; langs: string };

// Games whose hashes we have not asked RetroAchievements about yet, limited to
// the ones your own collection actually matched — the phone never grinds
// through the whole database.
export async function gamesNeedingHashNames(): Promise<number[]> {
  const d = await db();
  const rows = await d.getAllAsync<{ game_id: number }>(
    `SELECT DISTINCT l.game_id FROM library l
      WHERE l.game_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM game_hash_sync s WHERE s.game_id = l.game_id)`);
  return rows.map((r) => r.game_id);
}

export async function saveHashNames(
  gameId: number,
  entries: { md5: string; rom_name: string | null; region: string; langs: string }[],
): Promise<void> {
  const d = await db();
  await d.withTransactionAsync(async () => {
    const stmt = await d.prepareAsync(
      'INSERT OR REPLACE INTO hash_names(md5,rom_name,region,langs,fetched_at) VALUES(?,?,?,?,?)');
    try {
      const now = Date.now();
      for (const e of entries) {
        if (!e.md5) continue;
        await stmt.executeAsync([e.md5.toLowerCase(), e.rom_name, e.region, e.langs, now]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
    // Recorded even when a game returns nothing, so it is never asked twice.
    await d.runAsync('INSERT OR REPLACE INTO game_hash_sync(game_id,fetched_at) VALUES(?,?)', gameId, Date.now());
  });
}

export async function hashNameCount(): Promise<number> {
  const d = await db();
  const r = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM hash_names');
  return r?.n ?? 0;
}

// ---- persistent collection (ROMs you've hashed) ---------------------------
export type LibraryRow = { name: string; md5: string; match: MatchGame | null; raRegion?: string; raLangs?: string };

export async function upsertLibrary(rows: { md5: string; name: string; gameId: number | null; consoleId: number | null }[]): Promise<void> {
  if (!rows.length) return;
  const d = await db();
  await d.withTransactionAsync(async () => {
    const stmt = await d.prepareAsync('INSERT OR REPLACE INTO library(md5,name,game_id,console_id,scanned_at) VALUES(?,?,?,?,?)');
    try {
      const base = Date.now();
      let i = 0;
      for (const r of rows) {
        if (!r.md5) continue;
        await stmt.executeAsync([r.md5, r.name, r.gameId, r.consoleId, base + i++]);
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

export async function getLibrary(limit = 2000): Promise<LibraryRow[]> {
  const d = await db();
  const rows = await d.getAllAsync<any>(
    `SELECT l.name, l.md5, g.id AS gid, g.title, g.points, g.num_achievements, g.image_icon, g.console_id,
            hn.region AS ra_region, hn.langs AS ra_langs
       FROM library l
       LEFT JOIN games g ON g.id = l.game_id
       LEFT JOIN hash_names hn ON hn.md5 = l.md5
       ORDER BY l.scanned_at DESC LIMIT ?`, limit);
  return rows.map((r) => ({
    name: r.name,
    md5: r.md5,
    raRegion: r.ra_region ?? undefined,
    raLangs: r.ra_langs ?? undefined,
    match: r.gid != null ? { id: r.gid, title: r.title, points: r.points, num_achievements: r.num_achievements, image_icon: r.image_icon, console_id: r.console_id } : null,
  }));
}

// The stored names for a set of hashes — used right after a scan so fresh rows
// pick up their verified region without a reload.
export async function getHashNames(md5s: string[]): Promise<Map<string, { region: string; langs: string }>> {
  const out = new Map<string, { region: string; langs: string }>();
  const list = md5s.filter(Boolean).map((m) => m.toLowerCase());
  if (!list.length) return out;
  const d = await db();
  const ph = list.map(() => '?').join(',');
  const rows = await d.getAllAsync<any>(`SELECT md5, region, langs FROM hash_names WHERE md5 IN (${ph})`, ...list);
  for (const r of rows) out.set(r.md5, { region: r.region ?? '', langs: r.langs ?? '' });
  return out;
}

// Distinct RA games you actually own (matched at least one file in your
// collection). Drives Quick Wins, which is about *your* games — the desktop
// builds it the same way (routes.js getPlayableGames).
export async function getOwnedGames(): Promise<MatchGame[]> {
  const d = await db();
  return d.getAllAsync<MatchGame>(
    `SELECT DISTINCT g.id, g.title, g.points, g.num_achievements, g.image_icon, g.console_id
       FROM library l JOIN games g ON g.id = l.game_id
      WHERE g.num_achievements > 0`);
}

export async function libraryStats(): Promise<{ total: number; matched: number }> {
  const d = await db();
  const t = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM library');
  const m = await d.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM library l JOIN games g ON g.id = l.game_id WHERE g.num_achievements > 0`);
  return { total: t?.n ?? 0, matched: m?.n ?? 0 };
}

export async function clearLibrary(): Promise<void> {
  const d = await db();
  await d.execAsync('DELETE FROM library;');
}

// Re-match every collection row against the (now updated) hash DB — so ROMs
// scanned before a sync light up once their console is synced. Returns matched count.
export async function rematchCollection(): Promise<number> {
  const d = await db();
  await d.runAsync(`UPDATE library SET
      game_id = (SELECT h.game_id FROM hashes h WHERE h.md5 = library.md5),
      console_id = (SELECT g.console_id FROM games g JOIN hashes h ON h.game_id = g.id WHERE h.md5 = library.md5)`);
  const r = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM library WHERE game_id IS NOT NULL');
  return r?.n ?? 0;
}
