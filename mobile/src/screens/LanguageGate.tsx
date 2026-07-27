// First-run language picker (mirrors the desktop LanguageGate). Shown once when
// no language has been chosen yet.
import { View, StyleSheet, Pressable } from 'react-native';
import { colors, space, radius } from '../theme';
import { Display, Body } from '../ui';
import { Lang, translate } from '../i18n';

export function LanguageGate({ onPick }: { onPick: (l: Lang) => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.logo}><Display size={22} color={colors.cyan}>RA</Display></View>
      <Display size={16} color={colors.inkHi} style={{ marginTop: space.lg }}>RACHECKER</Display>
      <Body size={14} color={colors.inkMid} style={{ marginTop: space.sm, textAlign: 'center' }}>
        {translate('en', 'gate.title')} · {translate('de', 'gate.title')}
      </Body>
      <View style={styles.row}>
        {(['en', 'de'] as Lang[]).map((l) => (
          <Pressable key={l} onPress={() => onPick(l)} style={styles.btn}>
            <Display size={14} color={colors.cyan}>{l === 'en' ? 'EN' : 'DE'}</Display>
            <Body size={13} color={colors.inkMid} style={{ marginTop: 4 }}>{l === 'en' ? 'English' : 'Deutsch'}</Body>
          </Pressable>
        ))}
      </View>
      <Body size={12} color={colors.inkDim} style={{ marginTop: space.lg, textAlign: 'center' }}>
        {translate('en', 'gate.sub')}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  logo: { width: 64, height: 64, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.cyan, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: space.md, marginTop: space.xl },
  btn: { width: 120, alignItems: 'center', paddingVertical: space.lg, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
});
