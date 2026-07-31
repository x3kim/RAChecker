// Fetch the official ROM names for the games your scan matched, so their
// region/language comes from RetroAchievements instead of the phone's filename.
//
// A file that matched IS the dump RetroAchievements names for that hash — the
// filename cannot make that wrong, and a renamed file cannot make it unknown.
// There is no bulk endpoint for these names, so it is one call per game; the
// phone therefore only ever asks about games you actually own, never the whole
// database (that is what the desktop app is for).
import { getGameHashes } from './ra/api';
import { getCreds } from './storage';
import { gamesNeedingHashNames, saveHashNames } from './db';
import { parseRomTags, packTags } from './core';

// Same politeness pacing as the desktop background job.
const INTERVAL_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;

export type HashNameProgress = { done: number; total: number };

/**
 * Enrich every not-yet-fetched game in the collection. Safe to call after each
 * scan: it does nothing when there is nothing new, never runs twice at once, and
 * failures are swallowed — the filename stays as the fallback.
 */
export async function enrichCollectionHashNames(
  onProgress: (p: HashNameProgress) => void = () => {},
): Promise<HashNameProgress> {
  if (running) return { done: 0, total: 0 };
  const creds = await getCreds();
  const ids = creds ? await gamesNeedingHashNames() : [];
  const total = ids.length;
  if (!creds || !total) return { done: 0, total: 0 };

  running = true;
  let done = 0;
  try {
    for (const gameId of ids) {
      try {
        const res = await getGameHashes(creds, gameId);
        const entries = (res?.Results ?? []).map((r) => {
          const tags = packTags(parseRomTags(r.Name ?? ''));
          return { md5: r.MD5, rom_name: r.Name ?? null, region: tags.region, langs: tags.langs };
        });
        await saveHashNames(gameId, entries);
      } catch {
        // Leave the game unmarked so the next scan retries it.
      }
      done++;
      onProgress({ done, total });
      await sleep(INTERVAL_MS);
    }
  } finally {
    running = false;
  }
  return { done, total };
}
