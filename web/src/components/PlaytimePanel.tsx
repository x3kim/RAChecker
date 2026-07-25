import { useEffect, useRef, useState } from 'react';
import { Clock, Radio, RefreshCw, Download, Upload } from 'lucide-react';
import type { PlaySession, PlaytimeGame, PlaytimeTotals, PresenceStatus } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, Stat, SectionHeader } from './ui';
import { CountUp } from '../lib/anim';
import { useI18n } from '../lib/i18n';
import { fmtAgo, fmtDate } from '../lib/util';

// Local duration formatter — no new i18n keys needed, "2h 14m" / "45m" / "<1m".
function fmtDuration(ms: number): string {
  if (ms < 60000) return '<1m';
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function PlaytimePanel({ onOpenGame, goSettings }: {
  onOpenGame?: (id: number) => void;
  goSettings?: () => void;
}) {
  const { t } = useI18n();
  const [presence, setPresence] = useState<PresenceStatus | null>(null);
  const [games, setGames] = useState<PlaytimeGame[]>([]);
  const [totals, setTotals] = useState<PlaytimeTotals>({ sessions: 0, ms: 0, games: 0 });
  const [sessions, setSessions] = useState<PlaySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const [ioMsg, setIoMsg] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.presence().catch(() => null),
      api.playtime().catch(() => ({ games: [] as PlaytimeGame[], totals: { sessions: 0, ms: 0, games: 0 }, config: { enabled: false, intervalMin: 15 } })),
      api.sessions(10).catch(() => ({ sessions: [] as PlaySession[], totals: { sessions: 0, ms: 0, games: 0 } })),
    ]).then(([p, pt, s]) => {
      setPresence(p);
      setGames(pt.games);
      setTotals(pt.totals);
      setSessions(s.sessions);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const pollNow = () => {
    setPolling(true);
    api.pollPresence().catch(() => null).finally(() => { setPolling(false); load(); });
  };
  const enable = () => { api.savePresence({ enabled: true }).catch(() => null).finally(load); };
  const clearHistory = () => {
    if (!window.confirm(t('play.clearConfirm'))) return;
    api.clearSessions().catch(() => null).finally(load);
  };
  const doImport = async (file: File) => {
    setIoMsg('…');
    try {
      const data = JSON.parse(await file.text());
      const rows = Array.isArray(data) ? data : (Array.isArray(data?.sessions) ? data.sessions : null);
      if (!rows) { setIoMsg(t('play.importBad')); return; }
      const r = await api.importSessions(rows);
      if (r.error) { setIoMsg(t('play.importBad')); return; }
      setIoMsg(t('play.importDone', { added: r.added ?? 0, skipped: r.skipped ?? 0 }));
      load();
    } catch { setIoMsg(t('play.importBad')); }
  };

  const lastSample = presence?.lastSample ?? null;
  const isOff = presence?.enabled === false;

  return (
    <section className="panel p-5">
      <SectionHeader accent="var(--color-neon-purple)" title={t('play.title')} icon={Clock}>
        <div className="flex items-center gap-2">
          <button className="btn !py-1 !px-2.5 text-sm" onClick={pollNow} disabled={polling}>
            <Radio size={14} className={polling ? 'animate-pulse' : ''} /> {t('play.pollNow')}
          </button>
          <button className="btn !py-1 !px-2.5 text-sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
        </div>
      </SectionHeader>
      <div className="font-body text-ink-mid text-sm -mt-2 mb-4">{t('play.sub')}</div>

      {/* Playing now */}
      {lastSample?.active ? (
        <div className="panel !rounded-md p-2.5 flex items-center gap-3 mb-2" style={{ borderColor: 'var(--color-neon-green)' }}>
          {lastSample.imageUrl ? (
            <img src={imageUrl(lastSample.imageUrl)} width={32} height={32} className="rounded shrink-0" style={{ objectFit: 'contain' }} alt="" />
          ) : (
            <span style={{ width: 32, height: 32 }} className="shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="font-mono text-ink-dim text-sm">{t('play.now')}</div>
            <div className="font-body text-sm text-ink-hi truncate">
              {lastSample.title}
              {lastSample.consoleName && <span className="text-ink-dim"> · {lastSample.consoleName}</span>}
            </div>
            {lastSample.rich && <div className="font-mono text-neon-green text-sm truncate">{lastSample.rich}</div>}
          </div>
        </div>
      ) : (
        <div className="text-ink-dim font-mono text-sm mb-2">{t('play.nowNothing')}</div>
      )}
      {presence?.running && (
        <div className="font-mono text-ink-dim text-sm mb-4">{t('play.interval', { n: presence.intervalMin })}</div>
      )}

      {isOff ? (
        <div className="panel !rounded-lg p-4 flex items-center justify-between flex-wrap gap-3 mt-2">
          <div className="font-body text-sm text-ink-mid">{t('play.off')}</div>
          <div className="flex items-center gap-2">
            <button className="btn btn-primary !py-1.5 !px-3 text-sm" onClick={enable}>{t('play.enable')}</button>
            <button className="btn !py-1.5 !px-3 text-sm" onClick={() => goSettings?.()}>{t('nav.settings')}</button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
            <Stat label={t('play.totalTime')} value={fmtDuration(totals.ms)} accent="var(--color-neon-purple)" />
            <Stat label={t('play.sessions')} value={<CountUp value={totals.sessions} />} accent="var(--color-neon-cyan)" />
            <Stat label={t('play.gamesTracked')} value={<CountUp value={totals.games} />} accent="var(--color-neon-green)" />
          </div>

          {sessions.length === 0 && games.length === 0 ? (
            <div className="text-ink-dim font-mono text-sm mt-4">{t('play.empty')}</div>
          ) : (
            <>
              {games.length > 0 && (
                <div className="mt-5">
                  <SectionHeader accent="var(--color-neon-cyan)" title={t('play.topGames')} />
                  <div className="flex flex-col gap-1.5">
                    {games.map((g, i) => (
                      <button
                        key={g.game_id ?? `u-${i}`}
                        onClick={() => { if (g.game_id != null) onOpenGame?.(g.game_id); }}
                        className="w-full flex items-center gap-3 px-2 py-1.5 text-left row-hover rounded transition-colors"
                      >
                        {g.image_icon ? (
                          <img src={imageUrl(g.image_icon)} width={24} height={24} loading="lazy" className="rounded shrink-0" style={{ objectFit: 'contain' }} alt="" />
                        ) : (
                          <span style={{ width: 24, height: 24 }} className="shrink-0" />
                        )}
                        <span className="font-body text-sm text-ink-hi flex-1 min-w-0 truncate">{g.title || t('play.unknownGame')}</span>
                        <ConsoleIcon id={g.console_id} short={g.console_short ?? undefined} size={16} />
                        <span className="font-mono text-sm text-neon-purple w-16 text-right shrink-0">{fmtDuration(g.ms)}</span>
                        <span className="font-mono text-sm text-ink-dim w-24 text-right shrink-0">{g.sessions} {t('play.sessions')}</span>
                        <span className="font-mono text-sm text-ink-dim w-28 text-right shrink-0 hidden sm:inline">{t('play.lastSeen', { d: fmtAgo(g.lastAt) })}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {sessions.length > 0 && (
                <div className="mt-5">
                  <SectionHeader accent="var(--color-neon-amber)" title={t('play.recent')} />
                  <div className="flex flex-col gap-1.5">
                    {sessions.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-3 px-2 py-1.5">
                        <span className="font-mono text-sm text-ink-dim w-32 shrink-0">{fmtDate(s.started_at)}</span>
                        <span className="font-mono text-sm text-neon-purple w-14 shrink-0">{fmtDuration(s.last_seen_at - s.started_at)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="font-body text-sm text-ink-hi truncate">{s.title || t('play.unknownGame')}</div>
                          {s.rich_presence && <div className="font-mono text-ink-dim text-sm truncate">{s.rich_presence}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </>
      )}

      {/* Export/Import always available — importing a playtime backup shouldn't
          require live tracking to be enabled first. */}
      <div className="mt-5 pt-4 border-t border-crt-line flex items-center gap-2 flex-wrap">
        <a className="btn !py-1 !px-2.5 text-sm" href="/api/presence/export" title={t('play.export')}>
          <Download size={14} /> {t('play.export')}
        </a>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) doImport(f); }} />
        <button className="btn !py-1 !px-2.5 text-sm" onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> {t('play.import')}
        </button>
        {!isOff && <button className="btn btn-danger !py-1 !px-2.5 text-sm" onClick={clearHistory}>{t('play.clear')}</button>}
        {ioMsg && <span className="font-mono text-sm text-ink-mid">{ioMsg}</span>}
      </div>
    </section>
  );
}
