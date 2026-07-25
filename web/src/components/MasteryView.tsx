import { useEffect, useMemo, useState } from 'react';
import { Award, RefreshCw, Search, Star, Trophy, Gamepad2 } from 'lucide-react';
import type { AppStatus } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, Stat, SectionHeader, ViewToggle } from './ui';
import { Pct } from './Progress';
import { SkeletonGrid } from './Skeleton';
import { CountUp } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';

export function MasteryView({ status, onOpenGame }: { status: AppStatus | null; onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [profile, setProfile] = useState<any>(null);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [mode, setMode] = useViewMode('mastery');

  const load = (refresh = false) => {
    setLoading(true);
    Promise.all([api.userProfile().catch(() => null), api.userCompletion(refresh).catch(() => ({ games: [] }))])
      .then(([p, c]: any) => { setProfile(p); setGames(c.games || []); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  const stats = useMemo(() => {
    let mastered = 0, awarded = 0, possible = 0;
    for (const g of games) {
      awarded += g.NumAwarded || 0; possible += g.MaxPossible || 0;
      if (g.MaxPossible > 0 && g.NumAwarded >= g.MaxPossible) mastered++;
    }
    return { total: games.length, mastered, awarded, possible };
  }, [games]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return games
      .filter((g) => (!q || (g.Title || '').toLowerCase().includes(q)))
      .filter((g) => (!onlyOpen || !(g.MaxPossible > 0 && g.NumAwarded >= g.MaxPossible)))
      .sort((a, b) => new Date(b.MostRecentAwardedDate || 0).getTime() - new Date(a.MostRecentAwardedDate || 0).getTime());
  }, [games, search, onlyOpen]);

  return (
    <div className="flex flex-col gap-5">
      <section className="panel panel-glow crt-scanlines p-5">
        <div className="flex items-center gap-4 flex-wrap">
          {profile?.avatarUrl && (
            <img src={imageUrl(profile.avatarUrl)} width={64} height={64} className="rounded-lg" style={{ border: '1px solid var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)', objectFit: 'contain' }} alt="" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-lg text-glow-cyan flex items-center gap-2"><Award size={20} /> {profile?.User || 'MASTERY'}</h1>
            {profile?.RichPresenceMsg && <div className="font-mono text-base text-neon-green mt-1 truncate">▶ {profile.RichPresenceMsg}</div>}
            {profile?.MemberSince && <div className="font-mono text-sm text-ink-dim">{t('mastery.memberSince', { d: profile.MemberSince.slice(0, 10) })}</div>}
          </div>
          <button className="btn !py-1.5 !px-3" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label={t('mastery.points')} value={<CountUp value={profile?.TotalPoints ?? profile?.TotalSoftcorePoints ?? 0} />} accent="var(--color-neon-cyan)" sub={t('mastery.pointsSub')} />
          <Stat label={t('common.games')} value={<CountUp value={stats.total} />} accent="var(--color-neon-purple)" sub={t('mastery.gamesSub')} />
          <Stat label={t('mastery.mastered')} value={<CountUp value={stats.mastered} />} accent="var(--color-neon-green)" sub={t('mastery.masteredSub')} />
          <Stat label={t('common.achievements')} value={<CountUp value={stats.awarded} />} accent="var(--color-neon-amber)" sub={t('mastery.achSub', { n: stats.possible.toLocaleString('de-DE') })} />
        </div>
      </section>

      <div className="-mb-1">
        <SectionHeader accent="var(--color-neon-cyan)" title={`${t('mastery.yourGames')}${list.length ? ` (${list.length})` : ''}`} icon={Gamepad2} />
      </div>

      <section className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px] flex items-center gap-2 panel !rounded-lg px-3">
          <Search size={16} className="text-ink-dim" />
          <input className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('mastery.filterPlaceholder')} />
        </div>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setOnlyOpen((o) => !o)}
          style={onlyOpen ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
          {t('mastery.onlyIncomplete')}
        </button>
        <ViewToggle mode={mode} onChange={setMode} />
      </section>

      {loading ? (
        <SkeletonGrid n={6} />
      ) : list.length === 0 ? (
        <div className="panel p-10 text-center">
          <Gamepad2 size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('mastery.empty')}</div>
          <div className="font-body text-ink-dim text-sm mt-2">{t('mastery.emptyBody')}</div>
        </div>
      ) : mode === 'table' ? (
        <div className="panel !rounded-lg overflow-hidden divide-y" style={{ borderColor: 'var(--color-crt-line)' }}>
          {list.map((g) => {
            const pct = g.MaxPossible > 0 ? Math.round((g.NumAwarded / g.MaxPossible) * 100) : 0;
            const done = pct === 100;
            return (
              <button key={`${g.GameID}`} onClick={() => onOpenGame(g.GameID)}
                className="w-full flex items-center gap-3 px-3 py-2 text-left row-hover transition-colors">
                {g.ImageIcon ? <img src={imageUrl(g.ImageIcon)} width={26} height={26} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : <span style={{ width: 26, height: 26 }} className="shrink-0" />}
                <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate" title={g.Title}>{g.Title}</span>
                <ConsoleIcon id={g.ConsoleID} size={14} />
                <span className="font-mono text-sm w-20 text-right shrink-0" style={{ color: done ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)' }}>{g.NumAwarded}/{g.MaxPossible}</span>
                <span className="font-mono text-sm w-12 text-right shrink-0" style={{ color: done ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>{pct}%</span>
                <span className="w-20 shrink-0 hidden sm:block"><Pct value={pct} color={done ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)'} heightClass="h-2" mode="bar" /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {list.map((g) => {
            const pct = g.MaxPossible > 0 ? Math.round((g.NumAwarded / g.MaxPossible) * 100) : 0;
            const done = pct === 100;
            return (
              <button key={`${g.GameID}`} onClick={() => onOpenGame(g.GameID)}
                className="panel !rounded-lg p-3 text-left hover:border-neon-cyan transition-colors" style={{ borderColor: done ? 'var(--color-neon-green)' : 'var(--color-crt-line)' }}>
                <div className="flex items-center gap-3">
                  {g.ImageIcon ? <img src={imageUrl(g.ImageIcon)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-body text-sm text-ink-hi truncate" title={g.Title}>{g.Title}</div>
                    <div className="font-mono text-base flex items-center gap-2">
                      <ConsoleIcon id={g.ConsoleID} size={14} />
                      <span style={{ color: done ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)' }}>{g.NumAwarded}/{g.MaxPossible}</span>
                      {done && <span className="text-neon-green inline-flex items-center gap-0.5"><Star size={11} /> </span>}
                    </div>
                  </div>
                  <Trophy size={16} className={done ? 'text-neon-green' : 'text-ink-dim'} />
                </div>
                <div className="mt-2"><Pct value={pct} color={done ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)'} heightClass="h-2" ringSize={40} /></div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
