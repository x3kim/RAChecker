import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  Gamepad2, LayoutDashboard, ScanLine, DatabaseZap, Settings as SettingsIcon,
  Cpu, HardDriveDownload, Trophy, Palette, Check, Eye, UploadCloud, Keyboard, Languages, History, Compass,
  Sparkles, MoreHorizontal, ClipboardList,
} from 'lucide-react';
import { api } from './lib/api';
import type { AppStatus, ScanItem } from './lib/api';
import { visibleThemes, loadTheme, applyTheme, loadFont, applyFont, loadAurora, applyAurora } from './lib/theme';
import { applyCrt, loadCrt } from './lib/crt';
import { ViewFade } from './lib/anim';
import { useI18n, LANGS, langChosen } from './lib/i18n';
import type { Lang } from './lib/i18n';
import { LanguageGate } from './components/LanguageGate';
import { Flag } from './components/Flag';
import { UpdateChip } from './components/UpdateChip';
import { APP_VERSION, REPO_URL } from './lib/version';
import { collectDroppedFiles } from './lib/drop';
import { JobsProvider } from './lib/jobs';
import { Dashboard } from './components/Dashboard';
import { ScanView } from './components/ScanView';
import { SyncView } from './components/SyncView';
import { Settings } from './components/Settings';
import { GameModal } from './components/GameModal';
import { GamesView } from './components/GamesView';
import { ProfileHub } from './components/ProfileHub';
import { VersionFinder } from './components/VersionFinder';
import { UploadModal } from './components/UploadModal';
import { EasterEggs } from './components/EasterEggs';
import { AttractMode } from './components/AttractMode';
import { ChangelogModal } from './components/ChangelogModal';
import { ShortcutsModal } from './components/ShortcutsModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { CommandPalette } from './components/CommandPalette';
import type { Command } from './components/CommandPalette';
import { WatchToasts } from './components/WatchToasts';
import { JobHud } from './components/JobHud';
import { GuidedTour } from './components/GuidedTour';
import { DiscoverView } from './components/DiscoverView';
import { DatView } from './components/DatView';
import { EmulatorSetupModal } from './components/EmulatorSetupModal';

type Tab = 'dashboard' | 'scan' | 'library' | 'games' | 'discover' | 'insights' | 'mastery' | 'hardcore' | 'sync' | 'dat' | 'settings';

// "Mastery" is intentionally NOT listed here — it's reached via the profile
// button on the right, so listing it again would duplicate the entry point.
// "library", "insights" and "mastery" are NOT here — they live inside the
// profile hub, reached via the profile button on the right.
const TABS: { id: Tab; labelKey: string; icon: ComponentType<any> }[] = [
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { id: 'scan', labelKey: 'nav.scan', icon: ScanLine },
  { id: 'games', labelKey: 'nav.games', icon: Trophy },
  { id: 'discover', labelKey: 'nav.discover', icon: Sparkles },
  { id: 'sync', labelKey: 'nav.sync', icon: DatabaseZap },
  { id: 'dat', labelKey: 'nav.dat', icon: ClipboardList },
];

const PROFILE_TABS: Tab[] = ['mastery', 'library', 'insights', 'hardcore'];

// g-prefixed navigation shortcuts (press g, then the key).
const NAV_KEYS: Record<string, Tab> = {
  d: 'dashboard', s: 'scan', g: 'games', e: 'discover', h: 'sync', t: 'dat', p: 'mastery', ',': 'settings',
};

export function App() {
  const { t, lang, setLang } = useI18n();
  const [tab, setTab] = useState<Tab>('dashboard');
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [openGame, setOpenGame] = useState<number | null>(null);
  const [versionItem, setVersionItem] = useState<ScanItem | null>(null);
  const [uploadFiles, setUploadFiles] = useState<File[] | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [theme, setTheme] = useState('cyan');
  const [showChangelog, setShowChangelog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [showEmuSetup, setShowEmuSetup] = useState(false);
  // First-run language picker: shown until the user has ever chosen a language.
  const [langGate, setLangGate] = useState(() => !langChosen());
  const emuChecked = useRef(false);
  const dragDepth = useRef(0);

  useEffect(() => { const t = loadTheme(); setTheme(t); applyTheme(t); applyFont(loadFont()); applyAurora(loadAurora()); applyCrt(loadCrt()); }, []);
  const changeTheme = (id: string) => { setTheme(id); applyTheme(id); };

  const refresh = useCallback(async () => {
    try { setStatus(await api.status()); } catch { /* ignore */ }
  }, []);
  const reloadProfile = useCallback(() => {
    api.userProfile().then((p) => setProfile(p && !p.error ? p : null)).catch(() => setProfile(null));
  }, []);
  useEffect(() => {
    refresh();
    reloadProfile();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh, reloadProfile]);

  // First-run wizard: surfaces once when nothing is set up yet (no hashes) and
  // the user hasn't dismissed it before. Dismissal is sticky via localStorage.
  useEffect(() => {
    if (status && status.totals.hashes === 0 && !localStorage.getItem('ra-onboarded')) setShowWizard(true);
  }, [status]);
  const dismissWizard = () => { localStorage.setItem('ra-onboarded', '1'); setShowWizard(false); };

  // First-run, opt-in emulator setup: once, when RetroArch isn't configured yet
  // and we're not in the middle of the initial onboarding wizard.
  useEffect(() => {
    if (!status || emuChecked.current) return;
    if (localStorage.getItem('ra-emu-setup-seen')) { emuChecked.current = true; return; }
    if (status.totals.hashes === 0 && !localStorage.getItem('ra-onboarded')) return; // wizard first
    emuChecked.current = true;
    api.emulator().then((e) => { if (!e.retroarchPath) setShowEmuSetup(true); }).catch(() => {});
  }, [status]);

  // ---- global keyboard shortcuts ----
  useEffect(() => {
    let gArmed = false;
    let gTimer: number | undefined;
    const inField = (el: any) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
    const onKey = (e: KeyboardEvent) => {
      // Command palette: Ctrl/Cmd+K toggles it (handled before the modifier bail-out).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowPalette((p) => !p); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        if (showPalette) { setShowPalette(false); return; }
        if (showShortcuts) { setShowShortcuts(false); return; }
        if (showChangelog) { setShowChangelog(false); return; }
        // GameModal can be opened from within UploadModal/VersionFinder (both
        // z-50, rendered after it in the DOM so they'd visually cover it) —
        // close it first so Esc always hits the modal the user actually sees.
        if (openGame != null) { setOpenGame(null); return; }
        if (uploadFiles) { setUploadFiles(null); return; }
        if (versionItem) { setVersionItem(null); return; }
        return;
      }
      if (inField(e.target) || showWizard || showPalette || showTour) return;
      if (e.key === '?') { e.preventDefault(); setShowShortcuts((s) => !s); return; }
      // "/" opens the command palette (live search over games/systems/actions),
      // the Raycast/VS-Code style quick-search the inline field can't match.
      if (e.key === '/') { e.preventDefault(); setShowPalette(true); return; }
      if (gArmed) {
        gArmed = false; clearTimeout(gTimer);
        const target = NAV_KEYS[e.key.toLowerCase()];
        if (target) { e.preventDefault(); setTab(target); }
        return;
      }
      if (e.key.toLowerCase() === 'g') { gArmed = true; gTimer = window.setTimeout(() => { gArmed = false; }, 1200); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(gTimer); };
  }, [showShortcuts, showChangelog, uploadFiles, versionItem, openGame, showWizard, showPalette, showTour]);

  // ---- command palette commands (Ctrl+K) ----
  const nextTheme = () => { const list = visibleThemes(); const i = list.findIndex((x) => x.id === theme); changeTheme(list[(i + 1) % list.length].id); };
  const commands: Command[] = [
    ...TABS.map((tb) => ({ id: `nav-${tb.id}`, label: t(tb.labelKey), section: 'nav' as const, icon: tb.icon, run: () => setTab(tb.id) })),
    { id: 'nav-profile', label: t('sc.go.profile'), section: 'nav', icon: Trophy, run: () => setTab('mastery') },
    { id: 'nav-hardcore', label: t('hc.title'), section: 'nav', icon: Trophy, run: () => setTab('hardcore') },
    { id: 'nav-settings', label: t('nav.settings'), section: 'nav', icon: SettingsIcon, run: () => setTab('settings') },
    { id: 'act-changelog', label: t('cmd.openChangelog'), section: 'actions', icon: History, run: () => setShowChangelog(true) },
    { id: 'act-shortcuts', label: t('cmd.openShortcuts'), section: 'actions', icon: Keyboard, run: () => setShowShortcuts(true) },
    { id: 'act-theme', label: t('cmd.nextTheme'), section: 'actions', icon: Palette, run: nextTheme },
    { id: 'act-lang', label: t('cmd.toggleLang'), section: 'actions', icon: Languages, run: () => setLang(lang === 'de' ? 'en' : 'de') },
    { id: 'act-tour', label: t('tour.start'), section: 'actions', icon: Compass, run: () => setShowTour(true) },
  ];

  // ---- drag & drop (upload quick-test) ----
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault(); dragDepth.current = 0; setDragActive(false);
    if (!e.dataTransfer) return;
    const { files } = await collectDroppedFiles(e.dataTransfer);
    if (files.length) setUploadFiles(files);
  };

  const onFindVersion = (item: ScanItem) => setVersionItem(item);

  return (
    <JobsProvider onChange={refresh}>
      <div id="aurora-bg" aria-hidden />
      <div
        id="app-root"
        className="relative z-10 min-h-full flex flex-col"
        onDragEnter={(e) => { e.preventDefault(); dragDepth.current++; setDragActive(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (dragDepth.current === 0) setDragActive(false); }}
        onDrop={onDrop}
      >
        <Header tab={tab} setTab={setTab} status={status} theme={theme} changeTheme={changeTheme} profile={profile} onShortcuts={() => setShowShortcuts(true)} onTour={() => setShowTour(true)} />

        <main data-tour="content" className="flex-1 w-full max-w-[1320px] mx-auto px-4 sm:px-6 py-6">
          <ViewFade k={PROFILE_TABS.includes(tab) ? 'profile' : tab}>
            {tab === 'dashboard' && <Dashboard status={status} refresh={refresh} onOpenGame={setOpenGame} goScan={() => setTab('scan')} goSync={() => setTab('sync')} goGames={() => setTab('games')} goLibrary={() => setTab('library')} />}
            {tab === 'scan' && <ScanView status={status} onOpenGame={setOpenGame} goLibrary={() => setTab('library')} onFindVersion={onFindVersion} />}
            {tab === 'games' && <GamesView status={status} onOpenGame={setOpenGame} goSync={() => setTab('sync')} />}
            {tab === 'discover' && <DiscoverView status={status} onOpenGame={setOpenGame} goScan={() => setTab('scan')} goSettings={() => setTab('settings')} />}
            {PROFILE_TABS.includes(tab) && (
              <ProfileHub sub={tab as 'mastery' | 'library' | 'insights' | 'hardcore'} onSub={setTab}
                status={status} profile={profile} onOpenGame={setOpenGame}
                goScan={() => setTab('scan')} onFindVersion={onFindVersion} />
            )}
            {tab === 'sync' && <SyncView status={status} />}
            {tab === 'dat' && <DatView />}
            {tab === 'settings' && <Settings status={status} refresh={refresh} onAuthChange={reloadProfile} theme={theme} changeTheme={changeTheme} />}
          </ViewFade>
        </main>

        <footer className="w-full max-w-[1320px] mx-auto px-6 py-4 font-mono text-ink-dim text-base flex flex-wrap gap-x-4 gap-y-1 justify-between">
          <span data-tour="status" className="flex items-center gap-2">
            <button data-tour="version" className="hover:text-neon-cyan transition-colors" onClick={() => setShowChangelog(true)} title={t('footer.changelog')}>
              RACHECKER v{APP_VERSION}
            </button>
            <UpdateChip />
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-neon-cyan transition-colors" title="GitHub">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/></svg>
              GitHub
            </a>
            · {t('footer.local')} · {t('footer.hashes', { n: (status?.totals.hashes ?? 0).toLocaleString('de-DE') })}
          </span>
          <span className="text-ink-dim">{t('footer.tip')}</span>
        </footer>

        {dragActive && (
          <div className="fixed inset-0 z-[45] grid place-items-center pointer-events-none" style={{ background: 'rgba(8,11,18,.72)', backdropFilter: 'blur(3px)' }}>
            <div className="panel panel-glow p-10 text-center sweep relative overflow-hidden" style={{ borderColor: 'var(--color-neon-cyan)', borderStyle: 'dashed' }}>
              <UploadCloud size={56} className="mx-auto text-neon-cyan mb-3" />
              <div className="font-display text-sm text-glow-cyan">{t('drop.title')}</div>
              <div className="font-body text-ink-mid mt-2 text-sm">{t('drop.sub')}</div>
            </div>
          </div>
        )}

        {openGame != null && <GameModal gameId={openGame} onClose={() => setOpenGame(null)} />}
        {versionItem && <VersionFinder filename={versionItem.innerPath || versionItem.filePath} onOpenGame={setOpenGame} onClose={() => setVersionItem(null)} />}
        {uploadFiles && <UploadModal files={uploadFiles} status={status} onOpenGame={setOpenGame} onClose={() => setUploadFiles(null)} />}
        {showChangelog && <ChangelogModal onClose={() => setShowChangelog(false)} />}
        {showShortcuts && <ShortcutsModal onClose={() => setShowShortcuts(false)} />}
        {showTour && <GuidedTour onClose={() => setShowTour(false)} />}
        {langGate && <LanguageGate onChosen={() => setLangGate(false)} />}
        {showWizard && <OnboardingWizard status={status} refresh={refresh} onAuthChange={reloadProfile} onClose={dismissWizard} />}
        {showEmuSetup && <EmulatorSetupModal onClose={() => setShowEmuSetup(false)} goSettings={() => setTab('settings')} />}
        {showPalette && <CommandPalette commands={commands} onOpenGame={setOpenGame} onClose={() => setShowPalette(false)} />}
        <WatchToasts status={status} onOpenGame={setOpenGame} />
        <JobHud onGo={setTab} />
        <EasterEggs />
        <AttractMode status={status} />
      </div>
    </JobsProvider>
  );
}

function Header({ tab, setTab, status, theme, changeTheme, profile, onShortcuts, onTour }: {
  tab: Tab; setTab: (t: Tab) => void; status: AppStatus | null; theme: string; changeTheme: (id: string) => void; profile: any; onShortcuts: () => void; onTour: () => void;
}) {
  const { t } = useI18n();
  const [logoClicks, setLogoClicks] = useState(0);
  const [spin, setSpin] = useState(false);
  const onLogo = () => {
    const n = logoClicks + 1; setLogoClicks(n);
    if (n >= 7) { setLogoClicks(0); setSpin(true); setTimeout(() => setSpin(false), 1200); }
  };
  return (
    <header className="app-header crt-scanlines sticky top-0 z-20 border-b border-crt-line bg-[rgba(8,11,18,.82)] backdrop-blur-md">
      <div className="w-full max-w-[1320px] mx-auto px-4 sm:px-6">
        <div className="flex items-center gap-3 h-16">
          <button data-tour="logo" className="flex items-center gap-2.5 shrink-0" onClick={onLogo} title="RAChecker">
            <span className="grid place-items-center rounded-lg" style={{ width: 38, height: 38, background: 'linear-gradient(180deg,rgba(34,224,255,.25),rgba(157,107,255,.12))', border: '1px solid var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)', transition: 'transform .6s', transform: spin ? 'rotate(360deg) scale(1.15)' : 'none' }}>
              <Gamepad2 size={22} className="text-neon-cyan" />
            </span>
            <div className="leading-tight text-left hidden min-[400px]:block">
              <div className="font-display text-sm text-glow-cyan">RACHECKER</div>
              <div className="font-mono text-ink-dim text-sm -mt-0.5 hidden sm:block">{spin ? '1-UP! 🍄' : 'ROM ⇄ Achievement Scanner'}</div>
            </div>
          </button>

          <nav data-tour="nav" className="flex-1 min-w-0 flex items-center gap-0.5 justify-center flex-nowrap">
            {TABS.map((tb) => {
              const Icon = tb.icon;
              const active = tab === tb.id;
              const label = t(tb.labelKey);
              return (
                <button key={tb.id} onClick={() => setTab(tb.id)} title={label}
                  className="btn !py-1.5 !px-2 lg:!px-2.5 !rounded-lg shrink-0"
                  style={active ? { borderColor: 'var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)', background: 'rgba(34,224,255,.12)' } : { borderColor: 'transparent', background: 'transparent' }}>
                  <Icon size={16} className={active ? 'text-neon-cyan' : 'text-ink-mid'} />
                  <span className={`font-body text-sm ${active ? 'inline' : 'hidden lg:inline'} ${active ? 'text-neon-cyan' : 'text-ink-mid'}`}>{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            {status?.watch?.active && (
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-base" style={{ border: '1px solid var(--color-neon-green)', color: 'var(--color-neon-green)' }} title={t('nav.watch')}>
                <Eye size={13} className="animate-blink" /> Watch
              </span>
            )}
            <MoreMenu onTour={onTour} onShortcuts={onShortcuts} />
            <ThemeMenu theme={theme} changeTheme={changeTheme} />
            {!status?.rahasher?.available && (
              <span className="hidden 2xl:inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-base" style={{ border: '1px solid var(--color-neon-amber)', color: 'var(--color-neon-amber)' }} title={t('common.rahasherMissing')}>
                <HardDriveDownload size={13} /> RAHasher
              </span>
            )}
            <button data-tour="profile" onClick={() => setTab('mastery')} className="btn !py-1 !pl-1.5 !pr-2.5" title={t('nav.profile')}
              style={(tab === 'mastery' || tab === 'library' || tab === 'insights') ? { borderColor: 'var(--color-neon-cyan)' } : {}}>
              {profile?.avatarUrl
                ? <img src={`/api/image?path=${encodeURIComponent(profile.avatarUrl)}`} width={22} height={22} className="rounded-full" style={{ objectFit: 'cover' }} alt="" />
                : <Cpu size={16} className="text-neon-purple" />}
              <span className="font-mono text-base text-ink-hi hidden md:inline">{profile?.User || status?.ra.username || '—'}</span>
            </button>
            <button data-tour="settings" onClick={() => setTab('settings')} className="btn !p-2" title={t('nav.settings')}
              style={tab === 'settings' ? { borderColor: 'var(--color-neon-cyan)' } : {}}>
              <SettingsIcon size={16} className={tab === 'settings' ? 'text-neon-cyan' : 'text-ink-mid'} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// Overflow menu — bundles the secondary shell actions (language, keyboard
// shortcuts, guided tour, GitHub) so the top bar stays slim.
function MoreMenu({ onTour, onShortcuts }: { onTour: () => void; onShortcuts: () => void }) {
  const { lang, setLang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const item = 'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[rgba(127,127,127,.12)] text-left';
  return (
    <div className="relative" ref={ref} data-tour="more">
      <button className="btn !p-2" title={t('nav.more')} aria-label={t('nav.more')} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} className="text-ink-mid" />
      </button>
      {open && (
        <div className="panel panel-glow absolute right-0 mt-2 p-1.5 w-52 z-30 max-h-[70vh] overflow-auto">
          <div className="px-2.5 pt-1 pb-1 font-mono text-sm text-ink-dim">{t('nav.language')}</div>
          {LANGS.map((l) => (
            <button key={l.id} onClick={() => setLang(l.id as Lang)} className={item}>
              <Flag lang={l.id as Lang} />
              <span className="font-body text-sm flex-1 text-ink-hi">{l.name}</span>
              {lang === l.id && <Check size={15} className="text-neon-green" />}
            </button>
          ))}
          <div className="my-1 border-t border-crt-line" />
          <button className={item} onClick={() => { setOpen(false); onTour(); }}>
            <Compass size={16} className="text-ink-mid" /> <span className="font-body text-sm text-ink-hi">{t('tour.start')}</span>
          </button>
          <button className={item} onClick={() => { setOpen(false); onShortcuts(); }}>
            <Keyboard size={16} className="text-ink-mid" /> <span className="font-body text-sm text-ink-hi">{t('shortcuts.title')}</span>
          </button>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className={item} onClick={() => setOpen(false)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-ink-mid" aria-hidden="true">
              <path d="M12 .5C5.73.5.5 5.73.5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.06-.72.08-.71.08-.71 1.17.08 1.79 1.2 1.79 1.2 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.56-.29-5.26-1.28-5.26-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.28 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z"/>
            </svg>
            <span className="font-body text-sm text-ink-hi">GitHub</span>
          </a>
        </div>
      )}
    </div>
  );
}

function ThemeMenu({ theme, changeTheme }: { theme: string; changeTheme: (id: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref} data-tour="theme">
      <button className="btn !p-2" title={t('nav.theme')} onClick={() => setOpen((o) => !o)}><Palette size={16} className="text-neon-cyan" /></button>
      {open && (
        <div className="panel panel-glow absolute right-0 mt-2 p-1.5 w-48 z-30 max-h-[70vh] overflow-auto">
          {visibleThemes().map((t) => (
            <button key={t.id} onClick={() => { changeTheme(t.id); setOpen(false); }} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-[rgba(127,127,127,.12)] text-left">
              <span className="rounded-full shrink-0" style={{ width: 16, height: 16, background: t.swatch, border: '1px solid var(--color-crt-line2)' }} />
              <span className="font-body text-sm flex-1 text-ink-hi">{t.name}</span>
              {theme === t.id && <Check size={15} className="text-neon-green" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
