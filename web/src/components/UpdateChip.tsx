import { useEffect, useState } from 'react';
import { Download, RefreshCw, RotateCw, FolderOpen } from 'lucide-react';
import { api } from '../lib/api';
import { useI18n } from '../lib/i18n';

type ElState = 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error';
type ElStatus = { state: ElState; version?: string; percent?: number; error?: string; portable?: boolean };

declare global {
  interface Window {
    raUpdate?: {
      isElectron: boolean;
      onStatus: (cb: (s: ElStatus) => void) => () => void;
      check: () => Promise<{ ok: boolean; error?: string }>;
      install: () => Promise<{ ok: boolean }>;
      downloadPortable?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      revealPortable?: () => Promise<{ ok: boolean }>;
      swapPortable?: () => Promise<{ ok: boolean; error?: string }>;
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

  // ---- Electron: full auto flow (installer) + download-and-swap (portable) ----
  if (el?.isElectron && status) {
    if (status.state === 'downloading') {
      return (
        <span className="inline-flex items-center gap-1 text-neon-amber">
          <RefreshCw size={12} className="animate-spin" /> {t('update.downloading', { p: status.percent ?? 0 })}
        </span>
      );
    }
    if (status.state === 'downloaded') {
      // Portable: swap in on quit, or just reveal the downloaded exe.
      if (status.portable) {
        return (
          <span className="inline-flex items-center gap-2">
            <button onClick={() => el.swapPortable?.()} className="inline-flex items-center gap-1 text-neon-green hover:underline"
              title={status.version ? `v${status.version}` : ''}>
              <RotateCw size={12} /> {t('update.restartReplace')}
            </button>
            <button onClick={() => el.revealPortable?.()} className="inline-flex items-center gap-1 text-ink-dim hover:underline">
              <FolderOpen size={12} /> {t('update.reveal')}
            </button>
          </span>
        );
      }
      return (
        <button onClick={() => el.install()} className="inline-flex items-center gap-1 text-neon-green hover:underline"
          title={status.version ? `v${status.version}` : ''}>
          <RotateCw size={12} /> {t('update.restart')}
        </button>
      );
    }
    if (status.state === 'available') {
      // Portable can't self-install → offer a one-click download of the new exe.
      if (status.portable) {
        return (
          <button onClick={() => el.downloadPortable?.()} className="inline-flex items-center gap-1 text-neon-cyan hover:underline"
            title={status.version ? `v${status.version}` : ''}>
            <Download size={12} /> {t('update.download')}
          </button>
        );
      }
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
