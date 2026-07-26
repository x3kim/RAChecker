// Shared RN UI primitives styled to match the desktop (panels, buttons, section
// headers, retro text). Keeps every screen visually 1:1 with the web app.
import { ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, ViewStyle, TextStyle, StyleProp } from 'react-native';
import { colors, fonts, radius, space, textGlow } from './theme';

export function Panel({ children, style, glowColor }: { children: ReactNode; style?: StyleProp<ViewStyle>; glowColor?: string }) {
  return <View style={[styles.panel, glowColor ? { borderColor: glowColor } : null, style]}>{children}</View>;
}

// Retro pixel heading (Press Start 2P), cyan glow like the desktop brand/headers.
export function Display({ children, style, color = colors.cyan, size = 14 }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string; size?: number }) {
  return <Text style={[{ fontFamily: fonts.display, color, fontSize: size, letterSpacing: 0.5 }, textGlow(color, 10), style]}>{children}</Text>;
}

// VT323 monospace — used for stats, hashes, technical values.
export function Mono({ children, style, color = colors.inkMid, size = 18 }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string; size?: number }) {
  return <Text style={[{ fontFamily: fonts.mono, color, fontSize: size }, style]}>{children}</Text>;
}

export function Body({ children, style, color = colors.inkMid, size = 14, weight, numberOfLines }: { children: ReactNode; style?: StyleProp<TextStyle>; color?: string; size?: number; weight?: 'medium' | 'semibold' | 'bold'; numberOfLines?: number }) {
  const fam = weight === 'bold' ? fonts.bodyBold : weight === 'semibold' ? fonts.bodySemibold : weight === 'medium' ? fonts.bodyMedium : fonts.body;
  return <Text numberOfLines={numberOfLines} style={[{ fontFamily: fam, color, fontSize: size, lineHeight: size * 1.45 }, style]}>{children}</Text>;
}

// Desktop SectionHeader: an accent bar + a display-font title.
export function SectionHeader({ title, color = colors.cyan }: { title: string; color?: string }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.accentBar, { backgroundColor: color }]} />
      <Display size={12} color={colors.inkHi}>{title}</Display>
    </View>
  );
}

type BtnProps = { label: string; onPress?: () => void; variant?: 'primary' | 'default' | 'danger'; disabled?: boolean; style?: StyleProp<ViewStyle> };
export function Btn({ label, onPress, variant = 'default', disabled, style }: BtnProps) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const accent = danger ? colors.red : colors.cyan;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: colors.surface, borderColor: colors.line },
        pressed && !primary ? { borderColor: accent } : null,
        pressed ? { transform: [{ translateY: 1 }] } : null,
        disabled ? { opacity: 0.5 } : null,
        style,
      ]}
    >
      <Text style={[styles.btnLabel, { color: primary ? '#001018' : colors.inkHi }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  accentBar: { width: 4, height: 16, borderRadius: 2 },
  btn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnLabel: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.3 },
});
