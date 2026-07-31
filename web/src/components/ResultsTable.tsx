import { useState } from 'react';
import { Trophy, ChevronDown, ChevronRight, FolderSearch, Wand2 } from 'lucide-react';
import type { ScanItem } from '../lib/api';
import { api, imageUrl } from '../lib/api';
import { StatusBadge, ConsoleIcon } from './ui';
import { RegionBadges } from './RegionBadges';
import { useI18n } from '../lib/i18n';
import { basename, fmtBytes } from '../lib/util';

function isAbsolutePath(p?: string) {
  return !!p && (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('\\\\') || p.startsWith('/'));
}

export function ResultRow({ item, consoleShort, onOpenGame, onFindVersion, dense = true, priority = [] }: {
  item: ScanItem; consoleShort?: string; onOpenGame?: (id: number) => void; onFindVersion?: (item: ScanItem) => void;
  dense?: boolean; priority?: string[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const isMatch = item.status === 'match';
  const canExpand = true;
  const realPath = !item.uploaded && isAbsolutePath(item.filePath);
  const clamp34 = dense ? 'truncate max-w-[34ch]' : 'whitespace-normal break-words';
  const clamp28 = dense ? 'truncate max-w-[28ch]' : 'whitespace-normal break-words';

  return (
    <>
      <tr className="border-b border-crt-line/60 hover:bg-[rgba(127,127,127,.06)] transition-colors" style={{ cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <td className="py-2 pl-3 pr-1 w-9">{open ? <ChevronDown size={15} className="text-ink-dim" /> : <ChevronRight size={15} className="text-ink-dim" />}</td>
        <td className="py-2 pr-2 w-9"><ConsoleIcon id={item.consoleId} short={consoleShort} size={24} /></td>
        <td className="py-2 pr-3 min-w-0">
          <div className={`font-body text-ink-hi ${clamp34}`} title={item.filePath}>{basename(item.filePath)}</div>
          {item.innerPath && <div className={`font-mono text-ink-dim text-sm ${clamp34}`}>↳ {item.innerPath}</div>}
        </td>
        <td className="py-2 pr-3 whitespace-nowrap hidden sm:table-cell"><RegionBadges item={item} priority={priority} max={3} /></td>
        <td className="py-2 pr-3 whitespace-nowrap"><StatusBadge status={item.status} /></td>
        <td className="py-2 pr-3 min-w-0">
          {isMatch ? (
            <div className="flex items-center gap-2 min-w-0">
              {item.matchImage && <img src={imageUrl(item.matchImage)} width={26} height={26} loading="lazy" className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" />}
              <span className={`font-body text-neon-green ${clamp28}`} title={item.matchTitle}>{item.matchTitle}</span>
            </div>
          ) : (
            <span className={`font-mono text-ink-dim text-base block ${clamp34}`} title={item.message || ''}>{item.message || '—'}</span>
          )}
        </td>
        <td className="py-2 pr-3 whitespace-nowrap font-mono text-base text-ink-mid">
          {isMatch && item.matchAchievements ? <span className="inline-flex items-center gap-1 text-neon-amber"><Trophy size={13} /> {item.matchAchievements}</span> : <span className="text-ink-dim">—</span>}
        </td>
        <td className="py-2 pr-3 whitespace-nowrap font-mono text-sm text-ink-dim hidden md:table-cell">{item.md5 ? item.md5.slice(0, 10) + '…' : '—'}</td>
        <td className="py-2 pr-3 whitespace-nowrap font-mono text-sm text-ink-dim hidden lg:table-cell">{fmtBytes(item.size)}</td>
      </tr>
      {open && (
        <tr className="bg-[rgba(127,127,127,.05)]">
          <td colSpan={9} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-base">
              {isMatch && <>
                <span className="text-ink-mid">{t('rt.ach')}: <span className="text-neon-amber">{item.matchAchievements ?? '?'}</span></span>
                <span className="text-ink-mid">{t('rt.points')}: <span className="text-neon-cyan">{item.matchPoints ?? '?'}</span></span>
                {item.romName && <span className="text-ink-mid">{t('rt.refRom')}: <span className="text-ink-hi">{item.romName}</span></span>}
              </>}
              {item.md5 && <span className="text-ink-mid">{t('rt.hash')}: <span className="text-ink-hi">{item.md5}</span></span>}
              <span className="text-ink-dim truncate max-w-[40ch]" title={item.filePath}>{item.filePath}{item.innerPath ? ` › ${item.innerPath}` : ''}</span>
              <div className="flex items-center gap-2 ml-auto">
                {realPath && (
                  <button className="btn !py-1 !px-2.5 text-sm" onClick={(e) => { e.stopPropagation(); api.reveal(item.filePath).catch(() => {}); }} title={t('rt.explorerTip')}>
                    <FolderSearch size={13} /> {t('rt.explorer')}
                  </button>
                )}
                {item.status === 'no_match' && onFindVersion && (
                  <button className="btn !py-1 !px-2.5 text-sm btn-magenta" onClick={(e) => { e.stopPropagation(); onFindVersion(item); }} title={t('rt.rightVersionTip')}>
                    <Wand2 size={13} /> {t('rt.rightVersion')}
                  </button>
                )}
                {isMatch && item.matchGameId != null && onOpenGame && (
                  <button className="btn !py-1 !px-2.5 text-sm" onClick={(e) => { e.stopPropagation(); onOpenGame(item.matchGameId!); }}>{t('rt.gameDetails')}</button>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function ResultsTable({ items, consoleShortById, onOpenGame, onFindVersion, cap = 600, dense = true, priority = [] }: {
  items: ScanItem[]; consoleShortById?: Map<number, string>; onOpenGame?: (id: number) => void; onFindVersion?: (item: ScanItem) => void;
  cap?: number; dense?: boolean; priority?: string[];
}) {
  const { t } = useI18n();
  const shown = items.slice(0, cap);
  return (
    <div className="panel overflow-hidden">
      <div className="overflow-auto max-h-[58vh]">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 sticky-head backdrop-blur">
            <tr className="font-mono text-ink-mid text-base">
              <th className="py-2 pl-3 w-9"></th>
              <th className="py-2 pr-2"></th>
              <th className="py-2 pr-3">{t('rt.file')}</th>
              <th className="py-2 pr-3 hidden sm:table-cell">{t('rt.region')}</th>
              <th className="py-2 pr-3">{t('rt.status')}</th>
              <th className="py-2 pr-3">{t('rt.gameHint')}</th>
              <th className="py-2 pr-3">{t('rt.ach')}</th>
              <th className="py-2 pr-3 hidden md:table-cell">{t('rt.hash')}</th>
              <th className="py-2 pr-3 hidden lg:table-cell">{t('rt.size')}</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((it) => (
              <ResultRow key={`${it.filePath}|${it.innerPath ?? ''}`} item={it} consoleShort={it.consoleId != null ? consoleShortById?.get(it.consoleId) : undefined} onOpenGame={onOpenGame} onFindVersion={onFindVersion} dense={dense} priority={priority} />
            ))}
          </tbody>
        </table>
      </div>
      {items.length > cap && (
        <div className="font-mono text-ink-dim text-base px-4 py-2 border-t border-crt-line">
          {t('rt.showing', { cap, n: items.length.toLocaleString('de-DE') })}
        </div>
      )}
    </div>
  );
}
