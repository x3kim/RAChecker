import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { colors, space, radius } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { getCreds, getSelectedConsoles, setSelectedConsoles } from '../storage';
import { initDb, dbStats, clearDb, rematchCollection } from '../db';
import { syncAll, SyncProgress } from '../sync';
import { SystemsPicker } from '../components/SystemsPicker';
import { SYNC_CONSOLES } from '../consoles';
import { useI18n } from '../i18n';

export function SyncScreen({ onGoSettings }: { onGoSettings: () => void }) {
  const { t } = useI18n();
  const [hasCreds, setHasCreds] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ games: number; hashes: number; consoles: number } | null>(null);
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [systems, setSystems] = useState<number[] | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const refresh = useCallback(async () => {
    await initDb();
    setStats(await dbStats());
    setHasCreds(!!(await getCreds()));
    setSystems(await getSelectedConsoles());
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const changeSystems = async (v: number[] | null) => { setSystems(v); await setSelectedConsoles(v); };
  const selCount = systems == null ? SYNC_CONSOLES.length : systems.length;

  const run = async () => {
    const creds = await getCreds();
    if (!creds) { onGoSettings(); return; }
    setSyncing(true);
    try {
      await syncAll(creds, setProgress, systems);
      await rematchCollection();
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
        <SectionHeader title={t('sync.title')} color={colors.green} />
        <Body size={13} color={colors.inkDim} style={{ marginBottom: space.md }}>
          {t('sync.body')}
        </Body>

        <View style={styles.stats}>
          <Stat label={t('sync.hashes')} value={stats?.hashes ?? 0} color={colors.cyan} />
          <Stat label={t('sync.games')} value={stats?.games ?? 0} color={colors.green} />
          <Stat label={t('sync.systems')} value={stats?.consoles ?? 0} color={colors.amber} />
        </View>

        <Pressable onPress={() => setShowPicker((s) => !s)} style={styles.pickerToggle}>
          <Body size={12} color={colors.inkMid}>{t('sync.systemsToSync', { n: selCount === SYNC_CONSOLES.length ? t('sync.all') : selCount })}</Body>
          <Body size={12} color={colors.cyan}>{showPicker ? t('sync.hide') : t('sync.choose')}</Body>
        </Pressable>
        {showPicker && (
          <View style={{ marginTop: space.sm }}>
            <SystemsPicker value={systems} onChange={changeSystems} />
          </View>
        )}

        {syncing && (
          <View style={{ marginTop: space.lg }}>
            <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
            <Body size={12} color={colors.inkDim} style={{ marginTop: 6 }}>
              {progress ? `${progress.done}/${progress.total} · ${progress.name} · ${progress.hashCount.toLocaleString()} hashes` : t('sync.starting')}
            </Body>
          </View>
        )}

        <View style={styles.row}>
          <Btn label={syncing ? t('sync.syncing') : (stats?.hashes ? t('sync.resync') : t('sync.start'))} variant="primary" onPress={run} disabled={syncing} style={{ flex: 1 }} />
          {!!stats?.hashes && !syncing && <Btn label={t('scan.clear')} variant="danger" onPress={wipe} />}
        </View>

        {hasCreds === false && (
          <Body size={12} color={colors.amber} style={{ marginTop: space.md }}>
            {t('sync.connectFirst')}
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
  pickerToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  track: { height: 8, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.green },
});
