import { useEffect, useMemo, useState } from 'react';
import { Gift, RefreshCw, Search, Download, Trophy, ScanLine, FolderOpen, Settings2 } from 'lucide-react';
import type { AppStatus, FreeGamesResult } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, Stat, ViewToggle } from './ui';
import { SkeletonGrid } from './Skeleton';
import { CountUp, Stagger, StaggerItem } from '../lib/anim';
import { useViewMode } from '../lib/viewmode';
import { useI18n } from '../lib/i18n';

// Discovery surface for RetroAchievements' curated list of legally free
// homebrew/freeware games: what you can download right now and immediately
// start earning achievements in. Cross-references the local RA game DB and
// the scanned collection so "owned" reflects your actual library.
export function FreeGamesPanel({ status, onOpenGame, goScan, goSettings }: {
  status: AppStatus | null;
  onOpenGame: (id: number) => void;
  goScan: () => void;
  goSettings: () => void;
}) {
  const { t } = useI18n();
  const [downloadDir, setDownloadDir] = useState('');
  useEffect(() => { api.settings().then((s) => setDownloadDir(s.downloadDir || '')).catch(() => {}); }, []);
  const openDownloadDir = () => { api.openFolder('download').catch(() => {}); };
  const [result, setResult] = useState<FreeGamesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [consoleFilter, setConsoleFilter] = useState('all');
  const [onlySet, setOnlySet] = useState(false);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useViewMode('freegames', 'card');

  const load = () => {
    setLoading(true);
    api.freeGames().then(setResult).catch(() => setResult(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const games = result?.games ?? [];
  const counts = result?.counts ?? { total: 0, withSet: 0, owned: 0 };
  const systems = result?.systems ?? [];

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games
      .filter((g) => consoleFilter === 'all' || String(g.consoleId) === consoleFilter)
      .filter((g) => !onlySet || g.achievements > 0)
      .filter((g) => !onlyMissing || !g.owned)
      .filter((g) => !q || g.title.toLowerCase().includes(q) || (g.author ?? '').toLowerCase().includes(q));
  }, [games, consoleFilter, onlySet, onlyMissing, search]);

  let sourceHost: string | null = null;
  if (result?.source) {
    try { sourceHost = new URL(result.source).host; } catch { sourceHost = result.source; }
  }
  const unavailable = !loading && (!result || !!result.error || counts.total === 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel panel-glow crt-scanlines p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-glow-cyan flex items-center gap-2"><Gift size={20} /> {t('free.title')}</h1>
            <p className="font-body text-ink-mid mt-1 text-[15px] leading-relaxed">{t('free.sub')}</p>
          </div>
          <button className="btn !py-1.5 !px-3" onClick={load} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <Stat label={t('common.games')} value={<CountUp value={counts.total} />} accent="var(--color-neon-cyan)" sub={t('free.count', { n: counts.total })} />
          <Stat label={t('common.achievements')} value={<CountUp value={counts.withSet} />} accent="var(--color-neon-purple)" sub={t('free.withSet', { n: counts.withSet })} />
          <Stat label={t('common.owned')} value={<CountUp value={counts.owned} />} accent="var(--color-neon-green)" sub={t('free.owned', { n: counts.owned })} />
        </div>
      </section>

      {unavailable ? (
        <div className="panel p-10 text-center">
          <Gift size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('free.unavailable')}</div>
        </div>
      ) : (
        <>
          <section className="flex items-center gap-2 flex-wrap">
            <select className="input !w-auto" value={consoleFilter} onChange={(e) => setConsoleFilter(e.target.value)}>
              <option value="all">{t('free.filterSystem')}</option>
              {systems.map((s, i) => (
                <option key={`${s.consoleId}-${i}`} value={String(s.consoleId)}>{s.label}</option>
              ))}
            </select>
            <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setOnlySet((v) => !v)}
              style={onlySet ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
              {t('free.onlySet')}
            </button>
            <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setOnlyMissing((v) => !v)}
              style={onlyMissing ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
              {t('free.onlyMissing')}
            </button>
            <div className="flex-1 min-w-[160px] flex items-center gap-2 panel !rounded-lg px-3">
              <Search size={16} className="text-ink-dim" />
              <input data-search="1" className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ViewToggle mode={mode} onChange={setMode} />
          </section>

          {loading ? (
            <SkeletonGrid n={6} cols="grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" />
          ) : list.length === 0 ? (
            <div className="panel p-10 text-center">
              <Gift size={40} className="mx-auto text-ink-dim mb-3" />
              <div className="font-display text-sm text-ink-mid">{t('free.empty')}</div>
            </div>
          ) : mode === 'table' ? (
            <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
              {list.map((g, i) => (
                <div key={`${g.title}-${i}`}
                  className={`flex items-center gap-3 px-3 py-2 row-hover transition-colors ${g.raGameId != null ? 'cursor-pointer' : ''}`}
                  onClick={g.raGameId != null ? () => onOpenGame(g.raGameId!) : undefined}
                  role={g.raGameId != null ? 'button' : undefined}
                  tabIndex={g.raGameId != null ? 0 : undefined}
                  title={g.raGameId != null ? t('free.openDetails') : undefined}
                  onKeyDown={g.raGameId != null ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenGame(g.raGameId!); } } : undefined}>
                  {g.icon ? <img src={imageUrl(g.icon)} width={26} height={26} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : <span style={{ width: 26, height: 26 }} className="shrink-0" />}
                  <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate" title={g.title}>{g.title}</span>
                  <span className="font-mono text-sm text-ink-dim flex items-center gap-1.5 shrink-0"><ConsoleIcon id={g.consoleId} size={14} /> {g.systemLabel}</span>
                  <span className="font-mono text-sm w-32 text-right shrink-0" style={{ color: g.achievements > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>
                    {g.achievements > 0 ? t('free.hasSet', { n: g.achievements }) : t('free.noSet')}
                  </span>
                  <span className="w-4 text-center shrink-0" title={g.owned ? t('free.ownedBadge') : undefined}>
                    {g.owned && <span style={{ color: 'var(--color-neon-green)' }}>●</span>}
                  </span>
                  <a className="btn !py-1 !px-2 text-sm shrink-0" href={g.url} target="_blank" rel="noreferrer" title={t('free.download')} onClick={(e) => e.stopPropagation()}>
                    <Download size={13} />
                  </a>
                  {g.raGameId != null
                    ? <Trophy size={14} className="text-ink-dim shrink-0" />
                    : <span style={{ width: 14 }} className="shrink-0" />}
                </div>
              ))}
            </div>
          ) : (
            <Stagger className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {list.map((g, i) => {
                const openable = g.raGameId != null;
                return (
                <StaggerItem key={`${g.title}-${i}`}>
                  <div
                    className={`panel !rounded-lg p-3 h-full ${openable ? 'cursor-pointer row-hover transition-colors' : ''}`}
                    onClick={openable ? () => onOpenGame(g.raGameId!) : undefined}
                    role={openable ? 'button' : undefined}
                    tabIndex={openable ? 0 : undefined}
                    title={openable ? t('free.openDetails') : undefined}
                    onKeyDown={openable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenGame(g.raGameId!); } } : undefined}
                  >
                    <div className="flex items-center gap-3">
                      {g.icon ? <img src={imageUrl(g.icon)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                      <div className="min-w-0 flex-1">
                        <div className="font-body text-sm text-ink-hi truncate" title={g.title}>{g.title}</div>
                        <div className="font-mono text-sm text-ink-dim flex items-center gap-1.5">
                          <ConsoleIcon id={g.consoleId} size={13} /> <span className="truncate">{g.systemLabel}{g.author ? ` · ${t('free.by', { a: g.author })}` : ''}</span>
                        </div>
                      </div>
                      {g.owned && <span className="badge shrink-0" style={{ color: 'var(--color-neon-green)' }}>{t('free.ownedBadge')}</span>}
                    </div>
                    <div className="font-mono text-sm mt-2" style={g.achievements > 0 ? { color: 'var(--color-neon-green)' } : undefined}>
                      {g.achievements > 0 ? t('free.hasSet', { n: g.achievements }) : <span className="text-ink-dim">{t('free.noSet')}</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <a className="btn !py-1 !px-2.5 text-sm" href={g.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Download size={14} /> {t('free.download')}
                      </a>
                      {g.host && <span className="font-mono text-ink-dim text-sm truncate">{g.host}</span>}
                      {openable && <Trophy size={15} className="text-ink-dim ml-auto shrink-0" />}
                    </div>
                  </div>
                </StaggerItem>
                );
              })}
            </Stagger>
          )}

          <section className="flex flex-col gap-3">
            {/* Download target folder — the app can't fetch the external pages,
                but it can point you at (and open) where to drop the files. */}
            <div className="panel !rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="font-body text-sm text-ink-hi truncate" title={downloadDir || undefined}>
                  {downloadDir ? t('free.dlFolder', { p: downloadDir }) : t('free.dlUnset')}
                </div>
                <div className="font-body text-ink-dim text-sm mt-0.5">{t('free.dlNote')}</div>
              </div>
              {downloadDir ? (
                <button className="btn !py-1.5 !px-3 text-sm shrink-0" onClick={openDownloadDir}>
                  <FolderOpen size={14} /> {t('free.dlOpen')}
                </button>
              ) : (
                <button className="btn !py-1.5 !px-3 text-sm shrink-0" onClick={goSettings}>
                  <Settings2 size={14} /> {t('free.dlSet')}
                </button>
              )}
            </div>
            <p className="font-mono text-ink-dim text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t('free.legal')}</span>
              {result?.source && sourceHost && (
                <a href={result.source} target="_blank" rel="noreferrer" className="underline hover:text-ink-mid">{t('free.source', { s: sourceHost })}</a>
              )}
              {result?.updated && <span>{t('free.updated', { d: result.updated })}</span>}
            </p>
            {!!status?.romRoot && (
              <div className="panel !rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
                <span className="font-body text-ink-dim text-sm">{t('free.hint')}</span>
                <button className="btn !py-1.5 !px-3 text-sm shrink-0" onClick={goScan}>
                  <ScanLine size={14} /> {t('dash.scanLib')}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
