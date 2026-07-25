import { useState } from 'react';
import { X, MonitorCog, RotateCcw } from 'lucide-react';
import { loadCrt, applyCrt, CRT_DEFAULTS } from '../lib/crt';
import type { CrtSettings } from '../lib/crt';

// Floating CRT tuner (hidden easter egg — type "crt"). Interactive AND useful:
// the chosen values become real, persisted display settings.
export function CrtControls({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<CrtSettings>(loadCrt());
  const update = (patch: Partial<CrtSettings>) => { const next = { ...s, ...patch }; setS(next); applyCrt(next); };

  return (
    <div className="fixed bottom-4 right-4 z-[78] panel panel-glow modal-pop p-4 w-72" style={{ borderColor: 'var(--color-neon-cyan)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm text-glow-cyan flex items-center gap-2"><MonitorCog size={15} /> CRT-REGLER</h3>
        <button className="btn !p-1.5" onClick={onClose}><X size={15} /></button>
      </div>

      <label className="block mb-3">
        <span className="font-mono text-sm text-ink-mid flex justify-between"><span>Scanlines</span><span className="text-neon-cyan">{Math.round(s.scan * 100)}%</span></span>
        <input type="range" min={0} max={0.4} step={0.01} value={s.scan} onChange={(e) => update({ scan: Number(e.target.value) })} className="w-full accent-[var(--color-neon-cyan)]" />
      </label>

      <label className="block mb-3">
        <span className="font-mono text-sm text-ink-mid flex justify-between"><span>Raster</span><span className="text-neon-cyan">{Math.round(s.grid * 100)}%</span></span>
        <input type="range" min={0} max={1} step={0.02} value={s.grid} onChange={(e) => update({ grid: Number(e.target.value) })} className="w-full accent-[var(--color-neon-cyan)]" />
      </label>

      <div className="flex items-center justify-between">
        <button onClick={() => update({ flicker: !s.flicker })}
          className="btn !py-1.5 !px-3 text-sm"
          style={s.flicker ? { borderColor: 'var(--color-neon-magenta)', boxShadow: 'var(--shadow-glow-magenta)' } : {}}>
          Flackern: {s.flicker ? 'an' : 'aus'}
        </button>
        <button className="btn !py-1.5 !px-2.5 text-sm" onClick={() => update({ ...CRT_DEFAULTS })} title="Zurücksetzen"><RotateCcw size={14} /></button>
      </div>
    </div>
  );
}
