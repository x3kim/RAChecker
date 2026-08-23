import type { ScanStatus } from './api';
import { currentLang, translate } from './i18n';

export function fmtBytes(n?: number): string {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function fmtDate(ms?: number | null): string {
  const lang = currentLang();
  if (!ms) return translate(lang, 'time.never');
  const d = new Date(ms);
  return d.toLocaleString(lang === 'de' ? 'de-DE' : lang === 'ja' ? 'ja-JP' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtAgo(ms?: number | null): string {
  const lang = currentLang();
  if (!ms) return translate(lang, 'time.never');
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return translate(lang, 'time.justnow');
  if (s < 3600) return translate(lang, 'time.minAgo', { n: Math.floor(s / 60) });
  if (s < 86400) return translate(lang, 'time.hourAgo', { n: Math.floor(s / 3600) });
  const days = Math.floor(s / 86400);
  return translate(lang, days === 1 ? 'time.dayAgo' : 'time.daysAgo', { n: days });
}

// Localized status label / help (status colors + icons stay in STATUS_META).
export function statusLabel(status: ScanStatus): string { return translate(currentLang(), `status.${status}`); }
export function statusHelp(status: ScanStatus): string { return translate(currentLang(), `statushelp.${status}`); }

export function basename(p: string): string {
  return p.split(/[\\/]/).pop() || p;
}

export const STATUS_META: Record<ScanStatus, { label: string; color: string; glow?: string; icon: string }> = {
  match:          { label: 'MIT ERFOLGEN', color: 'var(--color-neon-green)',   glow: 'var(--shadow-glow-green)',   icon: '✓' },
  no_match:       { label: 'KEIN MATCH',  color: 'var(--color-neon-red)',     icon: '✕' },
  needs_rahasher: { label: 'RAHASHER',    color: 'var(--color-neon-amber)',   glow: 'var(--shadow-glow-amber)',   icon: '⚙' },
  ambiguous:      { label: 'UNKLAR',      color: 'var(--color-neon-purple)',  icon: '?' },
  unsupported:    { label: 'N/A',         color: 'var(--color-ink-dim)',      icon: '–' },
  error:          { label: 'FEHLER',      color: 'var(--color-neon-red)',     icon: '!' },
  skipped:        { label: 'ÜBERSPRUNGEN',color: 'var(--color-ink-dim)',      icon: '»' },
};

// Short explanations per status — shown as tooltips on the scan/library status
// chips, so the "legend" lives where the statuses actually appear.
export const STATUS_HELP: Partial<Record<ScanStatus, string>> = {
  match: 'Hash matcht — hier kannst du Erfolge freischalten.',
  no_match: 'Andere ROM-Version — RA kennt diesen Hash nicht, keine Erfolge möglich.',
  needs_rahasher: 'Disc-/Spezial-System — braucht das RAHasher-Tool.',
  ambiguous: 'System nicht eindeutig erkennbar.',
  unsupported: 'Dieses System/Format unterstützt keine Erfolge.',
  error: 'Beim Prüfen ist ein Fehler aufgetreten.',
  skipped: 'Übersprungen (z.B. unbekannte Dateiendung).',
};

export function pct(a: number, b: number): number {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}

// Build a CSV string from a header + rows. Fields are quoted and quotes escaped.
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
}

// Trigger a client-side download of text content (no server round-trip).
export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob(['﻿' + text], { type: `${mime};charset=utf-8` }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
