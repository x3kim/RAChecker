import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { X, ChevronLeft, ChevronRight, Check, Compass } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

// A step either points at an existing i18n key (titleKey/bodyKey) or carries
// inline bilingual copy ({ de, en }). New steps use inline text on purpose so
// the tour can be expanded without adding i18n keys. `target` may differ from
// `id` when several steps share one spotlight (e.g. the whole nav bar).
interface BiText { de: string; en: string }
interface Step {
  id: string;
  target?: string;
  titleKey?: string; bodyKey?: string;
  title?: BiText; body?: BiText;
}

// Targets are always-present shell/content elements so the tour works from any
// tab. Each maps to a [data-tour="id"] attribute in the DOM.
const STEPS: Step[] = [
  { id: 'logo', titleKey: 'tour.logo.t', bodyKey: 'tour.logo.b' },
  {
    id: 'nav',
    title: { de: 'Navigation — die fünf Bereiche', en: 'Navigation — the five areas' },
    body: {
      de: 'Übersicht zeigt deinen Sammlungs-Status. Scannen prüft einen Ordner gegen die Hash-DB. Spiele & Erfolge listet, was Achievements bringt. Entdecken zeigt gratis spielbare Titel, laufende Set-Projekte und Community-Neuigkeiten — immer abgeglichen mit deiner Sammlung. Hash-DB hält die lokale Datenbank aktuell. Einzelne Dateien prüfst du per Drag & Drop in die Seite.',
      en: 'Dashboard shows your collection status. Scan checks a folder against the hash DB. Games & achievements lists what earns achievements. Discover surfaces free-to-play titles, in-progress achievement sets and community news — always matched against your collection. Hash DB keeps the local database current. Check single files by dragging them onto the page.',
    },
  },
  {
    id: 'content', target: 'content',
    title: { de: 'Arbeitsbereich', en: 'Workspace' },
    body: {
      de: 'Hier öffnet sich der gewählte Bereich. Auf der Übersicht siehst du Kacheln mit Statistiken; ein Klick darauf springt direkt zum jeweiligen Detail.',
      en: 'The selected area opens here. On the dashboard you get stat tiles; clicking one jumps straight to its detail view.',
    },
  },
  { id: 'profile', titleKey: 'tour.profile.t', bodyKey: 'tour.profile.b' },
  {
    id: 'more', target: 'more',
    title: { de: 'Mehr: Sprache, Hilfe & Tour', en: 'More: language, help & tour' },
    body: {
      de: 'In diesem Menü liegen Sprache (Deutsch/English), Tastatur-Shortcuts (g + Taste zum Springen, / für Suche, ? für Hilfe), der GitHub-Link und der Neustart dieser Tour. Strg + K öffnet zusätzlich die Befehlspalette: tippen, um Spiele zu suchen, Bereiche zu wechseln oder Aktionen auszuführen.',
      en: 'This menu holds language (German/English), keyboard shortcuts (g + key to jump, / to search, ? for help), the GitHub link and restarting this tour. Ctrl + K also opens the command palette: type to find games, switch areas or run actions.',
    },
  },
  { id: 'theme', titleKey: 'tour.theme.t', bodyKey: 'tour.theme.b' },
  { id: 'settings', titleKey: 'tour.settings.t', bodyKey: 'tour.settings.b' },
  {
    id: 'status', target: 'status',
    title: { de: 'Lokal & offline', en: 'Local & offline' },
    body: {
      de: 'Alles läuft auf deinem Rechner — keine Cloud. Die Zahl zeigt, wie viele Hashes deine lokale Datenbank kennt. Lade über die Hash-DB neue Daten, damit Scans aktuelle Erfolge erkennen.',
      en: 'Everything runs on your machine — no cloud. The number shows how many hashes your local database knows. Pull fresh data via the Hash DB so scans recognise current achievements.',
    },
  },
  { id: 'version', titleKey: 'tour.version.t', bodyKey: 'tour.version.b' },
];

const PAD = 8;

export function GuidedTour({ onClose }: { onClose: () => void }) {
  const { t, lang } = useI18n();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  // The card's real height decides where it can sit — a fixed guess used to push
  // the buttons off-screen on steps anchored near the bottom edge (the footer).
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(240);
  const step = STEPS[i];
  const last = i === STEPS.length - 1;

  // Resolve a step's title/body: prefer i18n key, else inline bilingual text.
  const pick = (l: Lang, b?: BiText) => (b ? b[l] : '');
  const stepTitle = step.titleKey ? t(step.titleKey) : pick(lang, step.title);
  const stepBody = step.bodyKey ? t(step.bodyKey) : pick(lang, step.body);
  const targetId = step.target ?? step.id;

  const measure = () => {
    const el = document.querySelector(`[data-tour="${targetId}"]`) as HTMLElement | null;
    if (!el) { setRect(null); return; }
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    setRect(el.getBoundingClientRect());
  };

  useLayoutEffect(() => {
    measure();
    const t2 = setTimeout(measure, 80); // after any scroll settles
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t2); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') setI((x) => Math.min(STEPS.length - 1, x + 1));
      else if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  // Re-measure the card whenever its content changes, so placement uses the real
  // height instead of an estimate.
  useLayoutEffect(() => {
    const h = cardRef.current?.offsetHeight;
    if (h && Math.abs(h - cardH) > 1) setCardH(h);
  });

  // Tooltip placement: below the target when it fits, else above, else wherever
  // it fits — and always clamped into the viewport so the buttons stay reachable.
  const vw = window.innerWidth, vh = window.innerHeight;
  const MARGIN = 12;
  const cardW = Math.min(320, vw - MARGIN * 2);
  const maxCardH = Math.max(160, vh - MARGIN * 2);
  let cardStyle: React.CSSProperties;
  if (rect) {
    const fitsBelow = rect.bottom + MARGIN + cardH + MARGIN <= vh;
    const fitsAbove = rect.top - MARGIN - cardH >= MARGIN;
    let top = fitsBelow ? rect.bottom + MARGIN : (fitsAbove ? rect.top - MARGIN - cardH : rect.bottom + MARGIN);
    top = Math.max(MARGIN, Math.min(top, vh - Math.min(cardH, maxCardH) - MARGIN));
    let left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.max(MARGIN, Math.min(left, vw - cardW - MARGIN));
    cardStyle = { position: 'fixed', top, left, width: cardW, maxHeight: maxCardH, overflowY: 'auto' };
  } else {
    cardStyle = {
      position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
      width: cardW, maxHeight: maxCardH, overflowY: 'auto',
    };
  }

  return (
    <div className="fixed inset-0 z-[90]">
      {/* dim + spotlight hole via huge box-shadow */}
      {rect ? (
        <div className="absolute pointer-events-none" style={{
          top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2,
          borderRadius: 12, boxShadow: '0 0 0 9999px rgba(4,6,12,.72)', border: '2px solid var(--color-neon-cyan)',
          transition: 'all .2s ease',
        }} />
      ) : (
        <div className="absolute inset-0" style={{ background: 'rgba(4,6,12,.72)' }} />
      )}
      {/* click-catcher to advance / block UI */}
      <div className="absolute inset-0" onClick={() => setI((x) => (last ? x : x + 1))} />

      <div ref={cardRef} className="panel panel-glow modal-pop crt-scanlines p-4" style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-display text-sm text-glow-cyan flex items-center gap-2"><Compass size={15} /> {stepTitle}</span>
          <button className="btn !p-1" onClick={onClose} title={t('tour.skip')}><X size={15} /></button>
        </div>
        <p className="font-body text-sm text-ink-mid leading-relaxed">{stepBody}</p>
        <div className="flex items-center gap-1.5 mt-3">
          {STEPS.map((_, n) => (
            <span key={n} className="rounded-full" style={{ width: n === i ? 16 : 6, height: 6, background: n === i ? 'var(--color-neon-cyan)' : 'var(--color-crt-line2)', transition: 'all .2s' }} />
          ))}
          <span className="ml-auto font-mono text-sm text-ink-dim">{i + 1}/{STEPS.length}</span>
        </div>
        {/* wraps instead of overflowing: German labels are wide for a 320px card */}
        <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
          <button className="btn !py-1.5 !px-3 text-sm text-ink-dim shrink-0 whitespace-nowrap" onClick={onClose}>{t('tour.skip')}</button>
          <div className="flex items-center gap-2 ml-auto">
            {i > 0 && <button className="btn !py-1.5 !px-3 text-sm shrink-0 whitespace-nowrap" onClick={() => setI((x) => x - 1)}><ChevronLeft size={15} /> {t('tour.back')}</button>}
            {last
              ? <button className="btn btn-primary !py-1.5 !px-3 text-sm shrink-0 whitespace-nowrap" onClick={onClose}><Check size={15} /> {t('tour.done')}</button>
              : <button className="btn btn-primary !py-1.5 !px-3 text-sm shrink-0 whitespace-nowrap" onClick={() => setI((x) => x + 1)}>{t('tour.next')} <ChevronRight size={15} /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}
