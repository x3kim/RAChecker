// In-app changelog / version history (mirrors the desktop ChangelogModal).
import { Modal, View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Display, Mono, Body, SectionHeader } from '../ui';
import { useI18n } from '../i18n';
import { CHANGELOG } from '../version';

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <SectionHeader title={t('chg.title')} />
            <Pressable onPress={onClose} hitSlop={12}><Feather name="x" size={22} color={colors.inkMid} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingBottom: space.xl }}>
            {CHANGELOG.map((e) => (
              <Panel key={e.version} style={{ marginBottom: space.md }}>
                <View style={styles.verRow}>
                  <Display size={14} color={colors.cyan}>v{e.version}</Display>
                  <Mono size={14} color={colors.inkDim}>{e.date}</Mono>
                </View>
                <View style={{ gap: space.xs, marginTop: space.sm }}>
                  {(lang === 'de' ? e.de : e.en).map((line, i) => (
                    <View key={i} style={styles.bullet}>
                      <Body size={13} color={colors.green}>▸</Body>
                      <Body size={13} color={colors.inkMid} style={{ flex: 1 }}>{line}</Body>
                    </View>
                  ))}
                </View>
              </Panel>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg2, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.lg, maxHeight: '88%', borderWidth: 1, borderColor: colors.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  verRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bullet: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
