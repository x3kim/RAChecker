import { useState } from 'react';
import { X, Joystick, Sparkles, Loader2, Check } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

// First-run, opt-in helper: offers to auto-detect RetroArch (+ an existing
// RAHasher) and fill in the paths, or leave it to the user. Shown once.
export function EmulatorSetupModal({ onClose, goSettings }: { onClose: () => void; goSettings: () => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const seen = () => { try { localStorage.setItem('ra-emu-setup-seen', '1'); } catch { /* ignore */ } };
  const done = () => { seen(); onClose(); };
  const toSettings = () => { seen(); onClose(); goSettings(); };

  const auto = async () => {
    setBusy(true);
    try {
      const e = await api.detectEmulator(true); // save what's found
      const r = await api.detectRahasher().catch(() => ({ found: false, path: '' }));
      const parts = [e.retroarchPath ? t('emu.foundRa') : t('emu.noRa')];
      if (r.found) parts.push(t('emu.foundRah'));
      setResult(parts.join(' '));
      seen();
    } catch {
      setResult(t('emu.noRa')); seen();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={done}>
      <div className="panel panel-glow modal-pop w-full max-w-md crt-scanlines" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line">
          <h3 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Joystick size={16} /> {t('emu.setupTitle')}</h3>
          <button className="btn !p-1.5" onClick={done}><X size={16} /></button>
        </div>
        <div className="p-5">
          <p className="font-body text-ink-mid text-sm leading-relaxed">{t('emu.setupDesc')}</p>

          {result ? (
            <div className="font-mono text-base mt-4 flex items-start gap-2" style={{ color: 'var(--color-neon-green)' }}>
              <Check size={16} className="shrink-0 mt-0.5" /> <span>{result}</span>
            </div>
          ) : null}

          <div className="flex items-center gap-2 mt-5 flex-wrap">
            {!result && (
              <button className="btn btn-primary" onClick={auto} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {t('emu.auto')}
              </button>
            )}
            <button className="btn" onClick={toSettings}>{t('emu.manual')}</button>
            {result
              ? <button className="btn" onClick={done}>{t('emu.close')}</button>
              : <button className="btn" onClick={done}>{t('emu.later')}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
