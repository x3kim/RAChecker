import { useEffect, useMemo, useState } from 'react';
import { X, UploadCloud, Loader2 } from 'lucide-react';
import type { AppStatus, ScanItem } from '../lib/api';
import { api } from '../lib/api';
import { ResultsTable } from './ResultsTable';
import { useI18n } from '../lib/i18n';

export function UploadModal({ files, status, onClose, onOpenGame, note }: {
  files: File[]; status: AppStatus | null; onClose: () => void; onOpenGame: (id: number) => void; note?: string;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(true);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const shortById = useMemo(() => new Map((status?.consoles ?? []).map((c) => [c.id, c.short_code])), [status]);

  useEffect(() => {
    let alive = true;
    setBusy(true); setError(null);
    api.uploadCheck(files).then((r) => {
      if (!alive) return;
      if (r.error) setError(r.error);
      setResults(r.results ?? []);
    }).catch((e) => alive && setError(String(e.message))).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [files]);

  const matched = results.filter((r) => r.status === 'match').length;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-5xl max-h-[92vh] overflow-auto crt-scanlines" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line sticky top-0 sticky-head backdrop-blur z-10">
          <h3 className="font-display text-sm text-glow-cyan flex items-center gap-2"><UploadCloud size={16} /> {t('up.title', { n: files.length })}</h3>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-4">
          {note && <div className="font-mono text-amber-300 text-base mb-3" style={{ color: 'var(--color-neon-amber)' }}>{note}</div>}
          {busy && (
            <div className="py-8 text-center font-mono text-neon-cyan flex items-center justify-center gap-2">
              <Loader2 size={18} className="animate-spin" /> {t('up.uploading')}
            </div>
          )}
          {error && <div className="font-mono text-neon-red mb-3">⚠ {error}</div>}
          {!busy && results.length > 0 && (
            <>
              <div className="font-mono text-base text-ink-mid mb-3">
                {t('up.summary', { m: matched, n: results.length })}
              </div>
              <ResultsTable items={results} consoleShortById={shortById} onOpenGame={onOpenGame} cap={300} />
            </>
          )}
          {!busy && !error && results.length === 0 && (
            <div className="font-mono text-ink-dim text-center py-6">{t('common.noRomData')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
