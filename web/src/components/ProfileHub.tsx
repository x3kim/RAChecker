import { Award, Library as LibraryIcon, BarChart3, Shield } from 'lucide-react';
import type { ComponentType } from 'react';
import type { AppStatus, ScanItem } from '../lib/api';
import { MasteryView } from './MasteryView';
import { LibraryView } from './LibraryView';
import { InsightsView } from './InsightsView';
import { HardcoreView } from './HardcoreView';
import { useI18n } from '../lib/i18n';

type Sub = 'mastery' | 'library' | 'insights' | 'hardcore';

const SUBTABS: { id: Sub; key: string; icon: ComponentType<any>; accent: string }[] = [
  { id: 'mastery',  key: 'hub.mastery',    icon: Award,       accent: 'var(--color-neon-amber)' },
  { id: 'hardcore', key: 'hub.hardcore',   icon: Shield,      accent: 'var(--color-neon-amber)' },
  { id: 'library',  key: 'hub.collection', icon: LibraryIcon, accent: 'var(--color-neon-green)' },
  { id: 'insights', key: 'hub.insights',   icon: BarChart3,   accent: 'var(--color-neon-cyan)' },
];

// Personal hub: groups everything that is "yours" (achievement progress, ROM
// collection, stats) under one entry reached from the profile button, instead
// of three separate top-level nav items.
export function ProfileHub({ sub, onSub, status, profile, onOpenGame, goScan, onFindVersion }: {
  sub: Sub; onSub: (s: Sub) => void;
  status: AppStatus | null; profile: any;
  onOpenGame: (id: number) => void; goScan: () => void; onFindVersion: (item: ScanItem) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-5">
      <nav className="panel !rounded-xl p-1.5 flex gap-1">
        {SUBTABS.map((tb) => {
          const Icon = tb.icon;
          const active = sub === tb.id;
          return (
            <button key={tb.id} onClick={() => onSub(tb.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all font-body text-sm"
              style={active
                ? { background: 'rgba(127,127,127,.10)', borderBottom: `2px solid ${tb.accent}`, color: 'var(--color-ink-hi)' }
                : { color: 'var(--color-ink-mid)' }}>
              <Icon size={16} style={{ color: active ? tb.accent : 'var(--color-ink-mid)' }} />
              {t(tb.key)}
            </button>
          );
        })}
      </nav>

      {sub === 'mastery' && <MasteryView status={status} onOpenGame={onOpenGame} />}
      {sub === 'hardcore' && <HardcoreView status={status} onOpenGame={onOpenGame} />}
      {sub === 'library' && <LibraryView status={status} profile={profile} onOpenGame={onOpenGame} goScan={goScan} onFindVersion={onFindVersion} />}
      {sub === 'insights' && <InsightsView status={status} />}
    </div>
  );
}
