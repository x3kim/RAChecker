import { useEffect, useRef, useState } from 'react';
import { X, Gamepad2, RotateCw, Trophy } from 'lucide-react';

const CELL = 16, COLS = 20, ROWS = 18;
const HI_KEY = 'ra-snake-hi';
const UNLOCK_AT = 10; // food eaten to unlock the Plasma theme

type P = { x: number; y: number };

// Playable Snake — eat the ROM cartridges. Reaching UNLOCK_AT score unlocks a
// hidden theme (handled by the parent via onUnlock).
export function SnakeGame({ onClose, onUnlock }: { onClose: () => void; onUnlock: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [hi, setHi] = useState(() => Number(localStorage.getItem(HI_KEY) || 0));
  const [over, setOver] = useState(false);
  const [running, setRunning] = useState(false);

  const snake = useRef<P[]>([]);
  const dir = useRef<P>({ x: 1, y: 0 });
  const nextDir = useRef<P>({ x: 1, y: 0 });
  const food = useRef<P>({ x: 10, y: 9 });
  const scoreRef = useRef(0);
  const unlockedRef = useRef(false);
  const loopRef = useRef<number | null>(null);

  const reset = () => {
    snake.current = [{ x: 5, y: 9 }, { x: 4, y: 9 }, { x: 3, y: 9 }];
    dir.current = { x: 1, y: 0 }; nextDir.current = { x: 1, y: 0 };
    placeFood();
    scoreRef.current = 0; setScore(0); setOver(false); setRunning(true);
  };

  function placeFood() {
    let p: P, guard = 0;
    do {
      p = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      guard++;
    } while (snake.current.some((s) => s.x === p.x && s.y === p.y) && guard < 200);
    food.current = p;
  }

  const draw = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    // grid
    ctx.strokeStyle = 'rgba(127,127,127,.08)';
    for (let i = 0; i <= COLS; i++) { ctx.beginPath(); ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, ROWS * CELL); ctx.stroke(); }
    for (let j = 0; j <= ROWS; j++) { ctx.beginPath(); ctx.moveTo(0, j * CELL); ctx.lineTo(COLS * CELL, j * CELL); ctx.stroke(); }
    // food (cartridge)
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-neon-amber').trim() || '#ffb648';
    ctx.fillStyle = accent;
    ctx.fillRect(food.current.x * CELL + 3, food.current.y * CELL + 2, CELL - 6, CELL - 4);
    ctx.fillRect(food.current.x * CELL + 5, food.current.y * CELL + CELL - 4, CELL - 10, 3);
    // snake
    const green = getComputedStyle(document.documentElement).getPropertyValue('--color-neon-green').trim() || '#39ff8b';
    const cyan = getComputedStyle(document.documentElement).getPropertyValue('--color-neon-cyan').trim() || '#22e0ff';
    snake.current.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? cyan : green;
      ctx.shadowColor = i === 0 ? cyan : green; ctx.shadowBlur = i === 0 ? 8 : 0;
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
    ctx.shadowBlur = 0;
  };

  const step = () => {
    dir.current = nextDir.current;
    const head = snake.current[0];
    const nh = { x: head.x + dir.current.x, y: head.y + dir.current.y };
    // walls + self
    if (nh.x < 0 || nh.y < 0 || nh.x >= COLS || nh.y >= ROWS || snake.current.some((s) => s.x === nh.x && s.y === nh.y)) {
      setRunning(false); setOver(true);
      if (loopRef.current) { clearInterval(loopRef.current); loopRef.current = null; }
      if (scoreRef.current > Number(localStorage.getItem(HI_KEY) || 0)) {
        localStorage.setItem(HI_KEY, String(scoreRef.current)); setHi(scoreRef.current);
      }
      return;
    }
    snake.current.unshift(nh);
    if (nh.x === food.current.x && nh.y === food.current.y) {
      scoreRef.current += 1; setScore(scoreRef.current);
      placeFood();
      if (scoreRef.current >= UNLOCK_AT && !unlockedRef.current) { unlockedRef.current = true; onUnlock(); }
    } else {
      snake.current.pop();
    }
    draw();
  };

  // input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const map: Record<string, P> = {
        arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
        arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
      };
      if (map[k]) {
        e.preventDefault(); e.stopPropagation();
        const nd = map[k]; const cd = dir.current;
        if (nd.x !== -cd.x || nd.y !== -cd.y) nextDir.current = nd; // no 180° reversal
      } else if (k === 'escape') { onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // game loop (speeds up slightly with score)
  useEffect(() => {
    if (!running) return;
    const speed = Math.max(70, 140 - scoreRef.current * 4);
    loopRef.current = window.setInterval(step, speed);
    return () => { if (loopRef.current) clearInterval(loopRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, score]);

  useEffect(() => { reset(); draw(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="fixed inset-0 z-[84] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.85)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop crt-scanlines p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3 gap-6">
          <h3 className="font-display text-sm text-glow-green flex items-center gap-2"><Gamepad2 size={16} /> ROM SNAKE</h3>
          <div className="flex items-center gap-3 font-mono text-base">
            <span className="text-neon-cyan">Score {score}</span>
            <span className="text-neon-amber inline-flex items-center gap-1"><Trophy size={13} /> {hi}</span>
            <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="relative" style={{ width: COLS * CELL, height: ROWS * CELL }}>
          <canvas ref={canvasRef} width={COLS * CELL} height={ROWS * CELL} style={{ display: 'block', borderRadius: 8, border: '1px solid var(--color-crt-line)' }} />
          {over && (
            <div className="absolute inset-0 grid place-items-center text-center" style={{ background: 'rgba(8,11,18,.78)', borderRadius: 8 }}>
              <div>
                <div className="font-display text-base text-glow-magenta">GAME OVER</div>
                <div className="font-mono text-base text-ink-mid mt-2">Score {score} · Best {hi}</div>
                {unlockedRef.current && <div className="font-mono text-base text-neon-green mt-1">✦ Plasma-Theme freigeschaltet!</div>}
                <button className="btn btn-primary mx-auto mt-3" onClick={reset}><RotateCw size={15} /> Nochmal</button>
              </div>
            </div>
          )}
        </div>
        <div className="font-mono text-sm text-ink-dim mt-2 text-center">Pfeiltasten / WASD · {UNLOCK_AT} Punkte = geheimes Theme</div>
      </div>
    </div>
  );
}
