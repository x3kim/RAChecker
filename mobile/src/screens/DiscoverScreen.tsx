import { useEffect, useState, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable, Linking, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Body, SectionHeader, Btn, Input } from '../ui';
import { getCreds, getCache, setCache } from '../storage';
import { getAchievementOfTheWeek, getActiveClaims, getRecentGameAwards, mediaUrl } from '../ra/api';
import { getGamesForConsoles, MatchGame } from '../db';
import { useI18n } from '../i18n';
import { GameDetail } from './GameDetail';
// @ts-ignore ported data module
import { FREE_GAMES } from '../data/freeGames';

type Sub = 'free' | 'radar' | 'community';
const TTL = 30 * 60 * 1000;

// alnum-only lower key for fuzzy title matching against the synced DB.
const normKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function DiscoverScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const { t } = useI18n();
  const [sub, setSub] = useState<Sub>('free');
  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [aotw, setAotw] = useState<any>(null);
  const [awards, setAwards] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<MatchGame | null>(null);
  // resolver: `${consoleId}|${normTitle}` -> synced game (artwork/achievements/detail)
  const [resolver, setResolver] = useState<Map<string, MatchGame>>(new Map());

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

  // Resolve free games to synced RA games (artwork + achievements + detail).
  useEffect(() => {
    (async () => {
      const ids = [...new Set(FREE_GAMES.map((g: any) => g.consoleId).filter((n: any) => typeof n === 'number'))] as number[];
      const rows = await getGamesForConsoles(ids);
      const m = new Map<string, MatchGame>();
      for (const g of rows) m.set(`${g.console_id}|${normKey(g.title)}`, g);
      setResolver(m);
    })();
  }, []);

  const resolve = (g: any): MatchGame | null => resolver.get(`${g.consoleId}|${normKey(g.title || '')}`) ?? null;

  const free = useMemo(() => {
    const term = q.trim().toLowerCase();
    return term
      ? FREE_GAMES.filter((g: any) => (g.title + ' ' + (g.systemLabel || '') + ' ' + (g.author || '')).toLowerCase().includes(term))
      : FREE_GAMES;
  }, [q]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.seg}>
        {(['free', 'radar', 'community'] as Sub[]).map((s) => (
          <Pressable key={s} onPress={() => setSub(s)} style={[styles.segBtn, sub === s && styles.segOn]}>
            <Body size={12} color={sub === s ? colors.magenta : colors.inkDim} weight={sub === s ? 'semibold' : undefined}>
              {s === 'free' ? t('disc.free') : s === 'radar' ? t('disc.radar') : t('disc.community')}
            </Body>
          </Pressable>
        ))}
      </View>

      {sub !== 'free' && hasCreds === false && (
        <Panel style={{ marginTop: space.md }}>
          <Body size={13} color={colors.inkMid} style={{ marginBottom: space.md }}>{t('disc.connectFeed')}</Body>
          <Btn label={t('common.connect')} variant="primary" onPress={onGoSettings} />
        </Panel>
      )}
      {sub !== 'free' && loading && <View style={{ paddingVertical: space.xl }}><ActivityIndicator color={colors.cyan} /></View>}

      {sub === 'free' && (
        <View style={{ marginTop: space.md }}>
          <Panel style={{ marginBottom: space.md }}>
            <SectionHeader title={t('disc.freeTitle')} color={colors.magenta} />
            <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>{t('disc.freeBody')}</Body>
            <Input value={q} onChangeText={setQ} placeholder={t('disc.searchFree')} />
          </Panel>
          <View style={{ gap: space.sm }}>
            {free.slice(0, 200).map((g: any, i: number) => {
              const r = resolve(g);
              const icon = r ? mediaUrl(r.image_icon) : null;
              return (
                <Pressable key={i} onPress={() => (r ? setOpen(r) : g.url && Linking.openURL(g.url))}>
                  <View style={styles.row}>
                    {icon ? <Image source={{ uri: icon }} style={styles.icon} contentFit="cover" transition={150} />
                      : <View style={[styles.icon, styles.iconFallback]}><Feather name="download" size={16} color={colors.magenta} /></View>}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{g.title}</Body>
                      <Body size={12} color={colors.inkDim} numberOfLines={1}>
                        {g.systemLabel}{g.author ? ` · ${g.author}` : ''}
                        {r ? ` · ${r.num_achievements} ${t('common.achievements')}` : ''}
                      </Body>
                    </View>
                    {g.url && (
                      <Pressable onPress={() => Linking.openURL(g.url)} hitSlop={8} style={styles.dlBtn}>
                        <Feather name="external-link" size={15} color={colors.magenta} />
                      </Pressable>
                    )}
                    {r && <Feather name="chevron-right" size={16} color={colors.inkDim} />}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {sub === 'radar' && hasCreds && (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>{t('disc.radarBody')}</Body>
          {claims.length === 0 && !loading ? <Body size={13} color={colors.inkDim}>{t('disc.noClaims')}</Body> :
            claims.slice(0, 60).map((c: any, i: number) => (
              <Pressable key={i} onPress={() => c.GameID && setOpen({ id: c.GameID, title: c.GameTitle, points: 0, num_achievements: 0, image_icon: c.GameIcon ?? null, console_id: c.ConsoleID ?? 0 })}>
                <View style={styles.row}>
                  {mediaUrl(c.GameIcon) ? <Image source={{ uri: mediaUrl(c.GameIcon)! }} style={styles.icon} contentFit="cover" /> : <View style={styles.icon} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{c.GameTitle}</Body>
                    <Body size={12} color={colors.inkDim} numberOfLines={1}>{c.ConsoleName ?? ''} · {t('common.by')} {c.User}</Body>
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
              <SectionHeader title={t('disc.aotw')} color={colors.amber} />
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
          <Body size={12} color={colors.inkDim} style={{ marginBottom: space.xs }}>{t('disc.recent')}</Body>
          {awards.slice(0, 40).map((a: any, i: number) => (
            <View key={i} style={styles.row}>
              {mediaUrl(a.GameIcon) ? <Image source={{ uri: mediaUrl(a.GameIcon)! }} style={styles.icon} contentFit="cover" />
                : <View style={[styles.icon, styles.iconFallback]}><Feather name="award" size={16} color={colors.green} /></View>}
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
  dlBtn: { padding: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
});
