import { useState } from 'react';
import { ScanLine, DatabaseZap, ImageDown, ChevronDown, Activity, Loader2 } from 'lucide-react';
import { useJobs } from '../lib/jobs';
import { useI18n } from '../lib/i18n';

type Tab = 'scan' | 'sync' | 'settings';
interface Row { key: string; icon: any; label: string; detail: string; pct: number; tab: Tab; color: string }

// Floating, tab-persistent status box. Lives at the app root (above the page),
// so a running scan/sync/image-cache stays visible no matter which tab is open.
export function JobHud({ onGo }: { onGo: (tab: Tab) => void }) {
  const { scan, sync, imageWarm } = useJobs();
  const { t } = useI18n();
  const [min, setMin] = useState(false);

  const rows: Row[] = [];
  if (scan.active) {
    const tot = scan.totals;
    rows.push({
      key: 'scan', icon: ScanLine, label: t('hud.scan'), color: 'var(--color-neon-cyan)',
      detail: scan.current?.file ? scan.current.file : `${tot.scanned}/${tot.files || tot.scanned}`,
      pct: tot.files ? Math.round((tot.scanned / tot.files) * 100) : 5, tab: 'scan',
    });
  }
  if (sync.active) {
    rows.push({
      key: 'sync', icon: DatabaseZap, label: t('hud.sync'), color: 'var(--color-neon-green)',
      detail: sync.cur.name || '…', pct: sync.cur.total ? Math.round((sync.cur.done / sync.cur.total) * 100) : 8, tab: 'sync',
    });
  }
  if (imageWarm.active) {
    rows.push({
      key: 'images', icon: ImageDown, label: t('hud.images'), color: 'var(--color-neon-magenta)',
      detail: `${imageWarm.doneCount}/${imageWarm.total || '…'} · ${imageWarm.images} 🖼`,
      pct: imageWarm.total ? Math.round((imageWarm.doneCount / imageWarm.total) * 100) : 4, tab: 'settings',
    });
  }

  if (rows.length === 0) return null;

  if (min) {
    return (
      <button onClick={() => setMin(false)}
        className="fixed bottom-4 right-4 z-[72] panel panel-glow flex items-center gap-2 px-3 py-2"
        style={{ borderColor: 'var(--color-neon-cyan)' }} title={t('hud.title')}>
        <Loader2 size={15} className="animate-spin text-neon-cyan" />
        <span className="font-mono text-base text-ink-hi">{rows.length}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[72] panel panel-glow w-72 overflow-hidden" style={{ borderColor: 'var(--color-neon-cyan)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-crt-line">
        <span className="font-display text-sm text-glow-cyan flex items-center gap-2"><Activity size={14} /> {t('hud.title')}</span>
        <button className="btn !p-1" onClick={() => setMin(true)} title={t('hud.minimize')}><ChevronDown size={15} /></button>
      </div>
      <div className="p-2 flex flex-col gap-2">
        {rows.map((r) => (
          <button key={r.key} onClick={() => onGo(r.tab)} className="text-left panel !rounded-lg p-2 hover:border-neon-cyan transition-colors" style={{ borderColor: 'var(--color-crt-line)' }}>
            <div className="flex items-center gap-2">
              <r.icon size={14} style={{ color: r.color }} />
              <span className="font-mono text-base text-ink-hi">{r.label}</span>
              <span className="ml-auto font-mono text-sm" style={{ color: r.color }}>{r.pct}%</span>
            </div>
            <div className="progress-track h-1.5 mt-1.5"><div className="progress-fill" style={{ width: `${r.pct}%` }} /></div>
            <div className="font-mono text-sm text-ink-dim truncate mt-1" title={r.detail}>{r.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
