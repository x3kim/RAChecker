import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { loadProgressStyle } from '../lib/theme';
import type { ProgressStyle } from '../lib/theme';

// Reactively track the user's bar/ring choice. Settings dispatches 'ra-progress'
// on change so existing views update without a reload.
export function useProgressStyle(): ProgressStyle {
  const [s, setS] = useState(loadProgressStyle());
  useEffect(() => {
    const h = () => setS(loadProgressStyle());
    window.addEventListener('ra-progress', h);
    return () => window.removeEventListener('ra-progress', h);
  }, []);
  return s;
}

function Ring({ value, color, size = 54, stroke = 6 }: { value: number; color: string; size?: number; stroke?: number }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ * (1 - value / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-crt-line)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ}
        initial={{ strokeDashoffset: reduce ? off : circ }}
        animate={{ strokeDashoffset: off }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 90, damping: 20 }}
        style={{ filter: `drop-shadow(0 0 5px ${color}66)` }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        transform={`rotate(90 ${size / 2} ${size / 2})`}
        style={{ fontFamily: 'var(--font-mono)', fontSize: size * 0.26, fill: color }}>{Math.round(value)}%</text>
    </svg>
  );
}

// Unified completion indicator. Renders a bar or a ring per the user's setting.
// Use for semantic "% complete" (mastery, game completion, playable ratio) —
// NOT for scan/sync loading bars.
export function Pct({ value, color = 'var(--color-neon-cyan)', heightClass = 'h-2', ringSize = 54, mode }: {
  value: number; color?: string; heightClass?: string; ringSize?: number; mode?: ProgressStyle;
}) {
  const setting = useProgressStyle();
  const style = mode ?? setting;
  const reduce = useReducedMotion();
  const v = Math.max(0, Math.min(100, value || 0));
  if (style === 'ring') return <Ring value={v} color={color} size={ringSize} />;
  return (
    <div className={`progress-track ${heightClass}`}>
      <motion.div className="progress-fill"
        initial={{ width: reduce ? `${v}%` : 0 }}
        animate={{ width: `${v}%` }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 24 }} />
    </div>
  );
}
