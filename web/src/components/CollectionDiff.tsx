import { useCallback, useEffect, useState } from 'react';
import { GitCompareArrows, Sparkles, Trophy, TrendingDown, Trash2, RefreshCw } from 'lucide-react';
import type { CollectionDiff as Diff, DiffRow } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, SectionHeader } from './ui';
import { useI18n } from '../lib/i18n';
import { fmtAgo, basename } from '../lib/util';

type BucketKey = 'newlyMatched' | 'added' | 'lost' | 'removed';
const BUCKETS: { key: BucketKey; color: string; icon: any }[] = [
  { key: 'newlyMatched', color: 'var(--color-neon-green)', icon: Trophy },
  { key: 'added', color: 'var(--color-neon-cyan)', icon: Sparkles },
  { key: 'lost', color: 'var(--color-neon-amber)', icon: TrendingDown },
  { key: 'removed', color: 'var(--color-ink-dim)', icon: Trash2 },
];

function Row({ r, color, onOpenGame }: { r: DiffRow; color: string; onOpenGame: (id: number) => void }) {
  const title = r.match_title || r.prev_title || basename(r.path);
  const clickable = r.match_game_id != null;
  return (
    <button
      disabled={!clickable}
      onClick={() => clickable && onOpenGame(r.match_game_id as number)}
      className="panel !rounded-lg p-2 flex items-center gap-2.5 text-left w-full disabled:cursor-default"
      style={{ borderColor: 'var(--color-crt-line)' }}>
      {r.match_image
        ? <img src={imageUrl(r.match_image)} width={28} height={28} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />
        : <span className="shrink-0 grid place-items-center" style={{ width: 28, height: 28 }}><ConsoleIcon id={r.console_id} short={r.console_short ?? undefined} size={18} /></span>}
      <span className="min-w-0 flex-1">
        <span className="font-body text-sm text-ink-hi truncate block" title={title}>{title}</span>
        <span className="font-mono text-sm text-ink-dim truncate block" title={r.path}>{basename(r.path)}{r.inner_path ? ` › ${r.inner_path}` : ''}</span>
      </span>
      {r.match_achievements ? <span className="font-mono text-sm shrink-0" style={{ color }}>{r.match_achievements}🏆</span> : null}
    </button>
  );
}

export function CollectionDiff({ onOpenGame }: { onOpenGame: (id: number) => void }) {
  const { t } = useI18n();
  const [diff, setDiff] = useState<Diff | null>(null);
  const [open, setOpen] = useState<BucketKey | null>(null);

  const load = useCallback(() => { api.collectionDiff().then(setDiff).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  if (!diff || !diff.hasBaseline) return null;
  const totalChanges = diff.counts.added + diff.counts.newlyMatched + diff.counts.lost + diff.counts.removed;

  // Auto-open the most useful non-empty bucket the first time there are changes.
  const firstNonEmpty = BUCKETS.find((b) => diff.counts[b.key] > 0)?.key ?? null;
  const active = open ?? firstNonEmpty;
  const rows = active ? (diff[active] as DiffRow[]) : [];

  return (
    <section className="panel p-5">
      <SectionHeader accent="var(--color-neon-green)" title={t('diff.title')} icon={GitCompareArrows}>
        <button className="btn !py-1 !px-2.5 text-sm" onClick={load} title={t('diff.since', { ago: fmtAgo(diff.at) })}>
          <RefreshCw size={14} />
        </button>
      </SectionHeader>

      {totalChanges === 0 ? (
        <p className="font-body text-ink-dim text-sm -mt-1">{t('diff.none')}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {BUCKETS.map((b) => {
              const n = diff.counts[b.key];
              const isActive = active === b.key;
              return (
                <button key={b.key} onClick={() => setOpen(isActive ? null : b.key)} disabled={n === 0}
                  title={t(`diff.${b.key}.help`)}
                  className="panel !rounded-lg p-3 text-left transition-all disabled:opacity-45"
                  style={isActive && n > 0 ? { borderColor: b.color, boxShadow: `0 0 0 1px ${b.color}` } : {}}>
                  <div className="flex items-center gap-2">
                    <b.icon size={16} style={{ color: b.color }} />
                    <span className="font-display text-lg" style={{ color: b.color }}>{n}</span>
                  </div>
                  <div className="font-mono text-sm text-ink-mid mt-1">{t(`diff.${b.key}`)}</div>
                </button>
              );
            })}
          </div>

          {active && rows.length > 0 && (() => {
            const shown = rows.slice(0, 8);
            const color = BUCKETS.find((b) => b.key === active)!.color;
            return (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {shown.map((r, i) => (
                  <Row key={`${r.path}|${r.inner_path}|${i}`} r={r} color={color} onOpenGame={onOpenGame} />
                ))}
                {diff.counts[active] > shown.length && (
                  <div className="font-mono text-sm text-ink-dim self-center px-2">{t('diff.more', { n: diff.counts[active] - shown.length })}</div>
                )}
              </div>
            );
          })()}
        </>
      )}
    </section>
  );
}
