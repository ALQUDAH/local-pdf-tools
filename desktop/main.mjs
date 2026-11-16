// Local PDF Tools desktop app.
// Runs the bundled web app and its local server on 127.0.0.1 inside an Electron window,
// so all 40 tools (including Office conversions) work offline. Nothing is uploaded.
import { app, BrowserWindow, dialog, session, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// A fixed port keeps the same origin between launches, so settings (theme, language,
// pinned tools) persist. Falls back to a random free port if it's taken.
const PREFERRED_PORT = 47321;

process.env.LPT_EMBEDDED = '1';
process.env.NODE_ENV = 'production';
// Desktop settings (e.g. the optional Gemini API key for Translate PDF) live in the user's app data
process.env.LPT_SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

let origin = '';
let mainWindow = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

async function startLocalServer() {
  const { startServer } = await import('./server.mjs');
  const options = { host: '127.0.0.1', distPath: path.join(here, 'web') };
  try {
    return await startServer({ ...options, port: PREFERRED_PORT });
  } catch (err) {
    if (err?.code !== 'EADDRINUSE') throw err;
    return startServer({ ...options, port: 0 });
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'Local PDF Tools',
    backgroundColor: '#0f172a',
    icon: path.join(here, 'icon.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Keep the window on the local app; open any other link in the default browser.
  const isLocal = (url) => url.startsWith(origin + '/') || url === origin;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isLocal(url) && /^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocal(url)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });

  mainWindow.loadURL(origin);
}

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  // Only the camera (document scanner) and clipboard are ever needed.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'clipboard-sanitized-write'].includes(permission));
  });

  try {
    const { port } = await startLocalServer();
    origin = `http://127.0.0.1:${port}`;
  } catch (err) {
    dialog.showErrorBox('Local PDF Tools', `The app could not start.\n\n${err?.message || err}`);
    app.quit();
    return;
  }

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
