import { useEffect, useState } from 'react';
import { Folder, HardDrive, ArrowUp, Check, X, CornerDownRight, FileCog } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

// `mode="file"` lets the user pick a file (e.g. retroarch.exe) instead of a
// folder; `ext` filters which files are shown. Default stays folder-only.
export function FolderPicker({ initialPath, onPick, onClose, mode = 'dir', ext }: {
  initialPath?: string; onPick: (path: string) => void; onClose: () => void;
  mode?: 'dir' | 'file'; ext?: string[];
}) {
  const { t } = useI18n();
  const [path, setPath] = useState(initialPath || '');
  const [data, setData] = useState<Awaited<ReturnType<typeof api.fsList>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState(initialPath || '');

  const load = async (p: string) => {
    setLoading(true);
    try { const d = await api.fsList(p, mode === 'file' ? { files: true, ext } : {}); setData(d); setPath(d.path); setManual(d.path); }
    catch { setData({ path: p, parent: '', isRoot: false, drives: [], dirs: [], files: [], error: t('fp.unreadable') }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(initialPath || ''); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.78)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-2xl max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line">
          <h3 className="font-display text-sm text-glow-cyan">{t('fp.title')}</h3>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="p-4 flex gap-2 border-b border-crt-line">
          <input
            className="input"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(manual)}
            placeholder="D:\ROMs oder \\NAS\roms"
          />
          <button className="btn" onClick={() => load(manual)}><CornerDownRight size={16} /> {t('fp.open')}</button>
        </div>

        <div className="flex-1 overflow-auto p-2">
          {loading && <div className="font-mono text-ink-dim p-4">{t('common.loading')}</div>}
          {data?.error && <div className="font-mono text-neon-red p-4">{data.error}</div>}

          {!loading && data?.parent !== null && data?.parent !== undefined && data.parent !== '' && (
            <button className="w-full text-left btn !justify-start !border-transparent !bg-transparent hover:!bg-[rgba(34,224,255,.08)]" onClick={() => load(data.parent!)}>
              <ArrowUp size={16} className="text-neon-cyan" /> <span className="font-mono">{t('fp.up')}</span>
            </button>
          )}

          {data?.drives?.map((d) => (
            <button key={d.path} className="w-full text-left btn !justify-start !border-transparent !bg-transparent hover:!bg-[rgba(34,224,255,.08)]" onClick={() => load(d.path)}>
              <HardDrive size={16} className="text-neon-purple" /> <span className="font-mono">{d.name}</span>
            </button>
          ))}

          {data?.dirs?.map((d) => (
            <button key={d.path} className="w-full text-left btn !justify-start !border-transparent !bg-transparent hover:!bg-[rgba(34,224,255,.08)]" onClick={() => load(d.path)}>
              <Folder size={16} className="text-neon-cyan" /> <span className="font-body truncate">{d.name}</span>
            </button>
          ))}

          {mode === 'file' && data?.files?.map((f) => (
            <button key={f.path} className="w-full text-left btn !justify-start !border-transparent !bg-transparent hover:!bg-[rgba(57,255,139,.1)]" onClick={() => onPick(f.path)}>
              <FileCog size={16} className="text-neon-green" /> <span className="font-body truncate">{f.name}</span>
            </button>
          ))}

          {!loading && !data?.dirs?.length && !data?.drives?.length && !data?.files?.length && !data?.error && (
            <div className="font-mono text-ink-dim p-4">{t('fp.noSub')}</div>
          )}
        </div>

        <div className="p-4 border-t border-crt-line flex items-center justify-between gap-3">
          <div className="font-mono text-base text-ink-mid truncate flex-1" title={path}>{path || t('fp.chooseDrive')}</div>
          {mode === 'dir'
            ? <button className="btn btn-primary" disabled={!path} onClick={() => onPick(path)}>
                <Check size={16} /> {t('fp.useThis')}
              </button>
            : <span className="font-mono text-sm text-ink-dim shrink-0">{t('fp.pickFile')}</span>}
        </div>
      </div>
    </div>
  );
}
