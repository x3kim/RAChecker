import { useEffect, useRef, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { pickFiles, pickFolder, enumerateFolder, scanTargets, ScanRow } from '../scan';
import { getFolder, setFolder } from '../storage';
import { dbStats, MatchGame, upsertLibrary, getLibrary, clearLibrary } from '../db';
import { consoleName } from '../consoles';
import { mediaUrl } from '../ra/api';
import { GameDetail } from './GameDetail';

type Phase = 'idle' | 'listing' | 'scanning';
type DisplayRow = { name: string; md5: string; match: MatchGame | null; error?: string };

export function ScanScreen() {
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [fromCollection, setFromCollection] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [folder, setFolderState] = useState<string | null>(null);
  const [hashes, setHashes] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<MatchGame | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
      if (!targets.length) { setError('No ROMs found in that folder.'); setPhase('idle'); return; }
      await scan(targets);
    } catch (e: any) {
      setError(String(e?.message || e));
      setPhase('idle');
    }
  }, [scan]);

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
      const f = await getFolder();
      setFolderState(f);
      await loadCollection();
      if (f && !autoRan.current) { autoRan.current = true; runFolder(f); }
    })();
  }, [loadCollection, runFolder]);

  const busy = phase !== 'idle';
  const matched = rows.filter((r) => r.match).length;
  const noMatch = rows.filter((r) => !r.match && !r.error).length;
  const errors = rows.filter((r) => r.error).length;

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.cyan} />}
    >
      <Panel>
        <SectionHeader title="SCAN" />
        {hashes === 0 && (
          <Body size={12} color={colors.amber} style={{ marginBottom: space.md }}>
            No hashes yet — sync the hash DB first (Hash DB tab) so ROMs can match.
          </Body>
        )}
        <View style={styles.actions}>
          <Btn label="Pick ROMs" variant="primary" onPress={runFiles} disabled={busy} style={{ flex: 1 }} />
          <Btn label="Scan folder" onPress={() => runFolder()} disabled={busy} style={{ flex: 1 }} />
        </View>
        {folder && (
          <Body size={11} color={colors.inkDim} style={{ marginTop: space.sm }} numberOfLines={1}>
            Folder set · scans on launch. Tap “Scan folder” to change.
          </Body>
        )}

        {busy && (
          <View style={{ marginTop: space.md }}>
            <View style={styles.track}><View style={[styles.fill, { width: `${progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 6}%` }]} /></View>
            <Body size={12} color={colors.inkDim} style={{ marginTop: 6 }} numberOfLines={1}>
              {phase === 'listing' ? 'Listing folder…' : progress ? `${progress.done}/${progress.total} · ${progress.current}` : 'Scanning…'}
            </Body>
          </View>
        )}

        {error && <Body size={13} color={colors.red} style={{ marginTop: space.md }}>{error}</Body>}
      </Panel>

      {rows.length > 0 && (
        <>
          <View style={styles.summaryRow}>
            <Body size={12} color={colors.inkDim} weight="medium">{fromCollection ? 'YOUR COLLECTION' : 'SCAN RESULTS'}</Body>
            {fromCollection && <Pressable onPress={wipe}><Body size={12} color={colors.red}>Clear</Body></Pressable>}
          </View>
          <View style={styles.summary}>
            {hashes === 0 ? (
              <Tag n={noMatch} label="hashed · sync to match" color={colors.inkDim} />
            ) : (
              <>
                <Tag n={matched} label="with achievements" color={colors.green} />
                <Tag n={noMatch} label="no match" color={colors.red} />
              </>
            )}
            {errors > 0 && <Tag n={errors} label="errors" color={colors.amber} />}
          </View>
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {rows.slice(0, 400).map((r, i) => <Row key={r.md5 || i} row={r} onOpen={setOpenGame} dbEmpty={hashes === 0} />)}
            {rows.length > 400 && <Body size={12} color={colors.inkDim} style={{ textAlign: 'center' }}>… and {rows.length - 400} more</Body>}
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

function Row({ row, onOpen, dbEmpty }: { row: DisplayRow; onOpen: (g: MatchGame) => void; dbEmpty?: boolean }) {
  const unmatchedNeutral = !row.match && !row.error && dbEmpty;
  const accent = row.error ? colors.amber : row.match ? colors.green : unmatchedNeutral ? colors.inkDim : colors.red;
  const icon = mediaUrl(row.match?.image_icon);
  const inner = (
    <View style={[styles.rowCard, { borderLeftColor: accent }]}>
      {row.match && icon ? (
        <Image source={{ uri: icon }} style={styles.icon} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.icon, styles.iconFallback]}>
          <Feather name={row.error ? 'alert-triangle' : row.match ? 'award' : 'x'} size={18} color={accent} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Body size={13} color={colors.inkHi} weight="semibold" numberOfLines={1}>{row.match ? row.match.title : row.name}</Body>
        {row.match ? (
          <Body size={12} color={colors.inkMid} numberOfLines={1}>{consoleName(row.match.console_id) ?? ''} · {row.match.num_achievements} achievements · {row.match.points} pts</Body>
        ) : row.error ? (
          <Body size={12} color={colors.amber} numberOfLines={1}>{row.error}</Body>
        ) : unmatchedNeutral ? (
          <Body size={12} color={colors.inkDim} numberOfLines={1}>Hashed ✓ — sync the hash DB to check for achievements</Body>
        ) : (
          <Body size={12} color={colors.inkDim} numberOfLines={1}>No match — different version or not on RA</Body>
        )}
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
  rowCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1,
    borderLeftWidth: 3, borderRadius: radius.md, padding: space.sm,
  },
  icon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.surface },
  iconFallback: { alignItems: 'center', justifyContent: 'center' },
});
