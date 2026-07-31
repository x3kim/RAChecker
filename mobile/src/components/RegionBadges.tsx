// Region/language badges for a scan or collection row. The parsing comes from
// the shared core (core/region.js), so a filename reads exactly the same here as
// it does in the desktop app.
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '../theme';
import { Mono } from '../ui';
import { parseRomTags, tagTokens, isLangToken, tokenLabel } from '../core';

/**
 * `raRegion`/`raLangs` come from RetroAchievements' own ROM name for that hash
 * and win over anything the filename claims. A dashed outline marks the values
 * that are only a guess from the filename.
 */
export function RegionBadges({ name, raRegion, raLangs, priority = [], max = 4 }: {
  name: string; raRegion?: string; raLangs?: string; priority?: string[]; max?: number;
}) {
  const verified = !!(raRegion || raLangs);
  const tokens: string[] = verified
    ? tagTokens({
      regions: String(raRegion ?? '').split(',').filter(Boolean),
      languages: String(raLangs ?? '').split(',').filter(Boolean),
    })
    : tagTokens(parseRomTags(name));
  if (!tokens.length) return null;

  // Highlight the single token that wins the preference comparison.
  let best: string | null = null;
  let bestAt = Infinity;
  for (const tok of tokens) {
    const i = priority.indexOf(tok);
    if (i >= 0 && i < bestAt) { bestAt = i; best = tok; }
  }

  const shown = tokens.slice(0, max);
  return (
    <View style={styles.wrap}>
      {shown.map((tok) => {
        const color = tok === best ? colors.green : isLangToken(tok) ? colors.inkDim : colors.cyan;
        return (
          <View key={tok} style={[styles.badge, { borderColor: color, borderStyle: verified ? 'solid' : 'dashed' }]}>
            <Mono size={13} color={color}>{tokenLabel(tok)}</Mono>
          </View>
        );
      })}
      {tokens.length > shown.length && <Mono size={13} color={colors.inkDim}>+{tokens.length - shown.length}</Mono>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 4, paddingVertical: 0 },
});
