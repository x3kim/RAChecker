import { useEffect, useState } from 'react';
import { Download, RefreshCw, RotateCw } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

type ElState = 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error';
type ElStatus = { state: ElState; version?: string; percent?: number; error?: string };

declare global {
  interface Window {
    raUpdate?: {
      isElectron: boolean;
      onStatus: (cb: (s: ElStatus) => void) => () => void;
      check: () => Promise<{ ok: boolean; error?: string }>;
      install: () => Promise<{ ok: boolean }>;
    };
  }
}

// Footer chip next to the version. In the Electron desktop app it drives the
// real auto-updater (download in background → "restart & install"). In the
// web/.bat build it just links to the GitHub release when a newer one exists.
export function UpdateChip() {
  const { t } = useI18n();
  const el = typeof window !== 'undefined' ? window.raUpdate : undefined;
  const [status, setStatus] = useState<ElStatus | null>(null);
  const [web, setWeb] = useState<{ newer: boolean; url?: string; latest?: string } | null>(null);

  useEffect(() => {
    if (el?.isElectron) {
      const off = el.onStatus(setStatus);
      el.check().catch(() => {});
      return off;
    }
    api.checkUpdate()
      .then((r) => { if (r.ok) setWeb({ newer: !!r.newer, url: r.url, latest: r.latest }); })
      .catch(() => {});
  }, [el]);

  // ---- Electron: full auto flow ----
  if (el?.isElectron && status) {
    if (status.state === 'downloading') {
      return (
        <span className="inline-flex items-center gap-1 text-neon-amber">
          <RefreshCw size={12} className="animate-spin" /> {t('update.downloading', { p: status.percent ?? 0 })}
        </span>
      );
    }
    if (status.state === 'downloaded') {
      return (
        <button onClick={() => el.install()} className="inline-flex items-center gap-1 text-neon-green hover:underline"
          title={status.version ? `v${status.version}` : ''}>
          <RotateCw size={12} /> {t('update.restart')}
        </button>
      );
    }
    if (status.state === 'available') {
      return (
        <span className="inline-flex items-center gap-1 text-neon-cyan">
          <Download size={12} /> {t('update.available')}
        </span>
      );
    }
    return null; // checking / none / error → stay silent
  }

  // ---- Web / .bat: link to the release ----
  if (web?.newer && web.url) {
    return (
      <a href={web.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
        title={web.latest ? `v${web.latest}` : ''}>
        <Download size={12} /> {t('update.available')}
      </a>
    );
  }
  return null;
}
