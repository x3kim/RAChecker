import { useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator, Platform, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native';

const TOP_INSET = Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : 0;
import { useFonts, PressStart2P_400Regular } from '@expo-google-fonts/press-start-2p';
import { VT323_400Regular } from '@expo-google-fonts/vt323';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { colors, fonts, space, radius, textGlow } from './src/theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from './src/ui';
import { pickAndHash, HashResult } from './src/hashFile';

export default function App() {
  const [fontsLoaded] = useFonts({
    PressStart2P_400Regular,
    VT323_400Regular,
    Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold,
  });

  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await pickAndHash();
      if (r) setResult(r);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  if (!fontsLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.cyan} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />

      {/* brand header — matches the desktop wordmark */}
      <View style={styles.header}>
        <View style={styles.logoMark}>
          <Display size={16} color={colors.cyan}>RA</Display>
        </View>
        <View>
          <Display size={15} color={colors.inkHi}>RACHECKER</Display>
          <Body size={11} color={colors.inkDim} style={{ marginTop: 2 }}>ROM ⇄ Achievement Scanner</Body>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* hero */}
        <View style={{ marginBottom: space.lg }}>
          <Display size={18} color={colors.inkHi} style={{ lineHeight: 28 }}>Which ROMs earn achievements?</Display>
          <Body size={14} color={colors.inkMid} style={{ marginTop: space.md }}>
            Hash a ROM on your device and check it against RetroAchievements — the exact same hashing rules as the desktop app, running on your phone.
          </Body>
        </View>

        {/* scan panel */}
        <Panel style={{ marginBottom: space.lg }}>
          <SectionHeader title="ON-DEVICE SCAN" />
          <Body size={13} color={colors.inkDim} style={{ marginBottom: space.md }}>
            Pick a cartridge ROM (.nes, .snes/.sfc, .gb/.gbc/.gba, .n64/.z64, .md …). Disc systems need RAHasher and aren’t supported on mobile yet.
          </Body>
          <Btn label={busy ? 'Hashing…' : 'Pick a ROM'} variant="primary" onPress={run} disabled={busy} />

          {error && (
            <View style={[styles.resultBox, { borderColor: colors.red }]}>
              <Body size={13} color={colors.red}>{error}</Body>
            </View>
          )}

          {result && !error && (
            <View style={styles.resultBox}>
              <View style={styles.resultRow}>
                <Body size={12} color={colors.inkDim} weight="medium">FILE</Body>
                <Body size={13} color={colors.inkHi} style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{result.name}</Body>
              </View>
              <View style={styles.resultRow}>
                <Body size={12} color={colors.inkDim} weight="medium">RULE</Body>
                <Mono size={17} color={colors.inkMid}>{result.rule ?? '(none)'}</Mono>
              </View>
              <View style={styles.hashRow}>
                <Body size={12} color={colors.inkDim} weight="medium">RA HASH (MD5)</Body>
                <Mono size={20} color={colors.green} style={[{ marginTop: 4 }, textGlow(colors.green, 8)]}>{result.md5}</Mono>
              </View>
            </View>
          )}
        </Panel>

        {/* footer note */}
        <Body size={12} color={colors.inkDim} style={{ textAlign: 'center', marginTop: space.md }}>
          Proof build · shared hashing core · v0.1.0
        </Body>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingTop: TOP_INSET },
  loading: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg2,
  },
  logoMark: {
    width: 40, height: 40, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.cyan,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  content: { padding: space.lg, paddingBottom: space.xxl },
  resultBox: {
    marginTop: space.lg,
    padding: space.md,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    gap: space.sm,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  hashRow: { marginTop: space.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm },
});
