import { useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { colors, space, radius, textGlow } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader, Btn } from '../ui';
import { pickAndHash, HashResult } from '../hashFile';

export function ScanScreen() {
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

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ marginBottom: space.lg }}>
        <Display size={17} color={colors.inkHi} style={{ lineHeight: 27 }}>Which ROMs earn achievements?</Display>
        <Body size={14} color={colors.inkMid} style={{ marginTop: space.md }}>
          Hash a ROM on your device — the exact same rules as the desktop app. Matching against RetroAchievements comes with the hash-DB sync (next update).
        </Body>
      </View>

      <Panel>
        <SectionHeader title="ON-DEVICE SCAN" />
        <Body size={13} color={colors.inkDim} style={{ marginBottom: space.md }}>
          Pick a cartridge ROM (.nes, .sfc/.smc, .gb/.gbc/.gba, .n64/.z64, .md …). Disc systems need RAHasher and aren’t supported on mobile yet.
        </Body>
        <Btn label={busy ? 'Hashing…' : 'Pick a ROM'} variant="primary" onPress={run} disabled={busy} />

        {error && (
          <View style={[styles.resultBox, { borderColor: colors.red }]}>
            <Body size={13} color={colors.red}>{error}</Body>
          </View>
        )}

        {result && !error && (
          <View style={styles.resultBox}>
            <View style={styles.row}>
              <Body size={12} color={colors.inkDim} weight="medium">FILE</Body>
              <Body size={13} color={colors.inkHi} style={{ flex: 1, textAlign: 'right' }} numberOfLines={2}>{result.name}</Body>
            </View>
            <View style={styles.row}>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  hashRow: { marginTop: space.xs, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm },
});
