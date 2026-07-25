import { useEffect, useMemo, useState } from 'react';
import { Trophy, Search, ArrowLeft, DatabaseZap, Star } from 'lucide-react';
import type { AppStatus } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, ViewToggle } from './ui';
import { SkeletonGrid } from './Skeleton';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';

export function GamesView({ status, onOpenGame, goSync }: {
  status: AppStatus | null; onOpenGame: (id: number) => void; goSync: () => void;
}) {
  const { t } = useI18n();
  const [sel, setSel] = useState<number | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState(60);
  const [sortKey, setSortKey] = useState('points');
  const [sysSort, setSysSort] = useState<'count' | 'name'>('count');
  const [globalQ, setGlobalQ] = useState('');
  const [globalResults, setGlobalResults] = useState<any[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [mode, setMode] = useViewMode('games');

  const synced = useMemo(() => {
    const arr = (status?.consoles ?? []).filter((c) => c.gameCount > 0);
    return sysSort === 'name'
      ? arr.sort((a, b) => a.name.localeCompare(b.name))
      : arr.sort((a, b) => b.gameCount - a.gameCount);
  }, [status, sysSort]);
  const selConsole = synced.find((c) => c.id === sel);

  useEffect(() => {
    if (sel == null) return;
    let cancelled = false;
    setLoading(true);
    const h = setTimeout(() => {
      api.consoleGames(sel, { q: search.trim() || undefined, limit, sort: sortKey }).then((r) => {
        if (cancelled) return;
        setGames(r.games); setTotal(r.total);
      }).catch(() => { if (!cancelled) setGames([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [sel, search, limit, sortKey]);

  useEffect(() => {
    const q = globalQ.trim();
    if (q.length < 2) { setGlobalResults([]); setGlobalLoading(false); return; }
    let cancelled = false;
    setGlobalLoading(true);
    const h = setTimeout(() => {
      api.searchGames(q, 48).then((r) => { if (!cancelled) setGlobalResults(r); })
        .catch(() => { if (!cancelled) setGlobalResults([]); })
        .finally(() => { if (!cancelled) setGlobalLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(h); };
  }, [globalQ]);

  // ---- system picker ----
  if (sel == null) {
    return (
      <div className="flex flex-col gap-5">
        <section className="panel panel-glow crt-scanlines p-5">
          <h1 className="font-display text-lg text-glow-cyan flex items-center gap-2"><Trophy size={20} /> {t('games.title')}</h1>
          <p className="font-body text-ink-mid mt-2 text-[15px]">
            {t('games.body')}
          </p>
          <div className="flex items-center gap-2 panel !rounded-lg px-3 mt-3">
            <Search size={16} className="text-ink-dim" />
            <input className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={globalQ}
              onChange={(e) => setGlobalQ(e.target.value)}
              placeholder={t('games.globalPlaceholder')} />
          </div>
        </section>

        {globalQ.trim().length >= 2 ? (
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3 min-h-[30px]">
              {!globalLoading && globalResults.length > 0 ? (
                <div className="font-mono text-ink-dim text-base">
                  {globalResults.length === 1 ? t('games.resultsCount1') : t('games.resultsCount', { n: globalResults.length })}
                </div>
              ) : <span />}
              <ViewToggle mode={mode} onChange={setMode} />
            </div>
            {globalLoading && <div className="font-mono text-ink-dim text-center py-4">{t('common.searching')}</div>}
            {!globalLoading && globalResults.length === 0 && <div className="font-mono text-ink-dim text-center py-4">{t('common.nothing')}</div>}
            {!globalLoading && globalResults.length > 0 && (mode === 'table' ? (
              <GameTable games={globalResults} onOpenGame={onOpenGame} showConsole />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {globalResults.map((g) => (
                  <button key={g.id} onClick={() => onOpenGame(g.id)}
                    className="panel !rounded-lg p-3 flex items-center gap-3 text-left hover:border-neon-cyan transition-colors" style={{ borderColor: 'var(--color-crt-line)' }}>
                    {g.image_icon ? <img src={imageUrl(g.image_icon)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
                      : <span className="shrink-0 grid place-items-center rounded" style={{ width: 40, height: 40, border: '1px solid var(--color-crt-line)' }}><Trophy size={16} className="text-ink-dim" /></span>}
                    <div className="min-w-0 flex-1">
                      <div className="font-body text-sm text-ink-hi truncate" title={g.title}>{g.title}</div>
                      <div className="font-mono text-base text-ink-dim flex items-center gap-1.5"><ConsoleIcon id={g.console_id} size={13} /> {g.console_name} · <span className="text-neon-amber">{g.num_achievements}</span></div>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        ) : synced.length === 0 ? (
          <div className="panel p-10 text-center">
            <DatabaseZap size={40} className="mx-auto text-ink-dim mb-3" />
            <div className="font-display text-sm text-ink-mid">{t('games.noSystems')}</div>
            <button className="btn btn-primary mx-auto mt-4" onClick={goSync}><DatabaseZap size={18} /> {t('games.syncBtn')}</button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-ink-dim text-sm">{t('games.sort')}:</span>
            <select className="input !w-auto !py-1.5" value={sysSort} onChange={(e) => setSysSort(e.target.value as 'count' | 'name')}>
              <option value="count">{t('games.sortSysCount')}</option>
              <option value="name">{t('games.sortSysName')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {synced.map((c) => (
              <button key={c.id} onClick={() => { setSel(c.id); setSearch(''); setLimit(60); }}
                className="panel !rounded-lg p-3 flex items-center gap-3 text-left hover:border-neon-cyan transition-colors" style={{ borderColor: 'var(--color-crt-line)' }}>
                <ConsoleIcon id={c.id} short={c.short_code} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="font-body text-sm text-ink-hi truncate" title={c.name}>{c.name}</div>
                  <div className="font-mono text-base text-neon-cyan">{t('games.gamesCount', { n: c.gameCount.toLocaleString('de-DE') })}</div>
                </div>
              </button>
            ))}
          </div>
          </div>
        )}
      </div>
    );
  }

  // ---- games grid ----
  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-4 flex items-center gap-3 flex-wrap">
        <button className="btn !py-1.5 !px-2.5" onClick={() => setSel(null)}><ArrowLeft size={16} /> {t('games.systems')}</button>
        <div className="flex items-center gap-2">
          <ConsoleIcon id={sel} short={selConsole?.short_code} size={28} />
          <span className="font-display text-sm text-glow-cyan">{selConsole?.name}</span>
        </div>
        <div className="flex-1 min-w-[180px] flex items-center gap-2 panel !rounded-lg px-3">
          <Search size={16} className="text-ink-dim" />
          <input className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => { setSearch(e.target.value); setLimit(60); }} placeholder={t('games.searchPlaceholder')} />
        </div>
        <span className="font-mono text-ink-dim text-base">{t('games.gamesCount', { n: total.toLocaleString('de-DE') })}</span>
        <select className="input !w-auto !py-1.5" value={sortKey} onChange={(e) => { setSortKey(e.target.value); setLimit(60); }} title={t('games.sort')}>
          <option value="points">{t('games.sortPoints')}</option>
          <option value="achievements">{t('games.sortAch')}</option>
          <option value="title">{t('games.sortName')}</option>
        </select>
        <ViewToggle mode={mode} onChange={setMode} />
      </section>

      {loading && games.length === 0 && <SkeletonGrid n={6} />}
      {mode === 'table' ? (
        <GameTable games={games} onOpenGame={onOpenGame} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {games.map((g) => (
            <button key={g.id} onClick={() => onOpenGame(g.id)}
              className="panel !rounded-lg p-3 flex items-center gap-3 text-left hover:border-neon-cyan transition-colors" style={{ borderColor: 'var(--color-crt-line)' }}>
              {g.image_icon
                ? <img src={imageUrl(g.image_icon)} width={44} height={44} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)' }} alt="" />
                : <span className="shrink-0 grid place-items-center rounded" style={{ width: 44, height: 44, border: '1px solid var(--color-crt-line)' }}><Trophy size={18} className="text-ink-dim" /></span>}
              <div className="min-w-0 flex-1">
                <div className="font-body text-sm text-ink-hi truncate" title={g.title}>{g.title}</div>
                <div className="font-mono text-base flex items-center gap-3 mt-0.5">
                  <span className="text-neon-amber inline-flex items-center gap-1"><Trophy size={12} /> {g.num_achievements}</span>
                  <span className="text-neon-cyan inline-flex items-center gap-1"><Star size={12} /> {g.points}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="font-mono text-ink-dim text-center py-3">{t('common.loading')}</div>}
      {!loading && games.length < total && (
        <button className="btn mx-auto" onClick={() => setLimit((l) => l + 120)}>{t('games.loadMore', { a: games.length, b: total })}</button>
      )}
      {!loading && games.length === 0 && <div className="panel p-8 font-mono text-ink-dim text-center">{t('games.noGames')}</div>}
    </div>
  );
}

// Dense one-row-per-game table view (shared by the console grid + global search).
function GameTable({ games, onOpenGame, showConsole = false }: {
  games: any[]; onOpenGame: (id: number) => void; showConsole?: boolean;
}) {
  return (
    <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
      {games.map((g) => (
        <button key={g.id} onClick={() => onOpenGame(g.id)}
          className="w-full flex items-center gap-3 px-3 py-2 text-left row-hover transition-colors">
          {g.image_icon
            ? <img src={imageUrl(g.image_icon)} width={28} height={28} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
            : <span className="shrink-0 grid place-items-center rounded" style={{ width: 28, height: 28, border: '1px solid var(--color-crt-line)' }}><Trophy size={13} className="text-ink-dim" /></span>}
          <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate" title={g.title}>{g.title}</span>
          {showConsole && (
            <span className="font-mono text-sm text-ink-dim hidden sm:flex items-center gap-1.5 w-44 shrink-0 truncate" title={g.console_name}>
              <ConsoleIcon id={g.console_id} size={13} /> <span className="truncate">{g.console_name}</span>
            </span>
          )}
          <span className="font-mono text-sm text-neon-amber inline-flex items-center gap-1 w-14 shrink-0 justify-end"><Trophy size={12} /> {g.num_achievements}</span>
          {g.points != null && <span className="font-mono text-sm text-neon-cyan inline-flex items-center gap-1 w-16 shrink-0 justify-end"><Star size={12} /> {g.points}</span>}
        </button>
      ))}
    </div>
  );
}
