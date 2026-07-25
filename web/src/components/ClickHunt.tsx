import { useState } from 'react';
import type { CSSProperties } from 'react';

// Five faintly-glowing spots scattered around the edges. They twinkle (not
// invisible) and glow on hover. Click all five → onComplete fires (parent
// unlocks the Gold theme). Progress persists across reloads.
const SPOTS: CSSProperties[] = [
  { top: 72, left: 10 },
  { bottom: 70, left: 14 },
  { top: '42%', right: 8 },
  { bottom: 12, left: '52%' },
  { top: 132, right: '28%' },
];
const KEY = 'ra-hunt';

export function ClickHunt({ done, onComplete }: { done: boolean; onComplete: () => void }) {
  const [found, setFound] = useState<Set<number>>(() => {
    try { return new Set<number>(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
  });
  if (done) return null;

  const click = (i: number) => {
    const next = new Set(found); next.add(i);
    setFound(next);
    localStorage.setItem(KEY, JSON.stringify([...next]));
    if (next.size >= SPOTS.length) { localStorage.removeItem(KEY); onComplete(); }
  };

  return (
    <>
      {SPOTS.map((pos, i) => found.has(i) ? null : (
        <button key={i} className="hunt-spot" style={pos} title="✦" aria-label="hidden spot" onClick={() => click(i)} />
      ))}
    </>
  );
}
