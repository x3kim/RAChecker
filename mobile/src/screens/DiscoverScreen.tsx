import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Display, Body, SectionHeader, Btn, Input } from '../ui';
import { getCreds, getCache, setCache } from '../storage';
import { getAchievementOfTheWeek, getActiveClaims, getRecentGameAwards, mediaUrl } from '../ra/api';
import { MatchGame } from '../db';
import { GameDetail } from './GameDetail';
// @ts-ignore ported data module
import { FREE_GAMES } from '../data/freeGames';

type Sub = 'free' | 'radar' | 'community';
const TTL = 30 * 60 * 1000;

export function DiscoverScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const [sub, setSub] = useState<Sub>('free');
  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [aotw, setAotw] = useState<any>(null);
  const [awards, setAwards] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<MatchGame | null>(null);

  useEffect(() => {
    (async () => {
      const c = await getCreds();
      setHasCreds(!!c);
      if (!c) return;
      setLoading(true);
      try {
        const [a, aw, cl] = await Promise.all([
          getCache<any>('aotw', TTL).then((v) => v ?? getAchievementOfTheWeek(c).then((r) => (setCache('aotw', r), r))).catch(() => null),
          getCache<any[]>('awards', TTL).then((v) => v ?? getRecentGameAwards(c, 25).then((r: any) => { const list = Array.isArray(r) ? r : (r?.Results ?? []); setCache('awards', list); return list; })).catch(() => []),
          getCache<any[]>('claims', TTL).then((v) => v ?? getActiveClaims(c).then((r: any) => { const list = Array.isArray(r) ? r : []; setCache('claims', list); return list; })).catch(() => []),
        ]);
        setAotw(a); setAwards(aw || []); setClaims(cl || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const free = q.trim()
    ? FREE_GAMES.filter((g: any) => (g.title + ' ' + (g.systemLabel || '')).toLowerCase().includes(q.trim().toLowerCase()))
    : FREE_GAMES;

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.seg}>
        {(['free', 'radar', 'community'] as Sub[]).map((s) => (
          <Pressable key={s} onPress={() => setSub(s)} style={[styles.segBtn, sub === s && styles.segOn]}>
            <Body size={12} color={sub === s ? colors.magenta : colors.inkDim} weight={sub === s ? 'semibold' : undefined}>{s === 'free' ? 'Free games' : s === 'radar' ? 'Set radar' : 'Community'}</Body>
          </Pressable>
        ))}
      </View>

      {sub !== 'free' && hasCreds === false && (
        <Panel style={{ marginTop: space.md }}>
          <Body size={13} color={colors.inkMid} style={{ marginBottom: space.md }}>Connect your RA account to load the community feed.</Body>
          <Btn label="Connect account" variant="primary" onPress={onGoSettings} />
        </Panel>
      )}
      {sub !== 'free' && loading && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}

      {sub === 'free' && (
        <View style={{ marginTop: space.md }}>
          <Panel style={{ marginBottom: space.md }}>
            <SectionHeader title="FREE / HOMEBREW GAMES" color={colors.magenta} />
            <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>Legally free games with achievements, curated by RetroAchievements. Download links go to the developers’ pages — RAChecker ships no ROMs.</Body>
            <Input value={q} onChangeText={setQ} placeholder="Search free games…" />
          </Panel>
          <View style={{ gap: space.sm }}>
            {free.slice(0, 200).map((g: any, i: number) => (
              <Pressable key={i} onPress={() => g.url && Linking.openURL(g.url)}>
                <View style={styles.row}>
                  <View style={[styles.icon, styles.iconFallback]}><Feather name="download" size={16} color={colors.magenta} /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.title}</Body>
                    <Body size={12} color={colors.inkDim} numberOfLines={1}>{g.systemLabel}{g.author ? ` · ${g.author}` : ''}</Body>
                  </View>
                  <Feather name="external-link" size={16} color={colors.inkDim} />
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {sub === 'radar' && hasCreds && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>Achievement sets being built right now.</Body>
          {claims.length === 0 && !loading ? <Body size={13} color={colors.inkDim}>No active claims.</Body> :
            claims.slice(0, 60).map((c: any, i: number) => (
              <Pressable key={i} onPress={() => c.GameID && setOpen({ id: c.GameID, title: c.GameTitle, points: 0, num_achievements: 0, image_icon: c.GameIcon ?? null, console_id: c.ConsoleID ?? 0 })}>
                <View style={styles.row}>
                  {mediaUrl(c.GameIcon) ? <Image source={{ uri: mediaUrl(c.GameIcon)! }} style={styles.icon} contentFit="cover" /> : <View style={styles.icon} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{c.GameTitle}</Body>
                    <Body size={12} color={colors.inkDim} numberOfLines={1}>{c.ConsoleName ?? ''} · by {c.User}</Body>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.inkDim} />
                </View>
              </Pressable>
            ))}
        </View>
      )}

      {sub === 'community' && hasCreds && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {aotw?.Achievement && (
            <Panel style={{ marginBottom: space.sm }}>
              <SectionHeader title="ACHIEVEMENT OF THE WEEK" color={colors.amber} />
              <View style={styles.row}>
                {mediaUrl(aotw.Achievement.BadgeURL || (aotw.Achievement.BadgeName ? `/Badge/${aotw.Achievement.BadgeName}.png` : null)) ? (
                  <Image source={{ uri: mediaUrl(aotw.Achievement.BadgeURL || `/Badge/${aotw.Achievement.BadgeName}.png`)! }} style={styles.icon} contentFit="cover" />
                ) : <View style={styles.icon} />}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{aotw.Achievement.Title}</Body>
                  <Body size={12} color={colors.inkDim} numberOfLines={2}>{aotw.Achievement.Description}</Body>
                  {aotw.Game?.Title ? <Body size={12} color={colors.inkMid} numberOfLines={1}>{aotw.Game.Title}</Body> : null}
                </View>
              </View>
            </Panel>
          )}
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>Recently mastered across the community.</Body>
          {awards.slice(0, 40).map((a: any, i: number) => (
            <View key={i} style={styles.row}>
              <View style={[styles.icon, styles.iconFallback]}><Feather name="award" size={16} color={colors.green} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{a.GameTitle}</Body>
                <Body size={12} color={colors.inkDim} numberOfLines={1}>{a.ConsoleName ?? ''} · {a.User} · {a.AwardKind}</Body>
              </View>
            </View>
          ))}
        </View>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  seg: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.magenta },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  iconFallback: { alignItems: 'center', justifyContent: 'center' },
});
