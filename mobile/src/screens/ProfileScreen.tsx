import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius, textGlow } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { ConsoleIcon } from '../components/ConsoleIcon';
import { getCreds, getCache, setCache, Creds } from '../storage';
import { getUserProfile, getUserCompletionProgress, mediaUrl, RAProfile, CompletionGame } from '../ra/api';
import { getLibrary, libraryStats, collectionInsights, getOwnedGames, LibraryRow, CollectionInsights, MatchGame } from '../db';
import { consoleName } from '../consoles';
import { useI18n } from '../i18n';
import { GameDetail } from './GameDetail';

const TTL = 60 * 60 * 1000;
type Sub = 'overview' | 'collection' | 'insights' | 'mastery' | 'hardcore';
const SUBS: Sub[] = ['overview', 'collection', 'insights', 'mastery', 'hardcore'];

export function ProfileScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const { t } = useI18n();
  const [creds, setCredsState] = useState<Creds | null | undefined>(undefined);
  const [profile, setProfile] = useState<RAProfile | null>(null);
  const [comp, setComp] = useState<CompletionGame[]>([]);
  const [library, setLibrary] = useState<LibraryRow[]>([]);
  const [ins, setIns] = useState<CollectionInsights | null>(null);
  const [owned, setOwned] = useState<MatchGame[]>([]);
  const [colStats, setColStats] = useState<{ total: number; matched: number }>({ total: 0, matched: 0 });
  const [sub, setSub] = useState<Sub>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MatchGame | null>(null);

  const loadLocal = useCallback(async () => {
    setLibrary(await getLibrary());
    setIns(await collectionInsights());
    setColStats(await libraryStats());
    setOwned(await getOwnedGames());
  }, []);

  const load = useCallback(async (force = false) => {
    const c = await getCreds();
    setCredsState(c);
    await loadLocal();
    if (!c) return;
    setLoading(true); setError(null);
    try {
      let prof = force ? null : await getCache<RAProfile>('profile', TTL);
      if (!prof) { prof = await getUserProfile(c); await setCache('profile', prof); }
      setProfile(prof);
      let cg = force ? null : await getCache<CompletionGame[]>('completion', TTL);
      if (!cg) { cg = await getUserCompletionProgress(c); await setCache('completion', cg); }
      setComp(cg);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setLoading(false); }
  }, [loadLocal]);

  useEffect(() => { load(); }, [load]);

  if (creds === undefined) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;
  if (creds === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Panel>
          <SectionHeader title="RETROACHIEVEMENTS" />
          <Body size={14} color={colors.inkMid} style={{ marginBottom: space.md }}>{t('prof.connectBody')}</Body>
          <Btn label={t('common.connect')} variant="primary" onPress={onGoSettings} />
        </Panel>
      </ScrollView>
    );
  }

  const toGame = (g: CompletionGame): MatchGame => ({ id: g.GameID, title: g.Title, points: 0, num_achievements: g.MaxPossible, image_icon: g.ImageIcon ?? null, console_id: g.ConsoleID });
  const mastery = [...comp].filter((g) => g.MaxPossible > 0).sort((a, b) => (b.NumAwarded / b.MaxPossible) - (a.NumAwarded / a.MaxPossible));
  const hardcore = [...comp].filter((g) => g.NumAwarded > g.NumAwardedHardcore).sort((a, b) => (b.NumAwarded - b.NumAwardedHardcore) - (a.NumAwarded - a.NumAwardedHardcore));
  // Quick Wins mirrors the desktop (routes.js /api/library/quickwins): it ranks
  // the games *in your collection*, not just the ones you've already played —
  // otherwise it stays empty for anyone who hasn't started a nearly-mastered
  // game, which is why mobile and desktop disagreed.
  const progress = new Map(comp.map((g) => [g.GameID, g]));
  const quickWinItems = owned
    .map((g) => {
      const p = progress.get(g.id);
      const total = Number(p?.MaxPossible ?? g.num_achievements) || 0;
      const awarded = Number(p?.NumAwarded ?? 0) || 0;
      return { game: g, total, awarded, remaining: total - awarded };
    })
    .filter((x) => x.total > 0 && x.awarded < x.total)
    // started-but-unfinished first (fewest achievements left), then untouched
    // games with the smallest sets — the cheapest new masteries to pick up.
    .sort((a, b) => {
      const aStarted = a.awarded > 0, bStarted = b.awarded > 0;
      if (aStarted !== bStarted) return aStarted ? -1 : 1;
      return aStarted ? a.remaining - b.remaining : a.total - b.total;
    });
  const avatar = mediaUrl(profile?.UserPic);
  const label = (s: Sub) => t(`prof.${s}`);

  return (
    <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} tintColor={colors.cyan} />}>
      <Panel>
        <View style={styles.head}>
          {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" transition={200} />
            : <View style={[styles.avatar, styles.avFallback]}><Display size={18} color={colors.cyan}>{(profile?.User || creds.username).slice(0, 2).toUpperCase()}</Display></View>}
          <View style={{ flex: 1 }}>
            <Display size={15} color={colors.inkHi}>{profile?.User || creds.username}</Display>
            {profile?.Motto ? <Body size={13} color={colors.inkDim} style={{ marginTop: 4 }} numberOfLines={2}>{profile.Motto}</Body> : null}
          </View>
        </View>
        {profile && (
          <View style={styles.stats}>
            <Stat label={t('prof.points')} value={profile.TotalPoints} color={colors.cyan} />
            <Stat label={t('prof.rank')} value={profile.Rank != null ? `#${profile.Rank}` : '—'} color={colors.green} />
            <Stat label={t('prof.games')} value={comp.length} color={colors.amber} />
          </View>
        )}
      </Panel>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.seg} contentContainerStyle={{ gap: 3 }}>
        {SUBS.map((s) => (
          <Pressable key={s} onPress={() => setSub(s)} style={[styles.segBtn, sub === s && styles.segOn]}>
            <Body size={12} color={sub === s ? colors.cyan : colors.inkDim} weight={sub === s ? 'semibold' : undefined}>{label(s)}</Body>
          </Pressable>
        ))}
      </ScrollView>

      {error && <Body size={13} color={colors.amber} style={{ marginTop: space.md }}>{error}</Body>}
      {loading && comp.length === 0 && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}

      {sub === 'overview' && (
        <View style={{ marginTop: space.md, gap: space.md }}>
          <Panel>
            <SectionHeader title={t('prof.colTitle')} color={colors.green} />
            <View style={styles.miniStats}>
              <MiniStat label={t('prof.colFiles')} value={colStats.total} color={colors.cyan} />
              <MiniStat label={t('prof.colMatched')} value={colStats.matched} color={colors.green} />
              <MiniStat label={t('prof.colPoints')} value={ins?.points ?? 0} color={colors.amber} />
            </View>
          </Panel>
          <View>
            <SectionHeader title={t('prof.quickWins')} color={colors.green} />
            {quickWinItems.length === 0 ? <Body size={13} color={colors.inkDim}>{t('prof.noQuickWins')}</Body>
              : quickWinItems.slice(0, 30).map((x) => (
                <OwnedGameRow
                  key={x.game.id}
                  g={x.game}
                  onOpen={() => setOpen(x.game)}
                  sub={`${consoleName(x.game.console_id) ?? ''} · ${x.awarded}/${x.total}`}
                  trailing={t('prof.left', { n: x.remaining })}
                  trailingColor={x.awarded > 0 ? colors.green : colors.cyan}
                />
              ))}
          </View>
        </View>
      )}

      {sub === 'collection' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {library.length === 0 ? (
            <Panel>
              <Body size={13} color={colors.inkMid} style={{ marginBottom: space.md }}>{t('prof.colEmpty')}</Body>
            </Panel>
          ) : library.slice(0, 500).map((row, i) => (
            <Pressable key={row.md5 || i} onPress={() => row.match && setOpen(row.match)} disabled={!row.match}>
              <View style={styles.gameRow}>
                {row.match && mediaUrl(row.match.image_icon)
                  ? <Image source={{ uri: mediaUrl(row.match.image_icon)! }} style={styles.gIcon} contentFit="cover" transition={150} />
                  : <View style={[styles.gIcon, styles.gIconFallback]}><Feather name="file" size={16} color={colors.inkDim} /></View>}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{row.match?.title ?? row.name}</Body>
                  <Body size={12} color={row.match ? colors.green : colors.inkDim} numberOfLines={1}>
                    {row.match ? `${consoleName(row.match.console_id) ?? ''} · ${row.match.num_achievements} ${t('common.achievements')}` : t('scan.noMatch')}
                  </Body>
                </View>
                {row.match && <Feather name="chevron-right" size={16} color={colors.inkDim} />}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {sub === 'insights' && (
        <View style={{ marginTop: space.md, gap: space.md }}>
          {!ins || ins.files === 0 ? (
            <Panel><Body size={13} color={colors.inkMid}>{t('ins.noData')}</Body></Panel>
          ) : (
            <>
              <Panel>
                <SectionHeader title={t('ins.title')} />
                <View style={styles.miniStats}>
                  <MiniStat label={t('ins.files')} value={ins.files} color={colors.cyan} />
                  <MiniStat label={t('ins.withAch')} value={ins.matched} color={colors.green} />
                </View>
                <View style={[styles.miniStats, { marginTop: space.sm }]}>
                  <MiniStat label={t('ins.obtAch')} value={ins.achievements} color={colors.amber} />
                  <MiniStat label={t('ins.obtPts')} value={ins.points} color={colors.purple} />
                </View>
              </Panel>
              <View>
                <SectionHeader title={t('ins.bySystem')} color={colors.green} />
                {ins.bySystem.length === 0 ? <Body size={13} color={colors.inkDim}>{t('ins.noSystemData')}</Body>
                  : ins.bySystem.map((s) => {
                    const pct = s.files > 0 ? Math.round((s.matched / s.files) * 100) : 0;
                    return (
                      <View key={s.console_id} style={styles.sysRow}>
                        <ConsoleIcon id={s.console_id} size={24} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={styles.sysHead}>
                            <Body size={12} color={colors.inkHi} numberOfLines={1} style={{ flex: 1 }}>{consoleName(s.console_id) ?? `#${s.console_id}`}</Body>
                            <Mono size={13} color={colors.green}>{s.matched}/{s.files}</Mono>
                          </View>
                          <View style={styles.barTrack}><View style={[styles.barFill, { width: `${pct}%` }]} /></View>
                        </View>
                      </View>
                    );
                  })}
              </View>
            </>
          )}
        </View>
      )}

      {sub === 'mastery' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {mastery.slice(0, 200).map((g) => <GameRow key={g.GameID} g={g} onOpen={() => setOpen(toGame(g))} trailing={`${Math.round((g.NumAwarded / g.MaxPossible) * 100)}%`} trailingColor={g.NumAwarded === g.MaxPossible ? colors.green : colors.cyan} />)}
        </View>
      )}
      {sub === 'hardcore' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>{t('prof.hardcoreBody')}</Body>
          {hardcore.length === 0 ? <Body size={13} color={colors.inkDim}>{t('prof.hardcoreLevel')}</Body>
            : hardcore.slice(0, 200).map((g) => <GameRow key={g.GameID} g={g} onOpen={() => setOpen(toGame(g))} trailing={`+${g.NumAwarded - g.NumAwardedHardcore}`} trailingColor={colors.amber} />)}
        </View>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

// Row for a game from the local collection (Quick Wins) — same layout as the
// completion-progress rows, but sourced from the synced games table.
function OwnedGameRow({ g, onOpen, sub, trailing, trailingColor }: { g: MatchGame; onOpen: () => void; sub: string; trailing: string; trailingColor: string }) {
  const icon = mediaUrl(g.image_icon);
  return (
    <Pressable onPress={onOpen}>
      <View style={styles.gameRow}>
        {icon ? <Image source={{ uri: icon }} style={styles.gIcon} contentFit="cover" transition={150} /> : <View style={styles.gIcon} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.title}</Body>
          <Body size={12} color={colors.inkDim} numberOfLines={1}>{sub}</Body>
        </View>
        <Mono size={16} color={trailingColor}>{trailing}</Mono>
      </View>
    </Pressable>
  );
}

function GameRow({ g, onOpen, trailing, trailingColor }: { g: CompletionGame; onOpen: () => void; trailing: string; trailingColor: string }) {
  const icon = mediaUrl(g.ImageIcon);
  return (
    <Pressable onPress={onOpen}>
      <View style={styles.gameRow}>
        {icon ? <Image source={{ uri: icon }} style={styles.gIcon} contentFit="cover" transition={150} /> : <View style={styles.gIcon} />}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.Title}</Body>
          <Body size={12} color={colors.inkDim} numberOfLines={1}>{g.ConsoleName ?? ''} · {g.NumAwarded}/{g.MaxPossible}</Body>
        </View>
        <Mono size={16} color={trailingColor}>{trailing}</Mono>
      </View>
    </Pressable>
  );
}

function Stat({ label, value, color }: { label: string; value?: number | string; color: string }) {
  return (
    <View style={styles.stat}>
      <Mono size={24} color={color} style={textGlow(color, 8)}>{value != null ? (typeof value === 'number' ? value.toLocaleString() : value) : '—'}</Mono>
      <Body size={11} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.miniStat}>
      <Mono size={20} color={color}>{value.toLocaleString()}</Mono>
      <Body size={10} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  avFallback: { alignItems: 'center', justifyContent: 'center', borderColor: colors.cyan },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg, gap: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  seg: { marginTop: space.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 3, flexGrow: 0 },
  segBtn: { paddingVertical: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.cyan },
  miniStats: { flexDirection: 'row', gap: space.sm },
  miniStat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.sm },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  gIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  gIconFallback: { alignItems: 'center', justifyContent: 'center' },
  sysRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sysHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  barTrack: { height: 6, backgroundColor: colors.surface, borderRadius: 3, marginTop: 5, overflow: 'hidden' },
  barFill: { height: 6, backgroundColor: colors.green, borderRadius: 3 },
});
