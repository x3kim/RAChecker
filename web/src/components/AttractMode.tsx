import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppStatus } from '../lib/api';
import { api } from '../lib/api';

// Arcade "attract mode": after a stretch of inactivity the app falls into a
// retro screensaver — a logo bouncing DVD-style, blinking INSERT COIN, and the
// time-honoured payoff of nailing an exact corner. Any input wakes it.
const IDLE_MS = 90_000;
const COLORS = ['--color-neon-cyan', '--color-neon-green', '--color-neon-magenta', '--color-neon-amber', '--color-neon-purple'];

export function AttractMode({ status }: { status: AppStatus | null }) {
  const [active, setActive] = useState(false);
  const [corner, setCorner] = useState(false);
  const logoRef = useRef<HTMLDivElement | null>(null);

  // Rotating live stats — pulled from the app status plus a lazy collection
  // fetch the first time the screensaver kicks in (so it shows real numbers,
  // not a single static line).
  const [lib, setLib] = useState<{ total: number; matched: number } | null>(null);
  const [statIdx, setStatIdx] = useState(0);
  useEffect(() => {
    if (!active || lib) return;
    api.libraryStats().then((s) => {
      const matched = (s.byConsole || []).reduce((a, c) => a + (c.matched || 0), 0);
      setLib({ total: s.total || 0, matched });
    }).catch(() => {});
  }, [active, lib]);

  const stats = useMemo(() => {
    const out: string[] = [];
    if (status) {
      out.push(`${status.totals.hashes.toLocaleString('de-DE')} HASHES`);
      out.push(`${status.totals.games.toLocaleString('de-DE')} SPIELE IN DER DB`);
      const sys = (status.consoles || []).filter((c) => c.gameCount > 0).length;
      if (sys) out.push(`${sys} SYSTEME`);
    }
    if (lib) {
      if (lib.total) out.push(`${lib.total.toLocaleString('de-DE')} ROMS IN SAMMLUNG`);
      if (lib.matched) out.push(`${lib.matched.toLocaleString('de-DE')} MIT ERFOLGEN`);
    }
    const rm = status?.watch?.recentMatches?.find((m) => m.title);
    if (rm?.title) out.push(`ZULETZT GEFUNDEN: ${rm.title.toUpperCase()}`);
    return out;
  }, [status, lib]);

  // Advance the rotating stat while attract mode is on.
  useEffect(() => {
    if (!active || stats.length <= 1) return;
    const h = window.setInterval(() => setStatIdx((i) => i + 1), 3500);
    return () => window.clearInterval(h);
  }, [active, stats.length]);

  // Idle detection (mounted once). Any interaction wakes us and re-arms.
  useEffect(() => {
    let timer = 0;
    const arm = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setActive(true), IDLE_MS); };
    const wake = () => { setActive(false); arm(); };
    const evs: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    arm();
    return () => { evs.forEach((e) => window.removeEventListener(e, wake)); window.clearTimeout(timer); };
  }, []);

  // Bounce loop, runs only while attract mode is on.
  useEffect(() => {
    if (!active) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = logoRef.current;
    if (!el) return;
    let x = 90, y = 90, vx = 2.5, vy = 2.0, ci = 0, raf = 0;
    const step = () => {
      const w = window.innerWidth, h = window.innerHeight;
      const bw = el.offsetWidth, bh = el.offsetHeight;
      x += vx; y += vy;
      let walls = 0;
      if (x <= 0) { x = 0; vx = Math.abs(vx); walls++; }
      else if (x + bw >= w) { x = w - bw; vx = -Math.abs(vx); walls++; }
      if (y <= 0) { y = 0; vy = Math.abs(vy); walls++; }
      else if (y + bh >= h) { y = h - bh; vy = -Math.abs(vy); walls++; }
      if (walls > 0) { ci = (ci + 1) % COLORS.length; const c = `var(${COLORS[ci]})`; el.style.color = c; el.style.borderColor = c; }
      if (walls >= 2) { setCorner(true); window.setTimeout(() => setCorner(false), 4000); } // exact corner!
      el.style.transform = `translate(${x}px, ${y}px)`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[80] overflow-hidden cursor-none" style={{ background: 'rgba(4,6,12,.94)' }}>
      <div ref={logoRef} className="absolute top-0 left-0 font-display text-sm flex items-center gap-2 px-4 py-3 rounded-xl whitespace-nowrap"
        style={{ color: 'var(--color-neon-cyan)', border: '2px solid var(--color-neon-cyan)', willChange: 'transform' }}>
        🎮 RACHECKER
      </div>

      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center pointer-events-none px-6">
        <div className="font-display text-xl sm:text-2xl text-glow-cyan animate-blink">▶ INSERT COIN</div>
        {stats.length > 0 && (
          <div key={statIdx} className="font-mono text-glow-cyan mt-5 text-base sm:text-lg attract-stat">
            {stats[statIdx % stats.length]}
          </div>
        )}
        <div className="font-mono text-ink-dim mt-6 text-sm">— bewegen zum Fortfahren —</div>
      </div>

      {corner && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="font-display text-lg sm:text-xl text-glow-green animate-blink" style={{ textShadow: '0 0 22px rgba(57,255,139,.85)' }}>
            🏆 ECKENTREFFER!
          </div>
        </div>
      )}
    </div>
  );
}
