// RAChecker desktop shell. Boots the Fastify server in-process (Electron's
// Node has node:sqlite since v35) and opens the UI in a BrowserWindow.
import { app, BrowserWindow, dialog, shell, ipcMain } from 'electron';
import electronUpdater from 'electron-updater';
import { createServer } from 'node:net';
import { createWriteStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const GH_REPO = 'x3kim/RAChecker';

const { autoUpdater } = electronUpdater;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// One app instance is enough — a second launch focuses the existing window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  boot();
}

let win = null;

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('window-all-closed', () => app.quit());

/** Try the preferred port; if taken, let the OS pick a free one. */
function pickPort(preferred) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => {
      const any = createServer();
      any.listen(0, '127.0.0.1', () => {
        const { port } = any.address();
        any.close(() => resolve(port));
      });
    });
    probe.listen(preferred, '127.0.0.1', () => {
      probe.close(() => resolve(preferred));
    });
  });
}

/** Poll until the backend answers (it boots async on import). */
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server did not come up within ${timeoutMs / 1000}s (${url})`);
}

async function boot() {
  await app.whenReady();
  try {
    if (app.isPackaged) {
      // Installed apps must never write into their own (read-only) directory:
      // database/images/temp go to the per-user data dir, RAHasher downloads
      // to a writable bin dir (the bundled bin/ still works read-only).
      if (!process.env.RA_DATA_DIR) process.env.RA_DATA_DIR = join(app.getPath('userData'), 'data');
      if (!process.env.RA_BIN_DIR) process.env.RA_BIN_DIR = join(app.getPath('userData'), 'bin');
    }
    const port = await pickPort(Number(process.env.PORT) || 8088);
    process.env.PORT = String(port);
    if (!process.env.RA_HOST) process.env.RA_HOST = '127.0.0.1';

    // config.js reads env at import time, so import the server only now.
    await import(pathToFileURL(join(ROOT, 'server', 'src', 'index.js')).href);

    const url = `http://127.0.0.1:${port}`;
    await waitForServer(`${url}/api/status`);

    win = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 900,
      minHeight: 600,
      backgroundColor: '#070b10',
      autoHideMenuBar: true,
      title: 'RAChecker',
      icon: join(ROOT, 'build', 'icon.ico'),
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: join(__dirname, 'preload.cjs') },
    });
    // External links (RetroAchievements, GitHub …) open in the real browser.
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      shell.openExternal(target);
      return { action: 'deny' };
    });
    win.on('closed', () => { win = null; });
    await win.loadURL(url);
    // Installer builds self-update via electron-updater (NSIS). The portable exe
    // can't replace itself in place, so it gets a download-and-swap flow instead.
    if (app.isPackaged) { if (isPortable()) setupPortableUpdate(); else setupAutoUpdate(); }
  } catch (err) {
    dialog.showErrorBox('RAChecker konnte nicht starten', String(err?.stack || err));
    app.quit();
  }
}

// ---- auto-update (electron-updater, GitHub releases feed) -----------------
// Full-auto flow: on launch we check GitHub; if a newer release exists it is
// downloaded in the background, then the UI offers a one-click "restart &
// install". The publish feed + latest.yml come from electron-builder.yml.
function pushStatus(data) { try { win?.webContents.send('update:status', data); } catch { /* window gone */ } }

function setupAutoUpdate() {
  autoUpdater.autoDownload = true;             // download as soon as an update is found
  autoUpdater.autoInstallOnAppQuit = true;     // also install silently on a normal quit
  autoUpdater.on('checking-for-update', () => pushStatus({ state: 'checking' }));
  autoUpdater.on('update-available', (info) => pushStatus({ state: 'available', version: info?.version }));
  autoUpdater.on('update-not-available', (info) => pushStatus({ state: 'none', version: info?.version }));
  autoUpdater.on('error', (err) => pushStatus({ state: 'error', error: String(err?.message || err) }));
  autoUpdater.on('download-progress', (p) => pushStatus({ state: 'downloading', percent: Math.round(p?.percent || 0) }));
  autoUpdater.on('update-downloaded', (info) => pushStatus({ state: 'downloaded', version: info?.version }));
  autoUpdater.checkForUpdates().catch((e) => pushStatus({ state: 'error', error: String(e?.message || e) }));
}

// The renderer (via preload) can trigger a manual check and the install/restart.
ipcMain.handle('update:check', async () => {
  if (isPortable()) { try { await checkPortableUpdate(); return { ok: true }; } catch (e) { return { ok: false, error: String(e?.message || e) }; } }
  try { await autoUpdater.checkForUpdates(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('update:install', () => {
  // Defer so the IPC reply is sent before the app tears down to install.
  setImmediate(() => { try { autoUpdater.quitAndInstall(); } catch { /* ignore */ } });
  return { ok: true };
});

// ---- portable auto-update -------------------------------------------------
// A running .exe on Windows is locked and a portable build has no install dir,
// so electron-updater's silent replace is impossible. Instead: detect a newer
// GitHub release, download its -portable.exe next to the current one, then
// either reveal it or (best-effort) swap it in on quit via a tiny helper.
function isPortable() { return app.isPackaged && !!process.env.PORTABLE_EXECUTABLE_FILE; }

function semverGt(a, b) {
  const pa = String(a).replace(/^v/, '').split('-')[0].split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  // Equal core: a build without a prerelease tag beats one with (1.0.0 > 1.0.0-rc).
  const ta = String(a).includes('-'), tb = String(b).includes('-');
  return !ta && tb;
}

let portableUpdate = null; // { version, asset:{name,url,size} }

async function checkPortableUpdate() {
  pushStatus({ state: 'checking', portable: true });
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'RAChecker' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const j = await res.json();
  const latest = String(j.tag_name || j.name || '').replace(/^v/, '');
  const asset = (j.assets || []).find((a) => /-portable\.exe$/i.test(a.name));
  if (latest && asset && semverGt(latest, app.getVersion())) {
    portableUpdate = { version: latest, asset: { name: asset.name, url: asset.browser_download_url, size: asset.size } };
    pushStatus({ state: 'available', version: latest, portable: true });
  } else {
    portableUpdate = null;
    pushStatus({ state: 'none', version: latest, portable: true });
  }
}

function setupPortableUpdate() { checkPortableUpdate().catch((e) => pushStatus({ state: 'error', portable: true, error: String(e?.message || e) })); }

// Download the new portable exe next to the current one (avoiding the locked
// running file's own name). Returns the saved path.
async function downloadPortable() {
  if (!portableUpdate) throw new Error('no update');
  const dir = process.env.PORTABLE_EXECUTABLE_DIR || dirname(process.env.PORTABLE_EXECUTABLE_FILE);
  let target = join(dir, portableUpdate.asset.name);
  if (target === process.env.PORTABLE_EXECUTABLE_FILE) target = join(dir, `new-${portableUpdate.asset.name}`);
  const res = await fetch(portableUpdate.asset.url, { headers: { 'user-agent': 'RAChecker' } });
  if (!res.ok || !res.body) throw new Error(`download ${res.status}`);
  const total = Number(res.headers.get('content-length')) || portableUpdate.asset.size || 0;
  let received = 0;
  const ws = createWriteStream(target);
  const reader = Readable.fromWeb(res.body);
  reader.on('data', (c) => { received += c.length; pushStatus({ state: 'downloading', portable: true, percent: total ? Math.round((received / total) * 100) : 0 }); });
  await new Promise((resolve, reject) => { reader.pipe(ws); ws.on('finish', resolve); ws.on('error', reject); reader.on('error', reject); });
  return target;
}

let downloadedPortablePath = null;
ipcMain.handle('update:downloadPortable', async () => {
  try {
    downloadedPortablePath = await downloadPortable();
    pushStatus({ state: 'downloaded', portable: true, version: portableUpdate?.version });
    return { ok: true, path: downloadedPortablePath };
  } catch (e) { pushStatus({ state: 'error', portable: true, error: String(e?.message || e) }); return { ok: false, error: String(e?.message || e) }; }
});
ipcMain.handle('update:revealPortable', () => {
  if (downloadedPortablePath) shell.showItemInFolder(downloadedPortablePath);
  return { ok: true };
});
// Best-effort in-place swap: a detached helper waits for THIS process to exit
// (its file unlocks), overwrites the running exe with the download, relaunches
// it, and deletes itself. If anything fails the downloaded exe is still there.
ipcMain.handle('update:swapPortable', async () => {
  try {
    if (!downloadedPortablePath) return { ok: false, error: 'not downloaded' };
    const oldExe = process.env.PORTABLE_EXECUTABLE_FILE;
    const helper = join(app.getPath('temp'), `rachecker-update-${process.pid}.cmd`);
    const script = `@echo off\r\n`
      + `:wait\r\n`
      + `tasklist /FI "PID eq ${process.pid}" 2>nul | find "${process.pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)\r\n`
      + `move /Y "${downloadedPortablePath}" "${oldExe}" >nul\r\n`
      + `start "" "${oldExe}"\r\n`
      + `del "%~f0"\r\n`;
    await writeFile(helper, script, 'utf8');
    spawn('cmd.exe', ['/c', helper], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    setImmediate(() => app.quit());
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e?.message || e) }; }
});
