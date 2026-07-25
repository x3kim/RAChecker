import { useEffect, useMemo, useState } from 'react';
import { ScanLine, FolderOpen, Square, Search, Download, RotateCw, Library as LibraryIcon, Trophy, Star, FolderSearch, AlertTriangle } from 'lucide-react';
import type { AppStatus, ScanStatus, ScanItem } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { useJobs } from '../lib/jobs';
import { FolderPicker } from './FolderPicker';
import { ResultsTable } from './ResultsTable';
import { ConsoleIcon, ProgressBar, SectionHeader, ViewToggle, StatusBadge } from './ui';
import { useI18n } from '../lib/i18n';
import { useViewMode } from '../lib/viewmode';
import { STATUS_META, statusLabel, statusHelp, pct, basename } from '../lib/util';

const COUNTER_ORDER: ScanStatus[] = ['match', 'no_match', 'needs_rahasher', 'ambiguous', 'unsupported', 'error', 'skipped'];

export function ScanView({ status, onOpenGame, goLibrary, onFindVersion }: {
  status: AppStatus | null; onOpenGame: (id: number) => void; goLibrary: () => void; onFindVersion: (item: any) => void;
}) {
  const { t } = useI18n();
  const jobs = useJobs();
  const { scan } = jobs;
  const [root, setRoot] = useState('');
  const [picker, setPicker] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | ScanStatus>('all');
  const [systemFilter, setSystemFilter] = useState<number | 'all'>('all');
  const [scanConsole, setScanConsole] = useState<number | 'all'>('all');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useViewMode('scan', 'table'); // table = dense rows, card = spacious

  useEffect(() => { if (!root && status?.romRoot) setRoot(status.romRoot); }, [status?.romRoot]);

  const shortById = useMemo(() => new Map((status?.consoles ?? []).map((c) => [c.id, c.short_code])), [status]);
  const nameById = useMemo(() => new Map((status?.consoles ?? []).map((c) => [c.id, c.name])), [status]);

  const buffer = scan.getBuffer();
  const inputValue = scan.active ? scan.rootPath : root;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return buffer.filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false;
      if (systemFilter !== 'all' && it.consoleId !== systemFilter) return false;
      if (q) {
        const hay = `${it.filePath} ${it.innerPath ?? ''} ${it.matchTitle ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.version, statusFilter, systemFilter, search]);

  const sysList = useMemo(() => {
    return [...scan.getSysAgg().entries()]
      .map(([id, v]) => ({ id, ...v, name: nameById.get(id) || String(id), short: shortById.get(id) }))
      .sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan.version]);

  const exportCsv = () => {
    const rows = [['file', 'inner', 'console', 'status', 'match', 'achievements', 'md5']];
    for (const it of buffer) {
      rows.push([
        it.filePath, it.innerPath ?? '', nameById.get(it.consoleId ?? -1) ?? '',
        it.status, it.matchTitle ?? it.message ?? '', String(it.matchAchievements ?? ''), it.md5 ?? '',
      ]);
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'ra-checker-scan.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const totals = scan.totals;
  const runningElsewhere = !!status?.activeScan && !scan.active;

  return (
    <div className="flex flex-col gap-5">
      {/* control bar */}
      <section className="panel p-4 crt-scanlines">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
          <div className="flex-1 flex gap-2">
            <input className="input" value={inputValue} onChange={(e) => setRoot(e.target.value)} placeholder={t('scan.rootPlaceholder')} disabled={scan.active} />
            <button className="btn" onClick={() => setPicker(true)} disabled={scan.active}><FolderOpen size={16} /> {t('scan.browse')}</button>
          </div>
          <div className="flex gap-2">
            <select className="input !w-auto" value={scanConsole} disabled={scan.active}
              onChange={(e) => setScanConsole(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              title={t('scan.onlySystemTip')}>
              <option value="all">{t('scan.allSystems')}</option>
              {(status?.consoles ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!scan.active ? (
              <button className="btn btn-primary" onClick={() => jobs.startScan(root, scanConsole === 'all' ? null : scanConsole)} disabled={!root || runningElsewhere}>
                {scan.done ? <RotateCw size={18} /> : <ScanLine size={18} />} {scan.done ? t('scan.rescan') : t('scan.start')}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={jobs.cancelScan}><Square size={16} /> {t('scan.cancel')}</button>
            )}
            <button className="btn" onClick={goLibrary} title={t('scan.viewCollection')}><LibraryIcon size={16} /></button>
            <button className="btn" onClick={exportCsv} disabled={!buffer.length}><Download size={16} /> CSV</button>
          </div>
        </div>

        {scan.error && (
          <div className="mt-3 font-mono text-sm flex items-center gap-2" style={{ color: 'var(--color-neon-red)' }}>
            <AlertTriangle size={15} className="shrink-0" /> <span>{t('scan.error', { msg: scan.error })}</span>
          </div>
        )}
        {runningElsewhere && (
          <div className="mt-3 font-mono text-sm flex items-center gap-2" style={{ color: 'var(--color-neon-amber)' }}>
            <AlertTriangle size={15} className="shrink-0" /> <span>{t('scan.runningElsewhere')}</span>
          </div>
        )}

        {(scan.active || totals.files > 0) && (
          <div className="mt-4">
            <ProgressBar value={totals.scanned} max={totals.files || totals.scanned} label={scan.active ? t('scan.scanning') : t('scan.finished')} />
            {scan.active && scan.current && (
              <div className="font-mono text-sm mt-2 flex items-center gap-2 min-w-0">
                <span className="animate-blink text-neon-cyan shrink-0">▮</span>
                <span className="text-ink-mid shrink-0">{t('scan.current')}</span>
                <span className="text-ink-hi truncate" title={scan.current.file}>{scan.current.file}</span>
                {scan.current.phase && (
                  <span className="text-neon-amber shrink-0">
                    · {t(`scan.phase.${scan.current.phase}`)}
                    {scan.current.phaseTotal ? ` ${pct(scan.current.phaseDone || 0, scan.current.phaseTotal)}%` : ''}
                  </span>
                )}
                {scan.current.total > 0 && <span className="text-ink-dim shrink-0">· {scan.current.index.toLocaleString('de-DE')}/{scan.current.total.toLocaleString('de-DE')}</span>}
              </div>
            )}
          </div>
        )}
      </section>

      {/* counters */}
      {(totals.scanned > 0 || scan.active) && (
        <section className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {COUNTER_ORDER.map((s) => {
            const m = STATUS_META[s];
            const v = (totals as any)[s] as number;
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(active ? 'all' : s)} title={statusHelp(s)}
                className="panel !rounded-lg p-3 text-left transition-all"
                style={active ? { borderColor: m.color, boxShadow: m.glow } : {}}>
                <div className="font-display text-lg" style={{ color: m.color }}>{v ?? 0}</div>
                <div className="font-mono text-base text-ink-mid mt-1">{statusLabel(s)}</div>
              </button>
            );
          })}
        </section>
      )}

      {/* per-system aggregation */}
      {sysList.length > 0 && (
        <section className="panel p-4">
          <SectionHeader accent="var(--color-neon-cyan)" title={t('scan.systemsInScan')} />
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setSystemFilter('all')} className="btn !py-1 !px-2.5 text-sm"
              style={systemFilter === 'all' ? { borderColor: 'var(--color-neon-cyan)' } : {}}>{t('common.all')}</button>
            {sysList.map((s) => (
              <button key={s.id} onClick={() => setSystemFilter(systemFilter === s.id ? 'all' : s.id)}
                className="btn !py-1 !px-2.5 text-sm"
                style={systemFilter === s.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}
                title={s.name}>
                <ConsoleIcon id={s.id} short={s.short} size={18} />
                <span className="font-body">{s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name}</span>
                <span className="font-mono" style={{ color: s.match > 0 ? 'var(--color-neon-green)' : 'var(--color-ink-dim)' }}>
                  {s.match}/{s.total} ({pct(s.match, s.total)}%)
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* search + table */}
      <section className="flex items-center gap-2 flex-wrap">
        <div className="flex-1 min-w-[180px] flex items-center gap-2 panel !rounded-lg px-3">
          <Search size={16} className="text-ink-dim" />
          <input data-search="1" className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('scan.filterPlaceholder')} />
        </div>
        <ViewToggle mode={mode} onChange={setMode} />
        <span className="font-mono text-ink-dim text-base">{t('scan.hits', { n: filtered.length.toLocaleString('de-DE') })}</span>
      </section>

      {buffer.length > 0 ? (
        mode === 'card'
          ? <ScanCards items={filtered} shortById={shortById} onOpenGame={onOpenGame} />
          : <ResultsTable items={filtered} consoleShortById={shortById} onOpenGame={onOpenGame} onFindVersion={onFindVersion} dense />
      ) : (
        <div className="panel p-10 text-center">
          <ScanLine size={40} className="mx-auto text-ink-dim mb-3" />
          <div className="font-display text-sm text-ink-mid">{t('scan.ready')}</div>
          <div className="font-body text-ink-dim mt-2 text-sm">
            {t('scan.readyBody')}
          </div>
        </div>
      )}

      {picker && <FolderPicker initialPath={root} onPick={(p) => { setRoot(p); setPicker(false); }} onClose={() => setPicker(false)} />}
    </div>
  );
}

// Spacious card view of scan results (alternative to the dense ResultsTable).
function ScanCards({ items, shortById, onOpenGame }: {
  items: ScanItem[]; shortById: Map<number, string | undefined>; onOpenGame: (id: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {items.slice(0, 800).map((r, i) => {
        const name = basename(r.innerPath || r.filePath);
        const clickable = r.status === 'match' && r.matchGameId != null;
        return (
          <div key={`${r.filePath}|${r.innerPath ?? ''}|${i}`}
            className="panel !rounded-lg p-3 flex items-start gap-3" style={{ borderColor: 'var(--color-crt-line)' }}>
            {r.matchImage
              ? <img src={imageUrl(r.matchImage)} width={40} height={40} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
              : <span className="shrink-0 grid place-items-center rounded" style={{ width: 40, height: 40, border: '1px solid var(--color-crt-line)' }}><ConsoleIcon id={r.consoleId} short={r.consoleId != null ? shortById.get(r.consoleId) : undefined} size={22} /></span>}
            <div className="min-w-0 flex-1">
              <div className="font-body text-sm text-ink-hi truncate" title={name}>{name}</div>
              {r.status === 'match' && r.matchTitle && (
                <button className="font-body text-sm text-neon-green truncate block max-w-full text-left hover:underline" onClick={() => { if (clickable) onOpenGame(r.matchGameId!); }} title={r.matchTitle}>{r.matchTitle}</button>
              )}
              {r.status !== 'match' && r.message && <div className="font-mono text-sm text-ink-dim truncate" title={r.message}>{r.message}</div>}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <StatusBadge status={r.status} />
                {r.consoleId != null && <ConsoleIcon id={r.consoleId} short={shortById.get(r.consoleId)} size={16} />}
                {r.status === 'match' && (
                  <span className="font-mono text-sm flex items-center gap-2">
                    <span className="text-neon-amber inline-flex items-center gap-1"><Trophy size={11} /> {r.matchAchievements ?? 0}</span>
                    {r.matchPoints != null && <span className="text-neon-cyan inline-flex items-center gap-1"><Star size={11} /> {r.matchPoints}</span>}
                  </span>
                )}
                <button className="btn !py-0.5 !px-1.5 text-sm ml-auto shrink-0" onClick={() => api.reveal(r.filePath).catch(() => {})} title={t('rt.explorerTip')}><FolderSearch size={12} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
