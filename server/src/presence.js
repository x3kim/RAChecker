// Rich-Presence poller + local session tracking.
//
// RetroAchievements only exposes the *current* presence string ("what am I
// playing right now", refreshed site-side roughly every two minutes). It keeps
// no history. We poll that string on an interval and stitch consecutive
// samples of the same game into local play sessions, which gives the app a
// playtime history the site itself does not offer.
//
// Opt-in: disabled by default (it is a periodic network call tied to the user's
// account) and fully configurable in Settings.
import { config } from './config.js';
import { getUserSummary, mediaUrl } from './ra-api.js';
import { getSetting, setSetting, findOpenSession, startSession, touchSession } from './db.js';

export const DEFAULT_PRESENCE = { enabled: false, intervalMin: 2, staleMin: 10 };

let timer = null;
let polling = false;
let last = null;   // { at, gameId, title, consoleId, rich, active, error }

export function getPresenceConfig() {
  const saved = getSetting('presenceConfig', null);
  const c = { ...DEFAULT_PRESENCE, ...(saved && typeof saved === 'object' ? saved : {}) };
  c.intervalMin = Math.max(1, Math.min(60, Number(c.intervalMin) || DEFAULT_PRESENCE.intervalMin));
  c.staleMin = Math.max(2, Math.min(180, Number(c.staleMin) || DEFAULT_PRESENCE.staleMin));
  c.enabled = !!c.enabled;
  return c;
}

export function setPresenceConfig(patch = {}) {
  const next = { ...getPresenceConfig() };
  if (patch.enabled != null) next.enabled = !!patch.enabled;
  if (patch.intervalMin != null) next.intervalMin = Math.max(1, Math.min(60, Number(patch.intervalMin) || next.intervalMin));
  if (patch.staleMin != null) next.staleMin = Math.max(2, Math.min(180, Number(patch.staleMin) || next.staleMin));
  setSetting('presenceConfig', next);
  restartPresence();
  return next;
}

// RA timestamps look like "2026-07-24 18:22:11" and are UTC.
function parseRaTime(s) {
  if (!s || typeof s !== 'string') return null;
  const ms = Date.parse(s.replace(' ', 'T') + 'Z');
  return Number.isFinite(ms) ? ms : null;
}

const IDLE_PRESENCE = /^(unknown|offline|not currently playing)/i;

// One poll: fetch the summary, decide whether the user is actually playing,
// and extend or open a session. Never throws.
export async function pollPresence() {
  if (polling) return last;
  if (!config.raUsername || !config.raApiKey) {
    last = { at: Date.now(), active: false, error: 'not_logged_in' };
    return last;
  }
  polling = true;
  const cfg = getPresenceConfig();
  try {
    const s = await getUserSummary(config.raUsername, { recentGames: 1, recentAchievements: 0 });
    const rich = String(s?.RichPresenceMsg || '').trim();
    const gameId = Number(s?.LastGameID) || null;
    const game = s?.LastGame || null;
    const updatedAt = parseRaTime(s?.LastActivity?.lastupdate) ?? parseRaTime(s?.LastActivity?.timestamp);
    const now = Date.now();
    // Presence sticks around after the emulator closes, so a sample only counts
    // as "playing" while RA's own last-update is recent. Without a parsable
    // timestamp we trust the presence string (best effort).
    const fresh = updatedAt == null ? true : (now - updatedAt) < cfg.staleMin * 60 * 1000;
    const active = Boolean(rich) && !IDLE_PRESENCE.test(rich) && fresh;

    if (active) {
      // A gap of more than ~2.5 poll intervals (at least 10 min) ends a session.
      const gapMs = Math.max(10 * 60 * 1000, cfg.intervalMin * 60 * 1000 * 2.5);
      const open = findOpenSession(gameId, now - gapMs);
      if (open) touchSession(open.id, now, rich);
      else startSession({
        gameId,
        consoleId: Number(game?.ConsoleID) || null,
        title: game?.Title || null,
        at: now,
        rich,
      });
    }
    last = {
      at: now, active, rich,
      gameId,
      title: game?.Title || null,
      consoleId: Number(game?.ConsoleID) || null,
      consoleName: game?.ConsoleName || null,
      imageIcon: game?.ImageIcon || null,
      imageUrl: game?.ImageIcon ? mediaUrl(game.ImageIcon) : null,
      updatedAt,
      error: null,
    };
  } catch (e) {
    last = { at: Date.now(), active: false, error: String(e.message).slice(0, 200) };
  } finally {
    polling = false;
  }
  return last;
}

export function presenceStatus() {
  const cfg = getPresenceConfig();
  return {
    ...cfg,
    running: timer != null,
    lastSample: last,
    nextPollAt: timer ? (last?.at ?? Date.now()) + cfg.intervalMin * 60 * 1000 : null,
  };
}

export function stopPresence() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function startPresence() {
  stopPresence();
  const cfg = getPresenceConfig();
  if (!cfg.enabled) return presenceStatus();
  timer = setInterval(() => { pollPresence().catch(() => {}); }, cfg.intervalMin * 60 * 1000);
  if (timer.unref) timer.unref();
  pollPresence().catch(() => {}); // fire one immediately so the UI isn't blank
  return presenceStatus();
}

function restartPresence() {
  const cfg = getPresenceConfig();
  if (cfg.enabled) startPresence(); else stopPresence();
}

// Called once at boot; a no-op unless the user enabled presence tracking.
export function initPresence() {
  return restartPresence();
}
