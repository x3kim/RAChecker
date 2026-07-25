import { useEffect, useState } from 'react';
import { X, Wand2, FolderSearch, ChevronRight, Trophy } from 'lucide-react';
import { api, imageUrl } from '../lib/api';
import type { VersionReportResult } from '../lib/api';
import { ConsoleIcon } from './ui';
import { useI18n } from '../lib/i18n';

// Batch "which RA version do I need?" report for all no_match files in the
// collection. Runs against the local game DB (see /api/library/version-report).
export function VersionReport({ onOpenGame, onClose }: {
  onOpenGame: (id: number) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [data, setData] = useState<VersionReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.versionReport().then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line">
          <h3 className="font-display text-sm text-glow-magenta flex items-center gap-2"><Wand2 size={16} /> {t('vr.title')}</h3>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 border-b border-crt-line">
          <p className="font-body text-ink-mid text-sm">
            {t('vr.body')}
          </p>
          {data && (
            <div className="font-mono text-base text-ink-dim mt-2">
              {t('vr.stats', { scanned: data.scanned, resolved: data.resolved })}
              {data.unresolved > 0 && <span> · {t('vr.unresolved', { n: data.unresolved })}</span>}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-2">
          {loading && <div className="font-mono text-ink-dim p-4">{t('vr.analyzing')}</div>}
          {!loading && (!data || data.groups.length === 0) && (
            <div className="font-mono text-ink-dim p-4 text-center">{t('vr.noHits')}</div>
          )}
          {data?.groups.map((g) => (
            <div key={g.id} className="panel !rounded-lg p-3">
              <button className="w-full flex items-center gap-3 text-left" onClick={() => { onOpenGame(g.id); onClose(); }}>
                {g.icon ? <img src={imageUrl(g.icon)} width={40} height={40} className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                <div className="min-w-0 flex-1">
                  <div className="font-body text-sm text-ink-hi truncate" title={g.title}>{g.title}</div>
                  <div className="font-mono text-base text-ink-dim flex items-center gap-1.5">
                    <ConsoleIcon id={g.consoleId} short={g.consoleShort ?? undefined} size={13} /> {g.consoleName}
                    <span className="text-neon-amber inline-flex items-center gap-1 ml-1"><Trophy size={12} /> {g.achievements}</span>
                  </div>
                </div>
                <span className="font-mono text-sm text-neon-purple px-2 py-0.5 rounded shrink-0" style={{ border: '1px solid var(--color-neon-purple)' }}>{t('vr.files', { n: g.files.length })}</span>
                <ChevronRight size={16} className="text-ink-dim shrink-0" />
              </button>
              <div className="mt-2 pl-1 space-y-1">
                {g.files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono text-sm text-ink-dim">
                    <button className="hover:text-neon-cyan shrink-0" title={t('rt.explorerTip')} onClick={() => api.reveal(f.path).catch(() => {})}><FolderSearch size={13} /></button>
                    <span className="truncate" title={f.path}>{f.name}{f.inner ? ` › ${f.inner}` : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
