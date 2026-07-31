// Small region/language badges shown on collection and scan rows.
// Regions are the primary signal (cyan), languages are secondary (dim) — a
// "(Europe) (En,Fr,De)" ROM should read as "EU" first and its languages after.
//
// A dashed outline means the value was read off the FILENAME and is therefore
// only as good as the file's name. A solid outline means it came from the ROM
// name RetroAchievements stores for that exact hash, which no amount of
// renaming can get wrong.
import { itemTokens, tagSource, isLangToken, tokenLabel, tokenName } from '../lib/region';
import type { TagSource } from '../lib/region';
import type { ScanItem } from '../lib/api';
import { useI18n } from '../lib/i18n';

export function TagBadge({ token, preferred = false, source = 'file', hint = '' }: {
  token: string; preferred?: boolean; source?: TagSource; hint?: string;
}) {
  const lang = isLangToken(token);
  const color = preferred
    ? 'var(--color-neon-green)'
    : lang ? 'var(--color-ink-dim)' : 'var(--color-neon-cyan)';
  return (
    <span
      title={hint ? `${tokenName(token)} — ${hint}` : tokenName(token)}
      className="inline-flex items-center rounded px-1.5 font-mono text-sm leading-5"
      style={{
        border: `1px ${source === 'ra' ? 'solid' : 'dashed'} ${color}`,
        color,
        opacity: lang && !preferred ? 0.85 : 1,
      }}
    >
      {tokenLabel(token)}
    </span>
  );
}

/**
 * Badges for one row. `priority` only decides which badge is highlighted —
 * nothing is hidden, so a file's real tags are always visible.
 */
export function RegionBadges({ item, priority = [], max = 4 }: {
  item: Pick<ScanItem, 'region' | 'langs' | 'raRegion' | 'raLangs' | 'filePath' | 'innerPath'>;
  priority?: string[];
  max?: number;
}) {
  const { t } = useI18n();
  const tokens = itemTokens(item);
  if (!tokens.length) return null;
  const source = tagSource(item);
  const hint = source === 'ra' ? t('region.srcRa') : t('region.srcFile');
  // The one token that wins the priority comparison for this row.
  let best: string | null = null;
  let bestAt = Infinity;
  for (const tok of tokens) {
    const i = priority.indexOf(tok);
    if (i >= 0 && i < bestAt) { bestAt = i; best = tok; }
  }
  const shown = tokens.slice(0, max);
  return (
    <span className="inline-flex items-center gap-1 flex-wrap align-middle">
      {shown.map((tok) => <TagBadge key={tok} token={tok} preferred={tok === best} source={source} hint={hint} />)}
      {tokens.length > shown.length && (
        <span className="font-mono text-sm text-ink-dim" title={tokens.map(tokenName).join(', ')}>
          +{tokens.length - shown.length}
        </span>
      )}
    </span>
  );
}
