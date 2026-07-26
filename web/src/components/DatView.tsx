import { useEffect, useRef, useState } from 'react';
import { ClipboardList, Upload, Trash2, RefreshCw, ChevronRight, Download, X, Search, AlertTriangle, CheckCircle2, HelpCircle, Copy } from 'lucide-react';
import { api } from '../lib/api';
import type { DatFile, CrcStatus, DatCoverage, DatExtras } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { fmtBytes, fmtDate } from '../lib/util';

type CrcScan = { active: boolean; done: number; total: number; computed: number; skipped: number };

export function DatView() {
  const { t } = useI18n();
  const [dats, setDats] = useState<DatFile[]>([]);
  const [crc, setCrc] = useState<CrcStatus | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [crcScan, setCrcScan] = useState<CrcScan | null>(null);
  const [coverage, setCoverage] = useState<DatCoverage | null>(null);
  const [covLoading, setCovLoading] = useState(false);
  const [extras, setExtras] = useState<DatExtras | null>(null);
  const [extrasLoading, setExtrasLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = async () => {
    try { const r = await api.datList(); setDats(r.dats); setCrc(r.crc); } catch { /* ignore */ }
  };
  useEffect(() => { load(); return () => { esRef.current?.close(); }; }, []);

  const onFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setImporting(true); setImportMsg('');
    try {
      const r = await api.datImport(Array.from(files));
      const games = r.imported.reduce((n, d) => n + (d.games || 0), 0);
      setImportMsg(r.imported.length
        ? t('dat.importDone', { n: r.imported.length, games })
        : (r.errors[0]?.error ? `${t('dat.importErr')}: ${r.errors[0].error}` : t('dat.importErr')));
      await load();
    } catch { setImportMsg(t('dat.importErr')); }
    finally { setImporting(false); if (fileInput.current) fileInput.current.value = ''; setTimeout(() => setImportMsg(''), 8000); }
  };

  const runCrc = () => {
    if (crcScan?.active) return;
    esRef.current?.close();
    const es = new EventSource('/api/dat/scan-crc/stream');
    esRef.current = es;
    setCrcScan({ active: true, done: 0, total: 0, computed: 0, skipped: 0 });
    const upd = (e: Event, patch: (d: any) => Partial<CrcScan>) => {
      try { const d = JSON.parse((e as MessageEvent).data); setCrcScan((s) => s ? { ...s, ...patch(d) } : s); } catch { /* ignore */ }
    };
    es.addEventListener('init', (e) => upd(e, (d) => ({ total: d.total })));
    es.addEventListener('progress', (e) => upd(e, (d) => ({ done: d.done, total: d.total, computed: d.computed, skipped: d.skipped })));
    es.addEventListener('done', (e) => { upd(e, (d) => ({ active: false, done: d.done, computed: d.computed, skipped: d.skipped })); es.close(); load(); });
    es.onerror = () => { es.close(); setCrcScan((s) => (s ? { ...s, active: false } : null)); };
  };

  const openCoverage = async (id: number) => {
    setCovLoading(true); setCoverage(null);
    try { setCoverage(await api.datCoverage(id)); } catch { /* ignore */ }
    finally { setCovLoading(false); }
  };

  const delDat = async (d: DatFile) => {
    if (!window.confirm(t('dat.deleteConfirm', { name: d.name }))) return;
    try { await api.datDelete(d.id); if (coverage?.dat.id === d.id) setCoverage(null); await load(); } catch { /* ignore */ }
  };

  const loadExtras = async () => {
    setExtrasLoading(true);
    try { setExtras(await api.datExtras()); } catch { /* ignore */ }
    finally { setExtrasLoading(false); }
  };

  const copyExtras = async () => {
    if (!extras?.extras.length) return;
    const text = extras.extras.map((e) => e.inner ? `${e.path}#${e.inner}` : e.path).join('\r\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  const baseName = (p: string) => { const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\')); return i >= 0 ? p.slice(i + 1) : p; };

  return (
    <div className="w-full max-w-[1320px] mx-auto flex flex-col gap-5">
      {/* header */}
      <div>
        <h1 className="font-display text-base text-glow-cyan flex items-center gap-2"><ClipboardList size={18} /> {t('dat.title')}</h1>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed max-w-3xl">{t('dat.intro')}</p>
      </div>

      {/* import + CRC pass */}
      <section className="panel p-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="font-display text-sm text-ink-hi flex items-center gap-2"><Upload size={15} className="text-neon-cyan" /> {t('dat.import')}</div>
          <p className="font-body text-ink-dim text-sm leading-relaxed">{t('dat.importHint')}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <input ref={fileInput} type="file" accept=".dat,.xml" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <button className="btn btn-primary" onClick={() => fileInput.current?.click()} disabled={importing}>
              <Upload size={16} className={importing ? 'animate-pulse' : ''} /> {importing ? t('dat.importing') : t('dat.import')}
            </button>
            {importMsg && <span className="font-mono text-base text-ink-mid">{importMsg}</span>}
          </div>
        </div>

        <div className="pt-4 border-t border-crt-line flex flex-col gap-2">
          <div className="font-display text-sm text-ink-hi flex items-center gap-2"><RefreshCw size={15} className="text-neon-green" /> {t('dat.crcTitle')}</div>
          <p className="font-body text-ink-dim text-sm leading-relaxed">{t('dat.crcNote')}</p>
          {crc && (
            <div className="font-mono text-base text-ink-mid">
              {t('dat.crcStatus', { have: crc.withCrc.toLocaleString(), total: crc.total.toLocaleString() })}
            </div>
          )}
          {crcScan?.active && (
            <div className="flex flex-col gap-1">
              <div className="progress-track h-2"><div className="progress-fill" style={{ width: `${crcScan.total ? Math.round((crcScan.done / crcScan.total) * 100) : 4}%` }} /></div>
              <div className="font-mono text-sm text-ink-dim">{t('dat.crcProgress', { done: crcScan.done, total: crcScan.total })}</div>
            </div>
          )}
          {crcScan && !crcScan.active && crcScan.done > 0 && (
            <div className="font-mono text-sm text-neon-green">{t('dat.crcDone', { computed: crcScan.computed, skipped: crcScan.skipped })}</div>
          )}
          <div>
            <button className="btn" onClick={runCrc} disabled={crcScan?.active || (crc?.without ?? 0) === 0}>
              <RefreshCw size={16} className={crcScan?.active ? 'animate-spin' : ''} /> {crcScan?.active ? t('dat.crcRunning') : t('dat.crcRun')}
            </button>
            {crc && crc.without === 0 && crc.total > 0 && <span className="ml-2 font-mono text-sm text-neon-green inline-flex items-center gap-1"><CheckCircle2 size={13} /> {t('dat.crcAll')}</span>}
          </div>
        </div>
      </section>

      {/* imported DATs */}
      {dats.length === 0 ? (
        <div className="panel p-6 text-center font-mono text-base text-ink-dim">{t('dat.empty')}</div>
      ) : (
        <div className="flex flex-col gap-2">
          {dats.map((d) => {
            const pct = d.total ? Math.round((d.have / d.total) * 100) : 0;
            return (
              <div key={d.id} className="panel p-4 flex items-center gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="font-body text-sm text-ink-hi truncate" title={d.name}>{d.name}</div>
                  <div className="font-mono text-sm text-ink-dim flex gap-2 flex-wrap">
                    {d.console_name && <span>{d.console_name}</span>}
                    <span>{t('dat.games', { n: d.game_count.toLocaleString() })}</span>
                    <span>· {fmtDate(d.imported_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-display text-sm" style={{ color: pct >= 100 ? 'var(--color-neon-green)' : 'var(--color-neon-cyan)' }}>{pct}%</div>
                    <div className="font-mono text-sm text-ink-dim">{d.have.toLocaleString()} / {d.total.toLocaleString()}</div>
                  </div>
                  <div className="w-28 progress-track h-2 hidden sm:block"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
                  <button className="btn !py-1.5 !px-3 text-sm" onClick={() => openCoverage(d.id)}>{t('dat.details')} <ChevronRight size={14} /></button>
                  <button className="btn btn-danger !py-1.5 !px-2 text-sm" onClick={() => delDat(d)} title={t('dat.delete')}><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* extra / unknown dumps */}
      {dats.length > 0 && (
        <section className="panel p-5 flex flex-col gap-3">
          <div className="font-display text-sm text-ink-hi flex items-center gap-2"><HelpCircle size={15} className="text-neon-amber" /> {t('dat.extras.title')}</div>
          <p className="font-body text-ink-dim text-sm leading-relaxed max-w-3xl">{t('dat.extras.note')}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn" onClick={loadExtras} disabled={extrasLoading}>
              <RefreshCw size={16} className={extrasLoading ? 'animate-spin' : ''} /> {extrasLoading ? t('dat.extras.checking') : t('dat.extras.check')}
            </button>
            {extras && (
              <span className="font-mono text-base text-ink-mid">
                {extras.total === 0 ? t('dat.extras.none') : t('dat.extras.count', { n: extras.total.toLocaleString() })}
              </span>
            )}
            {extras && extras.extras.length > 0 && (
              <button className="btn !py-1.5 !px-3 text-sm" onClick={copyExtras}>
                <Copy size={14} /> {copied ? t('dat.extras.copied') : t('dat.extras.copy')}
              </button>
            )}
          </div>
          {extras && extras.extras.length > 0 && (
            <div className="flex flex-col gap-1 max-h-[40vh] overflow-auto">
              {extras.extras.slice(0, 500).map((e, i) => (
                <div key={i} className="flex items-center gap-3 font-mono text-sm panel !rounded-lg px-3 py-1.5">
                  <span className="text-ink-hi truncate flex-1 min-w-0" title={e.inner ? `${e.path}#${e.inner}` : e.path}>{e.inner || baseName(e.path)}</span>
                  {e.crc && <span className="text-ink-dim shrink-0 hidden sm:inline">{e.crc}</span>}
                  {e.size != null && <span className="text-ink-dim shrink-0">{fmtBytes(e.size)}</span>}
                </div>
              ))}
              {extras.total > extras.extras.length && (
                <div className="font-mono text-sm text-ink-dim px-3 py-1">{t('dat.extras.more', { n: (extras.total - extras.extras.length).toLocaleString() })}</div>
              )}
            </div>
          )}
        </section>
      )}

      {(coverage || covLoading) && <CoverageModal coverage={coverage} loading={covLoading} onClose={() => setCoverage(null)} />}
    </div>
  );
}

function CoverageModal({ coverage, loading, onClose }: { coverage: DatCoverage | null; loading: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const missing = coverage?.missing ?? [];
  const filtered = q.trim()
    ? missing.filter((m) => (m.game || '').toLowerCase().includes(q.toLowerCase()) || (m.rom || '').toLowerCase().includes(q.toLowerCase()))
    : missing;

  const exportMissing = () => {
    if (!coverage) return;
    const lines = missing.map((m) => m.rom || m.game || m.crc || '').filter(Boolean);
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${(coverage.dat.name || 'dat').replace(/[^\w.-]+/g, '_')}-missing.txt`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.82)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-crt-line flex items-center gap-3 sticky-head">
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-sm text-glow-cyan truncate">{coverage?.dat.name || '…'}</h2>
            {coverage && (
              <div className="font-mono text-sm text-ink-dim">
                {t('dat.cov.have', { have: coverage.have, total: coverage.total })} · {t('dat.cov.missing', { n: coverage.missingTotal })}
              </div>
            )}
          </div>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>

        {loading ? (
          <div className="p-8 text-center font-mono text-base text-ink-dim">…</div>
        ) : coverage && (
          <>
            {coverage.collectionCrcCount === 0 && (
              <div className="m-4 p-3 rounded-lg font-mono text-sm flex items-start gap-2" style={{ background: 'rgba(255,180,0,.08)', color: 'var(--color-neon-amber)' }}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {t('dat.cov.crcWarn')}
              </div>
            )}
            <div className="px-4 pt-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-dim" />
                <input className="input !pl-8 w-full" placeholder={t('dat.cov.searchMissing')} value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <button className="btn !py-1.5 !px-3 text-sm shrink-0" onClick={exportMissing} disabled={!missing.length}><Download size={14} /> {t('dat.cov.export')}</button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {filtered.length === 0 ? (
                <div className="text-center font-mono text-base text-neon-green py-6 flex items-center justify-center gap-2"><CheckCircle2 size={16} /> {t('dat.cov.noMissing')}</div>
              ) : (
                <div className="flex flex-col gap-1">
                  {filtered.map((m, i) => (
                    <div key={i} className="flex items-center gap-3 font-mono text-sm panel !rounded-lg px-3 py-1.5">
                      <span className="text-ink-hi truncate flex-1 min-w-0" title={m.rom || m.game || ''}>{m.rom || m.game || '—'}</span>
                      {(m.crc || m.sha1) && <span className="text-ink-dim shrink-0 hidden sm:inline">{m.crc || (m.sha1 ? m.sha1.slice(0, 8) : '')}</span>}
                      {m.size != null && <span className="text-ink-dim shrink-0">{fmtBytes(m.size)}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
