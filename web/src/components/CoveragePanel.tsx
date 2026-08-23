import { useEffect, useMemo, useState } from 'react';
import { Globe, RefreshCw } from 'lucide-react';
import type { CoverageResult } from '../lib/api';
import { api } from '../lib/api';
import { ConsoleIcon, Stat, SectionHeader } from './ui';
import { CountUp } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { pct } from '../lib/util';

const TOP_N = 12;

// Sub-1% coverage is the common case (a handful of owned games vs. ~11k on
// the site) — fall back to one decimal so it doesn't just read "0". Returns the
// bare number; the surrounding i18n string supplies the percent sign.
function finePct(a: number, b: number, locale: string): string {
  const p = pct(a, b);
  if (p > 0 || b <= 0) return p.toLocaleString(locale);
  const exact = (a / b) * 100;
  return exact > 0 ? exact.toLocaleString(locale, { maximumFractionDigits: 1 }) : '0';
}

export function CoveragePanel() {
  const { t, lang } = useI18n();
  const locale = lang === 'de' ? 'de-DE' : lang === 'ja' ? 'ja-JP' : 'en-US';
  const [data, setData] = useState<CoverageResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const load = () => {
    setLoading(true);
    api.coverage().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const consoles = useMemo(
    () => (data?.byConsole ?? []).slice().sort((a, b) => b.ownedGames - a.ownedGames || b.games - a.games),
    [data],
  );
  const visible = showAll ? consoles : consoles.slice(0, TOP_N);

  const all = data?.all ?? { games: 0, achievements: 0, points: 0 };
  const owned = data?.owned ?? { games: 0, achievements: 0, points: 0 };
  const reference = data?.reference;

  return (
    <section className="panel p-5">
      <SectionHeader accent="var(--color-neon-cyan)" title={t('cov.title')} icon={Globe}>
        <button className="btn !py-1 !px-2.5 text-sm" onClick={load} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </SectionHeader>
      <div className="font-body text-ink-mid text-sm -mt-2 mb-4">{t('cov.sub')}</div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Stat
          label={t('cov.games')} value={<CountUp value={owned.games} />} accent="var(--color-neon-cyan)"
          sub={t('cov.ofAll', { p: finePct(owned.games, all.games, locale), n: all.games.toLocaleString(locale) })}
        />
        <Stat
          label={t('cov.ach')} value={<CountUp value={owned.achievements} />} accent="var(--color-neon-green)"
          sub={t('cov.ofAll', { p: finePct(owned.achievements, all.achievements, locale), n: all.achievements.toLocaleString(locale) })}
        />
        <Stat
          label={t('cov.points')} value={<CountUp value={owned.points} />} accent="var(--color-neon-amber)"
          sub={t('cov.ofAll', { p: finePct(owned.points, all.points, locale), n: all.points.toLocaleString(locale) })}
        />
      </div>

      {consoles.length > 0 && (
        <div className="mt-5">
          <SectionHeader accent="var(--color-neon-green)" title={t('cov.bySystem')} />
          <div className="flex flex-col gap-2.5">
            {visible.map((c) => {
              const ratio = pct(c.ownedGames, c.games);
              return (
                <div key={c.id} className="flex items-center gap-3">
                  <ConsoleIcon id={c.id} short={c.short ?? undefined} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between font-mono text-sm">
                      <span className="text-ink-hi truncate" title={c.name}>{c.name}</span>
                      <span style={{ color: c.ownedGames > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>
                        {t('cov.ownedOf', { o: c.ownedGames, n: c.games })} · {ratio}%
                      </span>
                    </div>
                    <div className="progress-track h-2 mt-1"><div className="progress-fill" style={{ width: `${ratio}%` }} /></div>
                  </div>
                </div>
              );
            })}
          </div>
          {consoles.length > TOP_N && (
            <button className="btn !py-1 !px-2.5 text-sm mt-3" onClick={() => setShowAll((s) => !s)}>
              {showAll ? t('common.details') : t('common.all')}
            </button>
          )}
        </div>
      )}

      {reference && (
        <div className="font-mono text-ink-dim text-sm mt-4">
          {t('cov.reference', {
            d: reference.asOf,
            g: reference.games.toLocaleString(locale),
            a: reference.achievements.toLocaleString(locale),
            p: reference.players.toLocaleString(locale),
          })}
        </div>
      )}
    </section>
  );
}
