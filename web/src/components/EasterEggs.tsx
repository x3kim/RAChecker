import { useEffect, useRef, useState } from 'react';
import { Trophy } from 'lucide-react';
import { applyTheme, unlockTheme, unlockedThemes } from '../lib/theme';
import { SnakeGame } from './SnakeGame';
import { CrtControls } from './CrtControls';
import { ClickHunt } from './ClickHunt';
import { PacManRunner } from './PacManRunner';
import { useI18n } from '../lib/i18n';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

interface Toast { id: number; title: string; desc: string; points: number; }

// Tiny WebAudio synth for the classic two-note coin blip — no audio assets.
let audioCtx: AudioContext | null = null;
function playCoin() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now);        // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.56);
  } catch { /* audio not available */ }
}

// Pac-Man "waka waka" — two quick alternating blips per chomp.
function playWaka() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    const ctx = audioCtx;
    for (let i = 0; i < 8; i++) {
      const now = ctx.currentTime + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(i % 2 ? 220 : 440, now);
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    }
  } catch { /* audio not available */ }
}

function logConsoleArt() {
  const art = [
    '%c╔════════════════════════════════════════════╗',
    '║   RACHECKER  ·  INSERT COIN  ·  ▶            ║',
    '║ ↑↑↓↓←→←→ B A · tippe: barrel/gameboy/coin/waka/snake/crt ║',
    '╚════════════════════════════════════════════╝',
  ].join('\n');
  // eslint-disable-next-line no-console
  console.log(art, 'color:#22e0ff;font-family:monospace;font-weight:bold');
}

export function EasterEggs() {
  const { t } = useI18n();
  const [pacman, setPacman] = useState(false);
  const [snakeOpen, setSnakeOpen] = useState(false);
  const [crtOpen, setCrtOpen] = useState(false);
  const [goldDone, setGoldDone] = useState(() => unlockedThemes().includes('gold'));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idx = useRef(0);
  const buf = useRef('');
  const seen = useRef(new Set<string>());
  const toastId = useRef(1);

  // Fire the Pac-Man egg (same as typing "waka"). Shared by the Konami code so
  // both entry points reuse one trigger instead of duplicating the runner.
  const runPacman = () => { setPacman(true); playWaka(); };

  const unlock = (title: string, points: number, desc: string) => {
    if (seen.current.has(title)) return; // each achievement once per session
    seen.current.add(title);
    const id = toastId.current++;
    setToasts((t) => [...t, { id, title, desc, points }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4800);
  };

  useEffect(() => { logConsoleArt(); }, []);

  useEffect(() => {
    const inField = (el: any) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      // Konami (arrows + b/a) → launches the Pac-Man egg
      const want = KONAMI[idx.current];
      if (e.key.toLowerCase() === want.toLowerCase()) {
        idx.current++;
        if (idx.current === KONAMI.length) { idx.current = 0; runPacman(); unlock(t('egg.title.konami'), 30, t('egg.desc.konami')); }
      } else idx.current = e.key === KONAMI[0] ? 1 : 0;

      // typed-word eggs (ignore when typing in a field)
      if (!inField(e.target) && /^[a-z]$/i.test(e.key)) {
        buf.current = (buf.current + e.key.toLowerCase()).slice(-12);
        if (buf.current.endsWith('barrel')) {
          const el = document.getElementById('app-root');
          if (el) { el.classList.add('barrel-roll'); setTimeout(() => el.classList.remove('barrel-roll'), 1000); }
          unlock(t('egg.title.barrel'), 5, t('egg.desc.barrel'));
        }
        if (buf.current.endsWith('gameboy') || buf.current.endsWith('dmg')) {
          applyTheme('gameboy');
          unlock(t('egg.title.gameboy'), 10, t('egg.desc.gameboy'));
        }
        if (buf.current.endsWith('coin')) {
          playCoin();
          unlock(t('egg.title.coin'), 5, t('egg.desc.coin'));
        }
        if (buf.current.endsWith('waka')) {
          runPacman();
        }
        if (buf.current.endsWith('snake')) {
          setSnakeOpen(true);
        }
        if (buf.current.endsWith('crt')) {
          setCrtOpen((o) => !o);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {/* Steerable Pac-Man (type "waka" or enter the Konami code) */}
      {pacman && <PacManRunner onDone={(score) => { setPacman(false); unlock(t('egg.title.waka'), 25, t('egg.desc.waka', { score })); }} />}

      {/* Playable Snake (type "snake") — unlocks Plasma theme */}
      {snakeOpen && (
        <SnakeGame onClose={() => setSnakeOpen(false)}
          onUnlock={() => { if (unlockTheme('plasma')) unlock(t('egg.title.plasma'), 50, t('egg.desc.plasma')); }} />
      )}

      {/* Live CRT tuner (type "crt") */}
      {crtOpen && <CrtControls onClose={() => setCrtOpen(false)} />}

      {/* Click-hunt: 5 spots → unlocks Gold theme */}
      {!goldDone && (
        <ClickHunt done={goldDone}
          onComplete={() => { unlockTheme('gold'); setGoldDone(true); unlock(t('egg.title.gold'), 50, t('egg.desc.gold')); }} />
      )}

      {/* Achievement-Unlocked toasts (RetroAchievements style) */}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-in panel panel-glow flex items-center gap-3 p-3 pr-4" style={{ borderColor: 'var(--color-neon-amber)', minWidth: 280 }}>
            <span className="grid place-items-center rounded shrink-0" style={{ width: 44, height: 44, background: 'linear-gradient(180deg,rgba(255,182,72,.3),rgba(255,182,72,.1))', border: '1px solid var(--color-neon-amber)', boxShadow: 'var(--shadow-glow-amber)' }}>
              <Trophy size={22} style={{ color: 'var(--color-neon-amber)' }} />
            </span>
            <div className="min-w-0">
              <div className="font-mono text-base" style={{ color: 'var(--color-neon-amber)' }}>{t('egg.unlocked')}</div>
              <div className="font-body text-sm text-ink-hi truncate">{toast.title} <span className="text-neon-amber">({toast.points})</span></div>
              <div className="font-body text-ink-dim text-sm truncate">{toast.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
