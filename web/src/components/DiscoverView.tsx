import { useState } from 'react';
import type { ComponentType } from 'react';
import { Gift, Radar, Users } from 'lucide-react';
import type { AppStatus } from '../lib/api';
import { FreeGamesPanel } from './FreeGamesPanel';
import { SetRadarPanel } from './SetRadarPanel';
import { CommunityPanel } from './CommunityPanel';
import { useI18n } from '../lib/i18n';

type Sub = 'free' | 'radar' | 'community';

const SUBTABS: { id: Sub; key: string; icon: ComponentType<any>; accent: string }[] = [
  { id: 'free', key: 'disc.free', icon: Gift, accent: 'var(--color-neon-green)' },
  { id: 'radar', key: 'disc.radar', icon: Radar, accent: 'var(--color-neon-cyan)' },
  { id: 'community', key: 'disc.community', icon: Users, accent: 'var(--color-neon-purple)' },
];

// Discovery hub: everything that is about the wider RetroAchievements world
// rather than your own collection — free games you may legally download, which
// achievement sets are being built right now, and community activity. Each
// panel cross-references the local collection so it stays personal.
export function DiscoverView({ status, onOpenGame, goScan, goSettings }: {
  status: AppStatus | null;
  onOpenGame: (id: number) => void;
  goScan: () => void;
  goSettings: () => void;
}) {
  const { t } = useI18n();
  const [sub, setSub] = useState<Sub>('free');
  return (
    <div className="flex flex-col gap-5">
      <nav className="panel !rounded-xl p-1.5 flex gap-1">
        {SUBTABS.map((tb) => {
          const Icon = tb.icon;
          const active = sub === tb.id;
          return (
            <button key={tb.id} onClick={() => setSub(tb.id)}
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

      {sub === 'free' && <FreeGamesPanel status={status} onOpenGame={onOpenGame} goScan={goScan} goSettings={goSettings} />}
      {sub === 'radar' && <SetRadarPanel onOpenGame={onOpenGame} />}
      {sub === 'community' && <CommunityPanel onOpenGame={onOpenGame} goSettings={goSettings} />}
    </div>
  );
}
