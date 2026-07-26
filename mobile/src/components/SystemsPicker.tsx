import { View, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, space, radius } from '../theme';
import { Body } from '../ui';
import { CART_CONSOLES } from '../consoles';

// value: null = all systems; array = the chosen subset. onChange emits null when
// everything is selected (so "all" persists as "no filter").
export function SystemsPicker({ value, onChange }: { value: number[] | null; onChange: (v: number[] | null) => void }) {
  const all = CART_CONSOLES.map((c) => c.id);
  const sel = value == null ? new Set(all) : new Set(value);

  const toggle = (id: number) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next.size === all.length ? null : [...next]);
  };
  const setAll = (on: boolean) => onChange(on ? null : []);

  return (
    <View>
      <View style={styles.head}>
        <Body size={12} color={colors.inkDim} weight="medium">{sel.size}/{all.length} systems</Body>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Pressable onPress={() => setAll(true)}><Body size={12} color={colors.cyan}>All</Body></Pressable>
          <Pressable onPress={() => setAll(false)}><Body size={12} color={colors.inkDim}>None</Body></Pressable>
        </View>
      </View>
      <View style={styles.grid}>
        {CART_CONSOLES.map((c) => {
          const on = sel.has(c.id);
          return (
            <Pressable key={c.id} onPress={() => toggle(c.id)} style={[styles.chip, on && styles.chipOn]}>
              <Feather name={on ? 'check-square' : 'square'} size={13} color={on ? colors.cyan : colors.inkDim} />
              <Body size={12} color={on ? colors.inkHi : colors.inkMid} numberOfLines={1}>{c.name}</Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 10, backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.cyan },
});
