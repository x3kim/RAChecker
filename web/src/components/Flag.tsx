import { useId } from 'react';
import type { Lang } from '../lib/i18n';

// Inline SVG flags. Emoji regional-indicator flags (🇩🇪/🇬🇧) do NOT render as
// flags on Windows (they show "DE"/"GB" letters), so we draw them ourselves.
export function Flag({ lang, size = 22, className = '' }: { lang: Lang; size?: number; className?: string }) {
  const w = size;
  const h = Math.round(size * 0.64);
  const box: React.CSSProperties = { display: 'inline-block', borderRadius: 3, boxShadow: '0 0 0 1px rgba(0,0,0,.25)' };

  if (lang === 'de') {
    return (
      <svg viewBox="0 0 5 3" width={w} height={h} className={className} style={box} aria-hidden="true">
        <rect width="5" height="3" fill="#000000" />
        <rect width="5" height="2" y="1" fill="#DD0000" />
        <rect width="5" height="1" y="2" fill="#FFCE00" />
      </svg>
    );
  }

  // 'en' → Union Jack (GB). clipPath ids must be unique per render instance,
  // else a second flag on the page clips against the first one's paths.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const s = `s${uid}`;
  const t = `t${uid}`;
  return (
    <svg viewBox="0 0 60 30" width={w} height={h} className={className} style={box} aria-hidden="true">
      <clipPath id={s}><path d="M0,0 v30 h60 v-30 z" /></clipPath>
      <clipPath id={t}><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath>
      <g clipPath={`url(#${s})`}>
        <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#ffffff" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${t})`} stroke="#C8102E" strokeWidth="4" />
        <path d="M30,0 v30 M0,15 h60" stroke="#ffffff" strokeWidth="10" />
        <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}
