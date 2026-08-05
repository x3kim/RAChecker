import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { pickFiles, pickFolder, enumerateFolder, scanTargets, ScanRow, ScanStatus } from '../scan';
import { getFolder, setFolder, getAutoScan, getRegionPriority, onRegionPriorityChange } from '../storage';
import { dbStats, MatchGame, upsertLibrary, getLibrary, clearLibrary, getHashNames } from '../db';
import { enrichCollectionHashNames } from '../hashNames';
import { consoleName } from '../consoles';
import { mediaUrl } from '../ra/api';
import { useI18n } from '../i18n';
import { GameDetail } from './GameDetail';
import { RegionBadges } from '../components/RegionBadges';
import { parseRomTags, tagTokens, rankTokens, isLangToken, tokenLabel } from '../core';

type Phase = 'idle' | 'listing' | 'scanning';
// raRegion/raLangs are RetroAchievements' own answer for this hash — present
// once the game has been enriched, and preferred over the filename everywhere.
type DisplayRow = {
  name: string; md5: string; match: MatchGame | null; error?: string; status?: ScanStatus;
  raRegion?: string; raLangs?: string;
};

export function ScanScreen() {
  const { t } = useI18n();
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [fromCollection, setFromCollection] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number; current: string; detail?: string } | null>(null);
  const [folder, setFolderState] = useState<string | null>(null);
  const [hashes, setHashes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<MatchGame | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Region/language preference + the chip the user filtered by.
  const [priority, setPriority] = useState<string[]>([]);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [byRegion, setByRegion] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const autoRan = useRef(false);

  const loadCollection = useCallback(async () => {
    setRows(await getLibrary());
    setFromCollection(true);
  }, []);

  const scan = useCallback(async (targets: { uri: string; name: string }[]) => {
    if (!targets.length) return;
    setError(null);
    setPhase('scanning');
    setRows([]);
    try {
      const fresh: ScanRow[] = await scanTargets(targets, setProgress);
      setRows(fresh);
      setFromCollection(false);
      await upsertLibrary(
        fresh.filter((r) => r.md5).map((r) => ({ md5: r.md5, name: r.name, gameId: r.match?.id ?? null, consoleId: r.match?.console_id ?? r.consoleId ?? null })),
      );
      // Ask RetroAchievements for the official ROM names of what just matched,
      // then fold the verified regions into the rows on screen. Best effort:
      // offline or a failed call simply leaves the filename as the source.
      setEnriching(true);
      enrichCollectionHashNames()
        .then(async () => {
          const names = await getHashNames(fresh.map((r) => r.md5));
          if (!names.size) return;
          setRows((cur) => cur.map((r) => {
            const n = names.get((r.md5 || '').toLowerCase());
            return n ? { ...r, raRegion: n.region, raLangs: n.langs } : r;
          }));
        })
        .catch(() => { /* filenames remain the fallback */ })
        .finally(() => setEnriching(false));
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setPhase('idle');
      setProgress(null);
    }
  }, []);

  const runFolder = useCallback(async (existing?: string) => {
    setError(null);
    let dir = existing ?? null;
    if (!dir) dir = await pickFolder();
    if (!dir) return;
    await setFolder(dir);
    setFolderState(dir);
    setPhase('listing');
    try {
      const targets = await enumerateFolder(dir);
      if (!targets.length) { setError(t('scan.noRoms')); setPhase('idle'); return; }
      await scan(targets);
    } catch (e: any) {
      setError(String(e?.message || e));
      setPhase('idle');
    }
  }, [scan, t]);

  const runFiles = useCallback(async () => {
    const targets = await pickFiles();
    await scan(targets);
  }, [scan]);

  const wipe = useCallback(async () => { await clearLibrary(); setRows([]); setFromCollection(true); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setHashes((await dbStats()).hashes);
    await loadCollection();
    setRefreshing(false);
  }, [loadCollection]);

  useEffect(() => {
    (async () => {
      setHashes((await dbStats()).hashes);
      setPriority(await getRegionPriority());
      const f = await getFolder();
      setFolderState(f);
      await loadCollection();
      // A scan reads every file in the folder, so it only starts on request.
      // Re-scanning at launch is opt-in (Settings → Scanning).
      if (f && !autoRan.current && (await getAutoScan())) { autoRan.current = true; runFolder(f); }
    })();
  }, [loadCollection, runFolder]);

  useEffect(() => onRegionPriorityChange(setPriority), []);

  const busy = phase !== 'idle';
  // Rows loaded from the collection have no live status; treat a stored row as
  // matched/unmatched based on whether it resolved to a game.
  const statusOf = (r: DisplayRow): ScanStatus =>
    r.status ?? (r.error ? 'note'
      : r.match ? (r.match.num_achievements > 0 ? 'match' : 'noset')
      : hashes === 0 ? 'unsynced' : 'nomatch');
  const matched = rows.filter((r) => statusOf(r) === 'match').length;
  const noSet = rows.filter((r) => statusOf(r) === 'noset').length;
  const unsynced = rows.filter((r) => statusOf(r) === 'unsynced').length;
  const noMatch = rows.filter((r) => statusOf(r) === 'nomatch').length;
  const errors = rows.filter((r) => statusOf(r) === 'note').length;

  // Region/language chips are built from the rows on screen, so nothing is
  // offered that isn't actually there. Tokens are cached per row because the
  // filter, the sort and the badges all need them.
  const tokensByRow = useMemo(() => rows.map((r) => (
    (r.raRegion || r.raLangs)
      ? tagTokens({
        regions: String(r.raRegion ?? '').split(',').filter(Boolean),
        languages: String(r.raLangs ?? '').split(',').filter(Boolean),
      }) as string[]
      : tagTokens(parseRomTags(r.name)) as string[]
  )), [rows]);
  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const toks of tokensByRow) for (const tok of toks) counts.set(tok, (counts.get(tok) ?? 0) + 1);
    return [...counts.entries()]
      .map(([token, n]) => ({ token, n }))
      // Regions before languages, then by how many files carry them.
      .sort((a, b) => Number(isLangToken(a.token)) - Number(isLangToken(b.token)) || b.n - a.n || a.token.localeCompare(b.token))
      .slice(0, 24);
  }, [tokensByRow]);

  const shownRows = useMemo(() => {
    let list = rows.map((r, i) => ({ r, toks: tokensByRow[i] ?? [], i }));
    if (tagFilter) list = list.filter((x) => x.toks.includes(tagFilter));
    if (byRegion && priority.length) {
      list = [...list].sort((a, b) => rankTokens(a.toks, priority) - rankTokens(b.toks, priority) || a.i - b.i);
    }
    return list.map((x) => x.r);
  }, [rows, tokensByRow, tagFilter, byRegion, priority]);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}
    >
      <Panel>
        <SectionHeader title={t('scan.title')} />
        {hashes === 0 && (
          <Body size={12} color={colors.amber} style={{ marginBottom: space.md }}>
            {t('scan.noHashes')}
          </Body>
        )}
        <View style={styles.actions}>
          <Btn label={t('scan.pickFiles')} variant="primary" onPress={runFiles} disabled={busy} style={{ flex: 1 }} />
          <Btn label={t('scan.pickFolder')} onPress={() => runFolder()} disabled={busy} style={{ flex: 1 }} />
        </View>
        {folder && (
          <View style={{ marginTop: space.sm }}>
            <Btn label={t('scan.rescanFolder')} onPress={() => runFolder(folder)} disabled={busy} />
            <Body size={11} color={colors.inkDim} style={{ marginTop: space.sm }} numberOfLines={2}>
              {t('scan.folderNote')}
            </Body>
          </View>
        )}

        {busy && (
          <View style={{ marginTop: space.md }}>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 6}%` }]} /></View>
            <Body size={12} color={colors.inkDim} style={{ marginTop: 6 }} numberOfLines={1}>
              {phase === 'listing' ? t('scan.listing') : progress ? `${progress.done}/${progress.total} · ${progress.current}` : t('scan.scanning')}
            </Body>
            {progress?.detail && (
              <Body size={12} color={colors.cyan} style={{ marginTop: 2 }} numberOfLines={1}>{progress.detail}</Body>
            )}
            <Body size={11} color={colors.inkDim} style={{ marginTop: 4 }} numberOfLines={2}>{t('scan.bigArchiveHint')}</Body>
          </View>
        )}

        {error && <Body size={13} color={colors.red} style={{ marginTop: space.md }}>{error}</Body>}
      </Panel>

      {rows.length > 0 && (
        <>
          <View style={styles.summaryRow}>
            <Body size={12} color={colors.inkDim} weight="medium">{fromCollection ? t('scan.collection') : t('scan.results')}</Body>
            {fromCollection && <Pressable onPress={wipe}><Body size={12} color={colors.red}>{t('scan.clear')}</Body></Pressable>}
          </View>
          <View style={styles.summary}>
            <Tag n={matched} label={t('scan.withAch')} color={colors.green} />
            {noSet > 0 && <Tag n={noSet} label={t('scan.tagNoSet')} color={colors.purple} />}
            {unsynced > 0 && <Tag n={unsynced} label={t('scan.tagUnsynced')} color={colors.cyan} />}
            {noMatch > 0 && <Tag n={noMatch} label={t('scan.noMatch')} color={colors.red} />}
            {errors > 0 && <Tag n={errors} label={t('scan.errors')} color={colors.amber} />}
          </View>
          {chips.length > 0 && (
            <View style={{ marginTop: space.md }}>
              <View style={styles.chipHead}>
                <Body size={12} color={colors.inkDim} weight="medium">{t('scan.regionTitle')}</Body>
                {priority.length > 0 && (
                  <Pressable onPress={() => setByRegion((v) => !v)}>
                    <Body size={12} color={byRegion ? colors.green : colors.inkDim}>
                      {byRegion ? `✓ ${t('scan.regionSort')}` : t('scan.regionSort')}
                    </Body>
                  </Pressable>
                )}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <Pressable onPress={() => setTagFilter(null)}
                  style={[styles.chip, !tagFilter && { borderColor: colors.purple }]}>
                  <Mono size={14} color={!tagFilter ? colors.purple : colors.inkDim}>{t('common.all')}</Mono>
                </Pressable>
                {chips.map((c) => {
                  const on = tagFilter === c.token;
                  const accent = isLangToken(c.token) ? colors.cyan : colors.purple;
                  return (
                    <Pressable key={c.token} onPress={() => setTagFilter(on ? null : c.token)}
                      style={[styles.chip, on && { borderColor: accent }]}>
                      <Mono size={14} color={on ? accent : colors.inkMid}>{tokenLabel(c.token)}</Mono>
                      <Mono size={13} color={colors.inkDim}>{c.n}</Mono>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {enriching && (
                <Body size={11} color={colors.cyan} style={{ marginTop: 4 }}>{t('scan.regionVerifying')}</Body>
              )}
              <Body size={11} color={colors.inkDim} style={{ marginTop: 4 }}>
                {priority.length === 0 ? t('scan.regionHint') : t('scan.regionSourceHint')}
              </Body>
            </View>
          )}
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {shownRows.slice(0, 400).map((r, i) => <Row key={r.md5 || i} row={r} onOpen={setOpenGame} status={statusOf(r)} priority={priority} />)}

            {shownRows.length > 400 && <Body size={12} color={colors.inkDim} style={{ textAlign: 'center' }}>{t('scan.andMore', { n: shownRows.length - 400 })}</Body>}
            {shownRows.length === 0 && <Body size={12} color={colors.inkDim} style={{ textAlign: 'center' }}>{t('scan.regionNone')}</Body>}
          </View>
        </>
      )}

      {openGame && <GameDetail game={openGame} onClose={() => setOpenGame(null)} />}
    </ScrollView>
  );
}

function Tag({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={[styles.tag, { borderColor: color }]}>
      <Mono size={18} color={color}>{n}</Mono>
      <Body size={11} color={colors.inkDim}>{label}</Body>
    </View>
  );
}

// One result row. The sub-line states the *reason* a file didn't match, which is
// what makes an unmatched row actionable: "system not synced" can still become a
// match later, "no match" means the dump itself is unknown to RetroAchievements.
function Row({ row, onOpen, status, priority = [] }: { row: DisplayRow; onOpen: (g: MatchGame) => void; status: ScanStatus; priority?: string[] }) {
  const { t } = useI18n();
  const accent = status === 'note' ? colors.amber
    : status === 'match' ? colors.green
    : status === 'noset' ? colors.purple
    : status === 'unsynced' ? colors.cyan
    : colors.red;
  const iconName = status === 'note' ? 'alert-triangle'
    : status === 'match' ? 'award'
    : status === 'noset' ? 'clock'
    : status === 'unsynced' ? 'download-cloud'
    : 'help-circle';
  const icon = mediaUrl(row.match?.image_icon);
  const inner = (
    <View style={[styles.rowCard, { borderLeftColor: accent }]}>
      {row.match && icon ? (
        <Image source={{ uri: icon }} style={styles.icon} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.icon, styles.iconFallback]}>
          <Feather name={iconName} size={18} color={accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{row.match ? row.match.title : row.name}</Body>
        {row.match && status === 'noset' ? (
          <Body size={12} color={colors.purple} numberOfLines={2}>{t('scan.rowNoSet', { c: consoleName(row.match.console_id) ?? '' })}</Body>
        ) : row.match ? (
          <Body size={12} color={colors.inkMid} numberOfLines={1}>{consoleName(row.match.console_id) ?? ''} · {row.match.num_achievements} {t('common.achievements')} · {row.match.points} {t('common.pts')}</Body>
        ) : status === 'note' ? (
          <Body size={12} color={colors.amber} numberOfLines={3}>{row.error}</Body>
        ) : status === 'unsynced' ? (
          <Body size={12} color={colors.cyan} numberOfLines={2}>{t('scan.rowUnsynced')}</Body>
        ) : (
          <Body size={12} color={colors.inkDim} numberOfLines={2}>{t('scan.rowNoMatch')}</Body>
        )}
        <RegionBadges name={row.name} raRegion={row.raRegion} raLangs={row.raLangs} priority={priority} />
      </View>
      {row.match && <Feather name="chevron-right" size={18} color={colors.inkDim} />}
    </View>
  );
  if (row.match) {
    const g = row.match;
    return <Pressable onPress={() => onOpen(g)}>{inner}</Pressable>;
  }
  return inner;
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  actions: { flexDirection: 'row', gap: space.sm },
  track: { height: 8, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.cyan },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg },
  summary: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  tag: { flex: 1, alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: space.sm, backgroundColor: colors.panel },
  chipHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  chipRow: { gap: space.sm, paddingRight: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: space.sm, paddingVertical: 4, backgroundColor: colors.panel,
  },
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1,
    borderLeftWidth: 3, borderRadius: radius.md, padding: space.sm,
  },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  iconFallback: { alignItems: 'center', justifyContent: 'center' },
});
