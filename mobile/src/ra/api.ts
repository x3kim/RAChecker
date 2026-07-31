// Lean RetroAchievements Web API client for mobile (fetch-based). Mirrors the
// desktop's endpoints/auth (server/src/ra-api.js): auth via z=user&y=key query
// params, base https://retroachievements.org/API, media on media.retroachievements.org.
import { Creds } from '../storage';

const API = 'https://retroachievements.org/API';
const MEDIA = 'https://media.retroachievements.org';

function auth(c: Creds): string {
  return `z=${encodeURIComponent(c.username)}&y=${encodeURIComponent(c.apiKey)}`;
}

async function apiGet(endpoint: string, params: Record<string, string | number>, c: Creds): Promise<any> {
  const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');
  const url = `${API}/${endpoint}?${auth(c)}${qs ? '&' + qs : ''}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RAChecker-mobile/0.1' } });
  if (res.status === 401) throw new Error('Login failed — check username / API key');
  if (!res.ok) throw new Error(`RA API ${res.status}`);
  return res.json();
}

export type RAProfile = {
  User: string; UserPic?: string; TotalPoints?: number; TotalTruePoints?: number;
  Rank?: number; MemberSince?: string; Motto?: string; RichPresenceMsg?: string;
};

export function getUserProfile(c: Creds): Promise<RAProfile> {
  return apiGet('API_GetUserProfile.php', { u: c.username }, c);
}
export function getUserSummary(c: Creds): Promise<any> {
  return apiGet('API_GetUserSummary.php', { u: c.username, g: 1, a: 0 }, c);
}

// THE bulk endpoint: every achievement game + all its MD5 hashes for a console,
// in one call. h=1 includes hashes, f=1 restricts to games with achievements.
export type RAGame = { ID: number; Title: string; ImageIcon?: string; NumAchievements?: number; Points?: number; Hashes?: string[] };
// f=0 returns every game for the console, including those that have no
// achievement set. That costs nothing extra (still one request per console) and
// is what lets a scan say "this game exists on RetroAchievements but has no
// achievements yet" instead of lumping it in with unrecognised dumps.
// Games with achievements are told apart later by num_achievements > 0.
export function getGameList(c: Creds, consoleId: number): Promise<RAGame[]> {
  return apiGet('API_GetGameList.php', { i: consoleId, h: 1, f: 0 }, c);
}

// Game details + the signed-in user's achievement progress for one game.
export type RAAchievement = {
  ID: number; Title: string; Description: string; Points: number;
  BadgeName?: string; DateEarned?: string; DateEarnedHardcore?: string; DisplayOrder?: number;
};
export type RAGameInfo = {
  Title: string; ConsoleID?: number; ConsoleName?: string;
  ImageIcon?: string; ImageBoxArt?: string;
  NumAchievements?: number; NumAwardedToUser?: number; NumAwardedToUserHardcore?: number;
  UserCompletion?: string; Points?: number;
  Achievements?: Record<string, RAAchievement>;
};
export function getGameInfoAndUserProgress(c: Creds, gameId: number): Promise<RAGameInfo> {
  return apiGet('API_GetGameInfoAndUserProgress.php', { u: c.username, g: gameId }, c);
}

// ---- completion progress (Mastery / Hardcore / Quick Wins) ----------------
export type CompletionGame = {
  GameID: number; ConsoleID: number; ConsoleName?: string; Title: string; ImageIcon?: string;
  MaxPossible: number; NumAwarded: number; NumAwardedHardcore: number; MostRecentAwardedDate?: string;
};
export async function getUserCompletionProgress(c: Creds): Promise<CompletionGame[]> {
  const all: CompletionGame[] = [];
  let offset = 0; const count = 500;
  for (let guard = 0; guard < 40; guard++) {
    const page = await apiGet('API_GetUserCompletionProgress.php', { u: c.username, c: count, o: offset }, c);
    const results: CompletionGame[] = page?.Results || [];
    all.push(...results);
    const total = page?.Total ?? all.length;
    offset += count;
    if (all.length >= total || results.length === 0) break;
  }
  return all;
}

// ---- community / discover --------------------------------------------------
// The only endpoint that carries a hash's official ROM name — and with it the
// region of the actual dump, independent of what the file is called on the
// phone. There is no bulk variant, so this is one call per game; mobile asks
// only for the games your own scan matched.
export type RAHashEntry = { MD5: string; Name?: string; Labels?: string[]; PatchUrl?: string };
export function getGameHashes(c: Creds, gameId: number): Promise<{ Results?: RAHashEntry[] }> {
  return apiGet('API_GetGameHashes.php', { i: gameId }, c);
}

export function getAchievementOfTheWeek(c: Creds): Promise<any> { return apiGet('API_GetAchievementOfTheWeek.php', {}, c); }
export function getActiveClaims(c: Creds): Promise<any[]> { return apiGet('API_GetActiveClaims.php', {}, c); }
export function getRecentGameAwards(c: Creds, count = 25): Promise<any> { return apiGet('API_GetRecentGameAwards.php', { c: count, o: 0 }, c); }

// ---- leaderboards ----------------------------------------------------------
export type Leaderboard = { ID: number; Title: string; Description?: string; RankAsc?: boolean; Format?: string; TopEntry?: { User: string; Score: number; FormattedScore?: string } };
export function getGameLeaderboards(c: Creds, gameId: number): Promise<{ Count: number; Total: number; Results: Leaderboard[] }> {
  return apiGet('API_GetGameLeaderboards.php', { i: gameId, c: 100, o: 0 }, c);
}
export function getUserGameLeaderboards(c: Creds, gameId: number): Promise<{ Results: { ID: number; UserEntry?: { User: string; Rank: number; FormattedScore?: string; Score?: number } }[] }> {
  return apiGet('API_GetUserGameLeaderboards.php', { i: gameId, u: c.username, c: 100, o: 0 }, c);
}

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${MEDIA}${path.startsWith('/') ? '' : '/'}${path}`;
}

// Achievement badge image (locked variant appends _lock).
export function badgeUrl(badgeName?: string | null, locked = false): string | null {
  if (!badgeName) return null;
  return `${MEDIA}/Badge/${badgeName}${locked ? '_lock' : ''}.png`;
}
