import { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Body, Display, Mono, SectionHeader, Input } from '../ui';
import { ConsoleIcon } from '../components/ConsoleIcon';
import { searchGames, getConsolesWithCounts, getGamesByConsole, MatchGame } from '../db';
import { consoleName } from '../consoles';
import { mediaUrl } from '../ra/api';
import { useI18n } from '../i18n';
import { GameDetail } from './GameDetail';

type SortKey = 'points' | 'achievements' | 'title';

export function GamesScreen({ onGoSync }: { onGoSync: () => void }) {
  const { t } = useI18n();
  const [systems, setSystems] = useState<{ console_id: number; count: number }[] | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortKey>('points');
  const [games, setGames] = useState<MatchGame[]>([]);
  const [globalResults, setGlobalResults] = useState<MatchGame[]>([]);
  const [open, setOpen] = useState<MatchGame | null>(null);

  useEffect(() => { getConsolesWithCounts().then(setSystems); }, []);

  // Global search (systems view) — searches across every console.
  useEffect(() => {
    if (sel != null) return;
    let alive = true;
    const term = q.trim();
    if (!term) { setGlobalResults([]); return; }
    const h = setTimeout(async () => { const r = await searchGames(term); if (alive) setGlobalResults(r); }, 220);
    return () => { alive = false; clearTimeout(h); };
  }, [q, sel]);

  // Games within the selected console.
  useEffect(() => {
    if (sel == null) return;
    let alive = true;
    const h = setTimeout(async () => {
      const r = await getGamesByConsole(sel, { q: q.trim() || undefined, sort });
      if (alive) setGames(r);
    }, 220);
    return () => { alive = false; clearTimeout(h); };
  }, [sel, q, sort]);

  const enterConsole = (id: number) => { setSel(id); setQ(''); };
  const back = () => { setSel(null); setQ(''); };

  const empty = systems != null && systems.length === 0;
  const selCount = useMemo(() => systems?.find((s) => s.console_id === sel)?.count ?? 0, [systems, sel]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {empty ? (
        <Panel>
          <SectionHeader title={t('games.title')} color={colors.magenta} />
          <Body size={13} color={colors.inkMid} style={{ marginBottom: space.md }}>{t('games.noneYet')}</Body>
          <Pressable onPress={onGoSync}><Body size={13} color={colors.cyan} weight="semibold">{t('games.goSync')}</Body></Pressable>
        </Panel>
      ) : sel == null ? (
        <>
          <Panel style={{ marginBottom: space.md }}>
            <SectionHeader title={t('games.title')} color={colors.magenta} />
            <Input value={q} onChangeText={setQ} placeholder={t('games.search')} autoCapitalize="none" />
          </Panel>

          {q.trim() ? (
            <View style={{ gap: space.sm }}>
              {globalResults.map((g) => <GameRow key={g.id} g={g} showConsole onOpen={() => setOpen(g)} />)}
              {globalResults.length === 0 && <Body size={13} color={colors.inkDim} style={{ textAlign: 'center', marginTop: space.lg }}>{t('games.noneMatch', { q: q.trim() })}</Body>}
            </View>
          ) : (
            <View style={styles.grid}>
              {(systems ?? []).map((s) => (
                <Pressable key={s.console_id} style={styles.sysCard} onPress={() => enterConsole(s.console_id)}>
                  <ConsoleIcon id={s.console_id} size={40} />
                  <Body size={12} color={colors.inkHi} weight="semibold" numberOfLines={2} style={{ textAlign: 'center', marginTop: space.sm }}>{consoleName(s.console_id) ?? `#${s.console_id}`}</Body>
                  <Mono size={14} color={colors.cyan} style={{ marginTop: 2 }}>{s.count}</Mono>
                </Pressable>
              ))}
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.headRow}>
            <Pressable onPress={back} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={18} color={colors.inkHi} />
              <Body size={13} color={colors.inkHi} weight="semibold">{t('games.backToSystems')}</Body>
            </Pressable>
          </View>
          <Panel style={{ marginBottom: space.md }}>
            <View style={styles.consoleHead}>
              <ConsoleIcon id={sel} size={32} />
              <View style={{ flex: 1 }}>
                <Display size={13} color={colors.cyan}>{consoleName(sel) ?? `#${sel}`}</Display>
                <Body size={12} color={colors.inkDim} style={{ marginTop: 2 }}>{t('games.inSystem', { n: selCount })}</Body>
              </View>
            </View>
            <Input value={q} onChangeText={setQ} placeholder={t('games.search')} autoCapitalize="none" />
            <View style={styles.sortRow}>
              {(['points', 'achievements', 'title'] as SortKey[]).map((s) => (
                <Pressable key={s} onPress={() => setSort(s)} style={[styles.sortChip, sort === s && styles.sortOn]}>
                  <Body size={11} color={sort === s ? colors.cyan : colors.inkDim} weight={sort === s ? 'semibold' : undefined}>
                    {s === 'points' ? t('games.sortPoints') : s === 'achievements' ? t('games.sortAch') : t('games.sortTitle')}
                  </Body>
                </Pressable>
              ))}
            </View>
          </Panel>
          <View style={{ gap: space.sm }}>
            {games.map((g) => <GameRow key={g.id} g={g} onOpen={() => setOpen(g)} />)}
            {games.length === 0 && q.trim() && <Body size={13} color={colors.inkDim} style={{ textAlign: 'center', marginTop: space.lg }}>{t('games.noneMatch', { q: q.trim() })}</Body>}
          </View>
        </>
      )}

      {open && <GameDetail game={open} onClose={() => setOpen(null)} />}
    </ScrollView>
  );
}

function GameRow({ g, onOpen, showConsole }: { g: MatchGame; onOpen: () => void; showConsole?: boolean }) {
  const { t } = useI18n();
  return (
    <Pressable onPress={onOpen}>
      <View style={styles.card}>
        {mediaUrl(g.image_icon) ? (
          <Image source={{ uri: mediaUrl(g.image_icon)! }} style={styles.icon} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.icon, styles.iconFallback]}><Feather name="award" size={18} color={colors.magenta} /></View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.title}</Body>
          <Body size={12} color={colors.inkDim} numberOfLines={1}>
            {showConsole ? `${consoleName(g.console_id) ?? ''} · ` : ''}{g.num_achievements} {t('common.achievements')} · {g.points} {t('common.pts')}
          </Body>
        </View>
        <Feather name="chevron-right" size={18} color={colors.inkDim} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  sysCard: { width: '31%', minWidth: 96, flexGrow: 1, alignItems: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.sm },
  headRow: { marginBottom: space.md },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start' },
  consoleHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginBottom: space.md },
  sortRow: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  sortChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  sortOn: { borderColor: colors.cyan, backgroundColor: colors.panel },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space.sm },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  iconFallback: { alignItems: 'center', justifyContent: 'center' },
});
