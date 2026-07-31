import { useEffect, useMemo, useState } from 'react';
import {
  X, Trophy, ExternalLink, Check, Wrench, Download, RefreshCw, FolderOpen, Maximize2, Minimize2,
  Play, Cpu, BarChart3, ChevronDown, ChevronUp,
} from 'lucide-react';
import { api, imageUrl } from '../lib/api';
import type { OwnedFiles, LeaderboardsResult, LeaderboardEntry, ConsoleCores } from '../lib/api';
import { SectionHeader, Pill } from './ui';
import { RegionBadges } from './RegionBadges';
import { Pct } from './Progress';
import { Skeleton } from './Skeleton';
import { useI18n } from '../lib/i18n';
import { basename } from '../lib/util';
import {
  loadRegionPriority, cachedRegionPriority, REGION_EVENT,
  parseRomTags, tagTokens, rankTokens, tokenLabel, tokenName,
} from '../lib/region';

export function GameModal({ gameId, onClose }: { gameId: number; onClose: () => void }) {
  const { t } = useI18n();
  const [game, setGame] = useState<any>(null);
  const [prog, setProg] = useState<Awaited<ReturnType<typeof api.userGame>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [owned, setOwned] = useState<OwnedFiles | null>(null);
  const [ownedLoading, setOwnedLoading] = useState(true);
  const [full, setFull] = useState(() => localStorage.getItem('ra-gm-full') === '1');
  // leaderboards (lazy: only fetched once the section is expanded)
  const [lbOpen, setLbOpen] = useState(false);
  const [lb, setLb] = useState<LeaderboardsResult | null>(null);
  const [lbLoading, setLbLoading] = useState(false);
  const [entries, setEntries] = useState<Record<number, LeaderboardEntry[]>>({});
  const [entriesLoading, setEntriesLoading] = useState<number | null>(null);
  // emulator core hint + launch
  const [cores, setCores] = useState<ConsoleCores | null>(null);
  const [coreAlt, setCoreAlt] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true); setProg(null);
    setOwned(null); setOwnedLoading(true);
    setLbOpen(false); setLb(null); setEntries({}); setEntriesLoading(null);
    setCores(null); setCoreAlt(false); setLaunchMsg(null);
    api.game(gameId).then((g) => { if (alive) { setGame(g); setLoading(false); } }).catch(() => alive && setLoading(false));
    api.userGame(gameId).then((p) => { if (alive && !p.error) setProg(p); }).catch(() => {});
    api.libraryForGame(gameId).then((o) => { if (alive) setOwned(o); }).catch(() => {}).finally(() => { if (alive) setOwnedLoading(false); });
    return () => { alive = false; };
  }, [gameId]);

  // ---- region/language of the supported ROM versions ----------------------
  const [priority, setPriority] = useState<string[]>(cachedRegionPriority());
  useEffect(() => {
    loadRegionPriority().then(setPriority);
    const h = (e: Event) => setPriority(((e as CustomEvent).detail as string[]) ?? []);
    window.addEventListener(REGION_EVENT, h);
    return () => window.removeEventListener(REGION_EVENT, h);
  }, []);

  const ownedMd5 = useMemo(
    () => new Set((owned?.files ?? []).map((f) => String(f.md5 ?? '').toLowerCase()).filter(Boolean)),
    [owned],
  );
  // Preferred versions first, so "which one should I get?" is answered by the
  // top of the list. Stable for equal ranks, so RA's own order survives.
  const sortedHashes = useMemo(() => {
    const list: any[] = Array.isArray(game?.hashes) ? game.hashes : [];
    if (!priority.length) return list;
    return list
      .map((h, i) => ({ h, i, rank: rankTokens(tagTokens(parseRomTags(h?.Name ?? '')), priority) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.h);
  }, [game, priority]);
  // Distinct region tokens across all supported versions + which of them the
  // user already owns a file for.
  const { romRegions, ownedRegions } = useMemo(() => {
    const all: string[] = [];
    const mine = new Set<string>();
    for (const h of (Array.isArray(game?.hashes) ? game.hashes : [])) {
      const { regions } = parseRomTags(h?.Name ?? '');
      const isMine = ownedMd5.has(String(h?.MD5 ?? '').toLowerCase());
      for (const r of regions) {
        if (!all.includes(r)) all.push(r);
        if (isMine) mine.add(r);
      }
    }
    return { romRegions: all, ownedRegions: mine };
  }, [game, ownedMd5]);

  // Manual force-refresh: bypass the cache and re-pull from RetroAchievements.
  const refresh = () => {
    setRefreshing(true);
    Promise.all([
      api.game(gameId, true).then((g) => setGame(g)).catch(() => {}),
      api.userGame(gameId).then((p) => { if (!p.error) setProg(p); }).catch(() => {}),
    ]).finally(() => setRefreshing(false));
  };

  // Emulator cores for this console — drives the recommendation block.
  const consoleId: number | null = game?.ConsoleID != null ? Number(game.ConsoleID) : null;
  useEffect(() => {
    if (consoleId == null || Number.isNaN(consoleId)) return;
    let alive = true;
    api.coresFor(consoleId).then((c) => { if (alive) setCores(c); }).catch(() => {});
    return () => { alive = false; };
  }, [consoleId]);

  const loadLeaderboards = (refresh = false) => {
    setLbLoading(true);
    api.gameLeaderboards(gameId, refresh)
      .then((r) => { setLb(r); if (refresh) setEntries({}); })
      .catch(() => setLb({ total: 0, boards: [], error: 'load_failed' }))
      .finally(() => setLbLoading(false));
  };
  const toggleLb = () => {
    const next = !lbOpen;
    setLbOpen(next);
    if (next && !lb && !lbLoading) loadLeaderboards();
  };
  const loadEntries = (id: number) => {
    setEntriesLoading(id);
    api.leaderboardEntries(id)
      .then((r) => setEntries((p) => ({ ...p, [id]: (r.results || []).slice(0, 25) })))
      .catch(() => setEntries((p) => ({ ...p, [id]: [] })))
      .finally(() => setEntriesLoading(null));
  };

  const doLaunch = (f: { path: string; inner_path?: string }) => {
    setLaunching(true); setLaunchMsg(null);
    api.launch({ path: f.path, inner: f.inner_path || '', consoleId })
      .then((r) => {
        if (r.ok) setLaunchMsg({ ok: true, text: t('launch.started', { n: r.core?.name ?? '' }) });
        else if (r.error === 'no_emulator') setLaunchMsg({ ok: false, text: t('launch.notConfigured') });
        else setLaunchMsg({ ok: false, text: t('launch.failed', { e: r.message ?? r.error ?? '' }) });
      })
      .catch((e) => setLaunchMsg({ ok: false, text: t('launch.failed', { e: String(e?.message || e) }) }))
      .finally(() => setLaunching(false));
  };
  // Fade the inline launch feedback out again after a few seconds.
  useEffect(() => {
    if (!launchMsg) return;
    const id = setTimeout(() => setLaunchMsg(null), 6000);
    return () => clearTimeout(id);
  }, [launchMsg]);

  const earned = prog?.earned || {};
  const compPct = prog ? (prog.total ? Math.round((prog.numAwarded / prog.total) * 100) : 0) : 0;
  const coreList = cores?.cores || [];
  const primaryCore = coreList[0] || null;
  const altCores = coreList.slice(1);
  const standalone = cores?.standalone || [];

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className={`panel panel-glow modal-pop w-full overflow-auto crt-scanlines ${full ? 'w-[96vw] h-[94vh] max-w-none' : 'max-w-2xl max-h-[86vh]'}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line sticky top-0 sticky-head backdrop-blur z-10">
          <h3 className="font-display text-sm text-glow-cyan break-words leading-relaxed pr-3">{game?.Title || t('gm.game')}</h3>
          <div className="flex items-center gap-2 shrink-0">
            <button className="btn !p-1.5" onClick={refresh} disabled={refreshing} title={t('gm.refresh')}>
              <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button className="btn !p-1.5" onClick={() => setFull((f) => !f)} title={full ? t('gm.exitFullscreen') : t('gm.fullscreen')}>
              {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
          </div>
        </div>

        {loading && (
          <div className="p-5 flex flex-col gap-4">
            <div className="flex gap-4">
              <Skeleton style={{ width: 144, height: 110, borderRadius: 10 }} />
              <div className="flex-1 flex flex-col gap-2.5">
                <Skeleton style={{ width: '60%', height: 14 }} />
                <Skeleton style={{ width: '40%', height: 11 }} />
                <Skeleton style={{ width: '80%', height: 11 }} />
                <Skeleton style={{ width: '30%', height: 22, marginTop: 6 }} />
              </div>
            </div>
            <Skeleton style={{ width: '100%', height: 64 }} />
          </div>
        )}
        {!loading && game?.error && <div className="p-8 font-mono text-neon-red text-center">{t('gm.loadError', { e: game.error })}</div>}

        {!loading && game && !game.error && (
          <div className="p-5">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              {game.ImageBoxArt && (
                <img src={imageUrl(game.ImageBoxArt)} className="rounded-lg w-36 h-auto self-start shrink-0 mx-auto sm:mx-0"
                  style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
              )}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="font-mono text-base text-ink-mid">{game.ConsoleName}</div>
                <div className="flex flex-wrap gap-x-5 gap-y-1 font-body text-sm text-ink-mid">
                  {game.Developer && <span>{t('gm.developer')}: <span className="text-ink-hi">{game.Developer}</span></span>}
                  {game.Publisher && <span>{t('gm.publisher')}: <span className="text-ink-hi">{game.Publisher}</span></span>}
                  {game.Genre && <span>{t('gm.genre')}: <span className="text-ink-hi">{game.Genre}</span></span>}
                  {game.Released && <span>{t('gm.released')}: <span className="text-ink-hi">{game.Released}</span></span>}
                </div>
                <div className="flex items-center gap-2 font-mono text-lg text-neon-amber pt-1">
                  <Trophy size={16} /> {t('gm.achievementsN', { n: game.NumAchievements ?? 0 })}
                </div>

                {/* recommended emulator core for this console */}
                {consoleId != null && (
                  <div className="mt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm text-ink-mid">{t('core.title')}</span>
                      {primaryCore ? (
                        <>
                          <Pill color="var(--color-neon-cyan)" title={primaryCore.note || undefined}>
                            <Cpu size={12} /> {t('core.recommended')}: {primaryCore.name}
                          </Pill>
                          {primaryCore.achievements && (
                            <span className="badge" style={{ color: 'var(--color-neon-green)' }}>{t('core.achievements')}</span>
                          )}
                          {primaryCore.hardcore && (
                            <span className="badge" style={{ color: 'var(--color-neon-green)' }}>{t('core.hardcore')}</span>
                          )}
                          {(altCores.length > 0 || standalone.length > 0) && (
                            <button className="btn !py-0.5 !px-1.5 text-sm" onClick={() => setCoreAlt((a) => !a)} title={t('core.alternatives')}>…</button>
                          )}
                        </>
                      ) : cores ? (
                        <span className="font-body text-ink-dim text-sm">{t('core.noneKnown')}</span>
                      ) : null}
                    </div>
                    {coreAlt && (
                      <div className="font-mono text-sm text-ink-dim mt-1 space-y-0.5">
                        {altCores.length > 0 && <div>{t('core.alternatives')}: {altCores.map((c) => c.name).join(' · ')}</div>}
                        {standalone.length > 0 && <div>{t('core.standalone')}: {standalone.join(' · ')}</div>}
                      </div>
                    )}
                  </div>
                )}

                {/* your progress */}
                {prog && (
                  <div className="mt-1">
                    <div className="flex justify-between font-mono text-base">
                      <span className="text-ink-mid">{t('gm.progress')}</span>
                      <span style={{ color: compPct === 100 ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)' }}>
                        {prog.numAwarded}/{prog.total} ({compPct}%)
                      </span>
                    </div>
                    <div className="mt-1"><Pct value={compPct} color={compPct === 100 ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)'} heightClass="h-2.5" ringSize={48} /></div>
                  </div>
                )}

                {/* ownership */}
                <div className="mt-2">
                  {ownedLoading ? (
                    <div className="font-mono text-base text-ink-dim">{t('gm.checkingOwned')}</div>
                  ) : owned?.owned ? (
                    <div className="panel !rounded-md p-2.5" style={{ borderColor: 'var(--color-neon-green)' }}>
                      <div className="flex items-center gap-2 font-mono text-base text-neon-green">
                        <Check size={15} className="shrink-0" />
                        {owned.count > 1 ? t('gm.ownedN', { n: owned.count }) : t('gm.owned')}
                      </div>
                      <div className="font-body text-ink-dim text-sm mt-0.5">{t('gm.ownedHint')}</div>
                      <div className="mt-1.5 space-y-1">
                        {owned.files.slice(0, 3).map((f, i) => {
                          const fp = f.inner_path || f.path;
                          return (
                            <div key={i} className="flex items-center gap-2 min-w-0">
                              <span className="font-mono text-ink-dim text-sm truncate" title={fp}>{basename(fp)}</span>
                              <button className="btn !py-0.5 !px-1.5 text-sm shrink-0" onClick={() => api.reveal(f.path).catch(() => {})} title={t('gm.reveal')}>
                                <FolderOpen size={12} />
                              </button>
                              <button className="btn !py-0.5 !px-1.5 text-sm shrink-0" onClick={() => doLaunch(f)} disabled={launching} title={t('launch.playTip')}>
                                <Play size={12} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="panel !rounded-md p-2.5" style={{ borderColor: 'var(--color-neon-amber)' }}>
                      <div className="flex items-center gap-2 font-mono text-base text-neon-amber">
                        <Trophy size={15} className="shrink-0" />
                        {t('gm.notOwned')}
                      </div>
                      <div className="font-body text-ink-dim text-sm mt-0.5">{t('gm.notOwnedHint')}</div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 mt-1">
                  <a className="btn !py-1 !px-2.5 text-sm inline-flex" href={`https://retroachievements.org/game/${gameId}`} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} /> {t('gm.openRA')}
                  </a>
                  {owned?.owned && owned.files.length > 0 && (
                    <button className="btn btn-primary !py-1 !px-2.5 text-sm" onClick={() => doLaunch(owned.files[0])}
                      disabled={launching} title={t('launch.playTip')}>
                      <Play size={14} /> {t('launch.play')}
                    </button>
                  )}
                  {launchMsg && (
                    <span className="font-mono text-sm" style={{ color: launchMsg.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>
                      {launchMsg.text}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* achievements */}
            {Array.isArray(game.achievements) && game.achievements.length > 0 && (
              <div className="mt-5">
                <SectionHeader accent="var(--color-neon-amber)" title={t('gm.achTitle', { n: game.achievements.length })} icon={Trophy}>
                  {prog && <span className="font-mono text-neon-green text-base shrink-0">{t('gm.unlocked', { n: prog.numAwarded })}</span>}
                </SectionHeader>
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 overflow-auto pr-1 ${full ? 'xl:grid-cols-3 max-h-[58vh]' : 'max-h-80'}`}>
                  {game.achievements.map((a: any) => {
                    const got = earned[a.id];
                    return (
                      <div key={a.id} className="panel !rounded-md p-2 flex items-start gap-2.5"
                        style={got ? { borderColor: 'var(--color-neon-green)' } : { opacity: prog ? 0.75 : 1 }}>
                        {a.badgeUrl
                          ? <img src={imageUrl(a.badgeUrl)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', filter: got || !prog ? 'none' : 'grayscale(1)', objectFit: 'contain' }} alt="" />
                          : <span className="shrink-0" style={{ width: 40, height: 40 }} />}
                        <div className="min-w-0 flex-1">
                          <div className="font-body text-sm text-ink-hi flex items-start gap-1 leading-snug">
                            {got && <Check size={13} className="text-neon-green shrink-0 mt-0.5" />}<span>{a.title}</span>
                          </div>
                          <div className="font-body text-ink-dim text-sm leading-snug mt-0.5">{a.description}</div>
                        </div>
                        <span className="font-mono text-neon-amber text-base shrink-0">{a.points}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* leaderboards — collapsed by default, loaded on first expand */}
            <div className="mt-5">
              <SectionHeader accent="var(--color-neon-purple)" title={t('lb.title')} icon={BarChart3}>
                <div className="flex items-center gap-2 shrink-0">
                  {lb && !lb.error && <span className="badge">{t('lb.count', { n: lb.total })}</span>}
                  {lbOpen && lb && (
                    <button className="btn !p-1.5" onClick={() => loadLeaderboards(true)} disabled={lbLoading} title={t('common.refresh')}>
                      <RefreshCw size={13} className={lbLoading ? 'animate-spin' : ''} />
                    </button>
                  )}
                  <button className="btn !py-1 !px-2 text-sm" onClick={toggleLb} title={t('common.details')}>
                    {lbOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {t('common.details')}
                  </button>
                </div>
              </SectionHeader>

              {lbOpen && (
                <>
                  <div className="font-body text-ink-dim text-sm mb-2">{t('lb.hardcoreNote')}</div>
                  {lbLoading && !lb && <div className="font-mono text-ink-dim text-sm">{t('common.loading')}</div>}
                  {lb && (lb.error || lb.boards.length === 0) && (
                    <div className="font-mono text-ink-dim text-sm">{t('lb.none')}</div>
                  )}
                  {lb && !lb.error && lb.boards.length > 0 && (
                    <div className={`space-y-1 overflow-auto pr-1 ${full ? 'max-h-[40vh]' : 'max-h-72'}`}>
                      {lb.boards.map((b) => (
                        <div key={b.ID} className="panel !rounded-md p-2">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-body text-sm text-ink-hi break-words leading-snug">{b.Title}</div>
                              {b.Description && <div className="font-body text-ink-dim text-sm leading-snug">{b.Description}</div>}
                              {b.TopEntry && (
                                <div className="font-mono text-sm text-ink-mid mt-0.5">
                                  {t('lb.top', { u: b.TopEntry.User, s: b.TopEntry.FormattedScore })}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {b.userEntry ? (
                                <span className="font-mono text-sm text-neon-green">
                                  {t('lb.yourEntry')}: {t('lb.rank', { n: b.userEntry.Rank })} · {b.userEntry.FormattedScore}
                                </span>
                              ) : (
                                <span className="font-mono text-sm text-ink-dim">{t('lb.noEntry')}</span>
                              )}
                              {!entries[b.ID] && (
                                <button className="btn !py-0.5 !px-1.5 text-sm" onClick={() => loadEntries(b.ID)} disabled={entriesLoading === b.ID}>
                                  {entriesLoading === b.ID ? t('common.loading') : t('lb.load')}
                                </button>
                              )}
                            </div>
                          </div>
                          {entries[b.ID] && (
                            <div className="mt-1.5">
                              <div className="font-mono text-sm text-ink-dim mb-1">{t('lb.entries')}</div>
                              {entries[b.ID].length === 0 ? (
                                <div className="font-mono text-sm text-ink-dim">{t('lb.none')}</div>
                              ) : (
                                <div className="max-h-44 overflow-auto pr-1">
                                  {entries[b.ID].map((e, i) => (
                                    <div key={`${e.Rank}-${e.User}-${i}`} className="row-hover flex items-center gap-2 px-1 rounded font-mono text-sm">
                                      <span className="text-ink-dim w-9 shrink-0">#{e.Rank}</span>
                                      <span className="flex-1 truncate text-ink-hi">{e.User}</span>
                                      <span className="text-ink-mid shrink-0">{e.FormattedScore}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* compatible rom versions + patches */}
            {Array.isArray(game.hashes) && game.hashes.length > 0 && (
              <div className="mt-5">
                <SectionHeader accent="var(--color-neon-cyan)" title={t('gm.romVersions', { n: game.hashes.length })} />
                {!game.hashes.some((h: any) => h.PatchUrl) && (
                  <div className="font-body text-ink-dim text-sm mb-2">{t('gm.allStandard')}</div>
                )}
                {/* Which regions RetroAchievements actually supports for this
                    game — the answer to "is there a JP version I could use?".
                    RA names its hashes the No-Intro way, so the same parser that
                    reads the user's filenames reads these. */}
                {romRegions.length > 0 && (
                  <div className="font-body text-ink-mid text-sm mb-2 flex items-center gap-2 flex-wrap">
                    <span>{t('gm.regionsSupported')}</span>
                    {romRegions.map((tok) => (
                      <span key={tok} className="font-mono text-sm px-1.5 rounded"
                        style={{ border: `1px solid ${ownedRegions.has(tok) ? 'var(--color-neon-green)' : 'var(--color-ink-dim)'}`, color: ownedRegions.has(tok) ? 'var(--color-neon-green)' : 'var(--color-ink-mid)' }}
                        title={ownedRegions.has(tok) ? t('gm.regionOwned', { r: tokenName(tok) }) : tokenName(tok)}>
                        {tokenLabel(tok)}
                      </span>
                    ))}
                  </div>
                )}
                <div className={`gap-1 overflow-auto pr-1 ${full ? 'grid grid-cols-1 lg:grid-cols-2 max-h-[32vh]' : 'space-y-1 max-h-56'}`}>
                  {sortedHashes.map((h: any) => {
                    const isOwned = ownedMd5.has(String(h.MD5).toLowerCase());
                    return (
                    <div key={h.MD5} className="panel !rounded-md p-2 flex items-center justify-between gap-3"
                      style={isOwned ? { borderColor: 'var(--color-neon-green)' } : undefined}>
                      <div className="min-w-0">
                        <div className="font-body text-sm text-ink-hi break-words leading-snug">{h.Name}</div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <RegionBadges item={{ filePath: h.Name || '' }} priority={priority} max={4} />
                          {isOwned && <span className="font-mono text-sm text-neon-green">{t('gm.youHaveThis')}</span>}
                          {Array.isArray(h.Labels) && h.Labels.length > 0 && (
                            <span className="font-mono text-sm text-ink-dim">{h.Labels.join(' · ')}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {h.PatchUrl && (
                          <a className="btn !py-1 !px-2 text-sm" href={h.PatchUrl} target="_blank" rel="noreferrer"
                            title={t('gm.patchTip')}>
                            <Wrench size={13} /> Patch <Download size={12} />
                          </a>
                        )}
                        <span className="font-mono text-sm text-ink-dim">{h.MD5.slice(0, 12)}…</span>
                      </div>
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
