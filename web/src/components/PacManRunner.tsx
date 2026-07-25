import { useEffect, useRef, useState } from 'react';

// Steerable Pac-Man (type "waka"). Arrow ←/→ drive him along the bottom strip;
// eat the pellets. Auto-despawns after all pellets are eaten or ~14s. Returns
// the score via onDone so the parent can toast it.
export function PacManRunner({ onDone }: { onDone: (score: number) => void }) {
  const [x, setX] = useState(-50);
  const [facing, setFacing] = useState(1);
  const [eaten, setEaten] = useState<Set<number>>(new Set());
  const [ghostX, setGhostX] = useState(-150);
  const xRef = useRef(-50);
  const dirRef = useRef(1);
  const ghostRef = useRef(-150);
  const eatenRef = useRef<Set<number>>(new Set());
  const doneRef = useRef(false);

  // pellets evenly across the viewport
  const pellets = useRef<number[]>([]);
  if (pellets.current.length === 0) {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1200;
    for (let px = 60; px < w - 30; px += Math.max(60, w / 20)) pellets.current.push(px);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); dirRef.current = -1; setFacing(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); dirRef.current = 1; setFacing(1); }
      else if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey, true);

    const start = performance.now();
    let raf = 0;
    const speed = 4.2;
    const tick = (now: number) => {
      xRef.current += dirRef.current * speed;
      const w = window.innerWidth;
      if (xRef.current < -60) xRef.current = w + 40;       // wrap
      if (xRef.current > w + 60) xRef.current = -40;
      setX(xRef.current);
      // ghost chases with lag
      ghostRef.current += Math.sign(xRef.current - ghostRef.current) * (speed * 0.7);
      setGhostX(ghostRef.current);
      // eat
      pellets.current.forEach((px, i) => {
        if (!eatenRef.current.has(i) && Math.abs(px - xRef.current) < 18) {
          eatenRef.current.add(i); setEaten(new Set(eatenRef.current));
        }
      });
      if (eatenRef.current.size >= pellets.current.length || now - start > 14000) { finish(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    function finish() {
      if (doneRef.current) return; doneRef.current = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey, true);
      onDone(eatenRef.current.size);
    }
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-x-0 z-[60] pointer-events-none" style={{ bottom: 78, height: 60 }}>
      {pellets.current.map((px, i) => eaten.has(i) ? null : (
        <span key={i} className="pac-pellet" style={{ left: px, animation: 'none', opacity: 1 }} />
      ))}
      <div className="pac-ghost" style={{ left: ghostX, animation: 'none' }}>
        <span className="pac-ghost-eye" style={{ left: 9 }} />
        <span className="pac-ghost-eye" style={{ left: 23 }} />
      </div>
      <div className="pac-man" style={{ left: x, animation: 'pac-chomp .26s steps(1) infinite', transform: facing < 0 ? 'scaleX(-1)' : 'none' }}>
        <span className="pac-eye" />
      </div>
      <div className="fixed left-1/2 -translate-x-1/2 font-mono text-sm text-neon-amber" style={{ bottom: 150 }}>
        ←/→ · {eaten.size}/{pellets.current.length} 🟡
      </div>
    </div>
  );
}
