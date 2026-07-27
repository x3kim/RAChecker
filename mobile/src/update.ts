// Opt-in in-app updater. Checks GitHub releases for a newer Android build,
// downloads its APK and hands it to the system package installer (Android always
// shows its own install screen for sideloaded APKs — there is no silent install,
// so the user is always in control and can cancel). No extra native module: uses
// expo-file-system (download) + expo-sharing (hand-off), both already deps.
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { APP_VERSION, RELEASES_API } from './version';

export type UpdateInfo = { version: string; apkUrl: string; notesUrl: string; body: string; size: number };

const K_AUTO = 'ra_update_auto';       // '0' disables the launch check (default on)
const K_SKIP = 'ra_update_skip';       // a version the user chose to skip

export async function autoCheckEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(K_AUTO)) !== '0';
}
export async function setAutoCheck(on: boolean): Promise<void> {
  await AsyncStorage.setItem(K_AUTO, on ? '1' : '0');
}
export async function skipVersion(v: string): Promise<void> { await AsyncStorage.setItem(K_SKIP, v); }
async function skippedVersion(): Promise<string | null> { return AsyncStorage.getItem(K_SKIP); }

// Numeric major.minor.patch compare — true when a > b.
export function semverGt(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0, y = pb[i] ?? 0;
    if (x !== y) return x > y;
  }
  return false;
}

// Query GitHub releases, return the newest published `android-v*` release that
// ships an .apk and is newer than the installed version (else null).
export async function checkUpdate(): Promise<UpdateInfo | null> {
  const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const releases = await res.json();
  if (!Array.isArray(releases)) return null;
  let best: UpdateInfo | null = null;
  for (const r of releases) {
    if (r.draft || r.prerelease) continue;
    const m = String(r.tag_name || '').match(/^android-v?(\d+\.\d+\.\d+)/i);
    if (!m) continue;
    const apk = (r.assets || []).find((a: any) => String(a.name || '').toLowerCase().endsWith('.apk'));
    if (!apk) continue;
    const version = m[1];
    if (!best || semverGt(version, best.version)) {
      best = { version, apkUrl: apk.browser_download_url, notesUrl: r.html_url, body: r.body || '', size: apk.size || 0 };
    }
  }
  if (best && semverGt(best.version, APP_VERSION)) return best;
  return null;
}

// Like checkUpdate but returns null if the user disabled auto-check or already
// skipped this exact version — used for the silent launch check.
export async function checkUpdateForLaunch(): Promise<UpdateInfo | null> {
  if (!(await autoCheckEnabled())) return null;
  const info = await checkUpdate().catch(() => null);
  if (!info) return null;
  if ((await skippedVersion()) === info.version) return null;
  return info;
}

// Download the APK (reporting 0..1 progress) then hand it to the OS installer.
export async function downloadAndInstall(info: UpdateInfo, onProgress: (p: number) => void): Promise<void> {
  const dest = `${FileSystem.cacheDirectory}RAChecker-${info.version}.apk`;
  const dl = FileSystem.createDownloadResumable(info.apkUrl, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('download failed');
  if (!(await Sharing.isAvailableAsync())) {
    // No share target — fall back to the release page for a manual install.
    await Linking.openURL(info.notesUrl);
    return;
  }
  await Sharing.shareAsync(result.uri, {
    mimeType: 'application/vnd.android.package-archive',
    dialogTitle: 'Install RAChecker update',
  });
}
