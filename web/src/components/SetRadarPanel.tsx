import { useEffect, useState } from 'react';
import {
  Radar, RefreshCw, Trophy, Clock3, ListChecks, Heart, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react';
import type { ClaimRow, ClaimsResult, SetRequestsResult, WantToPlayResult } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, SectionHeader, Pill } from './ui';
import { SkeletonGrid } from './Skeleton';
import { Stagger, StaggerItem } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { fmtAgo, fmtDate } from '../lib/util';

type Tab = 'claims' | 'requests' | 'wtp';

// RA claim timestamps look like "2026-06-20 04:23:44" (no timezone) — treat as UTC.
function parseRaDate(s?: string): number | null {
  if (!s) return null;
  const t = new Date(s.replace(' ', 'T') + 'Z').getTime();
  return Number.isNaN(t) ? null : t;
}

function ClaimRowView({ row, onOpenGame }: { row: ClaimRow; onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const created = parseRaDate(row.Created);
  const due = parseRaDate(row.DoneTime);
  const clickable = row.gameId != null;
  return (
    <div className="panel !rounded-lg p-3 flex items-start gap-3" style={{ borderColor: 'var(--color-crt-line)' }}>
      {row.icon ? (
        <img src={imageUrl(row.icon)} width={32} height={32} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
      ) : (
        <span className="shrink-0 grid place-items-center" style={{ width: 32, height: 32 }}><ConsoleIcon id={row.consoleId} size={20} /></span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {clickable ? (
            <button className="font-body text-sm text-ink-hi hover:text-neon-cyan text-left truncate" onClick={() => onOpenGame(row.gameId as number)}>
              {row.GameTitle}
            </button>
          ) : (
            <span className="font-body text-sm text-ink-hi truncate">{row.GameTitle}</span>
          )}
          <Pill color={row.SetType === 1 ? 'var(--color-neon-amber)' : 'var(--color-neon-cyan)'}>
            {row.SetType === 1 ? t('radar.setRevision') : t('radar.setNew')}
          </Pill>
        </div>
        <div className="flex items-center gap-2 mt-1 font-mono text-sm text-ink-dim flex-wrap">
          <ConsoleIcon id={row.consoleId} size={13} /> {row.ConsoleName}
          <span>· {t('radar.claimBy', { u: row.User })}</span>
          {created != null && <span>· {t('radar.claimSince', { d: fmtDate(created) })}</span>}
          {due != null && <span>· {t('radar.claimDue', { d: fmtDate(due) })}</span>}
        </div>
        {row.relation === 'likely' && row.files && row.files.length > 0 && (
          <div className="mt-1.5 font-mono text-sm text-ink-dim flex flex-col gap-0.5">
            {row.files.map((f, i) => <span key={i} className="truncate">{f.name}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClaimsTab({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<ClaimsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showOther, setShowOther] = useState(false);

  const load = (refresh = false) => {
    setLoading(true);
    api.claims(refresh).then(setData).catch((e) => setData({ counts: { total: 0, owned: 0, likely: 0, other: 0 }, owned: [], likely: [], other: [], error: String(e) })).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  if (loading && !data) return <SkeletonGrid n={4} />;
  if (!data) return null;

  const other = showOther ? data.other : data.other.slice(0, 30);
  const empty = data.counts.total === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-sm text-ink-dim">
          {data._cachedAt ? fmtAgo(data._cachedAt) : ''}
        </div>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      {empty ? (
        <div className="panel p-10 text-center">
          <Radar size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('radar.noClaims')}</div>
        </div>
      ) : (
        <>
          {data.owned.length > 0 && (
            <section>
              <SectionHeader accent="var(--color-neon-green)" title={`${t('radar.owned')} (${data.owned.length})`} icon={Trophy} />
              <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.owned.map((r) => <StaggerItem key={r.GameID}><ClaimRowView row={r} onOpenGame={onOpenGame} /></StaggerItem>)}
              </Stagger>
            </section>
          )}
          {data.likely.length > 0 && (
            <section>
              <SectionHeader accent="var(--color-neon-amber)" title={`${t('radar.likely')} (${data.likely.length})`} icon={Clock3} />
              <p className="font-body text-ink-dim text-sm -mt-2 mb-2">{t('radar.likelyHint')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {data.likely.map((r) => <ClaimRowView key={r.GameID} row={r} onOpenGame={onOpenGame} />)}
              </div>
            </section>
          )}
          {data.other.length > 0 && (
            <section>
              <SectionHeader accent="var(--color-neon-cyan)" title={`${t('radar.other')} (${data.other.length})`} icon={ListChecks} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {other.map((r) => <ClaimRowView key={r.GameID} row={r} onOpenGame={onOpenGame} />)}
              </div>
              {data.other.length > 30 && (
                <button className="btn !py-1.5 !px-3 text-sm mt-2" onClick={() => setShowOther((s) => !s)}>
                  {showOther ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {t('common.loadMore')}
                </button>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function RequestsTab({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<SetRequestsResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (refresh = false) => {
    setLoading(true);
    api.setRequests(refresh).then(setData).catch((e) => setData({ games: [], totalRequests: 0, pointsForNext: null, error: String(e) })).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  if (loading && !data) return <SkeletonGrid n={4} />;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-sm text-ink-mid">
          {!data.loggedOut && t('radar.requests', { n: data.used ?? data.games.length, t: data.totalRequests })}
          {!data.loggedOut && data.pointsForNext != null && <span className="text-ink-dim"> · {t('radar.pointsForNext', { n: data.pointsForNext })}</span>}
        </div>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <a className="btn !py-1.5 !px-3 text-sm" href="https://retroachievements.org/setRequestList.php" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> {t('radar.requestOnRA')}
        </a>
        <a className="btn !py-1.5 !px-3 text-sm" href="https://docs.retroachievements.org/developer-docs/getting-started-as-an-achievement-developer.html" target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> {t('radar.devDocs')}
        </a>
      </div>

      {data.loggedOut ? (
        <div className="panel p-10 text-center">
          <Radar size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('radar.loginNeeded')}</div>
        </div>
      ) : data.games.length === 0 ? (
        <div className="panel p-10 text-center">
          <Radar size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('radar.noRequests')}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {data.games.map((g) => {
            const clickable = g.gameId != null;
            return (
              <div key={g.GameID} className="panel !rounded-lg p-3 flex items-center gap-3" style={{ borderColor: 'var(--color-crt-line)' }}>
                {g.icon ? (
                  <img src={imageUrl(g.icon)} width={32} height={32} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
                ) : (
                  <span className="shrink-0 grid place-items-center" style={{ width: 32, height: 32 }}><ConsoleIcon id={g.consoleId} size={20} /></span>
                )}
                <div className="min-w-0 flex-1">
                  {clickable ? (
                    <button className="font-body text-sm text-ink-hi hover:text-neon-cyan text-left truncate block w-full" onClick={() => onOpenGame(g.gameId as number)}>{g.Title}</button>
                  ) : (
                    <span className="font-body text-sm text-ink-hi truncate block">{g.Title}</span>
                  )}
                  <div className="flex items-center gap-2 font-mono text-sm text-ink-dim">
                    <ConsoleIcon id={g.consoleId} size={13} /> {g.ConsoleName}
                  </div>
                </div>
                {g.owned && <Pill color="var(--color-neon-green)">{t('common.owned')}</Pill>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WtpTab({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [data, setData] = useState<WantToPlayResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = (refresh = false) => {
    setLoading(true);
    api.wantToPlay(refresh).then(setData).catch((e) => setData({ total: 0, owned: 0, games: [], error: String(e) })).finally(() => setLoading(false));
  };
  useEffect(() => { load(false); }, []);

  if (loading && !data) return <SkeletonGrid n={4} />;
  if (!data) return null;

  const sorted = [...data.games].sort((a, b) => Number(b.owned) - Number(a.owned));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="font-mono text-sm text-ink-mid">{!data.loggedOut && t('radar.wtpOwned', { n: data.owned, t: data.total })}</div>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
        </button>
      </div>

      {data.loggedOut ? (
        <div className="panel p-10 text-center">
          <Heart size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('radar.loginNeeded')}</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="panel p-10 text-center">
          <Heart size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('radar.noWtp')}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sorted.map((g) => {
            const clickable = g.gameId != null;
            return (
              <div key={g.ID} className="panel !rounded-lg p-3 flex items-center gap-3" style={{ borderColor: g.owned ? 'var(--color-neon-green)' : 'var(--color-crt-line)' }}>
                {g.ImageIcon ? (
                  <img src={imageUrl(g.ImageIcon)} width={32} height={32} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
                ) : (
                  <span className="shrink-0 grid place-items-center" style={{ width: 32, height: 32 }}><ConsoleIcon id={g.ConsoleID} size={20} /></span>
                )}
                <div className="min-w-0 flex-1">
                  {clickable ? (
                    <button className="font-body text-sm text-ink-hi hover:text-neon-cyan text-left truncate block w-full" onClick={() => onOpenGame(g.gameId as number)}>{g.Title}</button>
                  ) : (
                    <span className="font-body text-sm text-ink-hi truncate block">{g.Title}</span>
                  )}
                  <div className="flex items-center gap-2 font-mono text-sm text-ink-dim">
                    <ConsoleIcon id={g.ConsoleID} size={13} /> {g.ConsoleName}
                  </div>
                </div>
                <Pill color={g.owned ? 'var(--color-neon-green)' : 'var(--color-crt-line2)'}>{g.owned ? t('common.owned') : t('common.notOwned')}</Pill>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SetRadarPanel({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>('claims');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'claims', label: t('radar.tab.claims') },
    { id: 'requests', label: t('radar.tab.requests') },
    { id: 'wtp', label: t('radar.tab.wtp') },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section className="panel panel-glow crt-scanlines p-5">
        <h1 className="font-display text-lg text-glow-cyan flex items-center gap-2"><Radar size={20} /> {t('radar.title')}</h1>
        <p className="font-body text-ink-dim text-sm mt-1">{t('radar.sub')}</p>
      </section>

      <div className="flex items-center gap-1.5">
        {tabs.map((tb) => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className="btn !py-1.5 !px-3 text-sm"
            style={tab === tb.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)', color: 'var(--color-ink-hi)' } : {}}>
            {tb.label}
          </button>
        ))}
      </div>

      {tab === 'claims' && <ClaimsTab onOpenGame={onOpenGame} />}
      {tab === 'requests' && <RequestsTab onOpenGame={onOpenGame} />}
      {tab === 'wtp' && <WtpTab onOpenGame={onOpenGame} />}
    </div>
  );
}
