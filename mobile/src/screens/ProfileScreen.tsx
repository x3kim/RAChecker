import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { colors, space, radius, textGlow } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { getCreds, getCache, setCache, Creds } from '../storage';
import { getUserProfile, getUserCompletionProgress, mediaUrl, RAProfile, CompletionGame } from '../ra/api';
import { MatchGame } from '../db';
import { GameDetail } from './GameDetail';

const TTL = 60 * 60 * 1000;
type Sub = 'overview' | 'mastery' | 'hardcore';

export function ProfileScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const [creds, setCredsState] = useState<Creds | null | undefined>(undefined);
  const [profile, setProfile] = useState<RAProfile | null>(null);
  const [comp, setComp] = useState<CompletionGame[]>([]);
  const [sub, setSub] = useState<Sub>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<MatchGame | null>(null);

  const load = useCallback(async (force = false) => {
    const c = await getCreds();
    setCredsState(c);
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
  }, []);

  useEffect(() => { load(); }, [load]);

  if (creds === undefined) return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;
  if (creds === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Panel>
          <SectionHeader title="RETROACHIEVEMENTS" />
          <Body size={14} color={colors.inkMid} style={{ marginBottom: space.md }}>Connect your RetroAchievements account to see your profile and progress.</Body>
          <Btn label="Connect account" variant="primary" onPress={onGoSettings} />
        </Panel>
      </ScrollView>
    );
  }

  const toGame = (g: CompletionGame): MatchGame => ({ id: g.GameID, title: g.Title, points: 0, num_achievements: g.MaxPossible, image_icon: g.ImageIcon ?? null, console_id: g.ConsoleID });
  const mastery = [...comp].filter((g) => g.MaxPossible > 0).sort((a, b) => (b.NumAwarded / b.MaxPossible) - (a.NumAwarded / a.MaxPossible));
  const hardcore = [...comp].filter((g) => g.NumAwarded > g.NumAwardedHardcore).sort((a, b) => (b.NumAwarded - b.NumAwardedHardcore) - (a.NumAwarded - a.NumAwardedHardcore));
  const quickWins = [...comp].filter((g) => g.MaxPossible > 0 && g.NumAwarded < g.MaxPossible && (g.MaxPossible - g.NumAwarded) <= 5).sort((a, b) => (a.MaxPossible - a.NumAwarded) - (b.MaxPossible - b.NumAwarded));
  const avatar = mediaUrl(profile?.UserPic);

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
            <Stat label="POINTS" value={profile.TotalPoints} color={colors.cyan} />
            <Stat label="RANK" value={profile.Rank != null ? `#${profile.Rank}` : '—'} color={colors.green} />
            <Stat label="GAMES" value={comp.length} color={colors.amber} />
          </View>
        )}
      </Panel>

      <View style={styles.seg}>
        {(['overview', 'mastery', 'hardcore'] as Sub[]).map((s) => (
          <Pressable key={s} onPress={() => setSub(s)} style={[styles.segBtn, sub === s && styles.segOn]}>
            <Body size={12} color={sub === s ? colors.cyan : colors.inkDim} weight={sub === s ? 'semibold' : undefined}>{s === 'overview' ? 'Overview' : s === 'mastery' ? 'Mastery' : 'Hardcore'}</Body>
          </Pressable>
        ))}
      </View>

      {error && <Body size={13} color={colors.amber} style={{ marginTop: space.md }}>{error}</Body>}
      {loading && comp.length === 0 && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}

      {sub === 'overview' && (
        <View style={{ marginTop: space.md }}>
          <SectionHeader title="QUICK WINS" color={colors.green} />
          {quickWins.length === 0 ? <Body size={13} color={colors.inkDim}>No games are close to mastery right now.</Body>
            : quickWins.slice(0, 30).map((g) => <GameRow key={g.GameID} g={g} onOpen={() => setOpen(toGame(g))} trailing={`${g.MaxPossible - g.NumAwarded} left`} trailingColor={colors.green} />)}
        </View>
      )}
      {sub === 'mastery' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          {mastery.slice(0, 200).map((g) => <GameRow key={g.GameID} g={g} onOpen={() => setOpen(toGame(g))} trailing={`${Math.round((g.NumAwarded / g.MaxPossible) * 100)}%`} trailingColor={g.NumAwarded === g.MaxPossible ? colors.green : colors.cyan} />)}
        </View>
      )}
      {sub === 'hardcore' && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>Games where hardcore trails softcore — re-earn these in hardcore for gold.</Body>
          {hardcore.length === 0 ? <Body size={13} color={colors.inkDim}>Hardcore is level with softcore. 💪</Body>
            : hardcore.slice(0, 200).map((g) => <GameRow key={g.GameID} g={g} onOpen={() => setOpen(toGame(g))} trailing={`+${g.NumAwarded - g.NumAwardedHardcore}`} trailingColor={colors.amber} />)}
        </View>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </ScrollView>
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

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  avFallback: { alignItems: 'center', justifyContent: 'center', borderColor: colors.cyan },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg, gap: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  seg: { flexDirection: 'row', marginTop: space.lg, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 3 },
  segBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.cyan },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  gIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
});
