import { X, Keyboard } from 'lucide-react';
import { useI18n } from '../lib/i18n';

function Keys({ combo }: { combo: string[] }) {
  return (
    <span className="flex items-center gap-1 shrink-0">
      {combo.map((k, i) => (
        <kbd key={i} className="font-mono text-sm rounded px-2 py-0.5"
          style={{ border: '1px solid var(--color-crt-line2)', background: 'rgba(8,11,18,.7)', color: 'var(--color-ink-hi)', minWidth: 24, textAlign: 'center' }}>
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const nav: { combo: string[]; key: string }[] = [
    { combo: ['g', 'd'], key: 'sc.go.dashboard' },
    { combo: ['g', 's'], key: 'sc.go.scan' },
    { combo: ['g', 'g'], key: 'sc.go.games' },
    { combo: ['g', 'e'], key: 'sc.go.discover' },
    { combo: ['g', 'h'], key: 'sc.go.sync' },
    { combo: ['g', 'p'], key: 'sc.go.profile' },
    { combo: ['g', ','], key: 'sc.go.settings' },
  ];
  const actions: { combo: string[]; key: string }[] = [
    { combo: ['Ctrl', 'K'], key: 'sc.palette' },
    { combo: ['/'], key: 'sc.focus.search' },
    { combo: ['?'], key: 'sc.help' },
    { combo: ['Esc'], key: 'sc.close' },
  ];
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-lg max-h-[86vh] overflow-auto crt-scanlines" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line">
          <h3 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Keyboard size={16} /> {t('shortcuts.title')}</h3>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-6">
          {[{ title: t('shortcuts.nav'), rows: nav }, { title: t('shortcuts.actions'), rows: actions }].map((sec) => (
            <div key={sec.title}>
              <div className="font-mono text-base text-neon-cyan mb-2">{sec.title}</div>
              <div className="flex flex-col gap-2">
                {sec.rows.map((r) => (
                  <div key={r.key} className="flex items-center justify-between gap-3">
                    <span className="font-body text-sm text-ink-mid">{t(r.key)}</span>
                    <Keys combo={r.combo} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 font-body text-sm text-ink-dim">{t('shortcuts.hint')}</div>
      </div>
    </div>
  );
}
