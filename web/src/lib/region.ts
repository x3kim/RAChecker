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

// Priority tokens for a collection row. Rows fetched from the server already
// carry the parsed columns; live scan rows don't, so they fall back to parsing
// the filename right here — same parser, same result.
export function itemTokens(item: Pick<ScanItem, 'region' | 'langs' | 'filePath' | 'innerPath'>): string[] {
  if (item.region != null || item.langs != null) {
    return tagTokens(unpackTags({ region: item.region, langs: item.langs }));
  }
  return tagTokens(parseRomTags(item.innerPath || item.filePath || ''));
}

export function itemRank(item: Parameters<typeof itemTokens>[0], priority: string[]): number {
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
