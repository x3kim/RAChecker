// Global job state (scan + sync) lifted above the tab navigation so switching
// tabs never aborts a running scan/sync. The EventSource + result buffer live
// in this provider, which is mounted once at the app root.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { openStream } from './api';
import type { ScanItem, ScanTotals } from './api';

const EMPTY: ScanTotals = { files: 0, processed: 0, scanned: 0, match: 0, no_match: 0, needs_rahasher: 0, unsupported: 0, error: 0, skipped: 0, ambiguous: 0 };

interface SyncState { active: boolean; done: boolean; cur: { done: number; total: number; name: string }; summary: any | null; error: string | null; }
interface WarmState { active: boolean; done: boolean; total: number; doneCount: number; images: number; errors: number; title: string; }

interface JobsValue {
  scan: {
    active: boolean; done: boolean; scanId: number | null; rootPath: string;
    version: number; totals: ScanTotals;
    current: { file: string; index: number; total: number; phase?: string; phaseDone?: number; phaseTotal?: number } | null;
    error: string | null;
    getBuffer: () => ScanItem[];
    getSysAgg: () => Map<number, { match: number; total: number }>;
  };
  startScan: (path: string, consoleId?: number | null, existingSid?: string) => void;
  cancelScan: () => void;
  sync: SyncState;
  startSync: (force: boolean, consoleIds?: number[]) => void;
  imageWarm: WarmState;
  startImageWarm: () => void;
}

const JobsCtx = createContext<JobsValue | null>(null);
export const useJobs = () => {
  const v = useContext(JobsCtx);
  if (!v) throw new Error('useJobs must be used within JobsProvider');
  return v;
};

export function JobsProvider({ children, onChange }: { children: ReactNode; onChange?: () => void }) {
  // --- scan ---
  const scanEs = useRef<EventSource | null>(null);
  const bufRef = useRef<ScanItem[]>([]);
  const sysRef = useRef<Map<number, { match: number; total: number }>>(new Map());
  const totalsRef = useRef<ScanTotals>(EMPTY);
  const curRef = useRef<{ file: string; index: number; total: number; phase?: string; phaseDone?: number; phaseTotal?: number } | null>(null);
  const flushTimer = useRef<number | null>(null);
  const [scanMeta, setScanMeta] = useState<{ active: boolean; done: boolean; scanId: number | null; rootPath: string; error: string | null }>(
    { active: false, done: false, scanId: null, rootPath: '', error: null });
  const [version, setVersion] = useState(0);

  // --- sync ---
  const syncEs = useRef<EventSource | null>(null);
  const [sync, setSync] = useState<SyncState>({ active: false, done: false, cur: { done: 0, total: 0, name: '' }, summary: null, error: null });

  // --- image pre-cache (badges/box art) — lifted here so it survives tab switches ---
  const warmEs = useRef<EventSource | null>(null);
  const [imageWarm, setImageWarm] = useState<WarmState>({ active: false, done: false, total: 0, doneCount: 0, images: 0, errors: 0, title: '' });

  useEffect(() => () => { scanEs.current?.close(); syncEs.current?.close(); warmEs.current?.close(); if (flushTimer.current) clearInterval(flushTimer.current); }, []);

  const stopScan = useCallback((message?: string) => {
    scanEs.current?.close(); scanEs.current = null;
    if (flushTimer.current) { clearInterval(flushTimer.current); flushTimer.current = null; }
    curRef.current = null;
    setScanMeta((m) => ({ ...m, active: false, done: true, error: message ?? m.error }));
    setVersion((v) => v + 1);
    onChange?.();
  }, [onChange]);

  // `existingSid` reconnects to a scan that is already running on the server —
  // used after a page reload, where this provider is fresh but the scan is not.
  const startScan = useCallback((path: string, consoleId?: number | null, existingSid?: string) => {
    if (scanEs.current) return;
    bufRef.current = []; sysRef.current = new Map(); totalsRef.current = { ...EMPTY }; curRef.current = null;
    setScanMeta({ active: true, done: false, scanId: null, rootPath: path, error: null });
    setVersion((v) => v + 1);
    // Session id for this run. EventSource reconnects on its own after a
    // network hiccup; the sid lets the server tell "this is my watcher coming
    // back" from "someone wants a second scan", so a dropped connection
    // reattaches instead of leaving the scan unreachable until it finishes.
    const sid = existingSid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const url = `/api/scan/stream?path=${encodeURIComponent(path)}&sid=${encodeURIComponent(sid)}`
      + (consoleId != null ? `&console=${consoleId}` : '');
    const es = openStream(url, {
      init: (d) => {
        // Reattached: the server replays the rows it already sent, so drop what
        // this client collected before the drop or they would appear twice.
        if (d.attached) { bufRef.current = []; sysRef.current = new Map(); }
        setScanMeta((m) => ({ ...m, scanId: d.scanId, active: true, done: false, error: null }));
      },
      processing: (d) => { curRef.current = { file: d.file || '', index: d.index || 0, total: d.total || 0 }; },
      phase: (d) => {
        const cur = curRef.current || { file: d.file || '', index: 0, total: 0 };
        curRef.current = { ...cur, file: d.file || cur.file, phase: d.phase, phaseDone: d.done, phaseTotal: d.total };
      },
      enumerated: (d) => { totalsRef.current = { ...totalsRef.current, files: d.files }; },
      progress: (d) => { if (d.totals) totalsRef.current = d.totals; },
      result: (d: ScanItem) => {
        bufRef.current.push(d);
        if (d.consoleId != null) {
          const s = sysRef.current.get(d.consoleId) || { match: 0, total: 0 };
          s.total++; if (d.status === 'match') s.match++;
          sysRef.current.set(d.consoleId, s);
        }
        if (d.totals) totalsRef.current = d.totals;
      },
      done: (d) => { if (d.totals) totalsRef.current = d.totals; stopScan(); },
      error: (d) => stopScan(d?.message),
      // A transient drop leaves EventSource in CONNECTING while it retries —
      // let it, the server reattaches us to the still-running scan. Only a
      // genuinely closed stream ends the run for this client.
      __error: () => { if (!scanEs.current || scanEs.current.readyState === EventSource.CLOSED) stopScan(); },
    });
    scanEs.current = es;
    flushTimer.current = window.setInterval(() => setVersion((v) => v + 1), 300);
  }, [stopScan]);

  const cancelScan = useCallback(() => { fetch('/api/scan/cancel', { method: 'POST' }).catch(() => {}); stopScan(); }, [stopScan]);

  const startSync = useCallback((force: boolean, consoleIds?: number[]) => {
    if (syncEs.current) return;
    setSync({ active: true, done: false, cur: { done: 0, total: 0, name: '' }, summary: null, error: null });
    const params = new URLSearchParams({ force: force ? '1' : '0' });
    if (consoleIds?.length) params.set('consoles', consoleIds.join(','));
    const stop = (message?: string) => { syncEs.current?.close(); syncEs.current = null; setSync((s) => ({ ...s, active: false, done: true, error: message ?? s.error })); onChange?.(); };
    const es = openStream(`/api/sync/stream?${params.toString()}`, {
      progress: (d) => { if (d.name) setSync((s) => ({ ...s, cur: { done: d.done ?? 0, total: d.total ?? 0, name: d.name } })); },
      summary: (d) => { setSync((s) => ({ ...s, summary: d })); stop(); },
      // 'done' carries the full summary too; close here so the browser doesn't
      // auto-reconnect and kick off a second sync.
      done: (d) => { setSync((s) => ({ ...s, summary: s.summary ?? d })); stop(); },
      error: (d) => stop(d?.message),
      __error: () => stop(),
    });
    syncEs.current = es;
  }, [onChange]);

  const startImageWarm = useCallback(() => {
    if (warmEs.current) return;
    setImageWarm({ active: true, done: false, total: 0, doneCount: 0, images: 0, errors: 0, title: '' });
    const stop = () => { warmEs.current?.close(); warmEs.current = null; setImageWarm((s) => ({ ...s, active: false, done: true })); onChange?.(); };
    warmEs.current = openStream('/api/cache/images/stream', {
      init: (d) => setImageWarm((s) => ({ ...s, total: d.total ?? 0 })),
      progress: (d) => setImageWarm((s) => ({ ...s, doneCount: d.done ?? 0, total: d.total ?? s.total, images: d.images ?? s.images, title: d.title ?? '' })),
      done: (d) => { setImageWarm((s) => ({ ...s, images: d.images ?? s.images, errors: d.errors ?? 0 })); stop(); },
      error: () => stop(),
      __error: () => stop(),
    });
  }, [onChange]);

  // Auto pre-load achievement badges/box art after a scan finishes, when the
  // user opted in (Settings checkbox -> localStorage 'ra-preload-auto'). Fires
  // on the rising edge of scan completion.
  useEffect(() => {
    if (!scanMeta.done || scanMeta.active) return;
    try {
      if (localStorage.getItem('ra-preload-auto') === '1' && !warmEs.current) {
        localStorage.setItem('ra-preload-done', String(Date.now()));
        startImageWarm();
      }
    } catch { /* localStorage unavailable — skip */ }
  }, [scanMeta.done, scanMeta.active, startImageWarm]);

  const value: JobsValue = {
    scan: {
      active: scanMeta.active, done: scanMeta.done, scanId: scanMeta.scanId, rootPath: scanMeta.rootPath,
      version, totals: totalsRef.current, current: curRef.current, error: scanMeta.error,
      getBuffer: () => bufRef.current, getSysAgg: () => sysRef.current,
    },
    startScan, cancelScan,
    sync, startSync,
    imageWarm, startImageWarm,
  };

  return <JobsCtx.Provider value={value}>{children}</JobsCtx.Provider>;
}
