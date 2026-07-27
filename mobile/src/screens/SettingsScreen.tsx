import { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, Alert, Pressable, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, space, radius, PALETTES, THEME_LIST, loadThemeId, saveThemeId } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn, Input } from '../ui';
import { getCreds, setCreds, clearCreds } from '../storage';
import { getUserProfile } from '../ra/api';
import { dbStats, clearDb, libraryStats, clearLibrary } from '../db';
import { shareCollectionCsv } from '../export';

const REPO_URL = 'https://github.com/x3kim/RAChecker';
const DOCS_URL = 'https://x3kim.github.io/RAChecker/';

export function SettingsScreen({ onConnected }: { onConnected: () => void }) {
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; msg: string } | null>(null);

  const [theme, setTheme] = useState('cyan');
  const [csvMsg, setCsvMsg] = useState<string | null>(null);
  const [data, setData] = useState<{ hashes: number; games: number; collection: number }>({ hashes: 0, games: 0, collection: 0 });
  const refreshData = useCallback(async () => {
    const d = await dbStats();
    const l = await libraryStats();
    setData({ hashes: d.hashes, games: d.games, collection: l.total });
  }, []);

  useEffect(() => {
    (async () => {
      const c = await getCreds();
      if (c) { setUsername(c.username); setHasKey(true); }
      else { const u = await AsyncStorage.getItem('ra_user'); if (u) setUsername(u); }
      setTheme(await loadThemeId());
      await refreshData();
    })();
  }, [refreshData]);

  const pickTheme = async (id: string) => {
    setTheme(id);
    await saveThemeId(id);
    Alert.alert('Theme saved', 'Restart RAChecker to apply the new theme.');
  };

  const exportCsv = async () => {
    setCsvMsg('Preparing…');
    const r = await shareCollectionCsv();
    setCsvMsg(r.ok ? `Shared ${r.count} entries.` : (r.error || 'Export failed.'));
    setTimeout(() => setCsvMsg(null), 5000);
  };

  const confirmClear = (title: string, fn: () => Promise<void>) =>
    Alert.alert(title, 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await fn(); await refreshData(); } },
    ]);

  const save = async () => {
    if (!username.trim() || !apiKey.trim()) { setStatus({ kind: 'err', msg: 'Enter username and API key.' }); return; }
    setStatus({ kind: 'busy', msg: 'Verifying…' });
    try {
      await setCreds(username, apiKey);
      const p = await getUserProfile({ username: username.trim(), apiKey: apiKey.trim() });
      setStatus({ kind: 'ok', msg: `Connected as ${p.User || username}.` });
      setHasKey(true);
      setApiKey('');
      onConnected();
    } catch (e: any) {
      setStatus({ kind: 'err', msg: String(e?.message || e) });
    }
  };

  const disconnect = async () => {
    await clearCreds();
    setUsername(''); setApiKey(''); setHasKey(false);
    setStatus({ kind: 'ok', msg: 'Disconnected.' });
  };

  const statusColor = status?.kind === 'err' ? colors.red : status?.kind === 'ok' ? colors.green : colors.inkMid;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={{ gap: space.md }}>
        <SectionHeader title="RETROACHIEVEMENTS ACCOUNT" />
        <Body size={13} color={colors.inkDim}>
          Your Web API key is stored securely on this device only. Get it at retroachievements.org → Settings → Keys.
        </Body>
        <Input label="Username" value={username} onChangeText={setUsername} placeholder="your RA username" />
        <Input label={hasKey ? 'API key (set — enter to change)' : 'Web API key'} value={apiKey} onChangeText={setApiKey} placeholder={hasKey ? '•••••••• stored' : 'paste your key'} secure />
        <View style={styles.row}>
          <Btn label={status?.kind === 'busy' ? 'Verifying…' : 'Save & connect'} variant="primary" onPress={save} disabled={status?.kind === 'busy'} style={{ flex: 1 }} />
          {hasKey && <Btn label="Disconnect" variant="danger" onPress={disconnect} />}
        </View>
        {status && <Body size={13} color={statusColor}>{status.msg}</Body>}
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title="APPEARANCE" color={colors.magenta} />
        <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>Pick a theme — restart the app to apply.</Body>
        <View style={styles.themes}>
          {THEME_LIST.map((t) => {
            const p = PALETTES[t.id];
            const on = theme === t.id;
            return (
              <Pressable key={t.id} onPress={() => pickTheme(t.id)} style={[styles.swatch, { backgroundColor: p.bg, borderColor: on ? p.cyan : colors.line }]}>
                <View style={[styles.dot, { backgroundColor: p.cyan }]} />
                <View style={[styles.dot, { backgroundColor: p.green }]} />
                <View style={[styles.dot, { backgroundColor: p.magenta }]} />
                <Body size={11} color={on ? colors.inkHi : colors.inkMid} style={{ marginLeft: 6 }}>{t.name}</Body>
              </Pressable>
            );
          })}
        </View>
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title="DATA & STORAGE" color={colors.green} />
        <View style={styles.stats}>
          <Stat label="HASHES" value={data.hashes} />
          <Stat label="GAMES" value={data.games} />
          <Stat label="COLLECTION" value={data.collection} />
        </View>
        <View style={styles.row}>
          <Btn label="Clear hash DB" variant="danger" onPress={() => confirmClear('Clear hash database?', clearDb)} style={{ flex: 1 }} />
          <Btn label="Clear collection" variant="danger" onPress={() => confirmClear('Clear collection?', clearLibrary)} style={{ flex: 1 }} />
        </View>
        <View style={{ marginTop: space.sm }}>
          <Btn label="Export collection (CSV)" onPress={exportCsv} />
          {csvMsg && <Body size={12} color={colors.inkMid} style={{ marginTop: space.sm }}>{csvMsg}</Body>}
        </View>
      </Panel>

      <Panel style={{ marginTop: space.lg }}>
        <SectionHeader title="ABOUT" color={colors.purple} />
        <Body size={13} color={colors.inkMid}>
          RAChecker is an unofficial, independent community project, not affiliated with RetroAchievements. It ships no ROMs; game data © retroachievements.org.
        </Body>
        <View style={{ flexDirection: 'row', gap: space.lg, marginTop: space.md }}>
          <Pressable onPress={() => Linking.openURL(REPO_URL)}><Body size={13} color={colors.cyan} weight="semibold">GitHub ↗</Body></Pressable>
          <Pressable onPress={() => Linking.openURL(DOCS_URL)}><Body size={13} color={colors.cyan} weight="semibold">Docs ↗</Body></Pressable>
        </View>
        <Display size={11} color={colors.inkDim} style={{ marginTop: space.md }}>v0.1.0 · mobile</Display>
      </Panel>
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Mono size={22} color={colors.cyan}>{value.toLocaleString()}</Mono>
      <Body size={11} color={colors.inkDim} weight="medium" style={{ marginTop: 2 }}>{label}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch', marginTop: space.md },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: space.md },
  stat: { flex: 1, alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, paddingVertical: space.md },
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  swatch: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 3 },
});
