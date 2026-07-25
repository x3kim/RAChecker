// Scheduled scans: run a full library scan once a day at a fixed time. Opt-in
// and fully disableable. Headless (no browser) — like the interval watcher, it
// updates the collection + the "since last scan" baseline so results are ready
// next time the UI opens. A 60-second tick checks the wall clock.
import { Scanner } from './scanner.js';
import { getSetting, setSetting, snapshotLibraryBaseline } from './db.js';
import { scannerOpts } from './watcher.js';
import { acquireScanLock, releaseScanLock } from './scan-lock.js';

let timer = null;
let running = false;
let getRoot = () => null;

const DEFAULT_SCHEDULE = { enabled: false, time: '03:00' };

export function getScheduleConfig() {
  const s = getSetting('scanSchedule', null);
  const c = { ...DEFAULT_SCHEDULE, ...(s && typeof s === 'object' ? s : {}) };
  c.enabled = !!c.enabled;
  c.time = /^\d{2}:\d{2}$/.test(c.time) ? c.time : '03:00';
  return c;
}

export function setScheduleConfig(patch) {
  const next = { ...getScheduleConfig(), ...(patch || {}) };
  next.enabled = !!next.enabled;
  next.time = /^([01]\d|2[0-3]):[0-5]\d$/.test(next.time) ? next.time : getScheduleConfig().time;
  setSetting('scanSchedule', next);
  return next;
}

export function scheduleStatus() {
  return { ...getScheduleConfig(), running, lastRunAt: getSetting('scheduleLastRunAt', null) };
}

function dayKey(d) { return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }

async function tick() {
  const c = getScheduleConfig();
  if (!c.enabled || running) return;
  const now = new Date();
  // "Target time reached or passed today" rather than exact minute equality —
  // a tick that lands one minute late (blocked event loop, long sync) must not
  // silently skip the whole day.
  const [hh, mm] = c.time.split(':').map(Number);
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm);
  // Grace window: catch up a missed minute, but don't surprise-scan when the
  // app first starts hours after the target time.
  if (now < target || now - target > 60 * 60 * 1000) return;
  if (getSetting('scheduleLastRunDay', null) === dayKey(now)) return; // already today
  const root = getRoot();
  if (!root) return;
  if (!acquireScanLock('schedule')) return; // manual/watch scan running — next tick retries

  running = true;
  setSetting('scheduleLastRunDay', dayKey(now)); // claim the slot before the (long) scan
  try {
    try { snapshotLibraryBaseline(); } catch { /* diff just won't update */ }
    const concurrency = Math.max(1, Math.min(16, Number(getSetting('scanConcurrency', 1)) || 1));
    const scanner = new Scanner({ rootPath: root, scanId: null, ...scannerOpts() });
    await scanner.run({ concurrency });
    setSetting('scheduleLastRunAt', Date.now());
  } catch { /* next day retries */ }
  finally { running = false; releaseScanLock('schedule'); }
}

export function initScheduler({ getRoot: gr } = {}) {
  if (timer) clearInterval(timer);
  getRoot = gr || (() => null);
  timer = setInterval(() => { tick().catch(() => {}); }, 60000);
}
