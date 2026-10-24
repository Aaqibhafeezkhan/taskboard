// Finds a Chromium for the dev tools: $CHROME, else the newest Playwright download, else a system Chrome.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  const inside = [
    'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell',
    'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell',
  ];
  for (const dir of caches.filter(existsSync)) {
    for (const d of readdirSync(dir).filter(d => d.startsWith('chromium_headless_shell')).sort().reverse()) {
      for (const f of inside) if (existsSync(join(dir, d, f))) return join(dir, d, f);
    }
  }
  for (const f of ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'])
    if (existsSync(f)) return f;
  throw new Error('No Chromium found. Run `npx playwright install chromium-headless-shell` or set CHROME=/path/to/chrome');
}
