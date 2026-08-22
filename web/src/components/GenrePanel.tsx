// Genres come from RetroAchievements one game at a time (the bulk game list
// carries none), so fetching them is a resumable background job like the ROM
// names. Fetched genres are stored in the local DB and survive a re-sync.
import { useEffect, useRef, useState } from 'react';
import { Tags, Play, Square, RefreshCw } from 'lucide-react';
import { api, openStream } from '../lib/api';
import type { GenreStatus } from '../lib/api';
import { Pct } from './Progress';
import { useI18n } from '../lib/i18n';

export function GenrePanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<GenreStatus | null>(null);
  const [facets, setFacets] = useState<{ genre: string; count: number }[]>([]);
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const esRef = useRef<EventSource | null>(null);

  const load = () => {
    api.genreStatus().then(setStatus).catch(() => {});
    api.genreFacets(ownedOnly).then((r) => setFacets(r.genres)).catch(() => {});
  };
  useEffect(() => { load(); return () => esRef.current?.close(); }, [ownedOnly]);

  const start = (scope: 'collection' | 'all') => {
    if (esRef.current) return;
    setError(''); setProgress({ done: 0, total: 0 });
    const es = openStream(`/api/genres/stream?scope=${scope}`, {
      progress: (p: any) => setProgress({ done: p.done ?? 0, total: p.total ?? 0 }),
      done: () => { esRef.current?.close(); esRef.current = null; setProgress(null); load(); },
      error: (e: any) => { setError(e?.message || t('common.error')); esRef.current?.close(); esRef.current = null; setProgress(null); },
      __error: () => { esRef.current = null; setProgress(null); load(); },
    });
    esRef.current = es;
  };
  const stop = () => { api.genresCancel().catch(() => {}); };

  if (!status) return null;
  const running = progress || (status.running ? { done: status.running.done, total: status.running.total } : null);
  const pct = running && running.total > 0 ? Math.round((running.done / running.total) * 100) : 0;
  const ownedPct = status.owned > 0 ? Math.round((status.ownedFetched / status.owned) * 100) : 100;
  const allPct = status.games > 0 ? Math.round((status.fetched / status.games) * 100) : 0;

  return (
    <section className="panel p-5">
      <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Tags size={16} /> {t('set.genre.title')}</h2>
      <p className="font-body text-ink-mid text-sm mt-2 leading-relaxed">{t('set.genre.desc')}</p>

      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div className="panel !rounded-lg p-3">
          <div className="font-mono text-base text-ink-mid">{t('set.genre.owned', { done: status.ownedFetched, n: status.owned })}</div>
          <Pct value={ownedPct} heightClass="h-2" color="var(--color-neon-green)" />
        </div>
        <div className="panel !rounded-lg p-3">
          <div className="font-mono text-base text-ink-mid">{t('set.genre.all', { done: status.fetched, n: status.games })}</div>
          <Pct value={allPct} heightClass="h-2" color="var(--color-neon-cyan)" />
        </div>
      </div>

      {running ? (
        <div className="mt-3">
          <div className="font-mono text-base text-neon-cyan">{t('set.genre.running', { done: running.done, n: running.total, pct })}</div>
          <Pct value={pct} heightClass="h-2" color="var(--color-neon-cyan)" />
          <button className="btn btn-danger !py-1.5 !px-3 text-sm mt-2" onClick={stop}><Square size={14} /> {t('set.genre.stop')}</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => start('collection')} disabled={status.ownedFetched >= status.owned}>
            <Play size={14} /> {t('set.genre.runOwned')}
          </button>
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => start('all')} disabled={status.fetched >= status.games}>
            <Play size={14} /> {t('set.genre.runAll', { min: Math.max(1, Math.round(((status.games - status.fetched) * status.intervalMs) / 60000)) })}
          </button>
          <button className="btn !py-1.5 !px-3 text-sm" onClick={load}><RefreshCw size={14} /> {t('common.refresh')}</button>
          {error && <span className="font-mono text-sm text-neon-red">{error}</span>}
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <button className="btn !py-1 !px-2 text-sm" onClick={() => setOwnedOnly(!ownedOnly)}>
          {ownedOnly ? t('set.genre.scopeOwned') : t('set.genre.scopeAll')}
        </button>
        {facets.length === 0
          ? <span className="font-body text-ink-dim text-sm">{t('set.genre.empty')}</span>
          : facets.slice(0, 40).map((f) => (
            <span key={f.genre} className="font-mono text-sm text-ink-mid border border-crt-line rounded px-2 py-0.5">
              {f.genre} <span className="text-ink-dim">{f.count}</span>
            </span>
          ))}
      </div>
    </section>
  );
}
