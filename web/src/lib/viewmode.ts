// Shared "card vs table" view-mode preference, persisted per view in
// localStorage so each list view (Games, Collection, Mastery, …) remembers how
// the user likes to see it.
import { useState } from 'react';

export type ViewMode = 'card' | 'table';

export function useViewMode(key: string, def: ViewMode = 'card'): [ViewMode, (m: ViewMode) => void] {
  const storageKey = `ra-view-${key}`;
  const [mode, setMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem(storageKey);
      if (v === 'table' || v === 'card') return v;
    } catch { /* localStorage unavailable */ }
    return def;
  });
  const set = (m: ViewMode) => {
    setMode(m);
    try { localStorage.setItem(storageKey, m); } catch { /* ignore */ }
  };
  return [mode, set];
}
