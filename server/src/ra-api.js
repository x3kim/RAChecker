// RetroAchievements Web API client with a polite rate limiter + retry/backoff.
// The API has no published numeric limit; RA asks integrations to be gentle and
// to cache aggressively. We serialize calls with a minimum interval.
import { config, RA_API_BASE, RA_MEDIA_BASE } from './config.js';

// ---- single-flight rate limiter (serialized, min interval between calls) --
let chain = Promise.resolve();
let lastCallAt = 0;

// `intervalMs` overrides the gap before THIS call. Long-running background jobs
// (the hash-name enrichment) pass a shorter one; because the chain is FIFO, an
// interactive call queued during such a job waits behind at most one of them.
function schedule(fn, intervalMs) {
  const gap = intervalMs ?? config.rateLimit.minIntervalMs;
  const run = chain.then(async () => {
    const wait = Math.max(0, gap - (Date.now() - lastCallAt));
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return fn();
  });
  // keep the chain alive even if this call rejects
  chain = run.then(() => {}, () => {});
  return run;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function authParams() {
  return `z=${encodeURIComponent(config.raUsername)}&y=${encodeURIComponent(config.raApiKey)}`;
}

async function apiGet(endpoint, params = {}, { intervalMs } = {}) {
  const qs = Object.entries(params)
    .filter(([, v]) => v != null)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  const url = `${RA_API_BASE}/${endpoint}?${authParams()}${qs ? '&' + qs : ''}`;

  return schedule(async () => {
    let lastErr;
    for (let attempt = 0; attempt <= config.rateLimit.maxRetries; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'RAChecker/0.1' } });
        if (res.status === 429 || res.status >= 500) {
          // Release the connection before retrying — an unconsumed body keeps
          // the undici socket alive until GC.
          await res.body?.cancel().catch(() => {});
          throw new RetryableError(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`RA API ${endpoint} -> HTTP ${res.status} ${body.slice(0, 120)}`);
        }
        return await res.json();
      } catch (e) {
        lastErr = e;
        if (e instanceof RetryableError || /fetch failed|ECONN|ETIMEDOUT|network/i.test(String(e.message))) {
          const backoff = config.rateLimit.backoffBaseMs * Math.pow(2, attempt);
          await sleep(backoff);
          continue;
        }
        throw e;
      }
    }
    throw lastErr ?? new Error(`RA API ${endpoint} failed`);
  }, intervalMs);
}

class RetryableError extends Error {}

// ---- endpoints ------------------------------------------------------------
export function getConsoleIDs({ activeOnly = true, gameSystemsOnly = true } = {}) {
  return apiGet('API_GetConsoleIDs.php', { a: activeOnly ? 1 : 0, g: gameSystemsOnly ? 1 : 0 });
}

// THE bulk endpoint: every game + all MD5 hashes for a console in one call.
export function getGameList(consoleId, { withHashes = true, onlyWithAchievements = true } = {}) {
  return apiGet('API_GetGameList.php', {
    i: consoleId,
    h: withHashes ? 1 : 0,
    f: onlyWithAchievements ? 1 : 0,
  });
}

// The ONLY endpoint that carries a hash's ROM name (and with it the region of
// the actual dump). There is no bulk variant anywhere in the v1 API, so a full
// enrichment is one call per game — measured at ~39 ms and ~200-800 bytes each,
// which makes our own politeness interval the real cost, not RetroAchievements.
export function getGameHashes(gameId, { intervalMs } = {}) {
  return apiGet('API_GetGameHashes.php', { i: gameId }, { intervalMs });
}

export function getGameExtended(gameId) {
  return apiGet('API_GetGameExtended.php', { i: gameId });
}

// Basic game metadata (title, console, Genre, release date) — same Genre field
// as GetGameExtended but without the achievement payload, so it is the cheap
// call for a genre-only enrichment pass.
export function getGame(gameId, { intervalMs } = {}) {
  return apiGet('API_GetGame.php', { i: gameId }, { intervalMs });
}

// ---- user (your own progress) ---------------------------------------------
export function getUserProfile(user) {
  return apiGet('API_GetUserProfile.php', { u: user });
}
export function getGameInfoAndUserProgress(user, gameId) {
  return apiGet('API_GetGameInfoAndUserProgress.php', { u: user, g: gameId });
}
// Paginated: every game the user has any achievements in. We fetch all pages.
export async function getUserCompletionProgress(user) {
  const all = [];
  let offset = 0;
  const count = 500;
  for (let guard = 0; guard < 40; guard++) {
    const page = await apiGet('API_GetUserCompletionProgress.php', { u: user, c: count, o: offset });
    const results = page?.Results || [];
    all.push(...results);
    const total = page?.Total ?? all.length;
    offset += count;
    if (all.length >= total || results.length === 0) break;
  }
  return all;
}

// ---- community / feed ------------------------------------------------------
// Achievement of the Week (event metadata + the achievement's game).
export function getAchievementOfTheWeek() {
  return apiGet('API_GetAchievementOfTheWeek.php');
}
// Every set claim currently in progress on the site (new sets + revisions).
export function getActiveClaims() {
  return apiGet('API_GetActiveClaims.php');
}
// Recently completed/mastered games across the site.
export function getRecentGameAwards({ count = 25, offset = 0 } = {}) {
  return apiGet('API_GetRecentGameAwards.php', { c: count, o: offset });
}

// ---- set requests / wishlist ----------------------------------------------
// The games a user has requested achievement sets for (+ their remaining quota).
export function getUserSetRequests(user) {
  return apiGet('API_GetUserSetRequests.php', { u: user });
}
// The user's "Want to Play" list (paginated; we fetch the first `count`).
export function getUserWantToPlayList(user, { count = 500, offset = 0 } = {}) {
  return apiGet('API_GetUserWantToPlayList.php', { u: user, c: count, o: offset });
}

// ---- leaderboards ----------------------------------------------------------
export function getGameLeaderboards(gameId, { count = 100, offset = 0 } = {}) {
  return apiGet('API_GetGameLeaderboards.php', { i: gameId, c: count, o: offset });
}
export function getUserGameLeaderboards(gameId, user, { count = 100, offset = 0 } = {}) {
  return apiGet('API_GetUserGameLeaderboards.php', { i: gameId, u: user, c: count, o: offset });
}
export function getLeaderboardEntries(leaderboardId, { count = 25, offset = 0 } = {}) {
  return apiGet('API_GetLeaderboardEntries.php', { i: leaderboardId, c: count, o: offset });
}

// ---- rich presence / session tracking -------------------------------------
// Summary carries RichPresenceMsg + LastGameID — the cheapest "what am I
// playing right now" probe (RA itself refreshes it about every 2 minutes).
export function getUserSummary(user, { recentGames = 1, recentAchievements = 0 } = {}) {
  return apiGet('API_GetUserSummary.php', { u: user, g: recentGames, a: recentAchievements });
}
export function getUserRecentlyPlayedGames(user, { count = 10, offset = 0 } = {}) {
  return apiGet('API_GetUserRecentlyPlayedGames.php', { u: user, c: count, o: offset });
}

// ---- image url helper -----------------------------------------------------
export function mediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${RA_MEDIA_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}
