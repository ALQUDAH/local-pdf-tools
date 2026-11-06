// Prepares desktop/ for Electron: web app, bundled server, icon and production deps.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const desktop = path.join(root, 'desktop');
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: root, ...opts });

// 1. Web app (no service worker: the desktop app is offline already)
fs.rmSync(path.join(desktop, 'web'), { recursive: true, force: true });
run('npx vite build --outDir desktop/web --emptyOutDir', { env: { ...process.env, DISABLE_PWA: 'true', BASE_PATH: '/' } });

// 2. Server bundled into one file; pdf-parse stays a real dependency (it loads native helpers)
run(
  'npx esbuild server.ts --bundle --platform=node --format=esm --target=node22 ' +
    '--define:process.env.NODE_ENV=\\"production\\" --external:vite --external:pdf-parse ' +
    '"--banner:js=import { createRequire as __cr } from \'module\'; const require = __cr(import.meta.url);" ' +
    '--outfile=desktop/server.mjs --log-level=warning'
);

// 3. Icon and version
fs.copyFileSync(path.join(root, 'public/pwa-512.png'), path.join(desktop, 'icon.png')); // window icon
fs.mkdirSync(path.join(desktop, 'build'), { recursive: true });
fs.copyFileSync(path.join(root, 'public/pwa-512.png'), path.join(desktop, 'build/icon.png')); // installer icons
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const desktopPkgPath = path.join(desktop, 'package.json');
const desktopPkg = JSON.parse(fs.readFileSync(desktopPkgPath, 'utf8'));
desktopPkg.version = rootPkg.version;
desktopPkg.dependencies['pdf-parse'] = rootPkg.dependencies['pdf-parse'];
fs.writeFileSync(desktopPkgPath, JSON.stringify(desktopPkg, null, 2) + '\n');

// 4. Production dependencies of the desktop app
run('npm install --omit=dev --no-audit --no-fund', { cwd: desktop });

console.log('\nDesktop app prepared in desktop/. Run "npm run desktop" or "npm run desktop:dist".');
