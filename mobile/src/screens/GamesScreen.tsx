import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Body, SectionHeader, Input } from '../ui';
import { searchGames, MatchGame } from '../db';
import { consoleName } from '../consoles';
import { mediaUrl } from '../ra/api';
import { GameDetail } from './GameDetail';

export function GamesScreen({ onGoSync }: { onGoSync: () => void }) {
  const [q, setQ] = useState('');
  const [games, setGames] = useState<MatchGame[]>([]);
  const [empty, setEmpty] = useState(false);
  const [open, setOpen] = useState<MatchGame | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(async () => {
      const r = await searchGames(q);
      if (!alive) return;
      setGames(r);
      setEmpty(r.length === 0 && !q.trim());
    }, 220);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Panel style={{ marginBottom: space.md }}>
        <SectionHeader title="GAMES" color={colors.magenta} />
        <Input value={q} onChangeText={setQ} placeholder="Search games…" autoCapitalize="none" />
      </Panel>

      {empty ? (
        <Panel>
          <Body size={13} color={colors.inkMid} style={{ marginBottom: space.md }}>No games yet — sync the hash DB to load every RetroAchievements game.</Body>
          <Pressable onPress={onGoSync}><Body size={13} color={colors.cyan} weight="semibold">Go to Hash DB →</Body></Pressable>
        </Panel>
      ) : (
        <View style={{ gap: space.sm }}>
          {games.map((g) => (
            <Pressable key={g.id} onPress={() => setOpen(g)}>
              <View style={styles.card}>
                {mediaUrl(g.image_icon) ? (
                  <Image source={{ uri: mediaUrl(g.image_icon)! }} style={styles.icon} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.icon, styles.iconFallback]}><Feather name="award" size={18} color={colors.magenta} /></View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.title}</Body>
                  <Body size={12} color={colors.inkDim} numberOfLines={1}>{consoleName(g.console_id) ?? ''} · {g.num_achievements} achievements · {g.points} pts</Body>
                </View>
                <Feather name="chevron-right" size={18} color={colors.inkDim} />
              </View>
            </Pressable>
          ))}
          {games.length === 0 && q.trim() && <Body size={13} color={colors.inkDim} style={{ textAlign: 'center', marginTop: space.lg }}>No games match “{q}”.</Body>}
        </View>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm,
  },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  iconFallback: { alignItems: 'center', justifyContent: 'center' },
});
