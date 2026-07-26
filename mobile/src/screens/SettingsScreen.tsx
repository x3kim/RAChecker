import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, space } from '../theme';
import { Panel, Display, Body, SectionHeader, Btn, Input } from '../ui';
import { getCreds, setCreds, clearCreds } from '../storage';
import { getUserProfile } from '../ra/api';

export function SettingsScreen({ onConnected }: { onConnected: () => void }) {
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'busy'; msg: string } | null>(null);

  useEffect(() => {
    (async () => {
      const c = await getCreds();
      if (c) { setUsername(c.username); setHasKey(true); }
      else { const u = await AsyncStorage.getItem('ra_user'); if (u) setUsername(u); }
    })();
  }, []);

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
        <SectionHeader title="ABOUT" color={colors.purple} />
        <Body size={13} color={colors.inkMid}>
          RAChecker is an unofficial, independent community project, not affiliated with RetroAchievements. It ships no ROMs; game data © retroachievements.org.
        </Body>
        <Display size={11} color={colors.inkDim} style={{ marginTop: space.md }}>v0.1.0 · proof + profile</Display>
      </Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, paddingBottom: space.xxl },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'stretch' },
});
