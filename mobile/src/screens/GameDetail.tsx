import { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Modal, Pressable, ActivityIndicator, Platform, StatusBar as RNStatusBar } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Display, Mono, Body } from '../ui';
import { MatchGame } from '../db';
import { getCreds } from '../storage';
import { getCache, setCache } from '../storage';
import { getGameInfoAndUserProgress, getGameLeaderboards, getUserGameLeaderboards, mediaUrl, badgeUrl, RAGameInfo, RAAchievement, Leaderboard } from '../ra/api';
import { consoleName } from '../consoles';
import { useI18n } from '../i18n';

const TOP = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 0;
const TTL = 6 * 60 * 60 * 1000; // 6h

// RetroAchievements tags achievements as missable / progression / win_condition
// (everything else is untyped) — the same filters its own game pages offer.
type AchFilter = 'all' | 'missable' | 'progression' | 'win_condition' | 'earned' | 'unearned';
const ACH_FILTERS: { key: AchFilter; labelKey: string }[] = [
  { key: 'all', labelKey: 'gd.filter.all' },
  { key: 'missable', labelKey: 'gd.filter.missable' },
  { key: 'progression', labelKey: 'gd.filter.progression' },
  { key: 'win_condition', labelKey: 'gd.filter.win' },
  { key: 'earned', labelKey: 'gd.filter.earned' },
  { key: 'unearned', labelKey: 'gd.filter.unearned' },
];

export function GameDetail({ game, onClose }: { game: MatchGame; onClose: () => void }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<RAGameInfo | null>(null);
  const [lbs, setLbs] = useState<{ lb: Leaderboard; rank?: number; score?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [achFilter, setAchFilter] = useState<AchFilter>('all');

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const cached = await getCache<RAGameInfo>('game_' + game.id, TTL);
        const c = await getCreds();
        if (cached) setInfo(cached);
        else if (!c) { setError(t('gd.connectAch')); setLoading(false); return; }
        else { const gi = await getGameInfoAndUserProgress(c, game.id); setInfo(gi); await setCache('game_' + game.id, gi); }
        // Leaderboards (best-effort — never block the screen).
        if (c) {
          try {
            const [gl, ul] = await Promise.all([getGameLeaderboards(c, game.id), getUserGameLeaderboards(c, game.id).catch(() => ({ Results: [] }))]);
            const userById = new Map((ul.Results || []).map((r) => [r.ID, r.UserEntry]));
            setLbs((gl.Results || []).slice(0, 25).map((lb) => {
              const ue = userById.get(lb.ID);
              return { lb, rank: ue?.Rank, score: ue?.FormattedScore ?? (ue?.Score != null ? String(ue.Score) : undefined) };
            }));
          } catch { /* leaderboards optional */ }
        }
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [game.id, t]);

  const achievements: RAAchievement[] = useMemo(() => (info?.Achievements
    ? Object.values(info.Achievements).sort((a, b) => (a.DisplayOrder ?? 0) - (b.DisplayOrder ?? 0))
    : []), [info]);
  const box = mediaUrl(info?.ImageBoxArt) || mediaUrl(game.image_icon);
  const total = info?.NumAchievements ?? game.num_achievements;
  const earned = info?.NumAwardedToUser ?? 0;
  const pct = total ? Math.round((earned / total) * 100) : 0;
  const gotOne = (a: RAAchievement) => !!(a.DateEarned || a.DateEarnedHardcore);

  // RetroAchievements states no point total for a game, so both the value of the
  // set and what you have earned are summed from the achievements themselves —
  // the game header used to read "0 pts" for that reason.
  const { setPoints, earnedPoints } = useMemo(() => {
    let all = 0, mine = 0;
    for (const a of achievements) {
      const value = Number(a.Points) || 0;
      all += value;
      if (gotOne(a)) mine += value;
    }
    return { setPoints: all || game.points, earnedPoints: mine };
  }, [achievements, game.points]);

  const achCounts = useMemo(() => {
    const c: Record<AchFilter, number> = { all: achievements.length, missable: 0, progression: 0, win_condition: 0, earned: 0, unearned: 0 };
    for (const a of achievements) {
      if (a.Type === 'missable') c.missable++;
      else if (a.Type === 'progression') c.progression++;
      else if (a.Type === 'win_condition') c.win_condition++;
      if (gotOne(a)) c.earned++; else c.unearned++;
    }
    return c;
  }, [achievements]);
  const shownAchievements = useMemo(() => {
    if (achFilter === 'all') return achievements;
    if (achFilter === 'earned') return achievements.filter(gotOne);
    if (achFilter === 'unearned') return achievements.filter((a) => !gotOne(a));
    return achievements.filter((a) => a.Type === achFilter);
  }, [achievements, achFilter]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Display size={12} color={colors.cyan} style={{ flex: 1 }} >{t('gd.title')}</Display>
          <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={colors.inkHi} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            {box ? <Image source={{ uri: box }} style={styles.box} contentFit="cover" transition={150} /> : <View style={[styles.box, styles.boxFallback]}><Feather name="award" size={28} color={colors.cyan} /></View>}
            <View style={{ flex: 1 }}>
              <Display size={14} color={colors.inkHi}>{info?.Title || game.title}</Display>
              <Body size={12} color={colors.inkMid} style={{ marginTop: 4 }}>{info?.ConsoleName || consoleName(game.console_id) || ''}</Body>
              <Body size={12} color={colors.inkDim} style={{ marginTop: 2 }}>
                {total} {t('common.achievements')}
                {setPoints > 0 ? ` · ${info ? t('gd.pointsOf', { n: earnedPoints, total: setPoints }) : t('gd.pointsN', { n: setPoints })}` : ''}
              </Body>
            </View>
          </View>

          {!loading && !error && total > 0 && (
            <View style={styles.progress}>
              <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
              <Body size={12} color={colors.inkMid} style={{ marginTop: 6 }}>{t('gd.unlocked', { e: earned, t: total, p: pct })}{info?.UserCompletion ? ` · ${info.UserCompletion}` : ''}</Body>
            </View>
          )}

          {loading && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}
          {error && <Body size={13} color={colors.amber} style={{ marginTop: space.md }}>{error}</Body>}

          {achievements.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.lg }} contentContainerStyle={styles.chipRow}>
              {ACH_FILTERS.map((f) => {
                const n = achCounts[f.key];
                if (f.key !== 'all' && !n) return null;
                const on = achFilter === f.key;
                return (
                  <Pressable key={f.key} onPress={() => setAchFilter(f.key)} style={[styles.chip, on && { borderColor: colors.amber }]}>
                    <Body size={12} color={on ? colors.amber : colors.inkMid}>{t(f.labelKey)}</Body>
                    <Mono size={13} color={colors.inkDim}>{n}</Mono>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <View style={{ gap: space.sm, marginTop: space.md }}>
            {shownAchievements.map((a) => {
              const got = gotOne(a);
              const badge = badgeUrl(a.BadgeName, !got);
              const typeColor = a.Type === 'missable' ? colors.red : a.Type === 'progression' ? colors.cyan : colors.green;
              return (
                <View key={a.ID} style={[styles.ach, got && { borderColor: colors.green }]}>
                  {badge ? <Image source={{ uri: badge }} style={[styles.badge, !got && { opacity: 0.55 }]} contentFit="cover" /> : <View style={styles.badge} />}
                  <View style={{ flex: 1 }}>
                    <Body size={13} color={got ? colors.inkHi : colors.inkMid} weight="semibold" numberOfLines={1}>{a.Title}</Body>
                    <Body size={12} color={colors.inkDim} numberOfLines={2}>{a.Description}</Body>
                    {a.Type ? (
                      <Body size={11} color={typeColor} style={{ marginTop: 2 }}>
                        {t(`gd.filter.${a.Type === 'win_condition' ? 'win' : a.Type}`)}
                      </Body>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Mono size={16} color={got ? colors.green : colors.inkDim}>{a.Points}</Mono>
                    {got && <Feather name="check" size={14} color={colors.green} />}
                  </View>
                </View>
              );
            })}
            {achievements.length > 0 && shownAchievements.length === 0 && (
              <Body size={12} color={colors.inkDim} style={{ textAlign: 'center' }}>{t('gd.filter.none')}</Body>
            )}
          </View>

          {lbs.length > 0 && (
            <View style={{ marginTop: space.xl, gap: space.sm }}>
              <Display size={12} color={colors.amber}>{t('gd.leaderboards')}</Display>
              {lbs.map(({ lb, rank, score }) => (
                <View key={lb.ID} style={styles.lb}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{lb.Title}</Body>
                    {lb.TopEntry ? <Body size={12} color={colors.inkDim} numberOfLines={1}>#1 {lb.TopEntry.User} · {lb.TopEntry.FormattedScore ?? lb.TopEntry.Score}</Body> : null}
                  </View>
                  {rank != null ? (
                    <View style={{ alignItems: 'flex-end' }}>
                      <Mono size={16} color={colors.green}>#{rank}</Mono>
                      {score ? <Body size={11} color={colors.inkDim}>{score}</Body> : null}
                    </View>
                  ) : <Body size={12} color={colors.inkDim}>—</Body>}
                </View>
              ))}
              <Body size={11} color={colors.inkDim}>{t('gd.lbNote')}</Body>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: TOP },
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg2 },
  content: { padding: space.lg, paddingBottom: space.xxl },
  head: { flexDirection: 'row', gap: space.md },
  box: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  boxFallback: { alignItems: 'center', justifyContent: 'center' },
  progress: { marginTop: space.lg },
  track: { height: 8, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.green },
  chipRow: { gap: space.sm, paddingRight: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: space.sm, paddingVertical: 4, backgroundColor: colors.panel,
  },
  ach: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  badge: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface },
  lb: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
});
