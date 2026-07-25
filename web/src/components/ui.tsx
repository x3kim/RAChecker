import { useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { LayoutGrid, Rows3 } from 'lucide-react';
import { consoleIconUrl } from '../lib/api';
import type { ScanStatus } from '../lib/api';
import { STATUS_META, statusLabel } from '../lib/util';
import { useI18n } from '../lib/i18n';
import type { ViewMode } from '../lib/viewmode';

// Segmented card/table switch shared by every list view. Pass the current mode
// and an onChange; pair with useViewMode() for persistence.
export function ViewToggle({ mode, onChange, className = '' }: {
  mode: ViewMode; onChange: (m: ViewMode) => void; className?: string;
}) {
  const { t } = useI18n();
  const opt = (m: ViewMode, Icon: ComponentType<any>, label: string) => (
    <button type="button" onClick={() => onChange(m)} title={label} aria-pressed={mode === m}
      className="btn !py-1.5 !px-2.5 text-sm flex items-center gap-1.5"
      style={mode === m ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
      <Icon size={15} /> <span className="hidden sm:inline">{label}</span>
    </button>
  );
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {opt('card', LayoutGrid, t('view.card'))}
      {opt('table', Rows3, t('view.table'))}
    </div>
  );
}

// Shared section header: a small accent bar + pixel title + optional action on
// the right. The accent bar is the only colour-emphasis (no glow), so sections
// read as a consistent, calm hierarchy across every view.
export function SectionHeader({ accent, title, icon: Icon, children }: {
  accent: string; title: string; icon?: ComponentType<any>; children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4 gap-3">
      <h2 className="font-display text-sm text-ink-hi flex items-center gap-2.5 min-w-0">
        <span className="inline-block rounded-full shrink-0" style={{ width: 3, height: 15, background: accent, opacity: 0.9 }} />
        {Icon && <Icon size={15} style={{ color: accent }} className="shrink-0" />}
        <span className="truncate">{title}</span>
      </h2>
      {children}
    </div>
  );
}

export function ConsoleIcon({ id, size = 28, short }: { id?: number | null; size?: number; short?: string }) {
  const [err, setErr] = useState(false);
  if (id == null) return <span style={{ width: size, height: size }} className="inline-block" />;
  if (err) {
    return (
      <span
        title={short}
        className="inline-flex items-center justify-center rounded font-mono text-ink-dim"
        style={{ width: size, height: size, fontSize: size * 0.4, border: '1px solid var(--color-crt-line)' }}
      >
        {(short || '?').slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={consoleIconUrl(id)}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErr(true)}
      alt={short || String(id)}
      style={{ objectFit: 'contain', imageRendering: 'auto' }}
    />
  );
}

export function StatusBadge({ status }: { status: ScanStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="badge" style={{ color: m.color, boxShadow: m.glow }}>
      <span aria-hidden>{m.icon}</span> {statusLabel(status)}
    </span>
  );
}

export function Stat({ label, value, accent, sub }: { label: string; value: ReactNode; accent?: string; sub?: string }) {
  return (
    <div className="panel p-4 flex flex-col gap-1">
      <div className="font-mono text-ink-mid text-lg uppercase tracking-wide">{label}</div>
      <div className="font-display text-2xl leading-none" style={{ color: accent || 'var(--color-ink-hi)', textShadow: accent ? `0 0 8px color-mix(in srgb, ${accent} 25%, transparent)` : undefined }}>
        {value}
      </div>
      {sub && <div className="font-mono text-ink-dim text-base">{sub}</div>}
    </div>
  );
}

export function ProgressBar({ value, max, label }: { value: number; max: number; label?: string }) {
  const p = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between font-mono text-base text-ink-mid">
          <span>{label}</span>
          <span>{value}/{max} ({Math.round(p)}%)</span>
        </div>
      )}
      <div className="progress-track h-3">
        <div className="progress-fill" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 font-mono text-neon-cyan">
      <span className="animate-blink">▮</span>{label}
    </span>
  );
}

export function Pill({ children, color = 'var(--color-crt-line2)', title }: { children: ReactNode; color?: string; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-base"
      style={{ border: `1px solid ${color}`, color }}
    >
      {children}
    </span>
  );
}
