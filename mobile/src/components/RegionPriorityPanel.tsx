// "Which version do I want to play?" — the ordered region/language preference,
// mirrored from the desktop Settings panel. It only ever re-orders things: an
// empty list means no preference and every list keeps the sorting it had.
import { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Panel, Mono, Body, SectionHeader, Btn } from '../ui';
import { getRegionPriority, setRegionPriority } from '../storage';
import { useI18n } from '../i18n';
import { REGION_ORDER, REGION_NAMES, LANGUAGE_NAMES, langToken, isLangToken, tokenLabel, tokenName } from '../core';

const LANG_CHOICES = ['ja', 'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'ru', 'zh', 'ko', 'pl'];

const PRESETS: { key: string; list: string[] }[] = [
  { key: 'set.regionPresetJp', list: ['JP', langToken('ja')] },
  { key: 'set.regionPresetEn', list: [langToken('en'), 'US', 'EU', 'WORLD'] },
  { key: 'set.regionPresetDe', list: [langToken('de'), 'DE', 'EU'] },
];

export function RegionPriorityPanel() {
  const { t } = useI18n();
  const [list, setList] = useState<string[]>([]);
  const [adding, setAdding] = useState<'region' | 'lang' | null>(null);

  useEffect(() => { getRegionPriority().then(setList); }, []);

  // Every change is persisted right away — there is no "save" button on mobile.
  const commit = (next: string[]) => { setList(next); setRegionPriority(next); };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= list.length) return;
    const n = [...list];
    [n[i], n[j]] = [n[j], n[i]];
    commit(n);
  };

  return (
    <Panel style={{ marginTop: space.lg }}>
      <SectionHeader title={t('set.region')} color={colors.purple} />
      <Body size={12} color={colors.inkDim} style={{ marginBottom: space.md }}>{t('set.regionDesc')}</Body>

      {list.length === 0 && (
        <Body size={12} color={colors.inkDim} style={{ marginBottom: space.sm }}>{t('set.regionEmpty')}</Body>
      )}

      <View style={{ gap: space.sm }}>
        {list.map((tok, i) => (
          <View key={tok} style={styles.row}>
            <Mono size={16} color={colors.cyan} style={{ width: 18 }}>{i + 1}</Mono>
            <View style={[styles.badge, { borderColor: isLangToken(tok) ? colors.inkDim : colors.cyan }]}>
              <Mono size={14} color={isLangToken(tok) ? colors.inkMid : colors.cyan}>{tokenLabel(tok)}</Mono>
            </View>
            <Body size={12} color={colors.inkHi} numberOfLines={1} style={{ flex: 1 }}>{tokenName(tok)}</Body>
            <Pressable onPress={() => move(i, -1)} disabled={i === 0} style={styles.iconBtn} hitSlop={6}>
              <Feather name="arrow-up" size={16} color={i === 0 ? colors.line : colors.inkMid} />
            </Pressable>
            <Pressable onPress={() => move(i, 1)} disabled={i === list.length - 1} style={styles.iconBtn} hitSlop={6}>
              <Feather name="arrow-down" size={16} color={i === list.length - 1 ? colors.line : colors.inkMid} />
            </Pressable>
            <Pressable onPress={() => commit(list.filter((x) => x !== tok))} style={styles.iconBtn} hitSlop={6}>
              <Feather name="x" size={16} color={colors.red} />
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.actions}>
        <Btn label={t('set.regionAddRegion')} onPress={() => setAdding(adding === 'region' ? null : 'region')} style={{ flex: 1 }} />
        <Btn label={t('set.regionAddLang')} onPress={() => setAdding(adding === 'lang' ? null : 'lang')} style={{ flex: 1 }} />
      </View>

      {adding && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickRow}>
          {(adding === 'region' ? REGION_ORDER : LANG_CHOICES).map((code: string) => {
            const tok = adding === 'region' ? code : langToken(code);
            const on = list.includes(tok);
            const name = adding === 'region' ? (REGION_NAMES[code] ?? code) : (LANGUAGE_NAMES[code] ?? code);
            return (
              <Pressable key={tok} disabled={on} onPress={() => { commit([...list, tok]); setAdding(null); }}
                style={[styles.pick, on && { opacity: 0.35 }]}>
                <Mono size={14} color={colors.inkHi}>{code}</Mono>
                <Body size={10} color={colors.inkDim} numberOfLines={1}>{name}</Body>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.presets}>
        <Body size={12} color={colors.inkDim}>{t('set.regionPresets')}</Body>
        {PRESETS.map((p) => (
          <Pressable key={p.key} onPress={() => commit(p.list)} style={styles.preset}>
            <Body size={12} color={colors.cyan}>{t(p.key)}</Body>
          </Pressable>
        ))}
        {list.length > 0 && (
          <Pressable onPress={() => commit([])} style={styles.preset}>
            <Body size={12} color={colors.red}>{t('set.regionClear')}</Body>
          </Pressable>
        )}
      </View>

      <Body size={11} color={colors.inkDim} style={{ marginTop: space.sm }}>{t('set.regionNote')}</Body>
    </Panel>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: space.sm, paddingVertical: 6, backgroundColor: colors.surface,
  },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 5 },
  iconBtn: { padding: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.md },
  pickRow: { gap: space.sm, paddingVertical: space.sm, paddingRight: space.sm },
  pick: {
    alignItems: 'center', minWidth: 54,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: space.sm, paddingVertical: 4, backgroundColor: colors.panel,
  },
  presets: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap', marginTop: space.md },
  preset: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space.sm, paddingVertical: 4 },
});
