import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import { Save, FolderOpen, HardDriveDownload, Cpu, CheckCircle2, KeyRound, Clock, Info, Palette, Check, Eye, EyeOff, LogIn, LogOut, UserRound, ExternalLink, Type, Database, Trash2, RefreshCw, Archive, Download, RotateCcw, Power, Gauge, HardDrive, MonitorSmartphone, Files, Settings2, CalendarClock } from 'lucide-react';
import { ImageDown, Sparkles, Play, Joystick, AlertTriangle, Upload, Package } from 'lucide-react';
import type { AppStatus, CacheTtls, BackupInfo, WatchStatus, StorageInfo, BigFileCopy, RateLimit, ScheduleStatus, EmulatorStatus, PresenceStatus, OfflineReadiness } from '../lib/api';
import { api, openStream } from '../lib/api';
import { useJobs } from '../lib/jobs';
import { visibleThemes, UI_FONTS, loadFont, applyFont, loadProgressStyle, applyProgressStyle, loadAurora, applyAurora } from '../lib/theme';
import type { ProgressStyle } from '../lib/theme';
import { Pct } from './Progress';
import { useI18n } from '../lib/i18n';
import { APP_VERSION } from '../lib/version';
import { fmtBytes, fmtDate, fmtAgo } from '../lib/util';
import { FolderPicker } from './FolderPicker';
import { RegionPriority } from './RegionPriority';
import { GenrePanel } from './GenrePanel';
import { ConsoleIcon } from './ui';

// Settings are split into groups shown one at a time via a top nav — keeps the
// (many) panels compact and scannable instead of one endless page.
// "Darstellung" wurde in "Allgemein" gemergt — kein eigener Tab mehr.
type SetGroup = 'general' | 'scanning' | 'data' | 'emulator' | 'advanced';
const GROUPS: { id: SetGroup; key: string; icon: ComponentType<any> }[] = [
  { id: 'general', key: 'set.groupGeneral', icon: UserRound },
  { id: 'scanning', key: 'set.groupScanning', icon: Eye },
  { id: 'data', key: 'set.groupData', icon: Database },
  { id: 'emulator', key: 'set.groupEmulator', icon: Play },
  { id: 'advanced', key: 'set.groupAdvanced', icon: Settings2 },
];

export function Settings({ status, refresh, onAuthChange, theme, changeTheme }: {
  status: AppStatus | null; refresh: () => void; onAuthChange: () => void; theme: string; changeTheme: (id: string) => void;
}) {
  const [root, setRoot] = useState('');
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState(false);
  // ---- download target folder (where the user drops free-game ROMs) ----
  const [downloadDir, setDownloadDir] = useState('');
  const [dlPicker, setDlPicker] = useState(false);
  const [dlSaved, setDlSaved] = useState(false);
  const [dlMsg, setDlMsg] = useState('');
  const saveDownloadDir = async () => {
    const r = await api.saveServerSettings({ downloadDir });
    setDownloadDir(r.downloadDir ?? downloadDir);
    setDlSaved(true); setTimeout(() => setDlSaved(false), 1800);
  };
  const openDownloadDir = async () => {
    setDlMsg('');
    const r = await api.openFolder('download');
    if (!r.ok) setDlMsg(t('set.openFolderFail'));
  };
  const [installing, setInstalling] = useState(false);
  const [installMsg, setInstallMsg] = useState<string>('');
  const [font, setFont] = useState(loadFont());
  const esRef = useRef<EventSource | null>(null);
  const recheckRef = useRef<EventSource | null>(null);
  const { t } = useI18n();
  const jobs = useJobs();
  const [group, setGroup] = useState<SetGroup>('general');

  const changeFont = (id: string) => { setFont(id); applyFont(id); };

  // ---- progress style (bar/ring) + aurora background ----
  const [progStyle, setProgStyle] = useState<ProgressStyle>(loadProgressStyle());
  const changeProg = (s: ProgressStyle) => { setProgStyle(s); applyProgressStyle(s); window.dispatchEvent(new Event('ra-progress')); };
  const [aurora, setAurora] = useState(loadAurora());
  const toggleAurora = () => { const v = !aurora; setAurora(v); applyAurora(v); };
  // ---- always-open-game-modal-fullscreen preference (read by GameModal) ----
  const [gmFull, setGmFull] = useState(() => localStorage.getItem('ra-gm-full') === '1');
  const toggleGmFull = () => { const v = !gmFull; setGmFull(v); localStorage.setItem('ra-gm-full', v ? '1' : '0'); };

  // ---- pre-cache achievement badges + box art (runs in JobsProvider so it
  // keeps going + stays visible in the HUD when you switch tabs) ----
  const warm = jobs.imageWarm;
  const warming = warm.active;
  const warmImages = () => { localStorage.setItem('ra-preload-done', String(Date.now())); setPreloadDone(Date.now()); jobs.startImageWarm(); };
  const warmMsg = warm.active
    ? t('cache.images.progress', { done: warm.doneCount, total: warm.total, images: warm.images }) + (warm.title ? ` · ${warm.title}` : '')
    : warm.done ? t('cache.images.done', { images: warm.images, errors: warm.errors }) : '';

  // ---- preload indicator + auto toggle (#11) ----
  const [preloadDone, setPreloadDone] = useState<number>(() => Number(localStorage.getItem('ra-preload-done')) || 0);
  const [preloadAuto, setPreloadAuto] = useState<boolean>(() => localStorage.getItem('ra-preload-auto') === '1');
  const togglePreloadAuto = () => { const v = !preloadAuto; setPreloadAuto(v); localStorage.setItem('ra-preload-auto', v ? '1' : '0'); };

  // ---- re-check the needs_rahasher backlog ----
  const [rechecking, setRechecking] = useState(false);
  const [recheckMsg, setRecheckMsg] = useState('');
  const recheckRahasher = () => {
    setRechecking(true); setRecheckMsg(t('set.starting'));
    recheckRef.current = openStream('/api/library/recheck-rahasher/stream', {
      init: (d) => setRecheckMsg(d.total ? t('set.recheckInit', { n: d.total }) : t('set.recheckNone')),
      progress: (d) => setRecheckMsg(t('set.recheckProgress', { checked: d.checked, total: d.total, file: d.file || '' })),
      done: (d) => { setRecheckMsg(t('set.recheckDone', { nowMatch: d.nowMatch, noMatch: d.noMatch, errors: d.errors })); setRechecking(false); recheckRef.current?.close(); refresh(); },
      error: (d) => { setRecheckMsg(t('set.errorPrefix', { msg: d.message || t('set.unknown') })); setRechecking(false); recheckRef.current?.close(); },
      __error: () => { setRecheckMsg(t('set.connLost')); setRechecking(false); recheckRef.current?.close(); },
    });
  };

  // ---- cache freshness ----
  const [ttls, setTtls] = useState<CacheTtls | null>(null);
  const [scanTimeout, setScanTimeout] = useState(600);
  const [cacheSaved, setCacheSaved] = useState(false);
  const [cacheMsg, setCacheMsg] = useState('');

  // ---- server-side settings (systems, big-file, rate limit, rahasher path) ----
  const [enabledConsoles, setEnabledConsoles] = useState<number[] | null>(null);
  const [bigFile, setBigFile] = useState<BigFileCopy>({ enabled: false, thresholdMB: 1024, maxThresholdMB: 8192 });
  const [rateLimit, setRateLimit] = useState<RateLimit>({ minIntervalMs: 0, maxRetries: 0 });
  const [rahasherPath, setRahasherPath] = useState('');
  const [rahPicker, setRahPicker] = useState(false);   // file picker for RAHasher.exe
  const [rahPathSaved, setRahPathSaved] = useState(false);
  const [rahMsg, setRahMsg] = useState('');
  const saveRahasherPath = async () => {
    const r = await api.saveServerSettings({ rahasherPath: rahasherPath.trim() });
    setRahasherPath(r.rahasherPath ?? '');
    setRahPathSaved(true); setTimeout(() => setRahPathSaved(false), 1800);
    refresh();
  };
  const detectRah = async () => {
    setRahMsg('…');
    try {
      const r = await api.detectRahasher();
      if (r.found) { setRahasherPath(r.path); setRahMsg(t('set.rahDetected')); }
      else setRahMsg(t('set.rahNotDetected'));
    } catch { setRahMsg(t('set.rahNotDetected')); }
    setTimeout(() => setRahMsg(''), 4000);
  };
  const [systemsSaved, setSystemsSaved] = useState(false);
  const [bigFileSaved, setBigFileSaved] = useState(false);
  const [advancedSaved, setAdvancedSaved] = useState(false);
  const [scanConcurrency, setScanConcurrency] = useState(1);
  const [concSaved, setConcSaved] = useState(false);
  const [skipCollected, setSkipCollected] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  useEffect(() => { api.schedule().then(setSchedule).catch(() => {}); }, []);
  const saveSchedule = async (patch: { enabled?: boolean; time?: string }) => {
    try { setSchedule(await api.saveSchedule(patch)); } catch { /* ignore */ }
  };

  const loadSettings = () => api.settings().then((s) => {
    setTtls(s.cacheTtls); setScanTimeout(s.scanFileTimeoutSec);
    setScanConcurrency(s.scanConcurrency ?? 1);
    setSkipCollected(!!s.skipCollected);
    setEnabledConsoles(s.enabledConsoles);
    setBigFile(s.bigFileCopy ?? { enabled: false, thresholdMB: 1024, maxThresholdMB: 8192 });
    setRateLimit(s.rateLimit ?? { minIntervalMs: 0, maxRetries: 0 });
    setRahasherPath(s.rahasherPath ?? '');
    setDownloadDir(s.downloadDir ?? '');
  }).catch(() => {});
  const saveConc = async () => {
    const r = await api.saveServerSettings({ scanConcurrency });
    setScanConcurrency(r.scanConcurrency ?? scanConcurrency);
    setConcSaved(true); setTimeout(() => setConcSaved(false), 1800);
  };
  const toggleSkip = async () => {
    const next = !skipCollected;
    setSkipCollected(next);
    try { await api.saveServerSettings({ skipCollected: next }); } catch { setSkipCollected(!next); }
  };
  useEffect(() => { loadSettings(); }, []);

  const setTtl = (k: keyof CacheTtls, v: number) => setTtls((t) => (t ? { ...t, [k]: Math.max(0, v) } : t));
  const saveTtls = async () => {
    if (!ttls) return;
    const r = await api.saveCacheTtls(ttls); setTtls(r.cacheTtls);
    await api.saveScanTimeout(Math.max(10, scanTimeout)).catch(() => {});
    setCacheSaved(true); setTimeout(() => setCacheSaved(false), 1800);
  };
  const clearCache = async () => {
    setCacheMsg(t('set.clearing'));
    try { await api.clearCache('all'); setCacheMsg(t('set.cacheCleared')); }
    catch { setCacheMsg(t('set.clearError')); }
    setTimeout(() => setCacheMsg(''), 3500);
  };

  // ---- system selection (#7) ----
  const allConsoles = status?.consoles ?? [];
  const totalSystems = allConsoles.length;
  const allSelected = enabledConsoles === null || (totalSystems > 0 && enabledConsoles.length >= totalSystems);
  const isSystemOn = (id: number) => enabledConsoles === null || enabledConsoles.includes(id);
  const toggleSystem = (id: number) => {
    const base = enabledConsoles === null ? allConsoles.map((c) => c.id) : enabledConsoles;
    setEnabledConsoles(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  };
  const selectAllSystems = () => setEnabledConsoles(allConsoles.map((c) => c.id));
  const selectNoSystems = () => setEnabledConsoles([]);
  // Empty selection means "no filter" server-side, i.e. ALL systems — the exact
  // opposite of what picking "None" looks like, so saving is blocked (#5).
  const systemsEmpty = enabledConsoles !== null && enabledConsoles.length === 0;
  const saveSystems = async () => {
    if (systemsEmpty) return;
    // Selecting all == no filter; "None" stores [] (backend treats as all again).
    const arr = allSelected ? allConsoles.map((c) => c.id) : (enabledConsoles ?? []);
    const r = await api.saveServerSettings({ enabledConsoles: arr });
    setEnabledConsoles(r.enabledConsoles);
    setSystemsSaved(true); setTimeout(() => setSystemsSaved(false), 1800);
  };

  // ---- big-file local copy (#5) ----
  const saveBigFile = async () => {
    const r = await api.saveServerSettings({ bigFileCopy: {
      enabled: bigFile.enabled,
      thresholdMB: Math.max(1, bigFile.thresholdMB),
      maxThresholdMB: Math.max(0, bigFile.maxThresholdMB ?? 0),
    } });
    setBigFile(r.bigFileCopy);
    setBigFileSaved(true); setTimeout(() => setBigFileSaved(false), 1800);
  };

  // ---- advanced: rate limit (RAHasher path moved to Data → RAHasher) ----
  const saveAdvanced = async () => {
    const r = await api.saveServerSettings({
      rateLimit: { minIntervalMs: Math.max(0, rateLimit.minIntervalMs), maxRetries: Math.max(0, rateLimit.maxRetries) },
    });
    setRateLimit(r.rateLimit); setRahasherPath(r.rahasherPath ?? '');
    setAdvancedSaved(true); setTimeout(() => setAdvancedSaved(false), 1800);
  };

  // ---- storage usage (#13) ----
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const [storageBusy, setStorageBusy] = useState(false);
  const [tempMsg, setTempMsg] = useState('');
  const [tempBusy, setTempBusy] = useState(false);
  const loadStorage = async () => {
    setStorageBusy(true);
    try { setStorage(await api.storage()); } catch { /* ignore */ }
    finally { setStorageBusy(false); }
  };
  useEffect(() => { loadStorage(); }, []);
  const clearTemp = async () => {
    setTempBusy(true); setTempMsg('…');
    try {
      const r = await api.clearTemp();
      setTempMsg(r.ok ? t('set.storageCleared', { n: r.removed, size: fmtBytes(r.freed) }) : (r.error || t('common.error')));
      await loadStorage();
    } catch { setTempMsg(t('common.error')); }
    finally { setTempBusy(false); setTimeout(() => setTempMsg(''), 4000); }
  };
  const tempKindLabel = (k: string) => t(({ upload: 'set.tempUpload', bigcopy: 'set.tempBigcopy', backup: 'set.tempBackup', extract: 'set.tempExtract' } as Record<string, string>)[k] || 'set.tempOther');

  // ---- destructive resets (images / collection / hash DB) ----
  const [resetBusy, setResetBusy] = useState('');
  const [resetMsg, setResetMsg] = useState('');
  const clearImages = async () => {
    if (!window.confirm(t('set.reset.imagesConfirm'))) return;
    setResetBusy('images'); setResetMsg('…');
    try { const r = await api.clearImages(); setResetMsg(t('set.reset.imagesDone', { n: r.removed, size: fmtBytes(r.freed) })); await loadStorage(); }
    catch { setResetMsg(t('common.error')); }
    finally { setResetBusy(''); setTimeout(() => setResetMsg(''), 5000); }
  };
  const resetCollection = async () => {
    if (!window.confirm(t('set.reset.collectionConfirm'))) return;
    setResetBusy('collection'); setResetMsg('…');
    try {
      const r = await api.resetCollection();
      setResetMsg(r.ok ? t('set.reset.collectionDone') : (r.error || t('common.error')));
      await loadStorage(); refresh();
    } catch { setResetMsg(t('common.error')); }
    finally { setResetBusy(''); setTimeout(() => setResetMsg(''), 6000); }
  };
  const resetHashDb = async () => {
    if (!window.confirm(t('set.reset.hashdbConfirm'))) return;
    setResetBusy('hashdb'); setResetMsg('…');
    try {
      const r = await api.resetHashDb();
      setResetMsg(r.ok ? t('set.reset.hashdbDone') : (r.error || t('common.error')));
      await loadStorage(); refresh();
    } catch { setResetMsg(t('common.error')); }
    finally { setResetBusy(''); setTimeout(() => setResetMsg(''), 6000); }
  };

  // ---- folder watch config (#1) ----
  const w = status?.watch;
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [watchMode, setWatchMode] = useState<'interval' | 'events'>('interval');
  const [watchInterval, setWatchInterval] = useState(10);
  const [watchBusy, setWatchBusy] = useState(false);
  // Sync local watch draft from server status once it arrives / changes.
  useEffect(() => {
    if (!w) return;
    setWatchEnabled(Boolean(w.enabled ?? w.active));
    if (w.mode) setWatchMode(w.mode);
    if (w.intervalMin != null) setWatchInterval(w.intervalMin);
  }, [w?.enabled, w?.active, w?.mode, w?.intervalMin]);
  const applyWatch = async () => {
    setWatchBusy(true);
    try {
      await api.watchConfig({ enabled: watchEnabled, mode: watchMode, intervalMin: Math.max(1, watchInterval) });
      refresh();
    } finally { setWatchBusy(false); }
  };
  // Relative time for the next/last run line. fmtAgo handles the past; for a
  // future timestamp we just show "~N min" using the existing minutes unit.
  const watchWhen = (() => {
    const ms = w?.nextRunAt;
    if (!ms) return w?.lastRunAt ? fmtAgo(w.lastRunAt) : t('set.watchIdle');
    const diff = ms - Date.now();
    if (diff <= 0) return fmtAgo(ms);
    const mins = Math.max(1, Math.round(diff / 60000));
    return `~${mins} ${t('set.watchIntervalUnit')}`;
  })();

  // ---- database backups ----
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  useEffect(() => { api.backups().then((b) => setBackups(b.backups)).catch(() => {}); }, []);
  const [restoreMsg, setRestoreMsg] = useState('');
  const [restoreOk, setRestoreOk] = useState(true);
  const backupNow = async () => {
    setBackingUp(true);
    try { const r = await api.backupNow(); setBackups(r.backups || []); }
    finally { setBackingUp(false); }
  };
  const restore = async (name: string) => {
    if (!window.confirm(t('set.restoreConfirm', { name }))) return;
    setRestoreMsg('…');
    const r = await api.restoreBackup(name);
    setRestoreOk(r.ok);
    setRestoreMsg(r.ok ? t('set.restoreQueued') : t('set.errorPrefix', { msg: r.error || t('set.unknown') }));
  };

  // ---- offline package (readiness + export/import) ----
  const [offline, setOffline] = useState<OfflineReadiness | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [offMsg, setOffMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const offFileRef = useRef<HTMLInputElement | null>(null);
  const loadOffline = async () => {
    setOffBusy(true);
    try { setOffline(await api.offlineReadiness()); } catch { /* ignore */ }
    finally { setOffBusy(false); }
  };
  useEffect(() => { loadOffline(); }, []);
  const importOffline = async (file: File) => {
    if (!window.confirm(t('off.importConfirm'))) return;
    setOffBusy(true); setOffMsg(null);
    try {
      const r = await api.offlineImport(file);
      setOffMsg(r.ok
        ? { ok: true, text: t('off.imported', { n: r.images ?? 0 }) }
        : { ok: false, text: t('off.importFailed', { e: r.error ?? '' }) });
      if (r.ok) await loadOffline();
    } catch (e: any) {
      setOffMsg({ ok: false, text: t('off.importFailed', { e: e?.message || t('set.unknown') }) });
    } finally { setOffBusy(false); }
  };

  // ---- emulator paths (RetroArch + cores) ----
  const [emu, setEmu] = useState<EmulatorStatus | null>(null);
  const [emuPath, setEmuPath] = useState('');
  const [emuCoreDir, setEmuCoreDir] = useState('');
  const [emuArgs, setEmuArgs] = useState('');
  const [emuSaved, setEmuSaved] = useState(false);
  const [corePicker, setCorePicker] = useState(false);
  const [emuPicker, setEmuPicker] = useState(false);   // file picker for retroarch.exe
  const [detecting, setDetecting] = useState(false);
  const [detectMsg, setDetectMsg] = useState('');
  const applyEmu = (e: EmulatorStatus) => {
    setEmu(e); setEmuPath(e.retroarchPath ?? ''); setEmuCoreDir(e.coreDir ?? ''); setEmuArgs(e.extraArgs ?? '');
  };
  useEffect(() => { api.emulator().then(applyEmu).catch(() => {}); }, []);
  const saveEmu = async () => {
    const r = await api.saveEmulator({ retroarchPath: emuPath.trim(), coreDir: emuCoreDir.trim(), extraArgs: emuArgs.trim() });
    applyEmu(r);
    setEmuSaved(true); setTimeout(() => setEmuSaved(false), 1800);
  };
  // Opt-in auto-detect: fill the fields with whatever was found (user still saves).
  const detectEmu = async () => {
    setDetecting(true); setDetectMsg('');
    try {
      const r = await api.detectEmulator(false);
      if (r.retroarchPath) setEmuPath(r.retroarchPath);
      if (r.coreDir) setEmuCoreDir(r.coreDir);
      setDetectMsg(r.retroarchPath ? t('set.emuDetected') : t('set.emuNotDetected'));
    } catch { setDetectMsg(t('set.emuNotDetected')); }
    finally { setDetecting(false); setTimeout(() => setDetectMsg(''), 4000); }
  };

  // ---- rich presence / playtime tracking ----
  const [presence, setPresence] = useState<PresenceStatus | null>(null);
  const [presEnabled, setPresEnabled] = useState(false);
  const [presInterval, setPresInterval] = useState(5);
  const [presStale, setPresStale] = useState(15);
  const [presSaved, setPresSaved] = useState(false);
  const applyPresence = (p: PresenceStatus) => {
    setPresence(p); setPresEnabled(p.enabled); setPresInterval(p.intervalMin); setPresStale(p.staleMin);
  };
  useEffect(() => { api.presence().then(applyPresence).catch(() => {}); }, []);
  const savePresence = async () => {
    const r = await api.savePresence({
      enabled: presEnabled,
      intervalMin: Math.max(1, Math.min(60, presInterval)),
      staleMin: Math.max(2, Math.min(180, presStale)),
    });
    applyPresence(r);
    setPresSaved(true); setTimeout(() => setPresSaved(false), 1800);
  };

  // ---- RA account ----
  const loggedIn = Boolean(status?.ra.hasKey && status?.ra.username);
  const [editAccount, setEditAccount] = useState(false);
  const [acctUser, setAcctUser] = useState('');
  const [acctKey, setAcctKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [acctBusy, setAcctBusy] = useState(false);
  const [acctMsg, setAcctMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const doLogin = async () => {
    if (!acctUser.trim() || !acctKey.trim()) { setAcctMsg({ ok: false, text: t('set.enterUserAndKey') }); return; }
    setAcctBusy(true); setAcctMsg(null);
    try {
      const r = await api.saveCredentials(acctUser.trim(), acctKey.trim());
      if (r.ok) {
        setAcctMsg({ ok: true, text: t('wiz.s2.loggedin', { user: r.username ?? acctUser.trim() }) });
        setAcctKey(''); setEditAccount(false);
        refresh(); onAuthChange();
      } else {
        setAcctMsg({ ok: false, text: r.error || t('set.loginFailed') });
      }
    } catch (e: any) {
      setAcctMsg({ ok: false, text: t('set.errorPrefix', { msg: e?.message || t('set.unknown') }) });
    } finally { setAcctBusy(false); }
  };

  const doLogout = async () => {
    setAcctBusy(true); setAcctMsg(null);
    try { await api.logout(); setEditAccount(false); setAcctUser(''); setAcctKey(''); refresh(); onAuthChange(); }
    finally { setAcctBusy(false); }
  };

  useEffect(() => { if (status?.romRoot && !root) setRoot(status.romRoot); }, [status?.romRoot]);
  useEffect(() => () => { esRef.current?.close(); recheckRef.current?.close(); }, []);

  const save = async () => { await api.saveSettings(root); setSaved(true); refresh(); setTimeout(() => setSaved(false), 1800); };

  const installRahasher = () => {
    setInstalling(true); setInstallMsg(t('set.starting'));
    const es = openStream('/api/rahasher/download/stream', {
      progress: (d) => setInstallMsg(d.message || d.phase || '…'),
      done: (d) => { setInstallMsg(t('set.installedVersion', { version: d.version ?? '' })); stop(); },
      error: (d) => { setInstallMsg(t('set.errorPrefix', { msg: d.message || t('set.unknown') })); stop(); },
      __error: () => { setInstallMsg(t('set.connLostShort')); stop(); },
    });
    esRef.current = es;
  };
  const stop = () => { setInstalling(false); esRef.current?.close(); esRef.current = null; refresh(); };

  const rahaserOk = status?.rahasher.available;

  const showForm = !loggedIn || editAccount;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* section navigator — one group at a time keeps the page compact */}
      <nav className="flex flex-wrap gap-2">
        {GROUPS.map((g) => (
          <button key={g.id} onClick={() => setGroup(g.id)}
            className="btn !py-1.5 !px-3 text-sm flex items-center gap-2"
            style={group === g.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
            <g.icon size={15} /> {t(g.key)}
          </button>
        ))}
      </nav>

      {/* ============================ GENERAL ============================ */}
      {/* RA-Konto + ROM-Ordner untereinander, volle Breite. */}
      {group === 'general' && (
      <div className="flex flex-col gap-5">

      {/* RA account */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><UserRound size={16} /> {t('set.account')}</h2>
        {loggedIn ? (
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="badge" style={{ color: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>
              <CheckCircle2 size={14} /> {t('set.loggedIn')}
            </span>
            <span className="font-mono text-base text-ink-hi flex items-center gap-2"><KeyRound size={14} className="text-neon-purple" /> {status?.ra.username}</span>
            <div className="flex-1" />
            {!editAccount && (
              <button className="btn !py-1.5 !px-3 text-sm" onClick={() => { setEditAccount(true); setAcctUser(status?.ra.username || ''); setAcctKey(''); setAcctMsg(null); }}>
                <KeyRound size={14} /> {t('set.switchAccount')}
              </button>
            )}
            <button className="btn btn-danger !py-1.5 !px-3 text-sm" onClick={doLogout} disabled={acctBusy}>
              <LogOut size={14} /> {t('set.logout')}
            </button>
          </div>
        ) : (
          <p className="font-body text-ink-mid mt-2 text-sm">{t('set.notLoggedIn')}</p>
        )}

        {showForm && (
          <div className="mt-4 flex flex-col gap-2 max-w-md">
            <label className="font-mono text-sm text-ink-dim">{t('set.username')}</label>
            <input className="input" value={acctUser} onChange={(e) => setAcctUser(e.target.value)} placeholder={t('set.usernamePlaceholder')} autoComplete="username" />
            <label className="font-mono text-sm text-ink-dim mt-1">{t('set.apiKey')}</label>
            <div className="flex gap-2">
              <input className="input flex-1 font-mono" type={showKey ? 'text' : 'password'} value={acctKey} onChange={(e) => setAcctKey(e.target.value)} placeholder={t('set.apiKeyPlaceholder')} autoComplete="off" />
              <button className="btn !px-3" type="button" onClick={() => setShowKey((s) => !s)} title={showKey ? t('set.hide') : t('set.show')}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>
            <a className="font-mono text-sm text-neon-cyan inline-flex items-center gap-1 hover:underline w-fit" href="https://retroachievements.org/settings" target="_blank" rel="noreferrer">
              <ExternalLink size={12} /> {t('set.findKey')}
            </a>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <button className="btn btn-primary" onClick={doLogin} disabled={acctBusy}>
                <LogIn size={16} /> {acctBusy ? t('set.checking') : t('set.login')}
              </button>
              {loggedIn && <button className="btn" onClick={() => { setEditAccount(false); setAcctMsg(null); setAcctKey(''); }}>{t('set.cancel')}</button>}
            </div>
          </div>
        )}
        {acctMsg && (
          <div className="font-mono text-base mt-3" style={{ color: acctMsg.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>{acctMsg.text}</div>
        )}
      </section>

      {/* ROM root */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><FolderOpen size={16} /> {t('set.romRoot')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm">{t('set.romRootDesc')}</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input className="input flex-1" value={root} onChange={(e) => setRoot(e.target.value)} />
          <button className="btn" onClick={() => setPicker(true)}><FolderOpen size={16} /> {t('set.choose')}</button>
          <button className="btn btn-primary" onClick={save}><Save size={16} /> {saved ? t('set.saved') : t('set.save')}</button>
        </div>
      </section>

      {/* Download target folder — where downloaded free-game ROMs go. */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Download size={16} /> {t('set.downloadDir')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.downloadDirDesc')}</p>
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input className="input flex-1 font-mono" value={downloadDir} onChange={(e) => setDownloadDir(e.target.value)} placeholder={root ? `${root}\\_downloads` : ''} />
          <button className="btn" onClick={() => setDlPicker(true)}><FolderOpen size={16} /> {t('set.choose')}</button>
          <button className="btn btn-primary" onClick={saveDownloadDir}><Save size={16} /> {dlSaved ? t('set.saved') : t('set.save')}</button>
          <button className="btn" onClick={openDownloadDir} disabled={!downloadDir}><FolderOpen size={16} /> {t('set.openFolder')}</button>
        </div>
        {dlMsg && <div className="font-mono text-base mt-2" style={{ color: 'var(--color-neon-red)' }}>{dlMsg}</div>}
      </section>
      </div>
      )}

      {/* ====================== SCANNING & WATCHING ===================== */}
      {group === 'scanning' && (<div className="flex flex-col gap-5">

      {/* Folder watch — configurable (#1) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Eye size={16} /> {t('set.watch')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.watchDesc')}</p>

        {/* on/off toggle */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="font-body text-sm text-ink-hi flex items-center gap-2"><Power size={15} className="text-neon-cyan" /> {t('set.watchEnabled')}</span>
          <button onClick={() => setWatchEnabled((v) => !v)}
            className="btn !py-1.5 !px-3 text-sm"
            style={watchEnabled ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            {watchEnabled ? t('set.watchOn') : t('set.watchOff')}
          </button>
          {status?.watch?.active && (
            <span className="font-mono text-base" style={{ color: 'var(--color-neon-green)' }}>
              {status.watch.scanning ? t('set.watchScanning') : t('set.watchNextRun', { when: watchWhen })}
            </span>
          )}
        </div>

        {/* mode select */}
        <div className="mt-4">
          <div className="font-body text-sm text-ink-hi">{t('set.watchMode')}</div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(['interval', 'events'] as const).map((m) => (
              <button key={m} onClick={() => setWatchMode(m)}
                className="btn !py-1.5 !px-3 text-sm"
                style={watchMode === m ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
                {m === 'interval' ? t('set.watchModeInterval') : t('set.watchModeEvents')}
              </button>
            ))}
          </div>
          <p className="font-body text-ink-dim text-sm mt-2 leading-relaxed">{t('set.watchModeDesc')}</p>
        </div>

        {/* interval input (only relevant for interval mode) */}
        {watchMode === 'interval' && (
          <div className="mt-4">
            <label className="font-body text-sm text-ink-hi">{t('set.watchInterval')}</label>
            <span className="flex items-center gap-2 mt-2">
              <input type="number" min={1} className="input !py-1.5 !px-2 w-24" value={watchInterval}
                onChange={(e) => setWatchInterval(Math.max(1, Number(e.target.value)))} />
              <span className="font-mono text-base text-ink-dim">{t('set.watchIntervalUnit')}</span>
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={applyWatch} disabled={watchBusy}><Save size={16} /> {t('set.save')}</button>
        </div>
      </section>

      {/* Systems selection (#7) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><MonitorSmartphone size={16} /> {t('set.systems')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.systemsDesc')}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn !py-1.5 !px-3 text-sm" onClick={selectAllSystems}>{t('set.systemsAll')}</button>
          <button className="btn !py-1.5 !px-3 text-sm" onClick={selectNoSystems}>{t('set.systemsNone')}</button>
          <span className="font-mono text-base text-ink-mid">
            {allSelected ? t('set.systemsAllActive') : t('set.systemsSelected', { n: enabledConsoles?.length ?? 0, m: totalSystems })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {allConsoles.map((c) => {
            const on = isSystemOn(c.id);
            return (
              <button key={c.id} onClick={() => toggleSystem(c.id)}
                className="panel !rounded-lg px-3 py-2 flex items-center gap-2 text-left transition-all"
                style={on ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : { opacity: 0.55 }}
                title={c.short_code ? `${c.name} (${c.short_code})` : c.name}>
                <ConsoleIcon id={c.id} short={c.short_code} size={22} />
                <span className="font-body text-sm text-ink-hi">{c.name}</span>
                {c.gameCount > 0 && <span className="font-mono text-sm text-ink-dim shrink-0">· {c.gameCount}</span>}
                {on && <Check size={14} className="text-neon-green shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={saveSystems} disabled={systemsEmpty}><Save size={16} /> {systemsSaved ? t('set.saved') : t('set.save')}</button>
          {systemsEmpty && <span className="font-mono text-sm" style={{ color: 'var(--color-neon-red)' }}>{t('set.systemsMinOne')}</span>}
        </div>
      </section>

      {/* Big-file local copy (#5) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><HardDrive size={16} /> {t('set.bigFile')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.bigFileDesc')}</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <button onClick={() => setBigFile((b) => ({ ...b, enabled: !b.enabled }))}
            className="btn !py-1.5 !px-3 text-sm"
            style={bigFile.enabled ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            <Power size={14} className={bigFile.enabled ? 'text-neon-green' : 'text-ink-mid'} /> {bigFile.enabled ? t('set.watchOn') : t('set.watchOff')}
          </button>
          <label className="flex items-center gap-2">
            <span className="font-body text-sm text-ink-hi">{t('set.bigFileThreshold')}</span>
            <input type="number" min={1} className="input !py-1.5 !px-2 w-24" value={bigFile.thresholdMB}
              onChange={(e) => setBigFile((b) => ({ ...b, thresholdMB: Math.max(1, Number(e.target.value)) }))} />
            <span className="font-mono text-base text-ink-dim">{t('set.unitMB')}</span>
          </label>
          <label className="flex items-center gap-2">
            <span className="font-body text-sm text-ink-hi">{t('set.bigFileMax')}</span>
            <input type="number" min={0} className="input !py-1.5 !px-2 w-24" value={bigFile.maxThresholdMB ?? 0}
              onChange={(e) => setBigFile((b) => ({ ...b, maxThresholdMB: Math.max(0, Number(e.target.value)) }))} />
            <span className="font-mono text-base text-ink-dim">{t('set.unitMB')}</span>
          </label>
        </div>
        <p className="font-body text-ink-dim text-sm mt-2 leading-relaxed">{t('set.bigFileMaxDesc')}</p>
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={saveBigFile}><Save size={16} /> {bigFileSaved ? t('set.saved') : t('set.save')}</button>
        </div>
      </section>

      {/* Scan performance — parallel files (helps slow NAS) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Gauge size={16} /> {t('set.concurrency')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.concurrencyDesc')}</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <input type="number" min={1} max={16} className="input !py-1.5 !px-2 w-24" value={scanConcurrency}
            onChange={(e) => setScanConcurrency(Math.max(1, Math.min(16, Number(e.target.value) || 1)))} />
          <button className="btn btn-primary" onClick={saveConc}><Save size={16} /> {concSaved ? t('set.saved') : t('set.save')}</button>
        </div>

        <div className="mt-5 pt-4 border-t border-crt-line">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={toggleSkip} className="btn !py-1.5 !px-3 text-sm"
              style={skipCollected ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
              {skipCollected ? t('set.watchOn') : t('set.watchOff')}
            </button>
            <span className="font-body text-sm text-ink-hi">{t('set.skipCollected')}</span>
          </div>
          <p className="font-body text-ink-dim text-sm mt-2 leading-relaxed max-w-2xl">{t('set.skipCollectedDesc')}</p>
        </div>
      </section>

      {/* Scheduled daily scan */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><CalendarClock size={16} /> {t('set.schedule')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.scheduleDesc')}</p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="font-body text-sm text-ink-hi flex items-center gap-2"><Power size={15} className="text-neon-cyan" /> {t('set.watchEnabled')}</span>
          <button onClick={() => saveSchedule({ enabled: !schedule?.enabled })}
            className="btn !py-1.5 !px-3 text-sm"
            style={schedule?.enabled ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            {schedule?.enabled ? t('set.watchOn') : t('set.watchOff')}
          </button>
          <label className="flex items-center gap-2">
            <span className="font-body text-sm text-ink-hi">{t('set.scheduleTime')}</span>
            <input type="time" className="input !py-1.5 !px-2 !w-auto" value={schedule?.time || '03:00'}
              onChange={(e) => saveSchedule({ time: e.target.value })} />
          </label>
          {schedule?.running
            ? <span className="font-mono text-base text-neon-green">{t('set.scheduleRunning')}</span>
            : schedule?.lastRunAt ? <span className="font-mono text-base text-ink-dim">{t('set.scheduleLast', { when: fmtAgo(schedule.lastRunAt) })}</span> : null}
        </div>
      </section>
      </div>
      )}

      {/* ======================= DATA & STORAGE ======================== */}
      {group === 'data' && (<div className="flex flex-col gap-5">

      {/* Cache & refresh (incl. scan timeout + image preload) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Database size={16} /> {t('set.cache')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">
          {t('set.cacheDesc')}
        </p>
        {ttls && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
            <TtlField label={t('set.ttlGame')} unit={t('set.unitDays')} value={ttls.gameDetailDays} onChange={(v) => setTtl('gameDetailDays', v)} />
            <TtlField label={t('set.ttlProfile')} unit={t('set.unitHours')} value={ttls.profileHours} onChange={(v) => setTtl('profileHours', v)} />
            <TtlField label={t('set.ttlProgress')} unit={t('set.unitHours')} value={ttls.completionHours} onChange={(v) => setTtl('completionHours', v)} />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <TtlField label={t('set.ttlScan')} unit={t('set.unitSec')} value={scanTimeout} onChange={(v) => setScanTimeout(Math.max(10, v))} />
        </div>
        <p className="font-body text-ink-dim text-sm mt-1">{t('set.scanTimeoutDesc')}</p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn btn-primary" onClick={saveTtls}><Save size={16} /> {cacheSaved ? t('set.saved') : t('set.save')}</button>
          <button className="btn" onClick={clearCache}><Trash2 size={16} /> {t('set.clearCache')}</button>
          {cacheMsg && <span className="font-mono text-base text-ink-mid">{cacheMsg}</span>}
        </div>
        <p className="font-body text-ink-dim text-sm mt-2">
          {t('set.cacheNote')}
        </p>

        <div className="mt-4 pt-4 border-t border-crt-line">
          <div className="font-body text-sm text-ink-hi flex items-center gap-2"><ImageDown size={15} className="text-neon-cyan" /> {t('cache.images.title')}</div>
          <p className="font-body text-ink-dim text-sm mt-1 leading-relaxed">{t('cache.images.desc')}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <button className="btn btn-magenta" onClick={warmImages} disabled={warming}>
              <ImageDown size={16} className={warming ? 'animate-pulse' : ''} /> {warming ? t('cache.images.running') : t('cache.images.start')}
            </button>
            {warmMsg && <span className="font-mono text-base text-ink-mid truncate">{warmMsg}</span>}
          </div>
          {/* preload indicator + auto toggle (#11) */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="font-mono text-sm text-ink-dim">
              {preloadDone ? fmtDate(preloadDone) : t('set.preloadNever')}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="font-body text-sm text-ink-hi flex items-center gap-2"><Power size={15} className="text-neon-cyan" /> {t('set.preloadAuto')}</span>
            <button onClick={togglePreloadAuto}
              className="btn !py-1.5 !px-3 text-sm"
              style={preloadAuto ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
              {preloadAuto ? t('set.watchOn') : t('set.watchOff')}
            </button>
          </div>
        </div>
      </section>

      {/* Storage usage (#13) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><HardDrive size={16} /> {t('set.storage')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.storageDesc')}</p>
        {storage && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
            <StorageField label={t('set.storageDb')} value={fmtBytes(storage.db)} sub={storage.wal ? `+ ${fmtBytes(storage.wal)} ${t('set.storageWal')}` : undefined} />
            <StorageField label={t('set.storageImages')} value={fmtBytes(storage.images)} sub={storage.imageCount != null ? t('set.storageItems', { n: storage.imageCount.toLocaleString('de-DE') }) : undefined} />
            <StorageField label={t('set.storageBackups')} value={fmtBytes(storage.backups)} sub={storage.backupCount != null ? t('set.storageItems', { n: storage.backupCount }) : undefined} />
            <StorageField label={t('set.storageTemp')} value={fmtBytes(storage.temp)} sub={storage.tempCount != null ? t('set.storageItems', { n: storage.tempCount }) : undefined} />
            <StorageField label={t('set.storageTotal')} value={fmtBytes(storage.total)} highlight />
          </div>
        )}

        {/* temp explanation + breakdown + clear */}
        <p className="font-body text-ink-dim text-sm mt-3 leading-relaxed">{t('set.storageTempDesc')}</p>
        {storage?.tempItems && storage.tempItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {storage.tempItems.map((it) => (
              <div key={it.name} className="flex items-center gap-2 font-mono text-sm panel !rounded-lg px-3 py-1.5">
                <span className="badge !px-2 !py-0.5 shrink-0" style={{ color: 'var(--color-ink-mid)' }}>{tempKindLabel(it.kind)}</span>
                <span className="text-ink-dim truncate flex-1 min-w-0" title={it.name}>{it.name}</span>
                <span className="text-ink-hi shrink-0">{fmtBytes(it.size)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn" onClick={loadStorage} disabled={storageBusy}>
            <RefreshCw size={16} className={storageBusy ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
          <button className="btn" onClick={clearTemp} disabled={tempBusy || !storage?.temp}>
            <Trash2 size={16} className={tempBusy ? 'animate-pulse' : ''} /> {t('set.storageClearTemp')}
          </button>
          {tempMsg && <span className="font-mono text-base text-ink-mid">{tempMsg}</span>}
          {!tempMsg && storage && !storage.temp && <span className="font-mono text-base text-ink-dim">{t('set.storageTempEmpty')}</span>}
        </div>
        {storage?.dataDir && <div className="font-mono text-sm text-ink-dim mt-2 break-all">{storage.dataDir}</div>}
      </section>

      {/* Danger zone — destructive resets (delete images / collection / hash DB) */}
      <section className="panel p-5">
        <h2 className="font-display text-sm flex items-center gap-2" style={{ color: 'var(--color-neon-red)' }}><AlertTriangle size={16} /> {t('set.reset.title')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.reset.desc')}</p>
        <div className="mt-3 flex flex-col gap-2">
          {[
            { id: 'images', label: t('set.reset.images'), hint: t('set.reset.imagesHint'), on: clearImages },
            { id: 'collection', label: t('set.reset.collection'), hint: t('set.reset.collectionHint'), on: resetCollection },
            { id: 'hashdb', label: t('set.reset.hashdb'), hint: t('set.reset.hashdbHint'), on: resetHashDb },
          ].map((r) => (
            <div key={r.id} className="flex items-center gap-3 panel !rounded-lg px-3 py-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-body text-sm text-ink-hi">{r.label}</div>
                <div className="font-body text-sm text-ink-dim">{r.hint}</div>
              </div>
              <button className="btn btn-danger !py-1.5 !px-3 text-sm shrink-0" onClick={r.on} disabled={!!resetBusy}>
                <Trash2 size={14} className={resetBusy === r.id ? 'animate-pulse' : ''} /> {t('set.reset.action')}
              </button>
            </div>
          ))}
        </div>
        {resetMsg && <div className="font-mono text-base mt-3 text-ink-hi">{resetMsg}</div>}
      </section>

      {/* Backups */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Archive size={16} /> {t('set.backups')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">
          {t('set.backupsDesc')}
        </p>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn btn-primary" onClick={backupNow} disabled={backingUp}><Archive size={16} /> {backingUp ? t('set.backingUp') : t('set.backupNow')}</button>
          <a className="btn" href="/api/backup/download" title={t('set.downloadTip')}><Download size={16} /> {t('set.download')}</a>
        </div>
        <p className="font-body text-ink-dim text-sm mt-2">{t('set.downloadKeyWarning')}</p>
        {backups.length > 0 && (
          <div className="mt-3 space-y-1">
            {backups.map((b) => (
              <div key={b.name} className="flex items-center gap-3 font-mono text-sm panel !rounded-lg px-3 py-2">
                <span className="text-ink-hi truncate flex-1 min-w-0">{b.name}</span>
                <span className="text-ink-dim shrink-0 hidden sm:inline">{fmtDate(b.at)} · {fmtBytes(b.size)}</span>
                <button className="btn !py-1 !px-2 text-sm shrink-0" onClick={() => restore(b.name)} title={t('set.restoreTip')}><RotateCcw size={13} /> {t('set.restore')}</button>
              </div>
            ))}
          </div>
        )}
        {restoreMsg && <div className="font-mono text-base mt-3" style={{ color: restoreOk ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>{restoreMsg}</div>}
      </section>

      {/* Offline package — readiness checklist + export/import */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Package size={16} /> {t('off.title')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('off.sub')}</p>

        {offline && (
          <>
            <div className="font-mono text-base mt-3"
              style={{ color: offline.ready ? 'var(--color-neon-green)' : 'var(--color-neon-amber)' }}>
              {offline.ready ? t('off.ready') : t('off.notReady')}
            </div>

            <div className="mt-3 space-y-1">
              {offline.checks.map((c) => {
                // Only two labels take variables; the rest are plain strings.
                const vars: Record<string, string | number> | undefined =
                  c.id === 'details' ? { v: c.value ?? 0, need: c.need ?? 0 }
                  : c.id === 'images' ? { v: c.value ?? 0 } : undefined;
                return (
                  <div key={c.id} className="flex items-center gap-2 font-mono text-sm panel !rounded-lg px-3 py-1.5">
                    {c.ok
                      ? <Check size={14} className="text-neon-green shrink-0" />
                      : <AlertTriangle size={14} className="text-neon-amber shrink-0" />}
                    <span className={c.ok ? 'text-ink-hi' : 'text-ink-mid'}>{t('off.check.' + c.id, vars)}</span>
                  </div>
                );
              })}
            </div>

            <div className="font-mono text-sm text-ink-dim mt-2">{t('off.size', { s: fmtBytes(offline.imageBytes) })}</div>
          </>
        )}

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <a className="btn" href="/api/offline/export" title={t('off.exportTip')}><Download size={16} /> {t('off.export')}</a>
          <input ref={offFileRef} type="file" accept=".7z" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importOffline(f); }} />
          <button className="btn" onClick={() => offFileRef.current?.click()} disabled={offBusy}>
            <Upload size={16} /> {t('off.import')}
          </button>
          <button className="btn" onClick={loadOffline} disabled={offBusy}>
            <RefreshCw size={16} className={offBusy ? 'animate-spin' : ''} /> {t('common.refresh')}
          </button>
          {!offline && <span className="font-mono text-base text-ink-dim">{t('common.loading')}</span>}
          {offMsg && (
            <span className="font-mono text-base" style={{ color: offMsg.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>{offMsg.text}</span>
          )}
        </div>
      </section>

      {/* RAHasher + recheck */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Cpu size={16} /> {t('set.rahasher')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">
          {t('set.rahasherDesc')}
        </p>
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {rahaserOk ? (
            <span className="badge" style={{ color: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>
              <CheckCircle2 size={14} /> {t('set.installed')}
            </span>
          ) : (
            <button className="btn btn-magenta" onClick={installRahasher} disabled={installing}>
              <HardDriveDownload size={16} /> {installing ? t('set.downloading') : t('set.downloadRahasher')}
            </button>
          )}
          {installMsg && <span className="font-mono text-base text-ink-mid">{installMsg}</span>}
        </div>
        <div className="font-mono text-sm text-ink-dim mt-2 break-all">{t('set.path')} {status?.rahasher.path}</div>

        {/* Manual path override (merged here from the old Advanced tab) */}
        <div className="mt-3">
          <label className="font-body text-sm text-ink-hi flex items-center gap-2"><Files size={15} className="text-neon-purple" /> {t('set.rahasherPath')}</label>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <input className="input flex-1 font-mono" value={rahasherPath} onChange={(e) => setRahasherPath(e.target.value)} placeholder="./bin/RAHasher.exe" />
            <button className="btn" onClick={() => setRahPicker(true)}><FolderOpen size={16} /> {t('set.choose')}</button>
            <button className="btn" onClick={detectRah}><Sparkles size={16} /> {t('set.autoDetect')}</button>
            <button className="btn btn-primary" onClick={saveRahasherPath}><Save size={16} /> {rahPathSaved ? t('set.saved') : t('set.save')}</button>
          </div>
          <p className="font-body text-ink-dim text-sm mt-1">{t('set.rahasherPathDesc')}</p>
          {rahMsg && <div className="font-mono text-sm mt-1 text-ink-mid">{rahMsg}</div>}
        </div>

        {rahaserOk && (
          <div className="mt-4 pt-4 border-t border-crt-line">
            <p className="font-body text-ink-mid text-sm leading-relaxed">
              {t('set.recheckDesc')}
            </p>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <button className="btn btn-magenta" onClick={recheckRahasher} disabled={rechecking}>
                <RefreshCw size={16} className={rechecking ? 'animate-spin' : ''} /> {t('set.recheckBtn')}
              </button>
              {recheckMsg && <span className="font-mono text-base text-ink-mid">{recheckMsg}</span>}
            </div>
          </div>
        )}
      </section>
      </div>
      )}

      {/* ============ APPEARANCE (in Allgemein gemergt) ============ */}
      {group === 'general' && (<div className="flex flex-col gap-5">

      {/* Preferred region/language of a ROM version */}
      <RegionPriority />

      {/* Genres fetched from RetroAchievements */}
      <GenrePanel />

      {/* Theme */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Palette size={16} /> {t('set.design')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm">{t('set.designDesc')}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
          {visibleThemes().map((t) => (
            <button key={t.id} onClick={() => changeTheme(t.id)}
              className="panel !rounded-lg p-3 flex items-center gap-3 text-left transition-all"
              style={theme === t.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
              <span className="rounded-full shrink-0" style={{ width: 22, height: 22, background: t.swatch, border: '1px solid var(--color-crt-line2)' }} />
              <span className="font-body text-sm flex-1 text-ink-hi">{t.name}</span>
              {theme === t.id && <Check size={16} className="text-neon-green" />}
            </button>
          ))}
        </div>

        {/* progress style + aurora */}
        <div className="grid sm:grid-cols-2 gap-4 mt-4">
          <div>
            <div className="font-body text-sm text-ink-hi">{t('set.progress')}</div>
            <p className="font-body text-ink-dim text-sm mt-1">{t('set.progressDesc')}</p>
            <div className="flex items-center gap-2 mt-2">
              {(['bar', 'ring'] as ProgressStyle[]).map((s) => (
                <button key={s} onClick={() => changeProg(s)}
                  className="btn !py-1.5 !px-3 text-sm flex items-center gap-2"
                  style={progStyle === s ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
                  {s === 'ring'
                    ? <Pct value={66} mode="ring" ringSize={26} />
                    : <span style={{ width: 34 }}><Pct value={66} mode="bar" /></span>}
                  {s === 'bar' ? t('set.progressBar') : t('set.progressRing')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="font-body text-sm text-ink-hi">{t('set.aurora')}</div>
            <p className="font-body text-ink-dim text-sm mt-1">{t('set.auroraDesc')}</p>
            <button onClick={toggleAurora} className="btn !py-1.5 !px-3 text-sm mt-2"
              style={aurora ? { borderColor: 'var(--color-neon-purple)', boxShadow: 'var(--shadow-glow-magenta)' } : {}}>
              <Sparkles size={14} className={aurora ? 'text-neon-purple' : 'text-ink-mid'} /> {aurora ? t('set.auroraOn') : t('set.auroraOff')}
            </button>
          </div>
        </div>

        {/* UI font */}
        <div className="mt-4">
          <div className="font-body text-sm text-ink-hi flex items-center gap-2"><Type size={15} className="text-neon-cyan" /> {t('set.font')}</div>
          <p className="font-body text-ink-dim text-sm mt-1">{t('set.fontDesc')}</p>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {UI_FONTS.map((f) => (
              <button key={f.id} onClick={() => changeFont(f.id)}
                className="panel !rounded-lg p-3 text-left transition-all"
                style={font === f.id ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' } : {}}>
                <div className="flex items-center justify-between">
                  <span className="font-body text-sm text-ink-hi">{f.name}</span>
                  {font === f.id && <Check size={15} className="text-neon-green" />}
                </div>
                <div className="font-mono text-base text-ink-mid mt-1">{f.note}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Always open the game detail window fullscreen */}
        <div className="mt-4">
          <div className="font-body text-sm text-ink-hi">{t('set.gmFull')}</div>
          <p className="font-body text-ink-dim text-sm mt-1">{t('set.gmFullDesc')}</p>
          <button onClick={toggleGmFull} className="btn !py-1.5 !px-3 text-sm mt-2"
            style={gmFull ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            <Power size={14} className={gmFull ? 'text-neon-green' : 'text-ink-mid'} /> {gmFull ? t('set.watchOn') : t('set.watchOff')}
          </button>
        </div>
      </section>
      </div>
      )}

      {/* ====================== EMULATOR & LAUNCH ====================== */}
      {group === 'emulator' && (<div className="flex flex-col gap-5">

      {/* RetroArch + core folder */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Joystick size={16} /> {t('set.emulator')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.emulatorDesc')}</p>

        <div className="mt-3">
          <label className="font-body text-sm text-ink-hi">{t('set.retroarchPath')}</label>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <input className="input flex-1 font-mono" value={emuPath} onChange={(e) => setEmuPath(e.target.value)} placeholder="C:\RetroArch\retroarch.exe" />
            <button className="btn" onClick={() => setEmuPicker(true)}><FolderOpen size={16} /> {t('set.choose')}</button>
            <button className="btn" onClick={detectEmu} disabled={detecting}>
              <Sparkles size={16} className={detecting ? 'animate-pulse' : ''} /> {t('set.autoDetect')}
            </button>
          </div>
          {emu && (
            <div className="font-mono text-sm mt-1" style={{ color: emu.retroarchFound ? 'var(--color-neon-green)' : 'var(--color-neon-amber)' }}>
              {emu.retroarchFound ? t('set.emuFound') : t('set.emuMissing')}
            </div>
          )}
          {detectMsg && <div className="font-mono text-sm mt-1 text-ink-mid">{detectMsg}</div>}
        </div>

        <div className="mt-4">
          <label className="font-body text-sm text-ink-hi">{t('set.coreDir')}</label>
          <div className="flex flex-col sm:flex-row gap-2 mt-2">
            <input className="input flex-1 font-mono" value={emuCoreDir} onChange={(e) => setEmuCoreDir(e.target.value)} />
            <button className="btn" onClick={() => setCorePicker(true)}><FolderOpen size={16} /> {t('set.choose')}</button>
          </div>
          {emu && (
            <div className="font-mono text-sm mt-1" style={{ color: emu.coreDirFound ? 'var(--color-neon-green)' : 'var(--color-neon-amber)' }}>
              {emu.coreDirFound ? t('set.emuFound') : t('set.emuMissing')}
            </div>
          )}
        </div>

        <div className="mt-4">
          <label className="font-body text-sm text-ink-hi">{t('set.extraArgs')}</label>
          <input className="input mt-2 font-mono" value={emuArgs} onChange={(e) => setEmuArgs(e.target.value)} placeholder="-f" />
        </div>

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={saveEmu}><Save size={16} /> {emuSaved ? t('set.saved') : t('set.save')}</button>
        </div>
      </section>

      {/* Rich presence / playtime tracking */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Clock size={16} /> {t('set.presence')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.presenceDesc')}</p>

        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <span className="font-body text-sm text-ink-hi flex items-center gap-2"><Power size={15} className="text-neon-cyan" /> {t('set.presenceEnable')}</span>
          <button onClick={() => setPresEnabled((v) => !v)}
            className="btn !py-1.5 !px-3 text-sm"
            style={presEnabled ? { borderColor: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' } : {}}>
            {presEnabled ? t('set.watchOn') : t('set.watchOff')}
          </button>
          {presence?.running && <span className="font-mono text-base text-ink-dim">{t('play.interval', { n: presence.intervalMin })}</span>}
        </div>

        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <label className="flex items-center gap-2">
            <span className="font-body text-sm text-ink-hi">{t('set.presenceInterval')}</span>
            <input type="number" min={1} max={60} className="input !py-1.5 !px-2 w-24" value={presInterval}
              onChange={(e) => setPresInterval(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
            <span className="font-mono text-base text-ink-dim">{t('set.unitMin')}</span>
          </label>
          <label className="flex items-center gap-2" title={t('set.presenceStaleHelp')}>
            <span className="font-body text-sm text-ink-hi inline-flex items-center gap-1">{t('set.presenceStale')} <Info size={13} className="text-ink-dim" /></span>
            <input type="number" min={2} max={180} className="input !py-1.5 !px-2 w-24" value={presStale}
              onChange={(e) => setPresStale(Math.max(2, Math.min(180, Number(e.target.value) || 2)))} />
            <span className="font-mono text-base text-ink-dim">{t('set.unitMin')}</span>
          </label>
        </div>
        <p className="font-body text-ink-dim text-sm mt-2 leading-relaxed">{t('set.presenceStaleHelp')}</p>

        {presence?.lastSample && (
          <div className="flex items-center gap-2 mt-3 flex-wrap font-mono text-base">
            <span className={presence.lastSample.active ? '' : 'text-ink-dim'}
              style={presence.lastSample.active ? { color: 'var(--color-neon-green)' } : {}}>
              {presence.lastSample.rich || presence.lastSample.title || t('set.watchIdle')}
            </span>
            <span className="text-ink-dim">{fmtAgo(presence.lastSample.at)}</span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <button className="btn btn-primary" onClick={savePresence}><Save size={16} /> {presSaved ? t('set.saved') : t('set.save')}</button>
        </div>
      </section>
      </div>
      )}

      {/* =========================== ADVANCED ========================== */}
      {group === 'advanced' && (<div className="flex flex-col gap-5">

      {/* Advanced — rate limit + rahasher path (#12), collapsible */}
      <section className="panel p-5">
        <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Settings2 size={16} /> {t('set.advanced')}</h2>
        <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.advancedDesc')}</p>

        <div className="mt-4">
            {/* rate limit */}
            <div className="font-body text-sm text-ink-hi flex items-center gap-2"><Gauge size={15} className="text-neon-amber" /> {t('set.rateLimit')}</div>
            <p className="font-body text-ink-dim text-sm mt-1 leading-relaxed">{t('set.rateLimitDesc')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <label className="panel !rounded-lg p-3 flex flex-col gap-1.5">
                <span className="font-body text-sm text-ink-hi">{t('set.rateInterval')}</span>
                <input type="number" min={0} className="input !py-1.5 !px-2 w-28" value={rateLimit.minIntervalMs}
                  onChange={(e) => setRateLimit((r) => ({ ...r, minIntervalMs: Math.max(0, Number(e.target.value)) }))} />
              </label>
              <label className="panel !rounded-lg p-3 flex flex-col gap-1.5">
                <span className="font-body text-sm text-ink-hi">{t('set.rateRetries')}</span>
                <input type="number" min={0} className="input !py-1.5 !px-2 w-28" value={rateLimit.maxRetries}
                  onChange={(e) => setRateLimit((r) => ({ ...r, maxRetries: Math.max(0, Number(e.target.value)) }))} />
              </label>
            </div>

            {/* RAHasher path lives under Data & Storage → RAHasher now. */}

            <div className="flex items-center gap-2 mt-4 flex-wrap">
              <button className="btn btn-primary" onClick={saveAdvanced}><Save size={16} /> {advancedSaved ? t('set.saved') : t('set.save')}</button>
            </div>

            {/* version / info */}
            <div className="mt-4 pt-4 border-t border-crt-line">
              <h3 className="font-display text-sm text-ink-hi flex items-center gap-2"><Info size={16} /> {t('set.info')}</h3>
              <div className="grid sm:grid-cols-2 gap-3 mt-3 font-mono text-base">
                <div className="flex items-center gap-2"><Clock size={15} className="text-neon-amber" /> {t('set.hashTtl')} <span className="text-ink-hi">{t('set.days90')}</span></div>
                <div className="flex items-center gap-2"><Cpu size={15} className="text-neon-purple" /> {t('set.version')} <span className="text-ink-hi">RAChecker v{APP_VERSION}</span></div>
              </div>
              <p className="font-body text-ink-dim text-sm mt-3">
                {t('set.infoNote')}
              </p>
              <p className="font-body text-ink-dim text-sm mt-2">
                {t('set.notAffiliated')}
              </p>
            </div>
        </div>
      </section>
      </div>
      )}

      {picker && <FolderPicker initialPath={root} onPick={(p) => { setRoot(p); setPicker(false); }} onClose={() => setPicker(false)} />}
      {dlPicker && <FolderPicker initialPath={downloadDir || root} onPick={(p) => { setDownloadDir(p); setDlPicker(false); }} onClose={() => setDlPicker(false)} />}
      {corePicker && <FolderPicker initialPath={emuCoreDir} onPick={(p) => { setEmuCoreDir(p); setCorePicker(false); }} onClose={() => setCorePicker(false)} />}
      {emuPicker && <FolderPicker mode="file" ext={['.exe']} initialPath={emuPath} onPick={(p) => { setEmuPath(p); setEmuPicker(false); }} onClose={() => setEmuPicker(false)} />}
      {rahPicker && <FolderPicker mode="file" ext={['.exe']} initialPath={rahasherPath} onPick={(p) => { setRahasherPath(p); setRahPicker(false); }} onClose={() => setRahPicker(false)} />}
    </div>
  );
}

function TtlField({ label, unit, value, onChange }: { label: string; unit: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="panel !rounded-lg p-3 flex flex-col gap-1.5">
      <span className="font-body text-sm text-ink-hi">{label}</span>
      <span className="flex items-center gap-2">
        <input type="number" min={0} className="input !py-1.5 !px-2 w-20" value={value}
          onChange={(e) => onChange(Number(e.target.value))} />
        <span className="font-mono text-base text-ink-dim">{unit}</span>
      </span>
    </label>
  );
}

function StorageField({ label, value, highlight, sub }: { label: string; value: string; highlight?: boolean; sub?: string }) {
  return (
    <div className="panel !rounded-lg p-3 flex flex-col gap-1"
      style={highlight ? { borderColor: 'var(--color-neon-cyan)' } : {}}>
      <span className="font-body text-sm text-ink-dim">{label}</span>
      <span className={`font-mono text-base ${highlight ? 'text-glow-cyan' : 'text-ink-hi'}`}>{value}</span>
      {sub && <span className="font-mono text-sm text-ink-dim">{sub}</span>}
    </div>
  );
}
