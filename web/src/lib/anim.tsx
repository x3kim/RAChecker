// Small animation helpers built on the (already-installed) `motion` lib, with a
// graceful fallback when the user prefers reduced motion. Keeps the retro look —
// these are subtle springs/fades, not flashy.
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';

export { motion, useReducedMotion };

// Animated number that counts from its previous value to the new one.
export function CountUp({ value, format, className, durationMs = 850 }: {
  value: number; format?: (n: number) => string; className?: string; durationMs?: number;
}) {
  const reduce = useReducedMotion();
  const [disp, setDisp] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    if (reduce) { setDisp(value); fromRef.current = value; return; }
    const from = fromRef.current, to = value, start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisp(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick); else { fromRef.current = to; setDisp(to); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, durationMs]);
  const n = Math.round(disp);
  return <span className={className}>{format ? format(n) : n.toLocaleString('de-DE')}</span>;
}

// Spring "pop" used for modals.
export const popSpring = { type: 'spring' as const, stiffness: 380, damping: 30, mass: 0.7 };

// Subtle page transition: fade + slight rise when the active view changes.
// Pass a `k` that changes per view (the tab id) so it remounts and replays.
export function ViewFade({ k, children }: { k: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <div key={k}>{children}</div>;
  return (
    <motion.div key={k} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}>
      {children}
    </motion.div>
  );
}

// Staggered fade-in container + item. Wrap a list in <Stagger> and each child in
// <StaggerItem> (or pass index for delay).
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div className={className} initial="hidden" animate="show"
      variants={{ show: { transition: { staggerChildren: 0.04 } } }}>
      {children}
    </motion.div>
  );
}
export function StaggerItem({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className} style={style}>{children}</div>;
  return (
    <motion.div className={className} style={style}
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } } }}>
      {children}
    </motion.div>
  );
}
