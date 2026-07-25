// Shimmering placeholders shown while data loads — feels faster and avoids the
// layout jump from a bare "Lade…" line.
export function Skeleton({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}

// A panel-shaped skeleton roughly matching the game/result cards used across the app.
export function SkeletonCard() {
  return (
    <div className="panel !rounded-lg p-3 flex items-center gap-3">
      <Skeleton style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0 }} />
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <Skeleton style={{ width: '70%', height: 12, borderRadius: 4 }} />
        <Skeleton style={{ width: '40%', height: 10, borderRadius: 4 }} />
      </div>
    </div>
  );
}

export function SkeletonGrid({ n = 6, cols = 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' }: { n?: number; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-2.5`}>
      {Array.from({ length: n }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}
