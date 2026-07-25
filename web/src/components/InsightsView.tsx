import { useEffect, useMemo, useState } from 'react';
import { BarChart3, RefreshCw, Trophy, Star, Gamepad2 } from 'lucide-react';
import type { AppStatus, ScanStatus } from '../lib/api';
import { api } from '../lib/api';
import { ConsoleIcon, Stat, SectionHeader, ViewToggle } from './ui';
import { CoveragePanel } from './CoveragePanel';
import { PlaytimePanel } from './PlaytimePanel';
import { CountUp } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';
import { STATUS_META, statusLabel, pct } from '../lib/util';

export function InsightsView({ status }: { status: AppStatus | null }) {
  const { t } = useI18n();
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.libraryStats>> | null>(null);
  const [insights, setInsights] = useState<Awaited<ReturnType<typeof api.libraryInsights>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useViewMode('insights');

  const load = () => {
    setLoading(true);
    Promise.all([api.libraryStats().catch(() => null), api.libraryInsights().catch(() => null)])
      .then(([s, i]) => { setStats(s); setInsights(i); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const total = stats?.total ?? 0;
  const maxStatus = useMemo(() => Math.max(1, ...(stats?.byStatus ?? []).map((x) => x.n)), [stats]);
  const consoles = useMemo(
    () => (stats?.byConsole ?? []).filter((c) => c.id != null).slice().sort((a, b) => b.total - a.total),
    [stats],
  );

  if (!loading && total === 0) {
    return (
      <div className="panel p-12 text-center">
        <Gamepad2 size={44} className="mx-auto text-ink-dim mb-3" />
        <div className="font-display text-sm text-ink-mid">{t('ins.noData')}</div>
        <div className="font-body text-ink-dim mt-2 text-sm">{t('ins.noDataBody')}</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Overview */}
      <section className="panel panel-glow crt-scanlines p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="font-display text-lg text-glow-cyan flex items-center gap-2"><BarChart3 size={20} /> {t('ins.title')}</h1>
          <button className="btn !py-1.5 !px-3" onClick={load} disabled={loading}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}</button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label={t('ins.files')} value={<CountUp value={total} />} accent="var(--color-neon-cyan)" sub={t('ins.filesSub')} />
          <Stat label={t('ins.withAch')} value={<CountUp value={insights?.playableFiles ?? 0} />} accent="var(--color-neon-green)" sub={t('ins.withAchSub', { p: pct(insights?.playableFiles ?? 0, total) })} />
          <Stat label={t('ins.obtAch')} value={<CountUp value={insights?.obtainableAchievements ?? 0} />} accent="var(--color-neon-amber)" sub={t('ins.obtAchSub')} />
          <Stat label={t('ins.obtPts')} value={<CountUp value={insights?.obtainablePoints ?? 0} />} accent="var(--color-neon-purple)" sub={t('ins.obtPtsSub')} />
        </div>
      </section>

      {/* Status distribution */}
      <section className="panel p-5">
        <SectionHeader accent="var(--color-neon-purple)" title={t('ins.statusDist')} icon={BarChart3} />
        <div className="flex flex-col gap-2.5">
          {(stats?.byStatus ?? []).slice().sort((a, b) => b.n - a.n).map((s) => {
            const meta = STATUS_META[s.status as ScanStatus];
            const color = meta?.color ?? 'var(--color-ink-dim)';
            return (
              <div key={s.status} className="flex items-center gap-3">
                <div className="font-mono text-base w-32 shrink-0 truncate" style={{ color }}>{meta ? statusLabel(s.status as ScanStatus) : s.status}</div>
                <div className="flex-1 progress-track h-4 relative overflow-hidden">
                  <div className="h-full" style={{ width: `${pct(s.n, maxStatus)}%`, background: color, opacity: 0.85, borderRadius: 'inherit' }} />
                </div>
                <div className="font-mono text-base text-ink-hi w-24 text-right shrink-0">{s.n.toLocaleString('de-DE')} <span className="text-ink-dim">· {pct(s.n, total)}%</span></div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Per-console playable ratio */}
      <section className="panel p-5">
        <SectionHeader accent="var(--color-neon-green)" title={t('ins.ratioBySystem')} icon={Trophy}>
          {consoles.length > 0 && <ViewToggle mode={mode} onChange={setMode} />}
        </SectionHeader>
        {consoles.length === 0 ? (
          <div className="font-mono text-ink-dim">{t('ins.noSystemData')}</div>
        ) : mode === 'table' ? (
          <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
            {consoles.map((c) => {
              const ratio = pct(c.matched, c.total);
              return (
                <div key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <ConsoleIcon id={c.id} short={c.short} size={20} />
                  <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate" title={c.name}>{c.name}</span>
                  <span className="font-mono text-sm w-24 text-right shrink-0" style={{ color: c.matched > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>{c.matched}/{c.total}</span>
                  <span className="font-mono text-sm w-12 text-right shrink-0 text-ink-dim">{ratio}%</span>
                  <span className="w-24 shrink-0 hidden sm:block progress-track h-2"><span className="progress-fill block h-full" style={{ width: `${ratio}%` }} /></span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-2.5">
            {consoles.map((c) => {
              const ratio = pct(c.matched, c.total);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <ConsoleIcon id={c.id} short={c.short} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-ink-hi truncate" title={c.name}>{c.name}</span>
                      <span style={{ color: c.matched > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>{c.matched}/{c.total} · {ratio}%</span>
                    </div>
                    <div className="progress-track h-2 mt-1"><div className="progress-fill" style={{ width: `${ratio}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <CoveragePanel />
      <PlaytimePanel />

      <div className="font-mono text-ink-dim text-sm flex items-center gap-2">
        <Star size={13} className="text-neon-cyan" /> {t('ins.footer', { n: status?.totals.games?.toLocaleString('de-DE') ?? 0 })}
      </div>
    </div>
  );
}
