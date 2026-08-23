import { Gamepad2 } from 'lucide-react';
import { LANGS, useI18n } from '../lib/i18n';
import type { Lang } from '../lib/i18n';
import { Flag } from './Flag';

// First-run language picker. Shown once, before the onboarding wizard, when the
// user has never explicitly chosen a language. Picking one persists it (via
// setLang) so it never reappears.
export function LanguageGate({ onChosen }: { onChosen: () => void }) {
  const { setLang } = useI18n();
  const pick = (l: Lang) => { setLang(l); onChosen(); };
  return (
    <div className="fixed inset-0 z-[95] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.92)', backdropFilter: 'blur(6px)' }}>
      <div className="panel panel-glow modal-pop w-full max-w-md text-center p-7 crt-scanlines relative overflow-hidden">
        <div className="relative z-10">
          <span className="grid place-items-center rounded-xl mx-auto mb-4" style={{ width: 52, height: 52, background: 'linear-gradient(180deg,rgba(34,224,255,.25),rgba(157,107,255,.12))', border: '1px solid var(--color-neon-cyan)', boxShadow: 'var(--shadow-glow-cyan)' }}>
            <Gamepad2 size={26} className="text-neon-cyan" />
          </span>
          <h1 className="font-display text-base text-glow-cyan">RACHECKER</h1>
          <p className="font-mono text-base text-ink-dim mt-2">Choose your language · Sprache wählen · 言語を選択</p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            {LANGS.map((l) => (
              <button key={l.id} onClick={() => pick(l.id as Lang)}
                className="btn flex-col !py-4 gap-2 items-center hover:border-neon-cyan">
                <Flag lang={l.id as Lang} size={40} />
                <span className="font-body text-sm text-ink-hi">{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
