import { useState } from 'react';
import { View, ScrollView, StyleSheet, Modal, Platform, StatusBar as RNStatusBar } from 'react-native';
import { colors, space, radius } from '../theme';
import { Panel, Display, Body, Btn, Input } from '../ui';
import { SystemsPicker } from '../components/SystemsPicker';
import { setCreds, setSelectedConsoles, setOnboarded } from '../storage';
import { getUserProfile } from '../ra/api';
import { syncAll, SyncProgress } from '../sync';
import { rematchCollection } from '../db';
import { CART_CONSOLES } from '../consoles';

const TOP = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 0;

export function OnboardingModal({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [systems, setSystems] = useState<number[] | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<SyncProgress | null>(null);

  const finish = async () => { await setOnboarded(); onDone(); };

  const connect = async () => {
    if (!username.trim() || !apiKey.trim()) { setStatus('Enter username and API key.'); return; }
    setBusy(true); setStatus('Verifying…');
    try {
      await setCreds(username, apiKey);
      const p = await getUserProfile({ username: username.trim(), apiKey: apiKey.trim() });
      setStatus(null);
      setUsername(p.User || username);
      setStep(1);
    } catch (e: any) {
      setStatus(String(e?.message || e));
    } finally { setBusy(false); }
  };

  const chooseNext = async () => { await setSelectedConsoles(systems); setStep(2); };

  const runSync = async () => {
    setBusy(true);
    try {
      await syncAll({ username: username.trim(), apiKey: apiKey.trim() }, setProgress, systems);
      await rematchCollection();
    } finally { setBusy(false); await finish(); }
  };

  const selCount = systems == null ? CART_CONSOLES.length : systems.length;
  const pct = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <Modal visible animationType="fade" statusBarTranslucent>
      <View style={styles.root}>
        <View style={styles.brand}>
          <Display size={18} color={colors.cyan}>RACHECKER</Display>
          <Body size={12} color={colors.inkDim} style={{ marginTop: 4 }}>Let’s get you set up</Body>
          <View style={styles.dots}>
            {[0, 1, 2].map((i) => <View key={i} style={[styles.dot, i === step && styles.dotOn]} />)}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {step === 0 && (
            <Panel style={{ gap: space.md }}>
              <Display size={13} color={colors.inkHi}>1 · Connect RetroAchievements</Display>
              <Body size={13} color={colors.inkDim}>Your Web API key stays on this device. Get it at retroachievements.org → Settings → Keys.</Body>
              <Input label="Username" value={username} onChangeText={setUsername} placeholder="RA username" />
              <Input label="Web API key" value={apiKey} onChangeText={setApiKey} placeholder="paste your key" secure />
              {status && <Body size={13} color={status.includes('Verify') ? colors.inkMid : colors.red}>{status}</Body>}
              <Btn label={busy ? 'Verifying…' : 'Connect'} variant="primary" onPress={connect} disabled={busy} />
            </Panel>
          )}

          {step === 1 && (
            <Panel style={{ gap: space.md }}>
              <Display size={13} color={colors.inkHi}>2 · Choose your systems</Display>
              <Body size={13} color={colors.inkDim}>Only sync the cartridge systems you own — fewer systems = faster. You can change this later.</Body>
              <SystemsPicker value={systems} onChange={setSystems} />
              <Btn label={`Next (${selCount} systems)`} variant="primary" onPress={chooseNext} />
            </Panel>
          )}

          {step === 2 && (
            <Panel style={{ gap: space.md }}>
              <Display size={13} color={colors.inkHi}>3 · Load the hash database</Display>
              <Body size={13} color={colors.inkDim}>Downloads the RA hashes for your {selCount} systems so scanning works offline. Takes a moment.</Body>
              {busy && (
                <View>
                  <View style={styles.track}><View style={[styles.fill, { width: `${pct}%` }]} /></View>
                  <Body size={12} color={colors.inkDim} style={{ marginTop: 6 }}>{progress ? `${progress.done}/${progress.total} · ${progress.name} · ${progress.hashCount.toLocaleString()} hashes` : 'starting…'}</Body>
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Btn label={busy ? 'Syncing…' : 'Sync now'} variant="primary" onPress={runSync} disabled={busy} style={{ flex: 1 }} />
                {!busy && <Btn label="Skip" onPress={finish} />}
              </View>
            </Panel>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: TOP },
  brand: { alignItems: 'center', paddingVertical: space.xl, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.bg2 },
  dots: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.cyan },
  content: { padding: space.lg },
  track: { height: 8, backgroundColor: colors.surface, borderRadius: 4, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.green },
});
