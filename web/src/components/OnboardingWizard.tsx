import { useState } from 'react';
import {
  Gamepad2, FolderOpen, UserRound, DatabaseZap, ChevronLeft, ChevronRight, Check,
  ExternalLink, Eye, EyeOff, LogIn, RefreshCw, CheckCircle2, X,
} from 'lucide-react';
import type { AppStatus } from '../lib/api';
import { api } from '../lib/api';
import { useJobs } from '../lib/jobs';
import { useI18n } from '../lib/i18n';
import { FolderPicker } from './FolderPicker';

const TOTAL = 3;

export function OnboardingWizard({ status, onClose, refresh, onAuthChange }: {
  status: AppStatus | null; onClose: () => void; refresh: () => void; onAuthChange: () => void;
}) {
  const { t } = useI18n();
  const { sync, startSync } = useJobs();
  const [step, setStep] = useState(1);
  const [picker, setPicker] = useState(false);

  // step 1
  const [root, setRoot] = useState(status?.romRoot || '');
  // step 2
  const [user, setUser] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const loggedIn = Boolean(status?.ra.hasKey && status?.ra.username);

  const saveRoot = async () => { if (root.trim()) await api.saveSettings(root.trim()).catch(() => {}); refresh(); };

  const next = async () => {
    if (step === 1) await saveRoot();
    setStep((s) => Math.min(TOTAL, s + 1));
  };
  const back = () => setStep((s) => Math.max(1, s - 1));

  const doLogin = async () => {
    if (!user.trim() || !key.trim()) { setMsg({ ok: false, text: t('wiz.s2.user') + ' + ' + t('wiz.s2.key') }); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await api.saveCredentials(user.trim(), key.trim());
      if (r.ok) { setMsg({ ok: true, text: t('wiz.s2.loggedin', { user: r.username || user }) }); refresh(); onAuthChange(); }
      else setMsg({ ok: false, text: r.error || t('common.error') });
    } catch (e: any) { setMsg({ ok: false, text: String(e?.message || e) }); }
    finally { setBusy(false); }
  };

  const finish = () => { onClose(); };

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.86)', backdropFilter: 'blur(6px)' }}>
      <div className="panel panel-glow modal-pop w-full max-w-lg crt-scanlines relative overflow-hidden">
        <div className="sweep absolute inset-0 pointer-events-none opacity-50" />
        <div className="relative z-10">
          {/* header */}
          <div className="p-5 border-b border-crt-line flex items-center gap-3">
            <span className="grid place-items-center rounded-lg shrink-0" style={{ width: 40, height: 40, background: 'linear-gradient(180deg,rgba(34,224,255,.25),rgba(157,107,255,.12))', border: '1px solid var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' }}>
              <Gamepad2 size={22} className="text-neon-cyan" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-sm text-glow-cyan">{t('wiz.title')}</h2>
              <div className="font-mono text-base text-ink-dim">{t('wiz.subtitle')}</div>
            </div>
            <button className="btn !p-1.5" onClick={onClose} title={t('wiz.skip')}><X size={16} /></button>
          </div>

          {/* step indicator */}
          <div className="px-5 pt-4 flex items-center gap-2">
            {[1, 2, 3].map((n) => (
              <div key={n} className="h-1.5 rounded-full flex-1 transition-all"
                style={{ background: n <= step ? 'var(--color-neon-cyan)' : 'var(--color-crt-line)', boxShadow: n <= step ? 'var(--shadow-glow-cyan)' : 'none' }} />
            ))}
          </div>
          <div className="px-5 pt-2 font-mono text-sm text-ink-dim">{t('wiz.step', { n: step, total: TOTAL })}</div>

          {/* step body */}
          <div className="p-5 min-h-[220px]">
            {step === 1 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-sm text-ink-hi flex items-center gap-2"><FolderOpen size={16} className="text-neon-cyan" /> {t('wiz.s1.title')}</h3>
                <p className="font-body text-sm text-ink-mid">{t('wiz.s1.desc')}</p>
                <div className="flex gap-2">
                  <input className="input flex-1" value={root} onChange={(e) => setRoot(e.target.value)} placeholder={t('wiz.s1.placeholder')} />
                  <button className="btn" onClick={() => setPicker(true)}><FolderOpen size={16} /> {t('wiz.s1.browse')}</button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-sm text-ink-hi flex items-center gap-2"><UserRound size={16} className="text-neon-purple" /> {t('wiz.s2.title')}</h3>
                <p className="font-body text-sm text-ink-mid">{t('wiz.s2.desc')}</p>
                {loggedIn ? (
                  <div className="badge w-fit" style={{ color: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>
                    <CheckCircle2 size={14} /> {t('wiz.s2.loggedin', { user: status?.ra.username || '' })}
                  </div>
                ) : (
                  <>
                    <input className="input" value={user} onChange={(e) => setUser(e.target.value)} placeholder={t('wiz.s2.user')} autoComplete="username" />
                    <div className="flex gap-2">
                      <input className="input flex-1 font-mono" type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('wiz.s2.key')} autoComplete="off" />
                      <button className="btn !px-3" type="button" onClick={() => setShowKey((s) => !s)}>{showKey ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                    <a className="font-mono text-sm text-neon-cyan inline-flex items-center gap-1 hover:underline w-fit" href="https://retroachievements.org/settings" target="_blank" rel="noreferrer">
                      <ExternalLink size={12} /> {t('wiz.s2.findkey')}
                    </a>
                    <button className="btn btn-primary w-fit" onClick={doLogin} disabled={busy}>
                      <LogIn size={16} /> {busy ? t('wiz.s2.checking') : t('wiz.s2.login')}
                    </button>
                  </>
                )}
                {msg && <div className="font-mono text-base" style={{ color: msg.ok ? 'var(--color-neon-green)' : 'var(--color-neon-red)' }}>{msg.text}</div>}
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-display text-sm text-ink-hi flex items-center gap-2"><DatabaseZap size={16} className="text-neon-green" /> {t('wiz.s3.title')}</h3>
                <p className="font-body text-sm text-ink-mid">{t('wiz.s3.desc')}</p>
                {sync.active ? (
                  <div className="flex flex-col gap-2">
                    <div className="font-mono text-base text-neon-cyan flex items-center gap-2"><RefreshCw size={15} className="animate-spin" /> {t('wiz.s3.running')} {sync.cur.name}</div>
                    <div className="progress-track h-2.5"><div className="progress-fill" style={{ width: `${sync.cur.total ? Math.round((sync.cur.done / sync.cur.total) * 100) : 8}%` }} /></div>
                  </div>
                ) : sync.done && sync.summary ? (
                  <div className="badge w-fit" style={{ color: 'var(--color-neon-green)', boxShadow: 'var(--shadow-glow-green)' }}>
                    <CheckCircle2 size={14} /> {t('wiz.s3.done')}
                  </div>
                ) : (
                  <button className="btn btn-primary w-fit" onClick={() => startSync(false)}>
                    <DatabaseZap size={16} /> {t('wiz.s3.start')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* footer nav */}
          <div className="p-5 border-t border-crt-line flex items-center gap-2">
            <button className="btn !py-1.5 !px-3 text-sm text-ink-dim" onClick={onClose}>{t('wiz.skip')}</button>
            <div className="flex-1" />
            {step > 1 && <button className="btn" onClick={back}><ChevronLeft size={16} /> {t('wiz.back')}</button>}
            {step < TOTAL
              ? <button className="btn btn-primary" onClick={next}>{t('wiz.next')} <ChevronRight size={16} /></button>
              : <button className="btn btn-primary" onClick={finish}><Check size={16} /> {t('wiz.finish')}</button>}
          </div>
        </div>
      </div>

      {picker && <FolderPicker initialPath={root} onPick={(p) => { setRoot(p); setPicker(false); }} onClose={() => setPicker(false)} />}
    </div>
  );
}
