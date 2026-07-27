// System artwork (mirrors the desktop ConsoleIcon). Loads the RA static system
// image; on error falls back to the short code in a bordered box.
import { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { colors, radius } from '../theme';
import { Mono } from '../ui';
import { consoleIconUrl, consoleShort } from '../consoles';

export function ConsoleIcon({ id, size = 34 }: { id: number | null | undefined; size?: number }) {
  const [err, setErr] = useState(false);
  const url = consoleIconUrl(id);
  const short = consoleShort(id) ?? '?';
  if (!url || err) {
    return (
      <View style={[styles.fallback, { width: size, height: size }]}>
        <Mono size={Math.max(9, size * 0.34)} color={colors.inkDim}>{short.slice(0, 4)}</Mono>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={150}
      onError={() => setErr(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.surface,
  },
});
