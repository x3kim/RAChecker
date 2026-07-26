// Folder watcher. Two modes, both opt-in and persisted so the NAS/disk is never
// touched unless the user explicitly enables it:
//   - 'interval': a light incremental re-scan every N minutes. Unchanged files
//     hit the hash cache (no re-hash), so each run is a short stat burst rather
//     than continuous I/O. Default — gentle on network shares.
//   - 'events':  the classic continuous fs.watch (recursive). Reacts instantly
//     to new files but keeps a recursive watch open, which is heavy over SMB.
import { watch } from 'node:fs';
import { join } from 'node:path';
import { Scanner } from './scanner.js';
import { getSetting, setSetting } from './db.js';
import { config } from './config.js';
import { acquireScanLock, releaseScanLock } from './scan-lock.js';

// Mirror the scan route's settings so watch-driven scans behave identically.
export function scannerOpts() {
  const enabled = getSetting('enabledConsoles', null);
  const bf = config.bigFileCopy || {};
  return {
    enabledConsoles: Array.isArray(enabled) && enabled.length ? enabled : null,
    bigFileCopyBytes: bf.enabled ? Math.max(0, Number(bf.thresholdMB) || 0) * 1024 * 1024 : 0,
    bigFileMaxBytes: Math.max(0, Number(bf.maxThresholdMB) || 0) * 1024 * 1024,
    fileTimeoutMs: Math.max(10, Number(getSetting('scanFileTimeoutSec', 600))) * 1000,
    skipCollected: !!getSetting('skipCollected', false),
  };
}

let current = null; // active watch state, or null when stopped

const DEBOUNCE_MS = 1800;
const RECENT_MAX = 50;

const DEFAULT_WATCH = { enabled: false, mode: 'interval', intervalMin: 30 };

export function getWatchConfig() {
  const saved = getSetting('watchConfig', null);
  const c = { ...DEFAULT_WATCH, ...(saved && typeof saved === 'object' ? saved : {}) };
  c.intervalMin = Math.max(1, Math.round(Number(c.intervalMin) || 30));
  c.mode = c.mode === 'events' ? 'events' : 'interval';
  c.enabled = !!c.enabled;
  return c;
}

export function setWatchConfig(patch) {
  const next = { ...getWatchConfig(), ...(patch || {}) };
  next.intervalMin = Math.max(1, Math.round(Number(next.intervalMin) || 30));
  next.mode = next.mode === 'events' ? 'events' : 'interval';
  next.enabled = !!next.enabled;
  setSetting('watchConfig', next);
  return next;
}

export function watchStatus() {
  const cfg = getWatchConfig();
  return {
    active: !!current,
    enabled: cfg.enabled,
    mode: current?.mode ?? cfg.mode,
    intervalMin: cfg.intervalMin,
    root: current?.root ?? null,
    recent: current?.recent ?? [],
    processed: current?.processedCount ?? 0,
    scanning: !!current?.running,
    lastRunAt: current?.lastRunAt ?? getSetting('watchLastRunAt', null),
    nextRunAt: current?.nextRunAt ?? null,
  };
}

// A scanner wired to push every per-file result into the watch state's recent
// buffer (for the /api/status "new matches" toast) and the user callback.
function makeScanner(root, state) {
  const scanner = new Scanner({ rootPath: root, scanId: null, ...scannerOpts() });
  scanner.emit = (ev, data) => {
    if (ev !== 'result') return;
    state.processedCount++;
    state.recent.unshift({ ...data, at: Date.now() });
    if (state.recent.length > RECENT_MAX) state.recent.pop();
    state.onItem(data);
  };
  return scanner;
}

export function startWatch(root, onItem = () => {}) {
  stopWatch({ persist: false });
  if (!root) throw new Error('Kein ROM-Ordner gesetzt.');
  const cfg = getWatchConfig();
  const state = {
    mode: cfg.mode, root, recent: [], processedCount: 0, onItem,
    running: false, lastRunAt: null, nextRunAt: null,
  };

  if (cfg.mode === 'events') {
    const scanner = makeScanner(root, state);
    state.timers = new Map();
    let watcher;
    try {
      watcher = watch(root, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const full = join(root, filename.toString());
        const prev = state.timers.get(full);
        if (prev) clearTimeout(prev);
        state.timers.set(full, setTimeout(() => {
          state.timers.delete(full);
          scanner.processFile(full).catch(() => {});
        }, DEBOUNCE_MS));
      });
    } catch (e) {
      throw new Error(`Watch failed for ${root}: ${e.message}`);
    }
    state.watcher = watcher;
  } else {
    // interval mode: a periodic incremental re-scan. Skips a run that's already
    // in flight so a slow NAS can't pile up overlapping scans.
    const ms = cfg.intervalMin * 60 * 1000;
    const runOnce = async () => {
      if (state.running || !current) return;
      // Never run on top of a manual or scheduled scan — next interval retries.
      if (!acquireScanLock('watch')) { state.nextRunAt = Date.now() + ms; return; }
      state.running = true;
      try {
        const scanner = makeScanner(root, state);
        await scanner.run({ concurrency: 2 });
        state.lastRunAt = Date.now();
        setSetting('watchLastRunAt', state.lastRunAt);
      } catch { /* ignore a failed pass; next interval retries */ }
      finally {
        state.running = false;
        releaseScanLock('watch');
        state.nextRunAt = Date.now() + ms;
      }
    };
    state.nextRunAt = Date.now() + ms;
    // Deliberately NO immediate run on start — avoids a NAS burst the instant the
    // app launches. The first pass happens after one interval.
    state.timer = setInterval(runOnce, ms);
  }

  current = state;
  setWatchConfig({ enabled: true });
  return watchStatus();
}

export function stopWatch({ persist = true } = {}) {
  if (current) {
    if (current.timers) for (const t of current.timers.values()) clearTimeout(t);
    if (current.timer) clearInterval(current.timer);
    try { current.watcher?.close(); } catch { /* ignore */ }
    current = null;
  }
  if (persist) setWatchConfig({ enabled: false });
}

// Called once at server boot. Only starts the watcher if the user previously
// enabled it — a fresh install never touches the NAS on its own.
export function initWatch(root, onItem = () => {}) {
  const cfg = getWatchConfig();
  if (cfg.enabled && root) {
    try { startWatch(root, onItem); }
    catch (e) { console.warn('[watch] auto-start failed:', e.message); }
  }
}
