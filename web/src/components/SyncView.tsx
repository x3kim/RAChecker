import { useEffect, useState } from 'react';
import { DatabaseZap, RefreshCw, Zap, CheckCircle2, AlertTriangle, XCircle, Sparkles } from 'lucide-react';
import type { AppStatus, NewSystemsResult } from '../lib/api';
import { api } from '../lib/api';
import { useJobs } from '../lib/jobs';
import { ConsoleIcon, Pill, ProgressBar, SectionHeader, ViewToggle } from './ui';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';
import { fmtAgo } from '../lib/util';

export function SyncView({ status }: { status: AppStatus | null }) {
  const { t } = useI18n();
  const { sync, startSync } = useJobs();
  const [mode, setMode] = useViewMode('sync');

  // Systems RA started supporting since the last sync. Re-checked whenever a
  // sync finishes, because that is when new systems get recorded.
  const [newSystems, setNewSystems] = useState<NewSystemsResult | null>(null);
  useEffect(() => { api.newSystems().then(setNewSystems).catch(() => {}); }, [sync.active]);
  const freshSystems = newSystems?.systems ?? [];

  const statusDot = (c: AppStatus['consoles'][number]) =>
    c.syncStatus === 'error'
      ? <AlertTriangle size={16} style={{ color: 'var(--color-neon-red)' }} />
      : c.stale
        ? <span title={t('common.staleMissing')} style={{ color: 'var(--color-neon-amber)' }}>●</span>
        : <CheckCircle2 size={16} style={{ color: 'var(--color-neon-green)' }} />;

  const consoles = (status?.consoles ?? []).slice().sort((a, b) => {
    if (!!a.syncedAt !== !!b.syncedAt) return a.syncedAt ? -1 : 1;
    return b.hashCount - a.hashCount;
  });
  const staleCount = consoles.filter((c) => c.stale).length;

  return (
    <div className="flex flex-col gap-5">
      <section className="panel panel-glow crt-scanlines p-6">
        <div className="flex flex-col lg:flex-row gap-5 lg:items-center justify-between">
          <div className="max-w-xl">
            <h1 className="font-display text-lg text-glow-cyan">{t('sync.title')}</h1>
            <p className="font-body text-ink-mid mt-2 text-[15px] leading-relaxed">
              {t('sync.body')}
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <button className="btn btn-primary" onClick={() => startSync(false)} disabled={sync.active}>
                <RefreshCw size={18} className={sync.active ? 'animate-spin' : ''} /> {staleCount > 0 ? t('sync.loadStale', { n: staleCount }) : t('sync.sync')}
              </button>
              <button className="btn btn-magenta" onClick={() => startSync(true)} disabled={sync.active}>
                <Zap size={18} /> {t('sync.force')}
              </button>
            </div>
          </div>
          <div className="font-mono text-base text-ink-mid space-y-1 shrink-0">
            <div>{t('sync.totalGames')} <span className="text-neon-green">{(status?.totals.games ?? 0).toLocaleString('de-DE')}</span></div>
            <div>{t('sync.totalHashes')} <span className="text-neon-cyan">{(status?.totals.hashes ?? 0).toLocaleString('de-DE')}</span></div>
            <div>{t('sync.lastFull')} <span className="text-ink-hi">{fmtAgo(status?.lastFullSyncAt)}</span></div>
          </div>
        </div>

        {sync.error && !sync.active && (
          <div className="mt-4 font-mono text-sm flex items-center gap-2" style={{ color: 'var(--color-neon-red)' }}>
            <XCircle size={15} className="shrink-0" /> <span>{t('sync.error', { msg: sync.error })}</span>
          </div>
        )}
        {sync.active && (
          <div className="mt-5">
            <ProgressBar value={sync.cur.done} max={sync.cur.total || 1} label={t('sync.syncing', { name: sync.cur.name || '…' })} />
          </div>
        )}
        {sync.summary && !sync.active && (
          <div className="mt-4 font-mono text-base flex flex-wrap gap-4">
            <span className="text-neon-green inline-flex items-center gap-1"><CheckCircle2 size={15} /> {t('sync.synced', { n: sync.summary.synced })}</span>
            <span className="text-ink-mid">{t('sync.upToDate', { n: sync.summary.skipped })}</span>
            {sync.summary.errors > 0 && <span className="text-neon-red inline-flex items-center gap-1"><AlertTriangle size={15} /> {t('sync.errors', { n: sync.summary.errors })}</span>}
            <span className="text-neon-cyan">{t('sync.hashesLoaded', { n: (sync.summary.hashCount ?? 0).toLocaleString('de-DE') })}</span>
          </div>
        )}
      </section>

      {/* newly supported systems (empty until a sync sees an unknown system) */}
      {freshSystems.length > 0 && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-green)" title={t('sys.newTitle')} icon={Sparkles} />
          <p className="font-body text-ink-dim text-sm -mt-2 mb-3">{t('sys.newSub')}</p>
          <div className="flex flex-col gap-2">
            {freshSystems.map((s) => (
              <div key={s.id} className="panel !rounded-lg p-3 flex items-center gap-3">
                <ConsoleIcon id={s.id} short={s.short ?? undefined} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="font-body text-sm text-ink-hi truncate" title={s.name}>{s.name}</div>
                  <div className="font-mono text-base text-ink-dim">{t('sys.since', { d: fmtAgo(s.firstSeenAt) })}</div>
                </div>
                <Pill color={s.supported ? 'var(--color-neon-green)' : 'var(--color-neon-amber)'}>
                  {s.supported ? t('sys.canHash') : t('sys.noHash')}
                </Pill>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel p-4">
        <SectionHeader accent="var(--color-neon-cyan)" title={t('sync.systems', { n: consoles.length })} icon={DatabaseZap}>
          <ViewToggle mode={mode} onChange={setMode} />
        </SectionHeader>
        {mode === 'table' ? (
          <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
            {consoles.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                <ConsoleIcon id={c.id} short={c.short_code} size={22} />
                <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate">{c.name}</span>
                <span className="font-mono text-sm text-neon-cyan w-24 text-right shrink-0">{c.hashCount > 0 ? c.hashCount.toLocaleString('de-DE') : '—'}</span>
                <span className="font-mono text-sm text-ink-dim w-28 text-right shrink-0 hidden sm:inline">{c.syncedAt ? fmtAgo(c.syncedAt) : t('dash.notLoaded')}</span>
                <span className="shrink-0 w-5 text-right">{statusDot(c)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {consoles.map((c) => (
              <div key={c.id} className="panel !rounded-lg p-3 flex items-center gap-3">
                <ConsoleIcon id={c.id} short={c.short_code} size={32} />
                <div className="flex-1 min-w-0">
                  <div className="font-body text-sm text-ink-hi truncate">{c.name}</div>
                  <div className="font-mono text-base text-ink-dim">
                    {c.hashCount > 0
                      ? t('sync.hashesAgo', { n: c.hashCount.toLocaleString('de-DE'), ago: fmtAgo(c.syncedAt) })
                      : t('dash.notLoaded')}
                  </div>
                </div>
                <div className="shrink-0">{statusDot(c)}</div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
