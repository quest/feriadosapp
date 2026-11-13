// Renders the PNG icons and the social image from the SVG sources with headless Chrome.
// Usage: npm run icons   (CHROME_PATH=/path/to/chrome to override the browser)

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(ROOT, 'icons');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const work = mkdtempSync(path.join(tmpdir(), 'feriados-icons-'));

function screenshot(html, out, width, height, transparent = true) {
  const page = path.join(work, `${path.basename(out)}.html`);
  writeFileSync(page, html);
  execFileSync(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${out}`,
    pathToFileURL(page).href,
  ], { stdio: 'ignore' });
  console.log('✓', path.relative(ROOT, out));
}

function icon(svgFile, out, size) {
  const src = pathToFileURL(path.join(ICONS, svgFile)).href;
  screenshot(
    `<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${size}px;height:${size}px}</style><img src="${src}">`,
    path.join(ICONS, out), size, size,
  );
}

icon('icon.svg', 'icon-192.png', 192);
icon('icon.svg', 'icon-512.png', 512);
icon('icon-maskable.svg', 'icon-maskable-512.png', 512);
icon('icon-maskable.svg', 'apple-touch-icon.png', 180);

// Social preview (Open Graph): 1200×630.
const iconSrc = pathToFileURL(path.join(ICONS, 'icon.svg')).href;
screenshot(`<!doctype html><meta charset="utf-8">
<style>
  html,body{margin:0}
  body{width:1200px;height:630px;box-sizing:border-box;display:flex;align-items:center;gap:72px;padding:0 96px;
    background:#fff;color:#17171a;font-family:-apple-system,"SF Pro Display",system-ui,sans-serif;overflow:hidden}
  .text{flex:1}
  .brand{font-size:26px;font-weight:600;color:#5c5c64}
  h1{font-size:76px;line-height:1.02;letter-spacing:-.04em;margin:18px 0 0;font-weight:750}
  h1 span{color:#d93025}
  .url{font-size:26px;margin-top:32px;color:#5c5c64}
  img{width:300px;height:300px;flex:none;filter:drop-shadow(0 24px 48px rgba(217,48,37,.25))}
</style>
<div class="text"><div class="brand">Feriados Chile</div><h1>¿Cuánto falta para el próximo <span>feriado</span>?</h1><div class="url">www.feriadosapp.com</div></div>
<img src="${iconSrc}" alt="">`,
path.join(ICONS, 'og.png'), 1200, 630, false);

rmSync(work, { recursive: true, force: true });
