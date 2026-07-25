// Live-tunable CRT look (scanlines, grid, flicker). Bound to CSS variables on
// :root so changes apply instantly and persist across sessions.
export interface CrtSettings { scan: number; grid: number; flicker: boolean }
const KEY = 'ra-crt';
export const CRT_DEFAULTS: CrtSettings = { scan: 0.16, grid: 0.5, flicker: false };

export function loadCrt(): CrtSettings {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v ? { ...CRT_DEFAULTS, ...v } : { ...CRT_DEFAULTS }; }
  catch { return { ...CRT_DEFAULTS }; }
}

export function applyCrt(s: CrtSettings) {
  const root = document.documentElement;
  root.style.setProperty('--scanline-alpha', String(s.scan));
  root.style.setProperty('--grid-opacity', String(s.grid));
  root.dataset.flicker = s.flicker ? '1' : '0';
  localStorage.setItem(KEY, JSON.stringify(s));
}

export function isCrtDefault(s: CrtSettings) {
  return s.scan === CRT_DEFAULTS.scan && s.grid === CRT_DEFAULTS.grid && s.flicker === CRT_DEFAULTS.flicker;
}
