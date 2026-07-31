// Syncs the RetroAchievements hash database into the local SQLite cache.
// One API call per console mirrors every game + hash; matching is then offline.
// Re-syncs only when a console's cache is older than the TTL (default 90 days).
import { getConsoleIDs, getGameList, getGameHashes } from './ra-api.js';
import {
  upsertConsole, replaceConsoleGames, recordSync, getConsoleSync,
  getConsoles, getSetting, setSetting, enrichHash, restoreHashNames,
  markGameHashesFetched, gamesNeedingHashNames, hashNameStats,
} from './db.js';
import { CONSOLE_BY_ID } from './consoles.js';
import { config } from './config.js';

function ttlMs() { return config.hashCacheTtlDays * 24 * 60 * 60 * 1000; }

function shortFromIconUrl(url) {
  const m = /\/system\/([^/]+)\.png/i.exec(url || '');
  return m ? m[1] : null;
}

export function consoleNeedsSync(consoleId, now = Date.now()) {
  const s = getConsoleSync(consoleId);
  if (!s || !s.synced_at) return true;
  if (s.status !== 'ok') return true;
  return now - s.synced_at > ttlMs();
}

// Pull the console list and merge with our hashing metadata.
export async function syncConsoles() {
  const list = await getConsoleIDs({ activeOnly: true, gameSystemsOnly: true });
  for (const c of list) {
    const meta = CONSOLE_BY_ID.get(c.ID);
    upsertConsole({
      id: c.ID,
      name: c.Name,
      short_code: meta?.short ?? shortFromIconUrl(c.IconURL),
      icon_url: c.IconURL,
      active: c.Active !== false,
      is_game_system: c.IsGameSystem !== false,
      hash_method: meta?.method ?? 'unknown',
    });
  }
  const added = recordConsoleFirstSeen(list.map((c) => c.ID));
  setSetting('consolesSyncedAt', Date.now());
  return { count: list.length, added };
}

// ---- "newly supported systems" bookkeeping --------------------------------
// RA keeps adding systems (GameCube 2024, Wii 2026 …). We can't know when RA
// added one, but we can record when *we* first saw it, so a later sync can tell
// the user "this system is new since your last sync". The very first sync only
// seeds the map — everything is "new" then, which would be noise.
function recordConsoleFirstSeen(ids) {
  const seen = getSetting('consoleFirstSeen', null);
  const now = Date.now();
  if (!seen || typeof seen !== 'object' || !Object.keys(seen).length) {
    const seed = {};
    for (const id of ids) seed[id] = now;
    setSetting('consoleFirstSeen', seed);
    setSetting('consoleSeenSeededAt', now);
    return [];
  }
  const added = [];
  const next = { ...seen };
  for (const id of ids) {
    if (next[id] == null) { next[id] = now; added.push(id); }
  }
  if (added.length) setSetting('consoleFirstSeen', next);
  return added;
}

// Systems first seen within the last `sinceDays`, newest first. Empty until a
// second sync has actually observed something new.
export function newlySupportedSystems({ sinceDays = 180 } = {}) {
  const seen = getSetting('consoleFirstSeen', null) || {};
  const seededAt = getSetting('consoleSeenSeededAt', null);
  const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
  const byId = new Map(getConsoles().map((c) => [c.id, c]));
  const rows = Object.entries(seen)
    .map(([id, at]) => ({ id: Number(id), firstSeenAt: Number(at) }))
    // Seeded entries share the seed timestamp and aren't genuinely "new".
    .filter((r) => r.firstSeenAt >= cutoff && (!seededAt || r.firstSeenAt > seededAt))
    .map((r) => {
      const c = byId.get(r.id);
      return {
        ...r,
        name: c?.name ?? `System ${r.id}`,
        short: c?.short_code ?? null,
        hashMethod: c?.hash_method ?? 'unknown',
        supported: CONSOLE_BY_ID.has(r.id),   // do we know how to hash it?
      };
    })
    .sort((a, b) => b.firstSeenAt - a.firstSeenAt);
  return { seededAt, systems: rows };
}

// Sync one console's game+hash set (bulk endpoint).
export async function syncConsoleHashes(consoleId, { force = false } = {}) {
  if (!force && !consoleNeedsSync(consoleId)) {
    const s = getConsoleSync(consoleId);
    return { skipped: true, gameCount: s.game_count, hashCount: s.hash_count };
  }
  try {
    const games = await getGameList(consoleId, { withHashes: true, onlyWithAchievements: true });
    const { gameCount, hashCount } = replaceConsoleGames(consoleId, games);
    // replaceConsoleGames rebuilt the hash rows from scratch — put the ROM names
    // we already fetched back on them, or a re-sync would silently undo hours of
    // enrichment (and with it every verified region).
    restoreHashNames();
    recordSync({ consoleId, syncedAt: Date.now(), gameCount, hashCount, status: 'ok' });
    return { skipped: false, gameCount, hashCount };
  } catch (e) {
    recordSync({ consoleId, syncedAt: Date.now(), status: 'error', message: String(e.message).slice(0, 200) });
    throw e;
  }
}

// Full sync across all game-system consoles, with progress callbacks.
export async function syncAll({ force = false, onProgress = () => {}, consoleIds = null } = {}) {
  await syncConsoles();
  let consoles = getConsoles().filter((c) => c.is_game_system);
  if (consoleIds) {
    const want = new Set(consoleIds);
    consoles = consoles.filter((c) => want.has(c.id));
  }
  const total = consoles.length;
  let done = 0;
  const summary = { total, synced: 0, skipped: 0, errors: 0, hashCount: 0, gameCount: 0 };

  for (const c of consoles) {
    onProgress({ phase: 'console', consoleId: c.id, name: c.name, short: c.short_code, done, total });
    try {
      const r = await syncConsoleHashes(c.id, { force });
      if (r.skipped) summary.skipped++; else summary.synced++;
      summary.hashCount += r.hashCount || 0;
      summary.gameCount += r.gameCount || 0;
    } catch {
      summary.errors++;
    }
    done++;
    onProgress({ phase: 'console-done', consoleId: c.id, name: c.name, short: c.short_code, done, total });
  }
  setSetting('lastFullSyncAt', Date.now());
  onProgress({ phase: 'done', ...summary, done: total, total });
  return summary;
}

// Enrich a single game's hashes with rom names + labels. Called on demand when a
// game detail is opened, and in bulk by enrichHashNames() below.
export async function enrichGameHashes(gameId, { intervalMs } = {}) {
  const res = await getGameHashes(gameId, { intervalMs });
  const results = res?.Results || [];
  for (const r of results) {
    enrichHash({ md5: r.MD5, rom_name: r.Name, labels: r.Labels, patch_url: r.PatchUrl });
  }
  // Marked even when a game returns nothing, so the job never asks again.
  markGameHashesFetched(gameId, results.length);
  return results;
}

// ---- bulk hash-name enrichment --------------------------------------------
// The ROM name is what makes a region trustworthy: a file matched by hash IS the
// dump RetroAchievements names here, whatever it is called on disk. There is no
// bulk endpoint, so this is one call per game — cheap individually (~39 ms) but
// worth pacing, hence its own interval. Fully resumable: every finished game is
// recorded, so a cancelled run continues where it stopped.
export const HASHNAME_INTERVAL_MS = 250;

/**
 * @param {'collection'|'all'} scope 'collection' = only games you own a file for
 */
export async function enrichHashNames({ scope = 'collection', onProgress = () => {}, signal } = {}) {
  const ids = gamesNeedingHashNames(scope);
  const total = ids.length;
  const summary = { scope, total, done: 0, hashes: 0, errors: 0, cancelled: false };
  onProgress({ phase: 'start', ...summary, ...hashNameStats() });

  for (const gameId of ids) {
    if (signal?.aborted) { summary.cancelled = true; break; }
    try {
      const results = await enrichGameHashes(gameId, { intervalMs: HASHNAME_INTERVAL_MS });
      summary.hashes += results.length;
    } catch {
      // A single game failing must not end the run — it stays unmarked and is
      // retried the next time the job runs.
      summary.errors++;
    }
    summary.done++;
    onProgress({ phase: 'progress', ...summary, gameId });
  }
  onProgress({ phase: 'done', ...summary, ...hashNameStats() });
  return summary;
}
