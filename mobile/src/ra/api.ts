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

export function mediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${MEDIA}${path.startsWith('/') ? '' : '/'}${path}`;
}
