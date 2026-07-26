import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { colors, space, radius } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { getCreds } from '../storage';
import { initDb, dbStats, clearDb } from '../db';
import { syncAll, SyncProgress } from '../sync';

export function SyncScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ games: number; hashes: number; consoles: number } | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    await initDb();
    setStats(await dbStats());
    setHasCreds(!!(await getCreds()));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const run = async () => {
    const creds = await getCreds();
    if (!creds) { onGoSettings(); return; }
    setSyncing(true);
    try {
      await syncAll(creds, setProgress);
    } finally {
      setSyncing(false);
      setProgress(null);
      await refresh();
    }
  };

  const wipe = async () => { await clearDb(); await refresh(); };

  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel>
        <SectionHeader title="HASH DATABASE" color={colors.green} />
        <Body size={13} color={colors.inkDim} style={{ marginBottom: space.md }}>
          Load the RetroAchievements hashes onto your device once. After that, scanning matches fully offline — no PC needed.
        </Body>

        <View style={styles.stats}>
          <Stat label="HASHES" value={stats?.hashes ?? 0} color={colors.cyan} />
          <Stat label="GAMES" value={stats?.games ?? 0} color={colors.green} />
          <Stat label="SYSTEMS" value={stats?.consoles ?? 0} color={colors.amber} />
        </View>

        {syncing && (
          <View style={{ marginTop: space.lg }}>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            <Body size={12} color={colors.inkDim} style={{ marginTop: 6 }}>
              {progress ? `${progress.done}/${progress.total} · ${progress.name} · ${progress.hashCount.toLocaleString()} hashes` : 'starting…'}
            </Body>
          </View>
        )}

        <View style={styles.row}>
          <Btn label={syncing ? 'Syncing…' : (stats?.hashes ? 'Re-sync' : 'Sync now')} variant="primary" onPress={run} disabled={syncing} style={{ flex: 1 }} />
          {!!stats?.hashes && !syncing && <Btn label="Clear" variant="danger" onPress={wipe} />}
        </View>

        {hasCreds === false && (
          <Body size={12} color={colors.amber} style={{ marginTop: space.md }}>
            Connect your RA account first (Settings).
          </Body>
        )}
      </Panel>
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.stat}>
      <Mono size={24} color={color}>{value.toLocaleString()}</Mono>
      <Body size={11} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  row: { flexDirection: 'row', gap: space.sm, marginTop: space.lg },
  track: { height: 8, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.green },
});
