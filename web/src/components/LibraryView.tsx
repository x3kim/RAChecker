import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Library as LibraryIcon, Search, ScanLine, RefreshCw, Copy, FolderSearch, Dice5,
  Trophy, Star, CheckCircle2, XCircle, Cpu, HelpCircle, Layers, Download, Wand2, AlertTriangle,
  Stethoscope, Trash2, ListMusic, CheckSquare, Play, ChevronDown, FileCode2, FileSpreadsheet,
  Languages,
} from 'lucide-react';
import type { AppStatus, ScanItem, ScanStatus, TagFacets } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ResultsTable } from './ResultsTable';
import { VersionReport } from './VersionReport';
import { ConsoleIcon, SectionHeader, ViewToggle, StatusBadge } from './ui';
import { RegionBadges } from './RegionBadges';
import { Pct } from './Progress';
import { SkeletonGrid } from './Skeleton';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';
import { pct, basename, toCsv, downloadText, statusLabel, statusHelp, fmtBytes } from '../lib/util';
import {
  loadRegionPriority, cachedRegionPriority, REGION_EVENT, NO_TAGS,
  itemRank, langToken, tokenName,
} from '../lib/region';

function mapRow(r: any): ScanItem {
  return {
    filePath: r.path, innerPath: r.inner_path || null, ext: r.ext, size: r.size,
    consoleId: r.console_id, md5: r.md5, matchGameId: r.match_game_id, status: r.status,
    message: r.message ?? r.match_title, matchTitle: r.match_title, matchImage: r.match_image,
    matchAchievements: r.match_achievements, matchPoints: r.match_points,
    scannedAt: r.scanned_at, region: r.region ?? null, langs: r.langs ?? null,
  };
}

type SortKey = 'recent' | 'name' | 'achievements' | 'points' | 'region';
const SORTS: { id: SortKey; key: string }[] = [
  { id: 'recent', key: 'lib.sort.recent' },
  { id: 'name', key: 'lib.sort.name' },
  { id: 'achievements', key: 'lib.sort.achievements' },
  { id: 'points', key: 'lib.sort.points' },
  { id: 'region', key: 'lib.sort.region' },
];

const SEGMENTS: { id: 'match' | 'no_match' | 'needs_rahasher' | 'ambiguous' | 'error' | 'all'; key: string; color: string; glow?: string; icon: any }[] = [
  { id: 'match', key: 'lib.seg.match', color: 'var(--color-neon-green)', glow: 'var(--shadow-glow-green)', icon: CheckCircle2 },
  { id: 'no_match', key: 'lib.seg.no_match', color: 'var(--color-neon-red)', icon: XCircle },
  { id: 'needs_rahasher', key: 'lib.seg.needs_rahasher', color: 'var(--color-neon-amber)', glow: 'var(--shadow-glow-amber)', icon: Cpu },
  { id: 'ambiguous', key: 'lib.seg.ambiguous', color: 'var(--color-neon-purple)', icon: HelpCircle },
  { id: 'error', key: 'lib.seg.error', color: 'var(--color-neon-red)', icon: AlertTriangle },
  { id: 'all', key: 'lib.seg.all', color: 'var(--color-neon-cyan)', icon: Layers },
];

// Order the copies of one game so the preferred region/language comes first.
// A stable sort keeps the server's path order for ties, so with an empty
// priority list nothing moves at all.
function orderCopies(files: any[], priority: string[]) {
  if (!priority.length) return files;
  return [...files]
    .map((f, i) => ({ f, i, rank: itemRank({ region: f.region ?? null, langs: f.langs ?? null, filePath: f.path, innerPath: f.inner_path }, priority) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.f);
}

export function LibraryView({ status, profile, onOpenGame, goScan, onFindVersion }: {
  status: AppStatus | null; profile: any; onOpenGame: (id: number) => void; goScan: () => void; onFindVersion: (item: any) => void;
}) {
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.libraryStats>> | null>(null);
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof api.libraryInsights>> | null>(null);
  const [rows, setRows] = useState<ScanItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | ScanStatus>('match');
  const [systemFilter, setSystemFilter] = useState<number | 'all'>('all');
  const [tagFilter, setTagFilter] = useState<string | 'all'>('all');
  const [facets, setFacets] = useState<TagFacets | null>(null);
  const [priority, setPriority] = useState<string[]>(cachedRegionPriority());
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [dupes, setDupes] = useState<any[] | null>(null);
  const [showDupes, setShowDupes] = useState(false);
  const [suggestion, setSuggestion] = useState<any>(null);
  const [showReport, setShowReport] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [mode, setMode] = useViewMode('library', 'table'); // table = current ResultsTable look
  const { t } = useI18n();
  const [showHealth, setShowHealth] = useState(false);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.libraryHealth>> | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [healthMsg, setHealthMsg] = useState('');
  const [exportMsg, setExportMsg] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  // Launcher platform names, fetched once on the first export that needs them.
  const platformsRef = useRef<Record<string, { esde: string | null; launchbox: string }> | null>(null);
  const [launchMsg, setLaunchMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  // Delete actual ROM files from disk (+ their collection rows). Confirms first.
  const deleteFiles = async (paths: string[]) => {
    const uniq = [...new Set(paths.filter(Boolean))];
    if (!uniq.length) return;
    if (!window.confirm(t('lib.delConfirm', { n: uniq.length }))) return;
    try {
      const r = await api.deleteFiles(uniq);
      if (r.ok) { setActionMsg(t('lib.deleted', { n: r.deleted, size: fmtBytes(r.freed) })); loadStats(); loadRows(); loadDupes(); setSelected(new Set()); }
      else setActionMsg(r.error || t('common.error'));
    } catch { setActionMsg(t('common.error')); }
    setTimeout(() => setActionMsg(''), 4000);
  };
  // Multi-select for bulk actions (keyed by path|inner).
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const rowKey = (r: ScanItem) => `${r.filePath}|${r.innerPath ?? ''}`;
  const toggleSel = (r: ScanItem) => setSelected((s) => { const n = new Set(s); const k = rowKey(r); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const shortById = useMemo(() => new Map((status?.consoles ?? []).map((c) => [c.id, c.short_code])), [status]);

  const sortedRows = useMemo(() => {
    const r = [...rows];
    if (sortBy === 'name') r.sort((a, b) => (a.matchTitle || basename(a.filePath)).localeCompare(b.matchTitle || basename(b.filePath)));
    else if (sortBy === 'achievements') r.sort((a, b) => (b.matchAchievements || 0) - (a.matchAchievements || 0));
    else if (sortBy === 'points') r.sort((a, b) => (b.matchPoints || 0) - (a.matchPoints || 0));
    // Preferred regions/languages first; inside one rank the title keeps the
    // list readable, and files with no tags land at the very end.
    else if (sortBy === 'region') {
      r.sort((a, b) => {
        const d = itemRank(a, priority) - itemRank(b, priority);
        if (d !== 0) return d;
        return (a.matchTitle || basename(a.filePath)).localeCompare(b.matchTitle || basename(b.filePath));
      });
    }
    else r.sort((a, b) => (b.scannedAt || 0) - (a.scannedAt || 0));
    return r;
  }, [rows, sortBy, priority]);
  const selectedRows = sortedRows.filter((r) => selected.has(rowKey(r)));

  const exportCsv = () => {
    const header = [t('rt.status'), t('lib.csvSystem'), t('rt.file'), t('lib.csvInnerPath'), t('lib.csvGame'), t('rt.ach'), t('rt.points'), t('rt.hash'), t('lib.csvPath')];
    const data = rows.map((r) => [
      statusLabel(r.status),
      r.consoleId != null ? (shortById.get(r.consoleId) ?? '') : '',
      basename(r.filePath), r.innerPath ?? '', r.matchTitle ?? '',
      r.matchAchievements ?? '', r.matchPoints ?? '', r.md5 ?? '', r.filePath,
    ]);
    downloadText(`ra-checker-collection-${statusFilter}.csv`, toCsv(header, data), 'text/csv');
  };

  const loadStats = () => { api.libraryStats().then(setStats).catch(() => {}); api.libraryInsights().then(setInsights).catch(() => {}); };
  const loadDupes = () => api.duplicates().then(setDupes).catch(() => setDupes([]));
  const loadFacets = () => api.libraryTags({
    status: statusFilter === 'all' ? undefined : statusFilter,
    console_id: systemFilter === 'all' ? undefined : systemFilter,
  }).then(setFacets).catch(() => setFacets(null));
  const loadRows = () => {
    setLoading(true);
    api.library({
      status: statusFilter === 'all' ? undefined : statusFilter,
      console_id: systemFilter === 'all' ? undefined : systemFilter,
      tag: tagFilter === 'all' ? undefined : tagFilter,
      q: search.trim() || undefined, limit: 3000,
    }).then((r) => setRows(r.map(mapRow))).catch(() => setRows([])).finally(() => setLoading(false));
  };
  const roll = () => api.suggestPlayable().then((g) => !g.empty && setSuggestion(g)).catch(() => {});

  const loadHealth = () => { setHealthBusy(true); setHealthMsg(''); setHealth(null); api.libraryHealth().then(setHealth).catch(() => {}).finally(() => setHealthBusy(false)); };
  const pruneMissing = async () => {
    setHealthBusy(true);
    try { const r = await api.libraryPrune(); setHealthMsg(t('health.removed', { n: r.removed })); loadStats(); loadRows(); loadHealth(); }
    finally { setHealthBusy(false); }
  };
  // ---- exports ------------------------------------------------------------
  // Every launcher format is built client-side from the rows the current
  // filters describe, restricted to matched entries. Archive members keep
  // RetroArch's `archive.zip#inner` path syntax everywhere.
  const xmlEsc = (v: unknown) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const csvEsc = (v: unknown) => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const romPath = (r: any) => (r.inner_path ? `${r.path}#${r.inner_path}` : r.path);
  const romTitle = (r: any) => r.match_title || basename(r.inner_path || r.path);
  const platformOf = (r: any) => r.console_name || r.console_short || '';

  const exportDone = (n: number) => { setExportMsg(t('exp.done', { n })); setTimeout(() => setExportMsg(''), 3000); };
  const exportNone = () => { setExportMsg(t('exp.noMatches')); setTimeout(() => setExportMsg(''), 3000); };

  // Matched rows for the active system/search filter (raw API shape).
  const matchedRows = () => api.library({
    status: 'match',
    console_id: systemFilter === 'all' ? undefined : systemFilter,
    q: search.trim() || undefined,
    limit: 100000,
  }).catch(() => [] as any[]);

  // RetroArch playlist (.lpl, JSON). Core is left as DETECT.
  const exportLpl = async () => {
    const rows = await matchedRows();
    if (!rows.length) return exportNone();
    const items = rows.map((r: any) => ({
      path: romPath(r), label: romTitle(r),
      core_path: 'DETECT', core_name: 'DETECT', crc32: '', db_name: 'RAChecker.lpl',
    }));
    const lpl = { version: '1.5', default_core_path: '', default_core_name: '', label_display_mode: 0, right_thumbnail_mode: 0, left_thumbnail_mode: 0, sort_mode: 0, items };
    downloadText('RAChecker.lpl', JSON.stringify(lpl, null, 2), 'application/json');
    exportDone(items.length);
  };

  // ES-DE expects ONE gamelist.xml per system with <path> relative to that
  // system's ROM folder — a single flat file with absolute paths would not load.
  // The server builds the real folder structure and returns it as a zip.
  const exportEsde = async () => {
    const rows = await matchedRows();
    if (!rows.length) return exportNone();
    window.location.href = api.esdeExportUrl({ console: systemFilter, q: search.trim() || undefined });
    exportDone(rows.length);
  };

  // Official platform names per launcher (LaunchBox matches on them); falls back
  // to the RA console name when a system isn't in the table.
  const platformFor = async (r: any) => {
    if (!platformsRef.current) {
      platformsRef.current = await api.frontendPlatforms().catch(() => ({}));
    }
    return platformsRef.current?.[String(r.console_id)]?.launchbox || platformOf(r);
  };

  // Playnite CSV importer format.
  const exportPlaynite = async () => {
    const rows = await matchedRows();
    if (!rows.length) return exportNone();
    const lines = ['Name,Platform,Path,Source'];
    for (const r of rows as any[]) {
      lines.push([romTitle(r), await platformFor(r), romPath(r), 'RetroAchievements'].map(csvEsc).join(','));
    }
    downloadText('playnite-import.csv', lines.join('\r\n'), 'text/csv');
    exportDone(rows.length);
  };

  // LaunchBox XML (one <Game> per ROM).
  const exportLaunchbox = async () => {
    const rows = await matchedRows();
    if (!rows.length) return exportNone();
    const parts: string[] = [];
    for (const r of rows as any[]) {
      parts.push(
        `  <Game>\n    <Title>${xmlEsc(romTitle(r))}</Title>\n    <ApplicationPath>${xmlEsc(romPath(r))}</ApplicationPath>\n` +
        `    <Platform>${xmlEsc(await platformFor(r))}</Platform>\n    <Notes></Notes>\n  </Game>`,
      );
    }
    downloadText('LaunchBox.xml', `<?xml version="1.0" standalone="yes"?>\n<LaunchBox>\n${parts.join('\n')}\n</LaunchBox>\n`, 'application/xml');
    exportDone(rows.length);
  };

  const EXPORTS: { id: string; key: string; icon: any; run: () => void | Promise<void> }[] = [
    { id: 'lpl', key: 'exp.lpl', icon: ListMusic, run: exportLpl },
    { id: 'esde', key: 'exp.esde', icon: FileCode2, run: exportEsde },
    { id: 'playnite', key: 'exp.playnite', icon: FileSpreadsheet, run: exportPlaynite },
    { id: 'launchbox', key: 'exp.launchbox', icon: FileCode2, run: exportLaunchbox },
    { id: 'csv', key: 'exp.csv', icon: FileSpreadsheet, run: () => { exportCsv(); exportDone(rows.length); } },
  ];

  // Launch a ROM in the configured emulator; result lands in the inline status.
  const launchRom = async (r: ScanItem) => {
    try {
      const res = await api.launch({ path: r.filePath, inner: r.innerPath || '', consoleId: r.consoleId });
      if (res.ok) setLaunchMsg({ text: t('launch.started', { n: res.core?.name ?? '' }), ok: true });
      else if (res.error === 'no_emulator') setLaunchMsg({ text: t('launch.notConfigured'), ok: false });
      else setLaunchMsg({ text: t('launch.failed', { e: res.message ?? res.error ?? '' }), ok: false });
    } catch (e: any) {
      setLaunchMsg({ text: t('launch.failed', { e: String(e?.message ?? e) }), ok: false });
    }
    setTimeout(() => setLaunchMsg(null), 5000);
  };

  useEffect(() => { loadStats(); loadRegionPriority().then(setPriority); }, []);
  // Settings fires this after saving so an open collection re-sorts immediately.
  useEffect(() => {
    const h = (e: Event) => setPriority(((e as CustomEvent).detail as string[]) ?? []);
    window.addEventListener(REGION_EVENT, h);
    return () => window.removeEventListener(REGION_EVENT, h);
  }, []);
  useEffect(() => { const t = setTimeout(loadRows, 200); return () => clearTimeout(t); /* eslint-disable-next-line */ }, [statusFilter, systemFilter, tagFilter, search]);
  // The chips describe what the *other* filters left over, so they follow those
  // two but deliberately not the tag filter itself (which would empty them out).
  useEffect(() => { loadFacets(); /* eslint-disable-next-line */ }, [statusFilter, systemFilter]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const statusCount = (s: string) => stats?.byStatus.find((x) => x.status === s)?.n ?? 0;
  const total = stats?.total ?? 0;
  const playablePct = insights ? pct(insights.playableFiles, insights.total) : 0;

  // stats === null means the initial stats fetch hasn't resolved yet — treat
  // that as a loading state so the "collection is empty" screen doesn't flash
  // on every mount (e.g. switching sub-tabs inside the profile hub).
  if (stats === null) {
    return <SkeletonGrid n={6} cols="grid-cols-1" />;
  }

  if (total === 0 && !loading) {
    return (
      <div className="panel p-12 text-center">
        <LibraryIcon size={44} className="mx-auto text-ink-dim mb-3" />
        <div className="font-display text-sm text-ink-mid">{t('lib.empty')}</div>
        <div className="font-body text-ink-dim mt-2 text-sm max-w-md mx-auto">
          {t('lib.emptyBody')}
        </div>
        <button className="btn btn-primary mx-auto mt-5" onClick={goScan}><ScanLine size={18} /> {t('lib.scanNow')}</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* compatibility hero (profile-combined) */}
      <section className="panel panel-glow crt-scanlines p-5">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-center">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {profile?.avatarUrl
              ? <img src={imageUrl(profile.avatarUrl)} width={56} height={56} className="rounded-lg shrink-0" style={{ border: '1px solid var(--color-neon-cyan)', objectFit: 'contain' }} alt="" />
              : <LibraryIcon size={40} className="text-neon-cyan shrink-0" />}
            <div className="min-w-0">
              <h1 className="font-display text-lg text-glow-cyan truncate">{profile?.User ? t('lib.collectionOf', { user: profile.User }) : t('lib.myCollection')}</h1>
              <div className="font-mono text-base text-ink-mid mt-1">{t('lib.filesChecked', { n: total.toLocaleString('de-DE') })}</div>
            </div>
          </div>

          {/* playable ratio bar */}
          <div className="flex-1 min-w-[220px]">
            <div className="flex justify-between font-mono text-base mb-1">
              <span className="text-neon-green">{t('lib.withAchN', { n: insights?.playableFiles ?? 0 })}</span>
              <span className="text-ink-mid">{playablePct}%</span>
            </div>
            <Pct value={playablePct} heightClass="h-3" color="var(--color-neon-green)" ringSize={60} />
            <div className="flex gap-4 mt-2 font-mono text-base">
              <span className="text-neon-amber inline-flex items-center gap-1"><Trophy size={13} /> {(insights?.obtainableAchievements ?? 0).toLocaleString('de-DE')} {t('lib.obtainable')}</span>
              <span className="text-neon-cyan inline-flex items-center gap-1"><Star size={13} /> {(insights?.obtainablePoints ?? 0).toLocaleString('de-DE')} {t('common.points')}</span>
            </div>
          </div>

          <button className="btn btn-primary shrink-0" onClick={roll}><Dice5 size={18} /> {t('lib.whatToPlay')}</button>
        </div>

        {/* suggestion card */}
        {suggestion && (
          <div className="panel !rounded-lg p-3 mt-4 flex items-center gap-3" style={{ borderColor: 'var(--color-neon-green)' }}>
            {suggestion.image_icon ? <img src={imageUrl(suggestion.image_icon)} width={48} height={48} className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
            <div className="min-w-0 flex-1">
              <div className="font-mono text-base text-neon-green">{t('lib.playNext')}</div>
              <div className="font-body text-ink-hi truncate">{suggestion.title}</div>
              <div className="font-mono text-base text-ink-dim flex items-center gap-1.5"><ConsoleIcon id={suggestion.console_id} size={14} /> {suggestion.console_name} · <span className="text-neon-amber">{t('gm.achievementsN', { n: suggestion.num_achievements })}</span></div>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button className="btn !py-1 !px-2.5 text-sm" onClick={() => onOpenGame(suggestion.id)}>{t('common.details')}</button>
              <button className="btn !py-1 !px-2.5 text-sm" onClick={() => api.reveal(suggestion.path).catch(() => {})}><FolderSearch size={13} /> {t('lib.explorer')}</button>
              <button className="btn !py-1 !px-2.5 text-sm" onClick={roll}><Dice5 size={13} /> {t('lib.again')}</button>
            </div>
          </div>
        )}
      </section>

      {/* segmented status control — strong visual separation */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {SEGMENTS.map((s) => {
          const active = statusFilter === s.id;
          const count = s.id === 'all' ? total : statusCount(s.id);
          return (
            <button key={s.id} onClick={() => setStatusFilter(s.id)}
              title={s.id === 'all' ? t('lib.allEntries') : statusHelp(s.id)}
              className="panel !rounded-lg p-3 text-left transition-all flex items-center gap-3"
              style={active ? { borderColor: s.color, boxShadow: s.glow || `0 0 0 1px ${s.color}` } : {}}>
              <s.icon size={22} style={{ color: s.color }} className="shrink-0" />
              <div>
                <div className="font-display text-lg" style={{ color: s.color }}>{count.toLocaleString('de-DE')}</div>
                <div className="font-mono text-base text-ink-mid">{t(s.key)}</div>
              </div>
            </button>
          );
        })}
      </section>

      {/* toolbar */}
      <section className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 panel !rounded-lg px-3">
          <Search size={16} className="text-ink-dim" />
          <input data-search="1" className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('lib.searchPlaceholder')} />
        </div>
        <select className="input !w-auto !py-1.5 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)} title={t('lib.sort.recent')}>
          {SORTS.map((s) => <option key={s.id} value={s.id}>{t(s.key)}</option>)}
        </select>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => { const n = !showDupes; setShowDupes(n); if (n && !dupes) loadDupes(); }}
          style={showDupes ? { borderColor: 'var(--color-neon-purple)' } : {}}>
          <Copy size={14} /> {t('lib.duplicates')}{dupes ? ` (${dupes.length})` : ''}
        </button>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => { const n = !showHealth; setShowHealth(n); if (n && !health) loadHealth(); }}
          style={showHealth ? { borderColor: 'var(--color-neon-amber)' } : {}}>
          <Stethoscope size={14} /> {t('health.button')}{health ? ` (${health.missingFiles})` : ''}
        </button>
        {/* export menu — plain relative wrapper (never give .panel a position) */}
        <div className="relative" ref={exportRef}>
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setExportOpen((o) => !o)} title={t('exp.menu')}>
            <Download size={14} /> {t('exp.menu')} <ChevronDown size={13} />
          </button>
          {exportOpen && (
            <div className="panel panel-glow absolute left-0 mt-2 p-1.5 w-64 z-30 max-h-[70vh] overflow-auto">
              {EXPORTS.map((x) => (
                <button key={x.id} onClick={() => { setExportOpen(false); x.run(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[rgba(127,127,127,.12)] text-left">
                  <x.icon size={15} className="text-neon-cyan shrink-0" />
                  <span className="font-body text-sm flex-1 text-ink-hi">{t(x.key)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {exportMsg && <span className="font-mono text-sm text-neon-green">{exportMsg}</span>}
        {statusCount('no_match') > 0 && (
          <button className="btn btn-magenta !py-1.5 !px-3 text-sm" onClick={() => setShowReport(true)} title={t('lib.versionReportTip')}>
            <Wand2 size={14} /> {t('lib.versionReport')}
          </button>
        )}
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => { loadStats(); loadRows(); loadDupes(); }}><RefreshCw size={14} /> {t('common.refresh')}</button>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => { setSelectMode((m) => !m); setSelected(new Set()); }}
          style={selectMode ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
          <CheckSquare size={14} /> {selectMode ? t('lib.selDone') : t('lib.select')}
        </button>
        <ViewToggle mode={mode} onChange={setMode} />
        <span className="font-mono text-ink-dim text-base">{loading ? t('common.loading') : t('lib.shown', { n: rows.length.toLocaleString('de-DE') })}</span>
      </section>

      {/* bulk action bar */}
      {selectMode && (
        <section className="panel p-3 flex items-center gap-2 flex-wrap" style={{ borderColor: 'var(--color-neon-cyan)' }}>
          <span className="font-mono text-base text-ink-hi">{t('lib.selectedN', { n: selected.size })}</span>
          <button className="btn !py-1 !px-2.5 text-sm" onClick={() => setSelected(new Set(sortedRows.slice(0, 800).map(rowKey)))}>{t('lib.selAll')}</button>
          <button className="btn !py-1 !px-2.5 text-sm" onClick={() => setSelected(new Set())}>{t('lib.selNone')}</button>
          <div className="flex-1" />
          <button className="btn !py-1 !px-2.5 text-sm" disabled={!selected.size}
            onClick={() => { navigator.clipboard?.writeText(selectedRows.map((r) => r.filePath).join('\n')); setActionMsg(t('lib.copied')); setTimeout(() => setActionMsg(''), 2000); }}>
            <Copy size={13} /> {t('lib.bulkCopy')}
          </button>
          <button className="btn btn-danger !py-1 !px-2.5 text-sm" disabled={!selected.size}
            onClick={() => deleteFiles(selectedRows.map((r) => r.filePath))}>
            <Trash2 size={13} /> {t('lib.bulkDelete')}
          </button>
          {actionMsg && <span className="font-mono text-sm text-neon-green">{actionMsg}</span>}
        </section>
      )}

      {!selectMode && actionMsg && <div className="font-mono text-sm text-neon-green -mt-2">{actionMsg}</div>}
      {launchMsg && (
        <div className="font-mono text-sm -mt-2" style={{ color: launchMsg.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>
          {launchMsg.text}
        </div>
      )}

      {/* duplicates */}
      {showDupes && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-purple)" title={t('lib.dupTitle')} icon={Copy} />
          {!dupes ? <div className="font-mono text-ink-dim">{t('common.loading')}</div>
            : dupes.length === 0 ? <div className="font-mono text-ink-dim">{t('lib.noDupes')}</div>
            : <div className="space-y-2">
                {dupes.map((d) => {
                  // The copy that best matches the region/language preference is
                  // the keeper — ★ marks it and "delete extras" spares exactly
                  // that one. Without a preference this stays the old order.
                  const files = orderCopies(d.files, priority);
                  return (
                  <div key={d.game_id} className="panel !rounded-lg p-3">
                    <div className="flex items-center gap-3">
                      {d.image_icon ? <img src={imageUrl(d.image_icon)} width={32} height={32} className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                      <button className="font-body text-sm text-neon-green truncate flex-1 text-left" onClick={() => onOpenGame(d.game_id)} title={d.title}>{d.title}</button>
                      <ConsoleIcon id={d.console_id} short={d.console_short} size={20} />
                      <span className="font-mono text-base px-2 py-0.5 rounded" style={{ color: 'var(--color-neon-purple)', border: '1px solid var(--color-neon-purple)' }}>{d.copies}×</span>
                      <button className="btn btn-danger !py-1 !px-2 text-sm shrink-0"
                        title={priority.length ? t('lib.dupDeleteKeepTip', { keep: basename(files[0].path) }) : t('lib.dupDeleteTip')}
                        onClick={() => deleteFiles(files.slice(1).map((f: any) => f.path))}>
                        <Trash2 size={13} /> {t('lib.dupDelete')}
                      </button>
                    </div>
                    <div className="mt-2 space-y-1 pl-1">
                      {files.map((f: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 font-mono text-sm text-ink-dim">
                          <button className="hover:text-neon-cyan" title={t('rt.explorerTip')} onClick={() => api.reveal(f.path).catch(() => {})}><FolderSearch size={13} /></button>
                          <span className="truncate flex-1" title={f.path}>{i === 0 && <span className="text-neon-green">★ </span>}{basename(f.path)}{f.inner_path ? ` › ${f.inner_path}` : ''}</span>
                          <RegionBadges item={{ region: f.region ?? null, langs: f.langs ?? null, filePath: f.path, innerPath: f.inner_path }} priority={priority} max={3} />
                          {i > 0 && <button className="hover:text-neon-red shrink-0" title={t('lib.delFile')} onClick={() => deleteFiles([f.path])}><Trash2 size={12} /></button>}
                        </div>
                      ))}
                    </div>
                  </div>
                  );
                })}
              </div>}
        </section>
      )}

      {/* collection health — missing files */}
      {showHealth && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-amber)" title={t('health.title')} icon={Stethoscope} />
          <p className="font-body text-ink-dim text-sm -mt-2 mb-3">{t('health.hint')}</p>
          {healthBusy && !health ? <div className="font-mono text-ink-dim">{t('health.checking')}</div>
            : !health ? null
            : health.missingFiles === 0 ? <div className="font-mono text-neon-green">{t('health.allok')}</div>
            : (
              <div>
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  <span className="font-mono text-base text-neon-amber">{t('health.missing', { n: health.missingFiles, rows: health.missingRows })}</span>
                  <button className="btn btn-danger !py-1.5 !px-3 text-sm" onClick={pruneMissing} disabled={healthBusy}>
                    <Trash2 size={14} /> {t('health.remove')}
                  </button>
                  {healthMsg && <span className="font-mono text-sm text-neon-green">{healthMsg}</span>}
                </div>
                <div className="space-y-1 max-h-72 overflow-auto pr-1">
                  {health.missingPaths.map((p) => (
                    <div key={p} className="font-mono text-sm text-ink-dim flex items-center gap-2">
                      <XCircle size={13} className="text-neon-red shrink-0" />
                      <span className="truncate" title={p}>{p}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </section>
      )}

      {/* systems */}
      {stats && stats.byConsole.length > 1 && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-cyan)" title={t('lib.bySystem')} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSystemFilter('all')} className="btn !py-1 !px-2.5 text-sm" style={systemFilter === 'all' ? { borderColor: 'var(--color-neon-cyan)' } : {}}>{t('common.all')}</button>
            {stats.byConsole.filter((c) => c.id != null).map((c) => (
              <button key={c.id} onClick={() => setSystemFilter(systemFilter === c.id ? 'all' : c.id)}
                className="btn !py-1 !px-2.5 text-sm"
                style={systemFilter === c.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}} title={c.name}>
                <ConsoleIcon id={c.id} short={c.short} size={18} />
                <span className="font-body">{(c.name || '?').length > 16 ? c.name.slice(0, 15) + '…' : (c.name || '?')}</span>
                <span className="font-mono" style={{ color: c.matched > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>{c.matched}/{c.total}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* region / language — built from what the collection actually contains */}
      {facets && (facets.regions.length > 0 || facets.languages.length > 0) && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-purple)" title={t('lib.byRegion')} icon={Languages}>
            <span className="font-mono text-sm text-ink-dim shrink-0">
              {priority.length ? t('lib.priorityActive', { list: priority.map(tokenName).join(' › ') }) : t('lib.priorityNone')}
            </span>
          </SectionHeader>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setTagFilter('all')} className="btn !py-1 !px-2.5 text-sm"
              style={tagFilter === 'all' ? { borderColor: 'var(--color-neon-purple)' } : {}}>{t('common.all')}</button>
            {facets.regions.map((r) => (
              <button key={r.code} onClick={() => setTagFilter(tagFilter === r.code ? 'all' : r.code)}
                className="btn !py-1 !px-2.5 text-sm" title={tokenName(r.code)}
                style={tagFilter === r.code ? { borderColor: 'var(--color-neon-purple)', boxShadow: '0 0 0 1px var(--color-neon-purple)' } : {}}>
                <span className="font-body">{r.code}</span>
                <span className="font-mono text-ink-dim">{r.n}</span>
              </button>
            ))}
            {facets.languages.map((l) => {
              const tok = langToken(l.code);
              return (
                <button key={tok} onClick={() => setTagFilter(tagFilter === tok ? 'all' : tok)}
                  className="btn !py-1 !px-2.5 text-sm" title={tokenName(tok)}
                  style={tagFilter === tok ? { borderColor: 'var(--color-neon-cyan)', boxShadow: '0 0 0 1px var(--color-neon-cyan)' } : {}}>
                  <span className="font-body text-ink-mid">{l.code}</span>
                  <span className="font-mono text-ink-dim">{l.n}</span>
                </button>
              );
            })}
            {facets.untagged > 0 && (
              <button onClick={() => setTagFilter(tagFilter === NO_TAGS ? 'all' : NO_TAGS)}
                className="btn !py-1 !px-2.5 text-sm" title={t('lib.untaggedTip')}
                style={tagFilter === NO_TAGS ? { borderColor: 'var(--color-neon-amber)' } : {}}>
                <span className="font-body">{t('lib.untagged')}</span>
                <span className="font-mono text-ink-dim">{facets.untagged}</span>
              </button>
            )}
          </div>
          <p className="font-body text-ink-dim text-sm mt-3">{t('lib.regionHint')}</p>
        </section>
      )}

      {rows.length > 0
        ? ((selectMode || mode === 'card')
            ? <LibraryCards rows={sortedRows.slice(0, 800)} shortById={shortById} onOpenGame={onOpenGame}
                selectMode={selectMode} selected={selected} toggleSel={toggleSel} rowKey={rowKey} onLaunch={launchRom} priority={priority} />
            : <ResultsTable items={sortedRows} consoleShortById={shortById} onOpenGame={onOpenGame} onFindVersion={onFindVersion} cap={800} priority={priority} />)
        : loading
          ? <SkeletonGrid n={6} cols="grid-cols-1" />
          : <div className="panel p-8 font-mono text-ink-dim text-center">{statusFilter === 'match' ? t('lib.noMatchFilter') : t('lib.noEntries')}</div>}

      {showReport && <VersionReport onOpenGame={onOpenGame} onClose={() => setShowReport(false)} />}
    </div>
  );
}

// Card grid for the collection (alternative to the ResultsTable rows). One card
// per entry; matched entries open the game modal on click.
function LibraryCards({ rows, shortById, onOpenGame, selectMode, selected, toggleSel, rowKey, onLaunch, priority = [] }: {
  rows: ScanItem[]; shortById: Map<number, string | undefined>; onOpenGame: (id: number) => void;
  selectMode?: boolean; selected?: Set<string>; toggleSel?: (r: ScanItem) => void; rowKey?: (r: ScanItem) => string;
  onLaunch?: (r: ScanItem) => void; priority?: string[];
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {rows.map((r, i) => {
        const title = r.matchTitle || basename(r.innerPath || r.filePath);
        const clickable = r.status === 'match' && r.matchGameId != null;
        const key = rowKey ? rowKey(r) : `${r.filePath}|${r.innerPath ?? ''}`;
        const isSel = !!selected?.has(key);
        const onClick = selectMode ? () => toggleSel?.(r) : () => { if (clickable) onOpenGame(r.matchGameId!); };
        return (
          <button key={`${key}|${i}`} onClick={onClick}
            className="panel !rounded-lg p-3 flex items-start gap-3 text-left hover:border-neon-cyan transition-colors"
            style={{ borderColor: isSel ? 'var(--color-neon-cyan)' : 'var(--color-crt-line)', boxShadow: isSel ? 'var(--shadow-glow-cyan)' : undefined, cursor: (selectMode || clickable) ? 'pointer' : 'default' }}>
            {selectMode && <CheckSquare size={18} className="shrink-0 mt-1" style={{ color: isSel ? 'var(--color-neon-cyan)' : 'var(--color-ink-dim)', opacity: isSel ? 1 : 0.4 }} />}
            {r.matchImage
              ? <img src={imageUrl(r.matchImage)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
              : <span className="shrink-0 grid place-items-center rounded" style={{ width: 40, height: 40, border: '1px solid var(--color-crt-line)' }}><ConsoleIcon id={r.consoleId} short={r.consoleId != null ? shortById.get(r.consoleId) : undefined} size={22} /></span>}
            <div className="min-w-0 flex-1">
              <div className="font-body text-sm text-ink-hi truncate" title={title}>{title}</div>
              <div className="font-mono text-sm text-ink-dim truncate" title={r.filePath}>{basename(r.innerPath || r.filePath)}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusBadge status={r.status} />
                {r.consoleId != null && <ConsoleIcon id={r.consoleId} short={shortById.get(r.consoleId)} size={16} />}
                <RegionBadges item={r} priority={priority} />

                {r.status === 'match' && (
                  <span className="font-mono text-sm flex items-center gap-2">
                    <span className="text-neon-amber inline-flex items-center gap-1"><Trophy size={11} /> {r.matchAchievements ?? 0}</span>
                    <span className="text-neon-cyan inline-flex items-center gap-1"><Star size={11} /> {r.matchPoints ?? 0}</span>
                  </span>
                )}
              </div>
            </div>
            {/* span, not <button>: the card itself is already a button */}
            {!selectMode && r.status === 'match' && onLaunch && (
              <span role="button" tabIndex={0} className="btn !py-0.5 !px-1.5 text-sm shrink-0"
                title={t('launch.playTip')}
                onClick={(e) => { e.stopPropagation(); onLaunch(r); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onLaunch(r); } }}>
                <Play size={12} /> {t('launch.play')}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
