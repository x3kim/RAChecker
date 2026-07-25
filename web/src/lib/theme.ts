export interface Theme { id: string; name: string; swatch: string; hidden?: boolean }

export const THEMES: Theme[] = [
  { id: 'cyan',      name: 'CRT Cyan',       swatch: '#22e0ff' },
  { id: 'amber',     name: 'Amber Terminal', swatch: '#ffb000' },
  { id: 'synthwave', name: 'Synthwave',      swatch: '#ff2e97' },
  { id: 'green',     name: 'Matrix',         swatch: '#39ff8b' },
  { id: 'gameboy',   name: 'Game Boy',       swatch: '#9bbc0f' },
  { id: 'light',     name: 'Light',          swatch: '#e6ebf4' },
  // Hidden themes — unlocked via easter eggs (Snake high-score / click hunt).
  { id: 'plasma',    name: 'Plasma ✦',       swatch: '#7df9ff', hidden: true },
  { id: 'gold',      name: 'Gold Cartridge ★', swatch: '#ffd24a', hidden: true },
];

const KEY = 'ra-theme';
const UNLOCK_KEY = 'ra-unlocked';

export function unlockedThemes(): string[] {
  try { const v = JSON.parse(localStorage.getItem(UNLOCK_KEY) || '[]'); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
export function unlockTheme(id: string): boolean {
  const u = unlockedThemes();
  if (u.includes(id)) return false;
  u.push(id);
  localStorage.setItem(UNLOCK_KEY, JSON.stringify(u));
  return true; // newly unlocked
}
// Themes shown in pickers: all non-hidden + any hidden ones already unlocked.
export function visibleThemes(): Theme[] {
  const u = unlockedThemes();
  return THEMES.filter((t) => !t.hidden || u.includes(t.id));
}

export function loadTheme(): string {
  const t = localStorage.getItem(KEY);
  return THEMES.some((x) => x.id === t) ? (t as string) : 'cyan';
}

export function applyTheme(id: string) {
  document.documentElement.dataset.theme = id;
  localStorage.setItem(KEY, id);
}

// ---- progress display style (bar vs ring) — user choice, bar is default ----
export type ProgressStyle = 'bar' | 'ring';
const PROG_KEY = 'ra-progress';
export function loadProgressStyle(): ProgressStyle {
  return localStorage.getItem(PROG_KEY) === 'ring' ? 'ring' : 'bar';
}
export function applyProgressStyle(s: ProgressStyle) { localStorage.setItem(PROG_KEY, s); }

// ---- aurora background toggle (animated gradient behind everything) ----
const AURORA_KEY = 'ra-aurora';
export function loadAurora(): boolean { return localStorage.getItem(AURORA_KEY) === '1'; }
export function applyAurora(on: boolean) {
  localStorage.setItem(AURORA_KEY, on ? '1' : '0');
  document.documentElement.dataset.aurora = on ? '1' : '0';
}

// UI font choice for body text & numbers. The pixel display font (Press Start
// 2P) for headings always stays — it carries the retro identity. This only
// swaps the pervasive content font. Default 'retro' keeps the VT323 look.
export interface UiFont { id: string; name: string; note: string; }

export const UI_FONTS: UiFont[] = [
  { id: 'retro',  name: 'Retro',  note: 'VT323 — Pixel-Terminal' },
  { id: 'clear',  name: 'Klar',   note: 'System-Mono — gut lesbar' },
  { id: 'modern', name: 'Modern', note: 'Inter — maximale Lesbarkeit' },
];

const FONT_KEY = 'ra-uifont';
const STACKS: Record<string, string> = {
  clear:  'ui-monospace, "Cascadia Mono", "Segoe UI Mono", Consolas, monospace',
  modern: '"Inter", system-ui, -apple-system, sans-serif',
};
const SANS = '"Inter", system-ui, -apple-system, sans-serif';

export function loadFont(): string {
  const f = localStorage.getItem(FONT_KEY);
  return UI_FONTS.some((x) => x.id === f) ? (f as string) : 'retro';
}

export function applyFont(id: string) {
  const root = document.documentElement;
  localStorage.setItem(FONT_KEY, id);
  if (id === 'retro') {
    root.style.removeProperty('--font-mono');   // fall back to stylesheet defaults
    root.style.removeProperty('--font-body');
    return;
  }
  root.style.setProperty('--font-mono', STACKS[id]);
  root.style.setProperty('--font-body', id === 'modern' ? STACKS.modern : SANS);
}
