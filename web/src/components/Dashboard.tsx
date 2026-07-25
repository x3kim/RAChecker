import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { ScanLine, DatabaseZap, FolderOpen, Trophy, Library as LibraryIcon, Zap, Star, Sparkles } from 'lucide-react';
import type { AotwResult, AppStatus, QuickWin, QuickWinsResult } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { Stat, ConsoleIcon, SectionHeader } from './ui';
import { CollectionDiff } from './CollectionDiff';
import { useI18n } from '../lib/i18n';
import { CountUp, Stagger, StaggerItem } from '../lib/anim';
import { basename, fmtAgo } from '../lib/util';

export function Dashboard({ status, onOpenGame, goScan, goSync, goGames, goLibrary }: {
  status: AppStatus | null; refresh: () => void; onOpenGame: (id: number) => void; goScan: () => void; goSync: () => void;
  goGames: () => void; goLibrary: () => void;
}) {
  const { t } = useI18n();
  const synced = status?.consoles.filter((c) => c.hashCount > 0).length ?? 0;
  const totalConsoles = status?.consoles.length ?? 0;

  const [qw, setQw] = useState<QuickWinsResult | null>(null);
  useEffect(() => { api.quickWins().then(setQw).catch(() => {}); }, []);

  // Achievement of the Week — rendered only when RA actually returned one.
  const [aotw, setAotw] = useState<AotwResult | null>(null);
  useEffect(() => { api.aotw().then(setAotw).catch(() => {}); }, []);
  const ach = aotw && !aotw.error ? aotw.Achievement : undefined;
  const aotwGameId = aotw?.gameId ?? null;
  const aotwFile = aotw?.ownedFiles?.[0]?.path;
  // The backend proxies absolute RA media URLs, so pass the full badge URL.
  const badgeUrl = ach?.BadgeURL ? imageUrl(`https://media.retroachievements.org${ach.BadgeURL}`) : '';

  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="panel panel-glow crt-scanlines relative overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center gap-6 justify-between">
          <div className="max-w-2xl">
            <h1 className="font-display text-xl sm:text-2xl text-glow-cyan leading-relaxed">
              {t('dash.hero.title1')}<br />{t('dash.hero.title2')} <span className="text-glow-green">{t('dash.hero.title3')}</span>
            </h1>
            <p className="font-body text-ink-mid mt-3 text-[15px] leading-relaxed">
              {t('dash.hero.body')}
            </p>
            <div className="grid grid-cols-2 min-[420px]:grid-cols-4 sm:flex sm:flex-wrap gap-2 sm:gap-3 mt-5">
              <button className="btn btn-primary justify-center" onClick={goScan}>
                <ScanLine size={18} /> {t('dash.qa.scan')}
              </button>
              <button className="btn justify-center" onClick={goLibrary}>
                <LibraryIcon size={18} /> {t('dash.qa.collection')}
              </button>
              <button className="btn justify-center" onClick={goGames}>
                <Trophy size={18} /> {t('dash.qa.games')}
              </button>
              <button className="btn justify-center" onClick={goSync}>
                <DatabaseZap size={18} /> {t('dash.qa.hashdb')}
              </button>
            </div>
            <div className="font-mono text-ink-dim text-base mt-4 flex items-center gap-2 break-all">
              <FolderOpen size={15} /> {status?.romRoot || '—'}
            </div>
          </div>

          <Stagger className="grid grid-cols-2 gap-3 shrink-0 w-full lg:w-auto">
            <StaggerItem><Stat label={t('dash.stat.hashes')} value={<CountUp value={status?.totals.hashes ?? 0} />} accent="var(--color-neon-cyan)" sub={t('dash.stat.hashesSub')} /></StaggerItem>
            <StaggerItem><Stat label={t('dash.stat.games')} value={<CountUp value={status?.totals.games ?? 0} />} accent="var(--color-neon-green)" sub={t('dash.stat.gamesSub')} /></StaggerItem>
            <StaggerItem><Stat label={t('dash.stat.systems')} value={`${synced}/${totalConsoles}`} accent="var(--color-neon-purple)" sub={t('dash.stat.systemsSub')} /></StaggerItem>
            <StaggerItem><Stat label={t('dash.stat.lastSync')} value={<span className="text-base">{fmtAgo(status?.lastFullSyncAt)}</span>} accent="var(--color-neon-amber)" /></StaggerItem>
          </Stagger>
        </div>
        <div className="sweep absolute inset-0 pointer-events-none opacity-60" />
      </section>

      {/* Quick Wins */}
      {qw && (qw.nearMastery.length > 0 || qw.freshStarts.length > 0) && (
        <section className="panel p-5">
          <SectionHeader accent="var(--color-neon-amber)" title={t('dash.quickwins')} icon={Zap}>
            <button className="btn !py-1 !px-2.5 text-sm" onClick={goLibrary}><LibraryIcon size={14} /> {t('dash.myCollection')}</button>
          </SectionHeader>
          <p className="font-body text-ink-dim text-sm -mt-2 mb-4">{t('dash.quickwins.sub')}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {qw.nearMastery.length > 0 && (
              <QwColumn title={t('dash.qw.near')} icon={Star} color="var(--color-neon-green)" items={qw.nearMastery} onOpenGame={onOpenGame} mode="near" />
            )}
            {qw.freshStarts.length > 0 && (
              <QwColumn title={t('dash.qw.fresh')} icon={Sparkles} color="var(--color-neon-cyan)" items={qw.freshStarts} onOpenGame={onOpenGame} mode="fresh" />
            )}
          </div>
        </section>
      )}

      {/* Achievement of the Week */}
      {ach && (
        <section className="panel p-5">
          <SectionHeader accent="var(--color-neon-amber)" title={t('comm.aotw')} icon={Trophy} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-4"
            onClick={() => { if (aotwGameId != null) onOpenGame(aotwGameId); }}
            style={{ cursor: aotwGameId != null ? 'pointer' : 'default' }}>
            {badgeUrl && (
              <img src={badgeUrl} width={44} height={44} loading="lazy" className="rounded shrink-0"
                style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-body text-sm text-ink-hi truncate" title={ach.Title}>{ach.Title}</div>
              <div className="font-body text-sm text-ink-mid truncate" title={ach.Description}>{ach.Description}</div>
              <div className="font-mono text-base text-ink-dim flex items-center gap-1.5 mt-1 min-w-0">
                <ConsoleIcon id={aotw?.Console?.ID} size={14} />
                <span className="truncate">{[aotw?.Game?.Title, aotw?.Console?.Title].filter(Boolean).join(' · ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <span className="font-mono text-neon-amber">{ach.Points} {t('common.points')}</span>
              {aotw?.TotalPlayers ? (
                <span className="font-mono text-base text-ink-dim">{t('comm.aotwPlayers', { n: aotw.TotalPlayers.toLocaleString('de-DE') })}</span>
              ) : null}
              <span className="font-mono text-base" style={{ color: aotw?.owned ? 'var(--color-neon-green)' : 'var(--color-neon-amber)' }}>
                {aotw?.owned
                  ? `${t('comm.aotwOwned')}${aotwFile ? ` · ${basename(aotwFile)}` : ''}`
                  : t('comm.aotwNotOwned')}
              </span>
              {aotwGameId != null && (
                <button className="btn !py-1 !px-2.5 text-sm" onClick={(e) => { e.stopPropagation(); onOpenGame(aotwGameId); }}>
                  {t('common.details')}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* What changed since the last scan */}
      <CollectionDiff onOpenGame={onOpenGame} />

      {/* System coverage */}
      <section className="panel p-5">
        <SectionHeader accent="var(--color-neon-cyan)" title={t('dash.coverage')} icon={DatabaseZap}>
          <button className="btn !py-1 !px-2.5 text-sm" onClick={goSync}>
            <DatabaseZap size={14} /> {t('dash.manage')}
          </button>
        </SectionHeader>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2.5">
          {(status?.consoles ?? []).slice().sort((a, b) => b.hashCount - a.hashCount).map((c) => (
            <div key={c.id} className="panel !rounded-lg p-3 flex items-center gap-3" style={{ borderColor: c.hashCount > 0 ? 'var(--color-crt-line)' : 'var(--color-crt-line)' }}>
              <ConsoleIcon id={c.id} short={c.short_code} size={34} />
              <div className="min-w-0 flex-1">
                <div className="font-body text-sm text-ink-hi truncate" title={c.name}>{c.name}</div>
                <div className="font-mono text-base" style={{ color: c.hashCount > 0 ? 'var(--color-neon-cyan)' : 'var(--color-ink-dim)' }}>
                  {c.hashCount > 0 ? t('dash.hashesN', { n: c.hashCount.toLocaleString('de-DE') }) : t('dash.notLoaded')}
                </div>
              </div>
              {c.hash_method === 'rahasher' && <span title={t('common.rahasherDisc')} className="font-mono text-amber-300 text-sm" style={{ color: 'var(--color-neon-amber)' }}>⚙</span>}
              {c.stale && c.hashCount > 0 && <span title={t('common.stale')} style={{ color: 'var(--color-neon-amber)' }}>•</span>}
            </div>
          ))}
          {!status?.consoles.length && (
            <div className="col-span-full font-mono text-ink-dim text-center py-6">
              {t('dash.noSystems')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function QwColumn({ title, icon: Icon, color, items, onOpenGame, mode }: {
  title: string; icon: ComponentType<any>; color: string; items: QuickWin[]; onOpenGame: (id: number) => void; mode: 'near' | 'fresh';
}) {
  const { t } = useI18n();
  return (
    <div>
      <div className="font-mono text-base flex items-center gap-2 mb-2" style={{ color }}>
        <Icon size={15} /> {title}
      </div>
      <Stagger className="flex flex-col gap-2">
        {items.map((g) => (
          <StaggerItem key={g.id}><button onClick={() => onOpenGame(g.id)}
            className="w-full panel !rounded-lg p-2.5 text-left flex items-center gap-3 hover:border-neon-cyan transition-colors" style={{ borderColor: 'var(--color-crt-line)' }}>
            {g.icon ? <img src={imageUrl(g.icon)} width={36} height={36} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
            <div className="min-w-0 flex-1">
              <div className="font-body text-sm text-ink-hi truncate" title={g.title}>{g.title}</div>
              <div className="font-mono text-sm flex items-center gap-2 text-ink-dim">
                <ConsoleIcon id={g.consoleId} short={g.consoleShort ?? undefined} size={13} />
                {mode === 'near'
                  ? <span style={{ color }}>{g.awarded}/{g.total} · {t('dash.qw.remaining', { n: g.remaining })}</span>
                  : <span style={{ color }}>{t('dash.qw.achPts', { a: g.total, p: g.points })}</span>}
              </div>
              {mode === 'near' && <div className="progress-track h-1.5 mt-1.5"><div className="progress-fill" style={{ width: `${g.pct}%` }} /></div>}
            </div>
          </button></StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
