import { useEffect, useRef, useState } from 'react';
import { X, Wand2, Search, ChevronRight, ChevronDown, Wrench, Download, ExternalLink } from 'lucide-react';
import { api, imageUrl } from '../lib/api';
import { ConsoleIcon, SectionHeader, Pill } from './ui';
import { useI18n } from '../lib/i18n';
import { basename } from '../lib/util';

// Clean a ROM filename into a search query: drop extension, region/tags, etc.
function cleanName(file: string): string {
  let n = basename(file).replace(/\.[^.]+$/, '');
  n = n.replace(/[([][^)\]]*[)\]]/g, ' ');     // (USA), [!], etc.
  n = n.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return n;
}

// Pull the No-Intro / GoodTools markers out of a filename: (USA), (En,Fr,De),
// (Rev 1), [!], [T-Ger] … — they usually explain why a hash does not match.
function romTags(file: string): string[] {
  const n = basename(file).replace(/\.[^.]+$/, '');
  const out: string[] = [];
  const re = /[([]([^)\]]+)[)\]]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(n)) !== null) {
    const tag = m[1].trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export function VersionFinder({ filename, onOpenGame, onClose }: {
  filename: string; onOpenGame: (id: number) => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [q, setQ] = useState(cleanName(filename));
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [hashes, setHashes] = useState<any[] | null>(null);
  const [hashLoading, setHashLoading] = useState(false);
  const reqRef = useRef(0);
  const tags = romTags(filename);

  const run = (query: string) => {
    if (query.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    api.searchGames(query.trim(), 40).then(setResults).catch(() => setResults([])).finally(() => setLoading(false));
  };
  useEffect(() => {
    setSel(null); setHashes(null); setHashLoading(false); reqRef.current++;
    const t = setTimeout(() => run(q), 250);
    return () => clearTimeout(t); /* eslint-disable-next-line */
  }, [q]);

  // Expand a result: pull the game's supported file versions so the user can
  // compare their filename against the hashes RA actually knows.
  const pick = (id: number) => {
    if (sel === id) { setSel(null); setHashes(null); reqRef.current++; return; }
    const seq = ++reqRef.current;
    setSel(id); setHashes(null); setHashLoading(true);
    api.game(id)
      .then((g) => { if (reqRef.current === seq) setHashes(Array.isArray(g?.hashes) ? g.hashes : []); })
      .catch(() => { if (reqRef.current === seq) setHashes([]); })
      .finally(() => { if (reqRef.current === seq) setHashLoading(false); });
  };

  return (
    <div className="fixed inset-0 z-[55] grid place-items-center p-4" style={{ background: 'rgba(4,6,12,.8)', backdropFilter: 'blur(5px)' }} onClick={onClose}>
      <div className="panel panel-glow modal-pop w-full max-w-2xl max-h-[82vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-crt-line">
          <h3 className="font-display text-sm text-glow-magenta flex items-center gap-2"><Wand2 size={16} /> {t('vf.title')}</h3>
          <button className="btn !p-1.5" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="p-4 border-b border-crt-line">
          <div className="font-body text-ink-mid text-sm mb-2">{t('vf.yourFile')} <span className="font-mono text-ink-hi">{basename(filename)}</span></div>
          <div className="flex items-center gap-2 panel !rounded-lg px-3">
            <Search size={16} className="text-ink-dim" />
            <input className="input !border-0 !bg-transparent !px-0 focus:!shadow-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('vf.placeholder')} />
          </div>
          <div className="font-body text-ink-dim text-sm mt-2">
            {t('vf.body')}
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {loading && <div className="font-mono text-ink-dim p-4">{t('common.searching')}</div>}
          {!loading && results.length === 0 && <div className="font-mono text-ink-dim p-4">{t('vf.noMatch')}</div>}
          {results.map((g) => {
            const open = sel === g.id;
            return (
              <div key={g.id}>
                <button onClick={() => pick(g.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-[rgba(127,127,127,.1)] text-left"
                  style={open ? { border: '1px solid var(--color-neon-cyan)' } : undefined}>
                  {g.image_icon ? <img src={imageUrl(g.image_icon)} width={34} height={34} className="rounded shrink-0" style={{ border: '1px solid var(--color-crt-line)', objectFit: 'contain' }} alt="" /> : null}
                  <div className="min-w-0 flex-1">
                    <div className="font-body text-sm text-ink-hi truncate">{g.title}</div>
                    <div className="font-mono text-base text-ink-dim flex items-center gap-1.5"><ConsoleIcon id={g.console_id} size={13} /> {g.console_name} · {t('gm.achievementsN', { n: g.num_achievements })}</div>
                  </div>
                  {open ? <ChevronDown size={16} className="text-neon-cyan shrink-0" /> : <ChevronRight size={16} className="text-ink-dim shrink-0" />}
                </button>

                {open && (
                  <div className="panel !rounded-lg p-3 mt-1 mb-2 space-y-2">
                    <div className="font-body text-sm text-ink-mid">
                      {t('vf.yourName')}: <span className="font-mono text-ink-hi break-all">{basename(filename)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {tags.length > 0
                        ? <Pill color="var(--color-neon-purple)">{t('vf.regionHint', { r: tags.join(' · ') })}</Pill>
                        : <span className="font-mono text-sm text-ink-dim">{t('vf.noRegion')}</span>}
                    </div>

                    <div className="pt-1">
                      <SectionHeader accent="var(--color-neon-cyan)" title={t('vf.compare')}>
                        {hashes && <span className="font-mono text-sm text-ink-dim shrink-0">{t('vf.knownHashes', { n: hashes.length })}</span>}
                      </SectionHeader>
                      {hashLoading && <div className="font-mono text-ink-dim text-sm">{t('vf.loadingHashes')}</div>}
                      {!hashLoading && hashes && hashes.length === 0 && (
                        <div className="font-mono text-ink-dim text-sm">{t('common.nothing')}</div>
                      )}
                      {!hashLoading && hashes && hashes.length > 0 && (
                        <div className="space-y-1 max-h-56 overflow-auto pr-1">
                          {hashes.map((h: any) => (
                            <div key={h.MD5} className="panel !rounded-md p-2 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-body text-sm text-ink-hi break-words leading-snug">{h.Name}</div>
                                {Array.isArray(h.Labels) && h.Labels.length > 0 && (
                                  <div className="font-mono text-sm text-ink-dim">{h.Labels.join(' · ')}</div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {h.PatchUrl && (
                                  <a className="btn !py-1 !px-2 text-sm" href={h.PatchUrl} target="_blank" rel="noreferrer"
                                    title={t('gm.patchTip')}>
                                    <Wrench size={13} /> Patch <Download size={12} />
                                  </a>
                                )}
                                <span className="font-mono text-sm text-ink-dim">{h.MD5.slice(0, 12)}…</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="font-body text-ink-dim text-sm">{t('vf.compareHint')}</div>
                    <button className="btn btn-primary !py-1 !px-2.5 text-sm" onClick={() => { onOpenGame(g.id); onClose(); }}>
                      <ExternalLink size={14} /> {t('common.open')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
