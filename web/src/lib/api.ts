// Typed client for the RAChecker backend.
export type HashMethod = 'file' | 'arcade' | 'rahasher' | 'unsupported' | 'unknown';
export type ScanStatus =
  | 'match' | 'no_match' | 'needs_rahasher' | 'unsupported' | 'error' | 'skipped' | 'ambiguous';

export interface ConsoleStatus {
  id: number; name: string; short_code: string; icon_url: string;
  hash_method: HashMethod; gameCount: number; hashCount: number;
  syncedAt: number | null; stale: boolean; syncStatus: string | null;
}

export interface AppStatus {
  ra: { username: string; hasKey: boolean };
  romRoot: string;
  totals: { games: number; hashes: number };
  consolesSyncedAt: number | null;
  lastFullSyncAt: number | null;
  rahasher: { available: boolean; path: string };
  watch: {
    active: boolean; enabled?: boolean; mode?: 'interval' | 'events'; intervalMin?: number;
    root: string | null; processed: number; scanning?: boolean;
    lastRunAt?: number | null; nextRunAt?: number | null;
    recentMatches?: { gameId: number | null; title: string; at: number }[];
  };
  activeScan: { id: number; rootPath: string; sid?: string | null; watchers?: number } | null;
  activeSync: boolean;
  consoles: ConsoleStatus[];
}

export interface BigFileCopy { enabled: boolean; thresholdMB: number; maxThresholdMB?: number; }
export interface TempItem { name: string; size: number; mtime: number; dir: boolean; kind: string; }
export interface RateLimit { minIntervalMs: number; maxRetries: number; backoffBaseMs?: number; }
export interface Settings {
  romRoot: string; hashCacheTtlDays: number; raUsername: string;
  cacheTtls: CacheTtls; scanFileTimeoutSec: number; scanConcurrency: number; skipCollected: boolean;
  enabledConsoles: number[] | null; bigFileCopy: BigFileCopy;
  rateLimit: RateLimit; rahasherPath: string; downloadDir: string;
  // Ordered region/language preference: region codes ("JP") mixed with language
  // tokens ("L:ja"). Empty means no preference is set.
  regionPriority: string[];
}
export interface TagFacets {
  regions: { code: string; n: number }[];
  languages: { code: string; n: number }[];
  untagged: number;
  /** rows whose tags come from RetroAchievements rather than the filename */
  verified: number;
  total: number;
}
export interface HashNameStatus {
  games: number; fetched: number; named: number; owned: number; ownedFetched: number;
  running: { scope: 'collection' | 'all'; done: number; total: number } | null;
  intervalMs: number;
}
export interface ScheduleStatus { enabled: boolean; time: string; running: boolean; lastRunAt: number | null; }
export interface StorageInfo {
  dataDir: string; db: number; wal?: number; images: number; backups: number; temp: number; total: number;
  imageCount?: number; backupCount?: number; tempItems?: TempItem[]; tempCount?: number;
}
export interface WatchStatus {
  active: boolean; enabled: boolean; mode: 'interval' | 'events'; intervalMin: number;
  root: string | null; processed: number; scanning: boolean;
  lastRunAt: number | null; nextRunAt: number | null; error?: string;
}
export interface OwnedFiles {
  owned: boolean; count: number;
  files: { path: string; inner_path: string; size: number | null; md5: string | null; scanned_at: number | null }[];
}

export interface ScanTotals {
  // files = everything the walk found; processed = files finished (whatever the
  // outcome) and therefore the progress denominator; scanned = files that
  // produced a result row, which is what the status counters add up to.
  files: number; processed: number; scanned: number; match: number; no_match: number;
  needs_rahasher: number; unsupported: number; error: number; skipped: number; ambiguous: number;
}

export interface ScanItem {
  filePath: string; innerPath?: string | null; ext?: string; size?: number;
  consoleId?: number | null; md5?: string; matchGameId?: number | null;
  status: ScanStatus; message?: string | null; hashMethod?: string;
  matchTitle?: string; matchImage?: string; matchAchievements?: number; matchPoints?: number;
  romName?: string | null; totals?: ScanTotals; uploaded?: boolean; cached?: boolean;
  scannedAt?: number;
  // Comma-joined codes parsed from the filename; only collection rows carry
  // them, live scan rows are parsed client-side from the same filename.
  region?: string | null; langs?: string | null;
  // The same, parsed from the ROM name RetroAchievements stores for this hash —
  // authoritative, because the file matched by content. Present once the game
  // has been enriched.
  raRegion?: string | null; raLangs?: string | null; raRomName?: string | null;
}

export interface QuickWin {
  id: number; title: string; consoleId: number; icon: string;
  points: number; total: number; awarded: number; remaining: number; pct: number;
  consoleName: string | null; consoleShort: string | null;
}
export interface QuickWinsResult {
  loggedIn: boolean; hasProgress: boolean; total: number;
  nearMastery: QuickWin[]; freshStarts: QuickWin[];
}

export interface VersionReportGroup {
  id: number; title: string; consoleId: number; consoleName: string | null; consoleShort: string | null;
  icon: string; achievements: number; points: number;
  files: { name: string; path: string; inner: string | null }[];
}
export interface VersionReportResult {
  scanned: number; resolved: number; unresolved: number; groups: VersionReportGroup[];
}

export interface CacheTtls { gameDetailDays: number; profileHours: number; completionHours: number; }
export interface BackupInfo { name: string; size: number; at: number; }

export interface DiffRow {
  path: string; inner_path: string; status: ScanStatus | null; match_game_id: number | null;
  console_id: number | null; scanned_at?: number; match_title: string | null; match_image: string | null;
  match_achievements?: number | null; match_points?: number | null;
  console_short: string | null; console_name?: string | null; prev_title?: string | null; prev_status?: string | null;
}
export interface CollectionDiff {
  at: number | null; hasBaseline: boolean;
  counts: { added: number; newlyMatched: number; lost: number; removed: number };
  added: DiffRow[]; newlyMatched: DiffRow[]; lost: DiffRow[]; removed: DiffRow[];
}

// ---- community / discovery (v0.9) -----------------------------------------
export interface AotwResult {
  Achievement?: { ID: number; Title: string; Description: string; Points: number; BadgeName?: string; BadgeURL?: string };
  Console?: { ID: number; Title: string };
  Game?: { ID: number; Title: string };
  ForumTopic?: { ID: number };
  StartAt?: string; TotalPlayers?: number; UnlocksCount?: number;
  gameId: number | null; owned: boolean;
  ownedFiles: { path: string; inner_path: string }[];
  localGame: { id: number; title: string; console_id: number; image_icon: string | null; num_achievements: number; points: number; console_name?: string | null } | null;
  _cachedAt?: number; _stale?: boolean; error?: string;
}

export interface AwardRow {
  User: string; AwardKind: string; AwardDate: string;
  GameID: number; GameTitle: string; ConsoleID: number; ConsoleName: string;
  owned: boolean;
}
export interface AwardsResult { total: number; results: AwardRow[]; _cachedAt?: number; _stale?: boolean; error?: string }

export interface ClaimRow {
  ID?: number; User: string; GameID: number; GameTitle: string; GameIcon?: string | null;
  ConsoleName?: string; ClaimType?: number; SetType?: number; Status?: number;
  Created?: string; DoneTime?: string; MinutesLeft?: number;
  gameId: number | null; consoleId: number | null; icon: string | null;
  knownLocally: boolean; achievements: number | null;
  relation: 'owned' | 'likely' | 'other';
  files?: { name: string; path: string; inner: string | null }[];
}
export interface ClaimsResult {
  counts: { total: number; owned: number; likely: number; other: number };
  owned: ClaimRow[]; likely: ClaimRow[]; other: ClaimRow[];
  _cachedAt?: number; _stale?: boolean; error?: string;
}

export interface SetRequestRow {
  GameID: number; Title: string; ConsoleName?: string;
  gameId: number | null; owned: boolean; icon: string | null; consoleId: number | null; achievements: number;
}
export interface SetRequestsResult {
  games: SetRequestRow[]; used?: number; totalRequests: number; pointsForNext: number | null;
  _cachedAt?: number; _stale?: boolean; error?: string; loggedOut?: boolean;
}

export interface WantToPlayRow {
  ID: number; Title: string; ImageIcon?: string; ConsoleID?: number; ConsoleName?: string;
  PointsTotal?: number; AchievementsPublished?: number;
  gameId: number | null; owned: boolean;
}
export interface WantToPlayResult {
  total: number; owned: number; games: WantToPlayRow[];
  _cachedAt?: number; _stale?: boolean; error?: string; loggedOut?: boolean;
}

export interface HardcoreGapGame {
  id: number; title: string; consoleId: number | null; consoleName: string | null; icon: string | null;
  max: number; softcore: number; hardcore: number; gap: number; pctHardcore: number;
  owned: boolean; lastAt: string | null;
}
export interface HardcoreGapResult {
  loggedIn: boolean; hasProgress: boolean; cachedAt: number | null;
  totals: { games: number; ownedGames: number; softcoreOnly: number; hardcoreMastered: number; softcoreMastered: number };
  games: HardcoreGapGame[];
}

export interface LeaderboardEntry { User: string; Score: number; FormattedScore: string; Rank: number; DateUpdated?: string }
export interface LeaderboardRow {
  ID: number; Title: string; Description: string; Format: string; RankAsc?: boolean; LowerIsBetter?: boolean;
  Author?: string; TopEntry?: { User: string; Score: number; FormattedScore: string } | null;
  userEntry: LeaderboardEntry | null;
}
export interface LeaderboardsResult { total: number; boards: LeaderboardRow[]; _cachedAt?: number; _stale?: boolean; error?: string }

export interface FreeGame {
  title: string; author: string | null; url: string; consoleId: number | null; systemLabel: string; host: string | null;
  raGameId: number | null; raTitle: string | null; achievements: number; points: number;
  icon: string | null; owned: boolean;
}
export interface FreeGamesResult {
  source: string | null; updated: string | null;
  counts: { total: number; withSet: number; owned: number };
  systems: { consoleId: number | null; label: string }[];
  games: FreeGame[]; error?: string;
}

export interface CoverageResult {
  all: { games: number; achievements: number; points: number };
  owned: { games: number; achievements: number; points: number };
  byConsole: { id: number; name: string; short: string | null; games: number; achievements: number; ownedGames: number }[];
  reference: { games: number; achievements: number; players: number; asOf: string };
}

export interface CoreEntry { id: string; name: string; achievements: boolean; hardcore: boolean; note: string | null }
export interface CoresResult {
  source: string | null;
  cores: Record<string, { cores: CoreEntry[]; standalone: string[] }>;
  frontends: { name: string; url: string; note?: string | null }[];
  error?: string;
}
export interface ConsoleCores {
  consoleId: number; cores: CoreEntry[]; standalone: string[];
  resolved?: { coreId: string | null; corePath: string | null; file?: string; name: string | null; source: string | null };
}

export interface NewSystemsResult {
  seededAt: number | null;
  systems: { id: number; firstSeenAt: number; name: string; short: string | null; hashMethod: string; supported: boolean }[];
}

export interface PresenceSample {
  at: number; active: boolean; rich?: string; gameId?: number | null; title?: string | null;
  consoleId?: number | null; consoleName?: string | null; imageIcon?: string | null; imageUrl?: string | null;
  updatedAt?: number | null; error?: string | null;
}
export interface PresenceStatus {
  enabled: boolean; intervalMin: number; staleMin: number; running: boolean;
  lastSample: PresenceSample | null; nextPollAt: number | null;
}
export interface PlaySession {
  id: number; game_id: number | null; console_id: number | null; title: string | null;
  started_at: number; last_seen_at: number; samples: number; rich_presence: string | null;
  image_icon?: string | null; console_short?: string | null; console_name?: string | null;
}
export interface PlaytimeGame {
  game_id: number | null; title: string | null; console_id: number | null;
  image_icon: string | null; console_short: string | null; ms: number; sessions: number; lastAt: number;
}
export interface PlaytimeTotals { sessions: number; ms: number; games: number }

export interface EmulatorStatus {
  retroarchPath: string; coreDir: string; extraArgs: string; coreOverrides: Record<string, string>;
  retroarchFound: boolean; coreDirFound: boolean;
}
export interface LaunchResult {
  ok: boolean; error?: string; message?: string;
  core?: { coreId: string | null; corePath: string | null; name: string | null; source: string | null };
  args?: string[];
}

export interface OfflineReadiness {
  ready: boolean;
  checks: { id: string; ok: boolean; value: number | null; need?: number }[];
  games: number; hashes: number; playable: number; gameDetails: number;
  images: number; imageBytes: number; lastFullSyncAt: number | null;
}

// ---- DAT completeness ----
export interface DatFile {
  id: number; name: string; description?: string | null; version?: string | null;
  console_id: number | null; console_name?: string | null; game_count: number;
  imported_at: number; total: number; have: number;
}
export interface CrcStatus { total: number; withCrc: number; without: number; }
export interface DatMissing { game: string | null; rom: string | null; crc: string | null; sha1?: string | null; size: number | null; }
export interface DatExtra { path: string; inner: string; size: number | null; crc: string | null; sha1: string | null; }
export interface DatExtras { extras: DatExtra[]; total: number; datCount: number; }
export interface DatCoverage {
  dat: { id: number; name: string; description?: string | null; version?: string | null; console_id: number | null; game_count: number };
  console_name?: string | null; total: number; have: number; missing: DatMissing[]; missingTotal: number; collectionCrcCount: number;
  error?: string;
}

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  status: () => j<AppStatus>('/api/status'),
  settings: () => j<Settings>('/api/settings'),
  // Generic settings save: send any subset of the settings fields.
  saveServerSettings: (patch: Partial<Settings>) =>
    j<{ ok: boolean } & Settings>('/api/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
    }),
  openFolder: (which: 'download' | 'rom' = 'download') =>
    j<{ ok?: boolean; path?: string; error?: string }>('/api/open-folder', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ which }),
    }),
  storage: () => j<StorageInfo>('/api/storage'),
  clearTemp: () => j<{ ok: boolean; removed: number; freed: number; error?: string }>('/api/storage/clear-temp', { method: 'POST' }),
  clearImages: () => j<{ ok: boolean; removed: number; freed: number }>('/api/data/clear-images', { method: 'POST' }),
  resetCollection: () => j<{ ok: boolean; counts?: Record<string, number>; error?: string }>('/api/data/reset-collection', { method: 'POST' }),
  resetHashDb: () => j<{ ok: boolean; counts?: Record<string, number>; error?: string }>('/api/data/reset-hashdb', { method: 'POST' }),
  checkUpdate: () => j<{ ok: boolean; current: string; latest?: string; newer?: boolean; url?: string; notes?: string; asset?: { name: string; url: string; size: number }; error?: string }>('/api/update/check'),
  datList: () => j<{ dats: DatFile[]; crc: CrcStatus }>('/api/dat/list'),
  datCrcStatus: () => j<CrcStatus>('/api/dat/crc-status'),
  datCoverage: (id: number) => j<DatCoverage>(`/api/dat/${id}/coverage`),
  datExtras: () => j<DatExtras>('/api/dat/extras'),
  datDelete: (id: number) => j<{ ok: boolean }>(`/api/dat/${id}`, { method: 'DELETE' }),
  datImport: (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f);
    return j<{ ok: boolean; imported: Array<{ file: string; name: string; entries: number; games: number; console_id: number | null }>; errors: Array<{ file: string; error: string }> }>('/api/dat/import', { method: 'POST', body: fd });
  },
  libraryForGame: (id: number) => j<OwnedFiles>(`/api/library/for-game/${id}`),
  watchConfig: (cfg: { enabled?: boolean; mode?: 'interval' | 'events'; intervalMin?: number; path?: string }) =>
    j<WatchStatus>('/api/watch/config', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg),
    }),
  saveScanTimeout: (scanFileTimeoutSec: number) =>
    j<{ ok: boolean; scanFileTimeoutSec: number }>('/api/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ scanFileTimeoutSec }),
    }),
  saveCacheTtls: (cacheTtls: Partial<CacheTtls>) =>
    j<{ ok: boolean; cacheTtls: CacheTtls }>('/api/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cacheTtls }),
    }),
  backups: () => j<{ backups: BackupInfo[] }>('/api/backups'),
  backupNow: () => j<{ ok: boolean; file?: string; skipped?: boolean; backups: BackupInfo[]; error?: string }>('/api/backup/now', { method: 'POST' }),
  restoreBackup: (name: string) =>
    j<{ ok: boolean; needsRestart?: boolean; error?: string }>('/api/backup/restore', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }),
    }),
  clearCache: (what: 'all' | 'games' | 'profile' = 'all') =>
    j<{ ok: boolean }>('/api/cache/clear', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ what }),
    }),
  saveSettings: (romRoot: string) =>
    j<{ ok: boolean; romRoot: string }>('/api/settings', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ romRoot }),
    }),
  saveCredentials: (username: string, apiKey: string) =>
    j<{ ok: boolean; username?: string; error?: string }>('/api/settings/credentials', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, apiKey }),
    }),
  logout: () => j<{ ok: boolean }>('/api/settings/logout', { method: 'POST' }),
  fsList: (path: string, opts: { files?: boolean; ext?: string[] } = {}) => {
    const p = new URLSearchParams({ path });
    if (opts.files) p.set('files', '1');
    if (opts.ext && opts.ext.length) p.set('ext', opts.ext.join(','));
    return j<{ path: string; parent: string | null; isRoot: boolean; drives: { name: string; path: string }[]; dirs: { name: string; path: string }[]; files?: { name: string; path: string }[]; error?: string }>(
      `/api/fs/list?${p.toString()}`);
  },
  fsInfo: (path: string) => j<{ exists: boolean; isDirectory?: boolean; isFile?: boolean; size?: number }>(`/api/fs/info?path=${encodeURIComponent(path)}`),
  scans: () => j<any[]>('/api/scans'),
  scan: (id: number) => j<any>(`/api/scan/${id}`),
  scanItems: (id: number, q: { status?: string; console_id?: number; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.console_id != null) p.set('console_id', String(q.console_id));
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return j<any[]>(`/api/scan/${id}/items?${p.toString()}`);
  },
  cancelScan: () => j<{ ok: boolean }>('/api/scan/cancel', { method: 'POST' }),
  checkFile: (path: string) =>
    j<{ path: string; results?: ScanItem[]; error?: string }>('/api/check-file', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path }),
    }),
  game: (id: number, refresh = false) => j<any>(`/api/game/${id}${refresh ? '?refresh=1' : ''}`),
  rahasherStatus: () => j<{ available: boolean; path: string; platform: string }>('/api/rahasher/status'),
  library: (q: { status?: string; console_id?: number; q?: string; tag?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.console_id != null) p.set('console_id', String(q.console_id));
    if (q.q) p.set('q', q.q);
    if (q.tag) p.set('tag', q.tag);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    return j<any[]>(`/api/library?${p.toString()}`);
  },
  hashNameStatus: () => j<HashNameStatus>('/api/hashnames/status'),
  hashNamesCancel: () => j<{ ok: boolean }>('/api/hashnames/cancel', { method: 'POST' }),
  libraryTags: (q: { status?: string; console_id?: number } = {}) => {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.console_id != null) p.set('console_id', String(q.console_id));
    return j<TagFacets>(`/api/library/tags?${p.toString()}`);
  },
  libraryStats: () => j<{ total: number; byStatus: { status: string; n: number }[]; byConsole: { id: number; name: string; short: string; total: number; matched: number }[] }>('/api/library/stats'),
  libraryInsights: () => j<{ total: number; playableGames: number; playableFiles: number; obtainableAchievements: number; obtainablePoints: number; byStatus: { status: string; n: number }[] }>('/api/library/insights'),
  suggestPlayable: () => j<any>('/api/library/suggest'),
  quickWins: () => j<QuickWinsResult>('/api/library/quickwins'),
  versionReport: () => j<VersionReportResult>('/api/library/version-report'),
  consoleGames: (id: number, q: { q?: string; limit?: number; offset?: number; sort?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.q) p.set('q', q.q);
    if (q.limit) p.set('limit', String(q.limit));
    if (q.offset) p.set('offset', String(q.offset));
    if (q.sort) p.set('sort', q.sort);
    return j<{ total: number; games: any[] }>(`/api/console/${id}/games?${p.toString()}`);
  },
  searchGames: (q: string, limit = 60) => j<any[]>(`/api/games/search?q=${encodeURIComponent(q)}&limit=${limit}`),
  userProfile: () => j<any>('/api/user/profile'),
  userGame: (id: number) => j<{ numAwarded: number; numAwardedHardcore: number; total: number; completion: string | null; totalPoints: number; points: number; pointsHardcore: number; earned: Record<string, { date: string; hardcore: boolean }>; error?: string }>(`/api/user/game/${id}`),
  userCompletion: (refresh = false) => j<{ _at: number; games: any[]; error?: string }>(`/api/user/completion${refresh ? '?refresh=1' : ''}`),
  duplicates: () => j<any[]>('/api/library/duplicates'),
  collectionDiff: () => j<CollectionDiff>('/api/library/diff'),
  libraryHealth: () => j<{ total: number; missingFiles: number; missingRows: number; missingPaths: string[] }>('/api/library/health'),
  libraryPrune: (paths?: string[]) =>
    j<{ ok: boolean; removed: number; error?: string }>('/api/library/prune', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(paths ? { paths } : {}),
    }),
  // DESTRUCTIVE: deletes the actual ROM files (+ their collection rows).
  deleteFiles: (paths: string[]) =>
    j<{ ok: boolean; deleted: number; freed: number; rows: number; skipped: number; errors: string[]; error?: string }>('/api/library/delete-files', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paths }),
    }),
  schedule: () => j<ScheduleStatus>('/api/schedule'),
  saveSchedule: (cfg: { enabled?: boolean; time?: string }) =>
    j<ScheduleStatus>('/api/schedule', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg),
    }),
  reveal: (path: string) => j<{ ok: boolean }>(`/api/reveal?path=${encodeURIComponent(path)}`),
  watchStart: (path?: string) => j<any>('/api/watch/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path }) }),
  watchStop: () => j<any>('/api/watch/stop', { method: 'POST' }),
  watchStatus: () => j<any>('/api/watch/status'),
  // ---- community / discovery (v0.9) ---------------------------------------
  aotw: (refresh = false) => j<AotwResult>(`/api/community/aotw${refresh ? '?refresh=1' : ''}`),
  recentAwards: (refresh = false) => j<AwardsResult>(`/api/community/recent-awards${refresh ? '?refresh=1' : ''}`),
  claims: (refresh = false) => j<ClaimsResult>(`/api/community/claims${refresh ? '?refresh=1' : ''}`),
  setRequests: (refresh = false) => j<SetRequestsResult>(`/api/user/set-requests${refresh ? '?refresh=1' : ''}`),
  wantToPlay: (refresh = false) => j<WantToPlayResult>(`/api/user/want-to-play${refresh ? '?refresh=1' : ''}`),
  hardcoreGap: () => j<HardcoreGapResult>('/api/user/hardcore-gap'),
  gameLeaderboards: (id: number, refresh = false) => j<LeaderboardsResult>(`/api/game/${id}/leaderboards${refresh ? '?refresh=1' : ''}`),
  leaderboardEntries: (id: number) => j<{ total: number; results: LeaderboardEntry[]; error?: string }>(`/api/leaderboard/${id}/entries`),
  freeGames: (consoleId?: number | null) =>
    j<FreeGamesResult>(`/api/free-games${consoleId != null ? `?console=${consoleId}` : ''}`),
  coverage: () => j<CoverageResult>('/api/coverage'),
  cores: () => j<CoresResult>('/api/cores'),
  coresFor: (consoleId: number) => j<ConsoleCores>(`/api/cores/${consoleId}`),
  newSystems: () => j<NewSystemsResult>('/api/systems/new'),
  // launcher platform names (ES-DE system dirs / LaunchBox platform strings)
  frontendPlatforms: () => j<Record<string, { esde: string | null; launchbox: string }>>('/api/frontends/platforms'),
  // ES-DE needs one gamelist.xml per system with relative paths — the server
  // builds that folder structure and returns it as a zip.
  esdeExportUrl: (q: { console?: number | 'all'; q?: string } = {}) => {
    const p = new URLSearchParams();
    if (q.console != null && q.console !== 'all') p.set('console', String(q.console));
    if (q.q) p.set('q', q.q);
    const qs = p.toString();
    return `/api/export/esde${qs ? `?${qs}` : ''}`;
  },
  // rich presence / play sessions
  presence: () => j<PresenceStatus>('/api/presence'),
  savePresence: (cfg: { enabled?: boolean; intervalMin?: number; staleMin?: number }) =>
    j<PresenceStatus>('/api/presence/config', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg),
    }),
  pollPresence: () => j<PresenceSample & { error?: string }>('/api/presence/poll', { method: 'POST' }),
  sessions: (limit = 40) => j<{ sessions: PlaySession[]; totals: PlaytimeTotals }>(`/api/presence/sessions?limit=${limit}`),
  playtime: (limit = 50) => j<{ games: PlaytimeGame[]; totals: PlaytimeTotals; config: { enabled: boolean; intervalMin: number } }>(`/api/presence/playtime?limit=${limit}`),
  clearSessions: () => j<{ ok: boolean }>('/api/presence/clear', { method: 'POST' }),
  importSessions: (sessions: any[]) =>
    j<{ ok?: boolean; added?: number; skipped?: number; totals?: PlaytimeTotals; error?: string }>('/api/presence/import', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessions }),
    }),
  // emulator launch
  emulator: () => j<EmulatorStatus>('/api/emulator'),
  saveEmulator: (cfg: { retroarchPath?: string; coreDir?: string; extraArgs?: string; coreOverrides?: Record<string, string> }) =>
    j<EmulatorStatus>('/api/emulator', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cfg),
    }),
  detectEmulator: (save = false) =>
    j<{ retroarchPath: string; coreDir: string; saved: boolean }>('/api/emulator/detect', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ save }),
    }),
  detectRahasher: () =>
    j<{ path: string; found: boolean }>('/api/rahasher/detect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }),
  launch: (p: { path: string; inner?: string; consoleId?: number | null }) =>
    j<LaunchResult>('/api/launch', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(p),
    }),
  // offline package
  offlineReadiness: () => j<OfflineReadiness>('/api/offline/readiness'),
  offlineImport: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    const res = await fetch('/api/offline/import', { method: 'POST', body: fd });
    return res.json() as Promise<{ ok: boolean; needsRestart?: boolean; images?: number; error?: string }>;
  },
  uploadCheck: async (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append('files', f, (f as any).webkitRelativePath || f.name);
    const res = await fetch('/api/upload-check', { method: 'POST', body: fd });
    return res.json() as Promise<{ results?: ScanItem[]; error?: string }>;
  },
};

export const imageUrl = (path?: string | null) =>
  path ? `/api/image?path=${encodeURIComponent(path)}` : '';
export const consoleIconUrl = (id: number) => `/api/console/${id}/icon`;

// ---- SSE helper -----------------------------------------------------------
export type SSEHandlers = Record<string, (data: any) => void>;
export function openStream(url: string, handlers: SSEHandlers): EventSource {
  const es = new EventSource(url);
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => {
      try { fn(JSON.parse((e as MessageEvent).data)); } catch { fn({}); }
    });
  }
  es.onerror = () => { handlers.__error?.({}); };
  return es;
}
