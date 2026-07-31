// Region/language helpers for the UI. The parsing itself lives in `ra-core` and
// is shared with the server and the Android app, so a filename is read exactly
// the same way everywhere.
import {
  parseRomTags, tagTokens, rankTokens, unpackTags, langToken, isLangToken,
  tokenCode, tokenLabel, tokenName, REGION_NAMES, REGION_ORDER, LANGUAGE_NAMES,
} from 'ra-core/region.js';
import type { ScanItem } from './api';
import { api } from './api';

export {
  parseRomTags, tagTokens, rankTokens, langToken, isLangToken,
  tokenCode, tokenLabel, tokenName, REGION_NAMES, REGION_ORDER, LANGUAGE_NAMES,
};

export const NO_TAGS = 'NONE';

export type TagSource = 'ra' | 'file' | 'none';
type TaggedItem = Pick<ScanItem, 'region' | 'langs' | 'raRegion' | 'raLangs' | 'filePath' | 'innerPath'>;

/**
 * Where a row's region/language actually comes from.
 * `ra`   — the ROM name RetroAchievements stores for this hash. The file matched
 *          by content, so this describes the real dump and the filename is
 *          irrelevant. Trustworthy.
 * `file` — parsed from the filename. A guess: right for a properly named set,
 *          wrong for a renamed or sloppily named file, absent for neither.
 */
export function tagSource(item: TaggedItem): TagSource {
  if (item.raRegion || item.raLangs) return 'ra';
  if (item.region || item.langs) return 'file';
  const parsed = parseRomTags(item.innerPath || item.filePath || '');
  return parsed.regions.length || parsed.languages.length ? 'file' : 'none';
}

// Priority tokens for a collection row. RetroAchievements' own name wins per
// field; a live scan row carries no columns at all and is parsed from its
// filename right here — same parser, same result.
export function itemTokens(item: TaggedItem): string[] {
  const hasColumns = item.region != null || item.langs != null || item.raRegion != null || item.raLangs != null;
  if (hasColumns) {
    return tagTokens(unpackTags({
      region: item.raRegion || item.region,
      langs: item.raLangs || item.langs,
    }));
  }
  return tagTokens(parseRomTags(item.innerPath || item.filePath || ''));
}

export function itemRank(item: TaggedItem, priority: string[]): number {
  return rankTokens(itemTokens(item), priority);
}

// ---- the user's priority list ---------------------------------------------
// Stored server-side (so it rides along in backups and the offline package).
// Views cache it and refresh when Settings fires the event below.
export const REGION_EVENT = 'ra-region-priority';

let cache: string[] | null = null;
let inflight: Promise<string[]> | null = null;

export function cachedRegionPriority(): string[] {
  return cache ?? [];
}

export function loadRegionPriority(force = false): Promise<string[]> {
  if (!force && cache) return Promise.resolve(cache);
  if (!force && inflight) return inflight;
  inflight = api.settings()
    .then((s) => { cache = Array.isArray(s.regionPriority) ? s.regionPriority : []; return cache; })
    .catch(() => (cache = cache ?? []))
    .finally(() => { inflight = null; });
  return inflight;
}

// Called by Settings after saving so open views re-sort without a reload.
export function announceRegionPriority(list: string[]) {
  cache = list;
  window.dispatchEvent(new CustomEvent(REGION_EVENT, { detail: list }));
}
