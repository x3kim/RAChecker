import { X, Sparkles, Wrench, CircleArrowUp, History } from 'lucide-react';
import { CHANGELOG, APP_VERSION } from '../lib/version';
import type { ChangeType } from '../lib/version';
import { useI18n } from '../lib/i18n';

const TYPE_META: Record<ChangeType, { color: string; icon: any; key: string }> = {
  feature: { color: 'var(--color-neon-green)', icon: Sparkles, key: 'changelog.type.feature' },
  improve: { color: 'var(--color-neon-cyan)', icon: CircleArrowUp, key: 'changelog.type.improve' },
  fix: { color: 'var(--color-neon-amber)', icon: Wrench, key: 'changelog.type.fix' },
};

export function ChangelogModal({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-2xl max-h-[86vh] overflow-auto crt-scanlines" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line sticky top-0 sticky-head backdrop-blur z-10">
          <h3 className="font-display text-sm text-glow-cyan flex items-center gap-2"><History size={16} /> {t('changelog.title')}</h3>
          <button className="btn !p-1.5" onClick={onClose} title={t('changelog.close')}><X size={16} /></button>
        </div>

        <div className="p-5 flex flex-col gap-6">
          {CHANGELOG.map((rel) => (
            <section key={rel.version}>
              <div className="flex items-baseline gap-3 flex-wrap mb-3">
                <span className="font-display text-base text-glow-cyan">v{rel.version}</span>
                {rel.version === APP_VERSION && (
                  <span className="badge" style={{ color: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>{t('changelog.current')}</span>
                )}
                {rel.title && <span className="font-body text-sm text-ink-mid">{rel.title[lang]}</span>}
                <span className="font-mono text-sm text-ink-dim ml-auto">{rel.date}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {rel.changes.map((c, i) => {
                  const m = TYPE_META[c.type];
                  const Icon = m.icon;
                  return (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="font-mono text-sm shrink-0 inline-flex items-center gap-1 rounded px-1.5 py-0.5 mt-0.5"
                        style={{ color: m.color, border: `1px solid ${m.color}`, minWidth: 78, justifyContent: 'center' }}>
                        <Icon size={12} /> {t(m.key)}
                      </span>
                      <span className="font-body text-sm text-ink-hi leading-snug">{c[lang]}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
