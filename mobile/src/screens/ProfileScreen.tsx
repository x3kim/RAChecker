import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { colors, space, radius, textGlow } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { getCreds, getCache, setCache, Creds } from '../storage';
import { getUserProfile, mediaUrl, RAProfile } from '../ra/api';

const PROFILE_TTL = 60 * 60 * 1000; // 1h

export function ProfileScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const [creds, setCredsState] = useState<Creds | null | undefined>(undefined); // undefined = still loading creds
  const [profile, setProfile] = useState<RAProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    const c = await getCreds();
    setCredsState(c);
    if (!c) return;
    setLoading(true);
    setError(null);
    try {
      if (!force) {
        const cached = await getCache<RAProfile>('profile', PROFILE_TTL);
        if (cached) { setProfile(cached); setLoading(false); return; }
      }
      const p = await getUserProfile(c);
      setProfile(p);
      await setCache('profile', p);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (creds === undefined) {
    return <View style={styles.center}><ActivityIndicator color={colors.cyan} /></View>;
  }

  if (creds === null) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Panel>
          <SectionHeader title="RETROACHIEVEMENTS" />
          <Body size={14} color={colors.inkMid} style={{ marginBottom: space.md }}>
            Connect your RetroAchievements account to see your profile, and (soon) whether your ROMs earn achievements.
          </Body>
          <Btn label="Connect account" variant="primary" onPress={onGoSettings} />
        </Panel>
      </ScrollView>
    );
  }

  const avatar = mediaUrl(profile?.UserPic);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(true)} tintColor={colors.cyan} />}
    >
      <Panel>
        <View style={styles.head}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}><Display size={18} color={colors.cyan}>{(profile?.User || creds.username).slice(0, 2).toUpperCase()}</Display></View>
          )}
          <View style={{ flex: 1 }}>
            <Display size={15} color={colors.inkHi}>{profile?.User || creds.username}</Display>
            {profile?.Motto ? <Body size={13} color={colors.inkDim} style={{ marginTop: 4 }} numberOfLines={2}>{profile.Motto}</Body> : null}
          </View>
        </View>

        {error && <Body size={13} color={colors.red} style={{ marginTop: space.md }}>{error}</Body>}

        {profile && (
          <View style={styles.stats}>
            <Stat label="POINTS" value={profile.TotalPoints} color={colors.cyan} />
            <Stat label="RANK" value={profile.Rank != null ? `#${profile.Rank}` : '—'} color={colors.green} />
            <Stat label="TRUE POINTS" value={profile.TotalTruePoints} color={colors.amber} />
          </View>
        )}

        {profile?.MemberSince ? (
          <Body size={12} color={colors.inkDim} style={{ marginTop: space.md }}>Member since {profile.MemberSince.slice(0, 10)}</Body>
        ) : null}
      </Panel>
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value?: number | string; color: string }) {
  return (
    <View style={styles.stat}>
      <Mono size={26} color={color} style={textGlow(color, 8)}>{value != null ? value.toLocaleString?.() ?? String(value) : '—'}</Mono>
      <Body size={11} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  avatar: { width: 64, height: 64, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', borderColor: colors.cyan },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.lg, gap: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
});
