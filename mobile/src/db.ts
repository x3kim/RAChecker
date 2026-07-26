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
  `);
  return d;
}

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!dbP) dbP = open();
  return dbP;
}

export async function initDb(): Promise<void> { await db(); }

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

export async function dbStats(): Promise<{ games: number; hashes: number; consoles: number }> {
  const d = await db();
  const g = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM games');
  const h = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM hashes');
  const c = await d.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_state');
  return { games: g?.n ?? 0, hashes: h?.n ?? 0, consoles: c?.n ?? 0 };
}

export async function clearDb(): Promise<void> {
  const d = await db();
  await d.execAsync('DELETE FROM hashes; DELETE FROM games; DELETE FROM sync_state;');
}
