import { useEffect, useRef, useState } from 'react';
import { Trophy, X } from 'lucide-react';
import type { AppStatus } from '../lib/api';
import { useI18n } from '../lib/i18n';

interface WToast { id: number; title: string; gameId: number | null }

let audioCtx: AudioContext | null = null;
function blip() {
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    audioCtx = audioCtx || new AC();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.42);
  } catch { /* no audio */ }
}

// Toasts for matches the folder-watcher auto-found. Compares the server's
// recentMatches list against the last timestamp we've already shown.
export function WatchToasts({ status, onOpenGame }: { status: AppStatus | null; onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<WToast[]>([]);
  const lastAt = useRef<number>(Date.now());
  const nextId = useRef(1);

  useEffect(() => {
    const matches = status?.watch?.recentMatches;
    if (!matches?.length) return;
    const fresh = matches.filter((m) => m.at > lastAt.current).sort((a, b) => a.at - b.at);
    if (!fresh.length) return;
    lastAt.current = Math.max(lastAt.current, ...fresh.map((m) => m.at));
    blip();
    for (const m of fresh.slice(-4)) {
      const id = nextId.current++;
      setToasts((ts) => [...ts, { id, title: m.title, gameId: m.gameId }]);
      setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), 7000);
    }
  }, [status]);

  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 left-4 z-[70] flex flex-col gap-2">
      {toasts.map((t2) => (
        <div key={t2.id} className="toast-in panel panel-glow flex items-center gap-3 p-3 pr-2" style={{ borderColor: 'var(--color-neon-green)', minWidth: 280, maxWidth: 360 }}>
          <span className="grid place-items-center rounded shrink-0" style={{ width: 40, height: 40, background: 'linear-gradient(180deg,rgba(57,255,139,.3),rgba(57,255,139,.1))', border: '1px solid var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>
            <Trophy size={20} style={{ color: 'var(--color-neon-green)' }} />
          </span>
          <button className="min-w-0 flex-1 text-left" disabled={t2.gameId == null} onClick={() => t2.gameId != null && onOpenGame(t2.gameId)}>
            <div className="font-mono text-base" style={{ color: 'var(--color-neon-green)' }}>{t('watch.found')}</div>
            <div className="font-body text-sm text-ink-hi truncate">{t2.title}</div>
          </button>
          <button className="btn !p-1.5 shrink-0" onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t2.id))}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
