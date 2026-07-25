// RAChecker desktop shell. Boots the Fastify server in-process (Electron's
// Node has node:sqlite since v35) and opens the UI in a BrowserWindow.
import { app, BrowserWindow, dialog, shell } from 'electron';
import { createServer } from 'node:net';
import { join, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

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
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    // External links (RetroAchievements, GitHub …) open in the real browser.
    win.webContents.setWindowOpenHandler(({ url: target }) => {
      shell.openExternal(target);
      return { action: 'deny' };
    });
    win.on('closed', () => { win = null; });
    await win.loadURL(url);
  } catch (err) {
    dialog.showErrorBox('RAChecker konnte nicht starten', String(err?.stack || err));
    app.quit();
  }
}
