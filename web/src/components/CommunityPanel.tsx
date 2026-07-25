import { useEffect, useState } from 'react';
import { Users, Trophy, RefreshCw, ExternalLink, Star, Medal } from 'lucide-react';
import type { AotwResult, AwardsResult } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, SectionHeader, Pill } from './ui';
import { SkeletonGrid, SkeletonCard } from './Skeleton';
import { Stagger, StaggerItem } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { fmtAgo, fmtDate, basename } from '../lib/util';

function AotwSection({ onOpenGame, goSettings }: { onOpenGame: (id: number) => void; goSettings: () => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<AotwResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (refresh = false) => {
    setLoading(true);
    api.aotw(refresh).then(setData).catch((e) => setData({ gameId: null, owned: false, ownedFiles: [], localGame: null, error: String(e) })).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  const badgeUrl = data?.Achievement?.BadgeURL
    ? imageUrl(`https://media.retroachievements.org${data.Achievement.BadgeURL}`)
    : null;

  return (
    <section className="panel panel-glow crt-scanlines p-5">
      <SectionHeader accent="var(--color-neon-amber)" title={t('comm.aotw')} icon={Star}>
        <div className="flex items-center gap-2">
          {data?._cachedAt != null && <span className="font-mono text-sm text-ink-dim">{fmtAgo(data._cachedAt)}</span>}
          <button className="btn !py-1 !px-2.5 text-sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </SectionHeader>

      {loading && !data ? (
        <SkeletonCard />
      ) : !data?.Achievement ? (
        <div className="p-6 text-center">
          <Star size={36} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('comm.noData')}</div>
          {data?.error && (
            <button className="btn !py-1.5 !px-3 text-sm mt-3" onClick={goSettings}>{t('nav.settings')}</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-4">
          {badgeUrl && (
            <img src={badgeUrl} width={72} height={72} className="rounded-lg shrink-0" style={{ border: '1px solid var(--color-neon-amber)', boxShadow: 'var(--shadow-glow-amber)', objectFit: 'contain' }} alt="" />
          )}
          <div className="min-w-0 flex-1 flex flex-col gap-2">
            <div>
              <div className="font-display text-base text-ink-hi">{data.Achievement.Title}</div>
              <div className="font-body text-sm text-ink-mid mt-1">{data.Achievement.Description}</div>
              <div className="font-mono text-neon-amber text-sm mt-1">{data.Achievement.Points} P</div>
            </div>
            <div className="font-mono text-sm text-ink-dim flex items-center gap-2 flex-wrap">
              <ConsoleIcon id={data.Console?.ID ?? null} size={14} short={data.Console?.Title} />
              <span>{data.Game?.Title}</span>
              {data.StartAt && <span>· {t('comm.aotwSince', { d: fmtDate(new Date(data.StartAt).getTime()) })}</span>}
              {data.TotalPlayers != null && <span>· {t('comm.aotwPlayers', { n: data.TotalPlayers })}</span>}
            </div>

            {data.owned ? (
              <div className="panel !rounded-lg p-3" style={{ borderColor: 'var(--color-neon-green)' }}>
                <div className="font-body text-sm text-neon-green">{t('comm.aotwOwned')}</div>
                {data.ownedFiles.length > 0 && (
                  <div className="font-mono text-sm text-ink-dim mt-1 flex flex-col gap-0.5">
                    {data.ownedFiles.slice(0, 3).map((f, i) => <span key={i} className="truncate">{basename(f.path)}</span>)}
                  </div>
                )}
              </div>
            ) : (
              <div className="panel !rounded-lg p-3" style={{ borderColor: 'var(--color-neon-amber)' }}>
                <div className="font-body text-sm text-neon-amber">{t('comm.aotwNotOwned')}</div>
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap mt-1">
              {data.gameId != null && (
                <button className="btn !py-1.5 !px-3 text-sm" onClick={() => onOpenGame(data.gameId as number)}>{t('common.details')}</button>
              )}
              {data.gameId != null && (
                <a className="btn !py-1.5 !px-3 text-sm" href={`https://retroachievements.org/game/${data.gameId}`} target="_blank" rel="noreferrer">
                  <ExternalLink size={14} /> {t('gm.openRA')}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function AwardRow({ row, onOpenGame }: { row: AwardsResult['results'][number]; onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  return (
    <div
      className="panel !rounded-lg p-2.5 flex items-center gap-2.5"
      style={{ borderColor: row.owned ? 'var(--color-neon-green)' : 'var(--color-crt-line)', borderLeftWidth: row.owned ? 3 : 1 }}>
      <Medal size={16} className={row.owned ? 'text-neon-green' : 'text-ink-dim'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="font-body text-sm text-ink-hi hover:text-neon-cyan text-left truncate" onClick={() => onOpenGame(row.GameID)}>{row.GameTitle}</button>
          {row.owned && <Pill color="var(--color-neon-green)">{t('comm.yours')}</Pill>}
        </div>
        <div className="font-mono text-sm text-ink-dim flex items-center gap-2 flex-wrap">
          <span>{row.User}</span>
          <ConsoleIcon id={row.ConsoleID} size={13} short={row.ConsoleName} /> {row.ConsoleName}
          <span>· {fmtAgo(Date.parse(row.AwardDate))}</span>
        </div>
      </div>
    </div>
  );
}

function AwardsSection({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<AwardsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [onlyMine, setOnlyMine] = useState(false);

  const load = (refresh = false) => {
    setLoading(true);
    api.recentAwards(refresh).then(setData).catch((e) => setData({ total: 0, results: [], error: String(e) })).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  const rows = (data?.results ?? []).filter((r) => !onlyMine || r.owned);

  return (
    <section className="panel p-5">
      <SectionHeader accent="var(--color-neon-purple)" title={t('comm.awards')} icon={Users}>
        <div className="flex items-center gap-2">
          {data?._cachedAt != null && <span className="font-mono text-sm text-ink-dim">{fmtAgo(data._cachedAt)}</span>}
          <button className="btn !py-1 !px-2.5 text-sm" onClick={() => setOnlyMine((v) => !v)}
            style={onlyMine ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            {t('hc.onlyOwned')}
          </button>
          <button className="btn !py-1 !px-2.5 text-sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </SectionHeader>
      <p className="font-body text-ink-dim text-sm -mt-2 mb-3">{t('comm.awardsSub')}</p>

      {loading && !data ? (
        <SkeletonGrid n={4} cols="grid-cols-1 sm:grid-cols-2" />
      ) : rows.length === 0 ? (
        <div className="p-6 text-center">
          <Trophy size={36} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('comm.noData')}</div>
        </div>
      ) : (
        <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {rows.map((r, i) => (
            <StaggerItem key={`${r.GameID}|${r.User}|${i}`}>
              <AwardRow row={r} onOpenGame={onOpenGame} />
            </StaggerItem>
          ))}
        </Stagger>
      )}
    </section>
  );
}

export function CommunityPanel({ onOpenGame, goSettings }: { onOpenGame: (id: number) => void; goSettings: () => void }) {
  return (
    <div className="flex flex-col gap-5">
      <AotwSection onOpenGame={onOpenGame} goSettings={goSettings} />
      <AwardsSection onOpenGame={onOpenGame} />
    </div>
  );
}
