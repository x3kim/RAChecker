import { useState } from 'react';
import { SafeAreaView, Text, Pressable, View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { pickAndHash, HashResult } from './src/hashFile';

export default function App() {
  const [result, setResult] = useState<HashResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await pickAndHash());
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <Text style={styles.title}>RAChecker — hash proof</Text>
      <Pressable style={[styles.btn, busy && styles.btnBusy]} onPress={run} disabled={busy}>
        <Text style={styles.btnText}>{busy ? 'Hashing…' : 'Pick a ROM'}</Text>
      </Pressable>
      {error && <Text style={styles.err}>{error}</Text>}
      {result && (
        <View style={styles.card}>
          <Text style={styles.row}>file: {result.name}</Text>
          <Text style={styles.row}>rule: {result.rule ?? '(none)'}</Text>
          <Text style={styles.md5}>{result.md5}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0e14', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#22e0ff', fontSize: 18, marginBottom: 24, fontWeight: '600' },
  btn: { backgroundColor: '#22e0ff', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  btnBusy: { opacity: 0.6 },
  btnText: { color: '#001018', fontWeight: '700' },
  err: { color: '#ff6b6b', marginTop: 16, textAlign: 'center' },
  card: { marginTop: 24, padding: 16, backgroundColor: '#121821', borderRadius: 8, alignSelf: 'stretch' },
  row: { color: '#9db4d0', marginBottom: 6 },
  md5: { color: '#39ff8b', fontFamily: 'monospace', marginTop: 6 },
});
