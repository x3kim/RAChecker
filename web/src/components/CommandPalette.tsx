import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';
import type { ComponentType } from 'react';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon } from './ui';
import { useI18n } from '../lib/i18n';

export interface Command { id: string; label: string; section: 'nav' | 'actions'; icon?: ComponentType<any>; run: () => void }
interface GameHit { id: number; title: string; console_id: number; console_short?: string; image_icon?: string }

export function CommandPalette({ commands, onOpenGame, onClose }: {
  commands: Command[]; onOpenGame: (id: number) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const [games, setGames] = useState<GameHit[]>([]);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // live game search (debounced)
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setGames([]); return; }
    const tmr = setTimeout(() => {
      api.searchGames(term, 8).then((r) => setGames(r.map((g: any) => ({ id: g.id, title: g.title, console_id: g.console_id, console_short: g.console_short, image_icon: g.image_icon })))).catch(() => setGames([]));
    }, 180);
    return () => clearTimeout(tmr);
  }, [q]);

  const filteredCmds = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(term));
  }, [q, commands]);

  // flat list for keyboard nav: commands first, then games
  const flat = useMemo(() => [
    ...filteredCmds.map((c) => ({ kind: 'cmd' as const, c })),
    ...games.map((g) => ({ kind: 'game' as const, g })),
  ], [filteredCmds, games]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${sel}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const exec = (i: number) => {
    const item = flat[i];
    if (!item) return;
    if (item.kind === 'cmd') { item.c.run(); onClose(); }
    else { onOpenGame(item.g.id); onClose(); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(flat.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); exec(sel); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let idx = -1;
  const navCmds = filteredCmds.filter((c) => c.section === 'nav');
  const actionCmds = filteredCmds.filter((c) => c.section === 'actions');

  const renderCmd = (c: Command) => {
    idx++;
    const i = idx; const active = i === sel;
    const Icon = c.icon;
    return (
      <button key={c.id} data-idx={i} onMouseEnter={() => setSel(i)} onClick={() => exec(i)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left"
        style={active ? { background: 'rgba(34,224,255,.14)', borderLeft: '2px solid var(--color-neon-cyan)' } : { borderLeft: '2px solid transparent' }}>
        {Icon ? <Icon size={15} className={active ? 'text-neon-cyan' : 'text-ink-mid'} /> : <span style={{ width: 15 }} />}
        <span className={`font-body text-sm flex-1 ${active ? 'text-ink-hi' : 'text-ink-mid'}`}>{c.label}</span>
        {active && <CornerDownLeft size={13} className="text-ink-dim" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-[82] flex items-start justify-center p-4 pt-[12vh]" style={{ background: 'rgba(4,6,12,.7)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-crt-line">
          <Search size={18} className="text-ink-dim shrink-0" />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            className="input !border-0 !bg-transparent !px-0 focus:!shadow-none flex-1" placeholder={t('cmd.placeholder')} />
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-auto p-2">
          {navCmds.length > 0 && <div className="font-mono text-sm text-ink-dim px-3 pt-1 pb-0.5">{t('cmd.nav')}</div>}
          {navCmds.map(renderCmd)}
          {actionCmds.length > 0 && <div className="font-mono text-sm text-ink-dim px-3 pt-2 pb-0.5">{t('cmd.actions')}</div>}
          {actionCmds.map(renderCmd)}
          {games.length > 0 && <div className="font-mono text-sm text-ink-dim px-3 pt-2 pb-0.5">{t('cmd.games')}</div>}
          {games.map((g) => {
            idx++; const i = idx; const active = i === sel;
            return (
              <button key={`g${g.id}`} data-idx={i} onMouseEnter={() => setSel(i)} onClick={() => exec(i)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left"
                style={active ? { background: 'rgba(34,224,255,.14)', borderLeft: '2px solid var(--color-neon-cyan)' } : { borderLeft: '2px solid transparent' }}>
                {g.image_icon
                  ? <img src={imageUrl(g.image_icon)} width={22} height={22} loading="lazy" className="rounded shrink-0" style={{ objectFit: 'contain' }} alt="" />
                  : <ConsoleIcon id={g.console_id} short={g.console_short} size={18} />}
                <span className={`font-body text-sm flex-1 truncate ${active ? 'text-ink-hi' : 'text-ink-mid'}`}>{g.title}</span>
                <ConsoleIcon id={g.console_id} short={g.console_short} size={15} />
              </button>
            );
          })}
          {flat.length === 0 && <div className="font-mono text-ink-dim text-center py-6">{t('cmd.empty')}</div>}
        </div>

        <div className="px-4 py-2 border-t border-crt-line font-mono text-sm text-ink-dim">{t('cmd.hint')}</div>
      </div>
    </div>
  );
}
