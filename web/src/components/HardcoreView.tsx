import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search, Shield, Trophy } from 'lucide-react';
import type { AppStatus, HardcoreGapGame, HardcoreGapResult } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, Pill, Stat, ViewToggle } from './ui';
import { Pct } from './Progress';
import { SkeletonGrid } from './Skeleton';
import { CountUp } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';
import { fmtAgo } from '../lib/util';

const AMBER = 'var(--color-neon-amber)';

// Hardcore catch-up list: games where hardcore progress trails softcore.
// Every softcore unlock can be re-earned in hardcore for the golden badge,
// leaderboard eligibility and full points — this view surfaces the gap,
// owned ROMs first since those are the ones actually actionable right now.
// Data comes from the cached profile completion via api.hardcoreGap().
export function HardcoreView({ status, onOpenGame }: { status: AppStatus | null; onOpenGame: (id: number) => void }) {
  void status;
  const { t } = useI18n();
  const [data, setData] = useState<HardcoreGapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyOwned, setOnlyOwned] = useState(true);
  const [mode, setMode] = useViewMode('hardcore', 'table');

  const load = () => {
    setLoading(true);
    api.hardcoreGap().then(setData).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const refresh = () => {
    setLoading(true);
    api.userCompletion(true).catch(() => null).then(() => api.hardcoreGap()).then(setData).finally(() => setLoading(false));
  };

  const games: HardcoreGapGame[] = data?.games ?? [];
  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games
      .filter((g) => (!q || g.title.toLowerCase().includes(q)))
      .filter((g) => (!onlyOwned || g.owned))
      .sort((a, b) => b.gap - a.gap);
  }, [games, search, onlyOwned]);

  const noProgress = !data || !data.loggedIn || !data.hasProgress;

  return (
    <div className="flex flex-col gap-5">
      <section className="panel panel-glow crt-scanlines p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg flex items-center gap-2" style={{ color: AMBER, textShadow: '0 0 8px color-mix(in srgb, var(--color-neon-amber) 35%, transparent)' }}>
              <Shield size={20} /> {t('hc.title')}
            </h1>
            <div className="font-body text-ink-mid mt-1">{t('hc.sub')}</div>
            {data?.cachedAt && <div className="font-mono text-sm text-ink-dim mt-1">{t('hc.cachedAt', { d: fmtAgo(data.cachedAt) })}</div>}
          </div>
          <button className="btn !py-1.5 !px-3" onClick={refresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label={t('hc.stat.games')} value={<CountUp value={data?.totals.games ?? 0} />} accent={AMBER} />
          <Stat label={t('hc.stat.owned')} value={<CountUp value={data?.totals.ownedGames ?? 0} />} accent="var(--color-neon-cyan)" />
          <Stat label={t('hc.stat.softOnly')} value={<CountUp value={data?.totals.softcoreOnly ?? 0} />} accent="var(--color-neon-purple)" />
          <Stat label={t('hc.stat.hcMastered')} value={<CountUp value={data?.totals.hardcoreMastered ?? 0} />} accent="var(--color-neon-green)" />
        </div>
      </section>

      {loading && !data ? (
        <SkeletonGrid n={6} />
      ) : noProgress ? (
        <div className="panel p-10 text-center">
          <Shield size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('hc.noProgress')}</div>
        </div>
      ) : (
        <>
          <section className="flex items-center gap-2 flex-wrap">
            <div className="flex-1 min-w-[200px] flex items-center gap-2 panel !rounded-lg px-3">
              <Search size={16} className="text-ink-dim" />
              <input data-search="1" className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('mastery.filterPlaceholder')} />
            </div>
            <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setOnlyOwned((o) => !o)}
              style={onlyOwned ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
              {t('hc.onlyOwned')}
            </button>
            <ViewToggle mode={mode} onChange={setMode} />
          </section>

          {loading ? (
            <SkeletonGrid n={6} />
          ) : games.length === 0 || list.length === 0 ? (
            <div className="panel p-10 text-center">
              <Trophy size={40} className="mx-auto text-ink-dim mb-3" />
              <div className="font-display text-sm text-ink-mid">{t('hc.empty')}</div>
            </div>
          ) : mode === 'table' ? (
            <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
              {list.map((g) => (
                <div key={g.id} className="flex items-center gap-3 px-3 py-2 row-hover">
                  {g.icon ? <img src={imageUrl(g.icon)} width={26} height={26} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : <span style={{ width: 26, height: 26 }} className="shrink-0" />}
                  <button onClick={() => onOpenGame(g.id)} className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate text-left" title={g.title}>{g.title}</button>
                  <ConsoleIcon id={g.consoleId} size={14} />
                  <span className="font-mono text-sm text-ink-mid shrink-0 hidden sm:inline">{t('hc.progress', { h: g.hardcore, m: g.max, s: g.softcore })}</span>
                  <Pill color={AMBER}>{t('hc.gap', { n: g.gap })}</Pill>
                  {g.owned && <span className="font-mono text-sm text-neon-green shrink-0 hidden sm:inline">{t('common.owned')}</span>}
                  <span className="w-20 shrink-0 hidden sm:block"><Pct value={g.pctHardcore} color={AMBER} heightClass="h-2" mode="bar" /></span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {list.map((g) => (
                <div key={g.id} className="panel !rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    {g.icon ? <img src={imageUrl(g.icon)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                    <div className="min-w-0 flex-1">
                      <button onClick={() => onOpenGame(g.id)} className="font-body text-sm text-ink-hi truncate text-left block w-full" title={g.title}>{g.title}</button>
                      <div className="font-mono text-sm flex items-center gap-2 text-ink-mid">
                        <ConsoleIcon id={g.consoleId} size={14} />
                        <span>{t('hc.progress', { h: g.hardcore, m: g.max, s: g.softcore })}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 gap-2">
                    <Pill color={AMBER}>{t('hc.gap', { n: g.gap })}</Pill>
                    {g.owned && <span className="font-mono text-sm text-neon-green">{t('common.owned')}</span>}
                  </div>
                  <div className="mt-2"><Pct value={g.pctHardcore} color={AMBER} heightClass="h-2" ringSize={40} /></div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
