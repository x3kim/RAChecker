// "Which version do I actually want to play?" — an ordered list of regions and
// languages. Everything that ranks ROM versions (collection sort, the ★ keeper
// in the duplicate cleanup, the version list in a game's detail window) reads
// this one list.
//
// Nothing is ever hidden because of it: an empty list simply means "no
// preference", and every view keeps its previous ordering.
import { useEffect, useRef, useState } from 'react';
import { Globe2, Plus, X, ArrowUp, ArrowDown, Save, RotateCcw, ShieldCheck, Play, Square } from 'lucide-react';
import { api, openStream } from '../lib/api';
import type { HashNameStatus } from '../lib/api';
import { Pct } from './Progress';
import { useI18n } from '../lib/i18n';
import {
  REGION_ORDER, REGION_NAMES, LANGUAGE_NAMES, langToken, isLangToken,
  tokenLabel, tokenName, announceRegionPriority,
} from '../lib/region';

// Offered in the "add" pickers. Regions come from the shared vocabulary; the
// language list is trimmed to the ones No-Intro sets actually use a lot.
const LANG_CHOICES = ['ja', 'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'sv', 'ru', 'zh', 'ko', 'pl'];

const PRESETS: { key: string; list: string[] }[] = [
  { key: 'set.regionPresetJp', list: ['JP', langToken('ja')] },
  { key: 'set.regionPresetEn', list: [langToken('en'), 'US', 'EU', 'WORLD'] },
  { key: 'set.regionPresetDe', list: [langToken('de'), 'DE', 'EU'] },
];

export function RegionPriority() {
  const { t } = useI18n();
  const [list, setList] = useState<string[]>([]);
  const [initial, setInitial] = useState<string[]>([]);
  const [adding, setAdding] = useState<'region' | 'lang' | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = list.join('|') !== initial.join('|');

  useEffect(() => {
    api.settings()
      .then((s) => { const p = Array.isArray(s.regionPriority) ? s.regionPriority : []; setList(p); setInitial(p); })
      .catch(() => {});
  }, []);

  const move = (i: number, d: -1 | 1) => setList((l) => {
    const j = i + d;
    if (j < 0 || j >= l.length) return l;
    const n = [...l];
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const remove = (tok: string) => setList((l) => l.filter((x) => x !== tok));
  const add = (tok: string) => { setList((l) => (l.includes(tok) ? l : [...l, tok])); setAdding(null); };

  const save = async () => {
    await api.saveServerSettings({ regionPriority: list });
    setInitial(list);
    announceRegionPriority(list); // open views re-sort without a reload
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <section className="panel p-5">
      <h2 className="font-display text-sm text-glow-cyan flex items-center gap-2"><Globe2 size={16} /> {t('set.region')}</h2>
      <p className="font-body text-ink-mid mt-2 text-sm leading-relaxed">{t('set.regionDesc')}</p>

      {/* the ordered list itself */}
      <div className="mt-3 space-y-1.5">
        {list.length === 0 && (
          <div className="font-mono text-base text-ink-dim panel !rounded-lg p-3">{t('set.regionEmpty')}</div>
        )}
        {list.map((tok, i) => (
          <div key={tok} className="panel !rounded-lg p-2 flex items-center gap-2">
            <span className="font-display text-sm w-8 shrink-0 text-center" style={{ color: 'var(--color-neon-cyan)' }}>{i + 1}</span>
            <span className="font-mono text-base px-2 rounded shrink-0"
              style={{ border: `1px solid ${isLangToken(tok) ? 'var(--color-ink-dim)' : 'var(--color-neon-cyan)'}`, color: isLangToken(tok) ? 'var(--color-ink-mid)' : 'var(--color-neon-cyan)' }}>
              {tokenLabel(tok)}
            </span>
            <span className="font-body text-sm text-ink-hi flex-1 truncate">{tokenName(tok)}</span>
            <span className="font-mono text-sm text-ink-dim shrink-0">{isLangToken(tok) ? t('set.regionKindLang') : t('set.regionKindRegion')}</span>
            <button className="btn !p-1.5" disabled={i === 0} onClick={() => move(i, -1)} title={t('set.regionUp')}><ArrowUp size={14} /></button>
            <button className="btn !p-1.5" disabled={i === list.length - 1} onClick={() => move(i, 1)} title={t('set.regionDown')}><ArrowDown size={14} /></button>
            <button className="btn !p-1.5" onClick={() => remove(tok)} title={t('set.regionRemove')}><X size={14} /></button>
          </div>
        ))}
      </div>

      {/* add + presets */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setAdding(adding === 'region' ? null : 'region')}
          style={adding === 'region' ? { borderColor: 'var(--color-neon-cyan)' } : {}}>
          <Plus size={14} /> {t('set.regionAddRegion')}
        </button>
        <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setAdding(adding === 'lang' ? null : 'lang')}
          style={adding === 'lang' ? { borderColor: 'var(--color-neon-cyan)' } : {}}>
          <Plus size={14} /> {t('set.regionAddLang')}
        </button>
        <span className="font-mono text-sm text-ink-dim">{t('set.regionPresets')}</span>
        {PRESETS.map((p) => (
          <button key={p.key} className="btn !py-1.5 !px-3 text-sm" onClick={() => setList(p.list)}>{t(p.key)}</button>
        ))}
        {list.length > 0 && (
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => setList([])} title={t('set.regionClearTip')}>
            <RotateCcw size={14} /> {t('set.regionClear')}
          </button>
        )}
      </div>

      {adding && (
        <div className="panel !rounded-lg p-3 mt-2 flex flex-wrap gap-1.5 max-h-52 overflow-auto">
          {(adding === 'region' ? REGION_ORDER : LANG_CHOICES).map((code) => {
            const tok = adding === 'region' ? code : langToken(code);
            const disabled = list.includes(tok);
            const name = adding === 'region' ? (REGION_NAMES[code] ?? code) : (LANGUAGE_NAMES[code] ?? code);
            return (
              <button key={tok} className="btn !py-1 !px-2 text-sm" disabled={disabled} onClick={() => add(tok)}
                title={name} style={disabled ? { opacity: 0.35 } : {}}>
                {code}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button className="btn btn-primary" onClick={save} disabled={!dirty}><Save size={16} /> {saved ? t('set.saved') : t('set.save')}</button>
        <span className="font-body text-ink-dim text-sm">{t('set.regionNote')}</span>
      </div>

      <HashNamePanel />
    </section>
  );
}

// Where the region actually comes from, and the job that makes it trustworthy.
// A matched file IS the dump RetroAchievements names for that hash, so its ROM
// name beats any filename. There is no bulk endpoint for those names, hence a
// job: automatic for the games you own, on demand for the whole database.
function HashNamePanel() {
  const { t } = useI18n();
  const [status, setStatus] = useState<HashNameStatus | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const esRef = useRef<EventSource | null>(null);

  const load = () => api.hashNameStatus().then(setStatus).catch(() => {});
  useEffect(() => {
    load();
    return () => esRef.current?.close();
  }, []);

  const start = (scope: 'collection' | 'all') => {
    if (esRef.current) return;
    setError(''); setProgress({ done: 0, total: 0 });
    const es = openStream(`/api/hashnames/stream?scope=${scope}`, {
      progress: (p: any) => setProgress({ done: p.done ?? 0, total: p.total ?? 0 }),
      done: () => { esRef.current?.close(); esRef.current = null; setProgress(null); load(); },
      error: (e: any) => { setError(e?.message || t('common.error')); esRef.current?.close(); esRef.current = null; setProgress(null); },
      __error: () => { esRef.current = null; setProgress(null); load(); },
    });
    esRef.current = es;
  };
  const stop = () => { api.hashNamesCancel().catch(() => {}); };

  if (!status) return null;
  const running = progress || (status.running ? { done: status.running.done, total: status.running.total } : null);
  const pct = running && running.total > 0 ? Math.round((running.done / running.total) * 100) : 0;
  const ownedPct = status.owned > 0 ? Math.round((status.ownedFetched / status.owned) * 100) : 100;
  const allPct = status.games > 0 ? Math.round((status.fetched / status.games) * 100) : 0;

  return (
    <div className="mt-5 pt-4 border-t border-crt-line">
      <div className="font-body text-sm text-ink-hi flex items-center gap-2">
        <ShieldCheck size={15} className="text-neon-green" /> {t('set.hn.title')}
      </div>
      <p className="font-body text-ink-mid text-sm mt-1 leading-relaxed">{t('set.hn.desc')}</p>

      <div className="grid sm:grid-cols-2 gap-3 mt-3">
        <div className="panel !rounded-lg p-3">
          <div className="font-mono text-base text-ink-mid">{t('set.hn.owned', { done: status.ownedFetched, n: status.owned })}</div>
          <Pct value={ownedPct} heightClass="h-2" color="var(--color-neon-green)" />
        </div>
        <div className="panel !rounded-lg p-3">
          <div className="font-mono text-base text-ink-mid">{t('set.hn.all', { done: status.fetched, n: status.games })}</div>
          <Pct value={allPct} heightClass="h-2" color="var(--color-neon-cyan)" />
        </div>
      </div>

      {running ? (
        <div className="mt-3">
          <div className="font-mono text-base text-neon-cyan">{t('set.hn.running', { done: running.done, n: running.total, pct })}</div>
          <Pct value={pct} heightClass="h-2" color="var(--color-neon-cyan)" />
          <button className="btn btn-danger !py-1.5 !px-3 text-sm mt-2" onClick={stop}><Square size={14} /> {t('set.hn.stop')}</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => start('collection')} disabled={status.ownedFetched >= status.owned}>
            <Play size={14} /> {t('set.hn.runOwned')}
          </button>
          <button className="btn !py-1.5 !px-3 text-sm" onClick={() => start('all')} disabled={status.fetched >= status.games}>
            <Play size={14} /> {t('set.hn.runAll', { min: Math.max(1, Math.round(((status.games - status.fetched) * status.intervalMs) / 60000)) })}
          </button>
          {error && <span className="font-mono text-sm text-neon-red">{error}</span>}
        </div>
      )}

      <p className="font-body text-ink-dim text-sm mt-2 leading-relaxed">{t('set.hn.note')}</p>
    </div>
  );
}
