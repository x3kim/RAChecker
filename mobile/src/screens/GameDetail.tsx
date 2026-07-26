import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Modal, Pressable, ActivityIndicator, Platform, StatusBar as RNStatusBar } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Display, Mono, Body } from '../ui';
import { MatchGame } from '../db';
import { getCreds } from '../storage';
import { getCache, setCache } from '../storage';
import { getGameInfoAndUserProgress, mediaUrl, badgeUrl, RAGameInfo, RAAchievement } from '../ra/api';
import { consoleName } from '../consoles';

const TOP = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 0;
const TTL = 6 * 60 * 60 * 1000; // 6h

export function GameDetail({ game, onClose }: { game: MatchGame; onClose: () => void }) {
  const [info, setInfo] = useState<RAGameInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true); setError(null);
      try {
        const cached = await getCache<RAGameInfo>('game_' + game.id, TTL);
        if (cached) { setInfo(cached); setLoading(false); return; }
        const c = await getCreds();
        if (!c) { setError('Connect your RA account to see achievements.'); setLoading(false); return; }
        const gi = await getGameInfoAndUserProgress(c, game.id);
        setInfo(gi);
        await setCache('game_' + game.id, gi);
      } catch (e: any) {
        setError(String(e?.message || e));
      } finally {
        setLoading(false);
      }
    })();
  }, [game.id]);

  const achievements: RAAchievement[] = info?.Achievements
    ? Object.values(info.Achievements).sort((a, b) => (a.DisplayOrder ?? 0) - (b.DisplayOrder ?? 0))
    : [];
  const box = mediaUrl(info?.ImageBoxArt) || mediaUrl(game.image_icon);
  const total = info?.NumAchievements ?? game.num_achievements;
  const earned = info?.NumAwardedToUser ?? 0;
  const pct = total ? Math.round((earned / total) * 100) : 0;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.bar}>
          <Display size={12} color={colors.cyan} style={{ flex: 1 }} >GAME</Display>
          <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={colors.inkHi} /></Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.head}>
            {box ? <Image source={{ uri: box }} style={styles.box} contentFit="cover" transition={150} /> : <View style={[styles.box, styles.boxFallback]}><Feather name="award" size={28} color={colors.cyan} /></View>}
            <View style={{ flex: 1 }}>
              <Display size={14} color={colors.inkHi}>{info?.Title || game.title}</Display>
              <Body size={12} color={colors.inkMid} style={{ marginTop: 4 }}>{info?.ConsoleName || consoleName(game.console_id) || ''}</Body>
              <Body size={12} color={colors.inkDim} style={{ marginTop: 2 }}>{total} achievements · {info?.Points ?? game.points} pts</Body>
            </View>
          </View>

          {!loading && !error && total > 0 && (
            <View style={styles.progress}>
              <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
              <Body size={12} color={colors.inkMid} style={{ marginTop: 6 }}>{earned}/{total} unlocked · {pct}%{info?.UserCompletion ? ` · ${info.UserCompletion}` : ''}</Body>
            </View>
          )}

          {loading && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}
          {error && <Body size={13} color={colors.amber} style={{ marginTop: space.md }}>{error}</Body>}

          <View style={{ gap: space.sm, marginTop: space.lg }}>
            {achievements.map((a) => {
              const got = !!(a.DateEarned || a.DateEarnedHardcore);
              const badge = badgeUrl(a.BadgeName, !got);
              return (
                <View key={a.ID} style={[styles.ach, got && { borderColor: colors.green }]}>
                  {badge ? <Image source={{ uri: badge }} style={[styles.badge, !got && { opacity: 0.55 }]} contentFit="cover" /> : <View style={styles.badge} />}
                  <View style={{ flex: 1 }}>
                    <Body size={13} color={got ? colors.inkHi : colors.inkMid} weight="semibold" numberOfLines={1}>{a.Title}</Body>
                    <Body size={12} color={colors.inkDim} numberOfLines={2}>{a.Description}</Body>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Mono size={16} color={got ? colors.green : colors.inkDim}>{a.Points}</Mono>
                    {got && <Feather name="check" size={14} color={colors.green} />}
                  </View>
                </View>
              );
            })}
          </View>
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
  ach: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  badge: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface },
});
