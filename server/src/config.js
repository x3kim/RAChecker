// Central configuration. Defaults can be overridden via:
//   1. server/config.local.json  (git-ignored, recommended for secrets)
//   2. environment variables (RA_USERNAME, RA_API_KEY, RA_ROM_ROOT, PORT, ...)
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync, readFileSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(__dirname, '..', '..'); // repo root

const DATA_DIR = process.env.RA_DATA_DIR ? resolve(process.env.RA_DATA_DIR) : join(ROOT, 'data');

// ---- defaults -------------------------------------------------------------
const defaults = {
  port: 8088,
  host: '127.0.0.1',

  // RetroAchievements Web API credentials. Intentionally EMPTY here — never
  // commit secrets to source. Set them at runtime via the Settings UI (stored
  // in the DB) or in the git-ignored server/config.local.json / env vars.
  raUsername: '',
  raApiKey: '',

  // Default ROM root to pre-fill in the UI. Intentionally empty — the
  // onboarding wizard / Settings ask for it. Set your own default in the
  // git-ignored server/config.local.json or via RA_ROM_ROOT.
  romRoot: '',

  // RA Web API politeness throttle. RA asks integrations to stay well under
  // a few requests/second. We default to ~2 req/s with a small burst.
  rateLimit: {
    minIntervalMs: 500, // >= 500ms between calls => max 2 req/s
    maxRetries: 4,
    backoffBaseMs: 1500,
  },

  // How long a cached console hash-list stays fresh before we re-sync.
  hashCacheTtlDays: 90,

  // Paths (resolved relative to DATA_DIR unless absolute).
  dataDir: DATA_DIR,
  dbPath: join(DATA_DIR, 'ra-checker.db'),
  imageCacheDir: join(DATA_DIR, 'images'),
  tempDir: join(DATA_DIR, 'temp'),

  // Optional path to RAHasher.exe for full disc-based-system support.
  // If empty, we auto-detect ./bin/RAHasher.exe and PATH.
  rahasherPath: '',

  // Max size (bytes) we will read from inside an archive into memory for
  // file-based hashing. Larger entries are streamed to a temp file instead.
  archiveInMemoryLimit: 64 * 1024 * 1024, // 64 MB

  // Large self-contained files (big disc images on a slow network share) can
  // time out when hashed in place — RAHasher seeks all over the file. When
  // enabled, files at/above thresholdMB are copied to the local temp dir first,
  // hashed at local-disk speed, then deleted. Files above maxThresholdMB are
  // NEVER copied (so a huge image can't fill the local disk) — they hash in
  // place. A free-space guard also skips the copy if temp lacks room.
  // User-tunable in Settings. maxThresholdMB = 0 means "no upper cap".
  bigFileCopy: { enabled: true, thresholdMB: 1024, maxThresholdMB: 8192 },
};

// ---- merge local overrides ------------------------------------------------
function loadLocal() {
  const p = join(__dirname, '..', 'config.local.json');
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    console.warn('[config] Could not parse config.local.json:', e.message);
    return {};
  }
}

const local = loadLocal();

export const config = {
  ...defaults,
  ...local,
  rateLimit: { ...defaults.rateLimit, ...(local.rateLimit || {}) },
  port: Number(process.env.PORT || local.port || defaults.port),
  host: process.env.RA_HOST || local.host || defaults.host,
  raUsername: process.env.RA_USERNAME || local.raUsername || defaults.raUsername,
  raApiKey: process.env.RA_API_KEY || local.raApiKey || defaults.raApiKey,
  romRoot: process.env.RA_ROM_ROOT || local.romRoot || defaults.romRoot,
  rahasherPath: process.env.RA_RAHASHER || local.rahasherPath || defaults.rahasherPath,
};

// Ensure runtime dirs exist.
for (const d of [config.dataDir, config.imageCacheDir, config.tempDir]) {
  mkdirSync(d, { recursive: true });
}

// Apply a pending restore (staged by the Settings "restore backup" action)
// BEFORE the database is opened. config.js is evaluated before db.js imports it,
// so this is the one safe spot to swap the file out while nothing holds it open.
try {
  const pending = join(config.dataDir, 'ra-checker.restore.db');
  if (existsSync(pending)) {
    copyFileSync(pending, config.dbPath);
    for (const ext of ['-wal', '-shm']) { try { unlinkSync(config.dbPath + ext); } catch { /* none */ } }
    unlinkSync(pending);
    console.log('[config] restored database from a pending backup');
  }
} catch (e) {
  console.warn('[config] pending restore failed:', e.message);
}

export const RA_API_BASE = 'https://retroachievements.org/API';
export const RA_MEDIA_BASE = 'https://media.retroachievements.org';
export const RA_STATIC_BASE = 'https://static.retroachievements.org';
