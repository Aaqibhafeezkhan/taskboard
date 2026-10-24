// Dev-only: records a scripted tour of the demo app as a real-time video (for the README).
// node tools/record.mjs <url> <tour.js> <out-basename> [width] [height]
// Writes <out>.mp4 and <out>.gif. The tour script runs in the page and sets window.__tour = 'done' when it is finished.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findChrome } from './chrome.mjs';

const [url, tourFile, out, W = '1440', H = '900'] = process.argv.slice(2);
if (!url || !tourFile || !out) { console.error('usage: node tools/record.mjs <url> <tour.js> <out-basename> [width] [height]'); process.exit(2); }
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'tbrec-'));
const frames = mkdtempSync(join(tmpdir(), 'tbframes-'));
const chrome = spawn(findChrome(), ['--headless', '--hide-scrollbars', '--force-color-profile=srgb', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let target;
for (let i = 0; i < 80 && !target; i++) { await sleep(100); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const shots = [];
const send = (method, params = {}) => new Promise((r) => { const k = ++id; pending.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
  if (d.method === 'Page.screencastFrame') {
    const { data, metadata, sessionId } = d.params;
    shots.push({ data, t: metadata.timestamp });
    send('Page.screencastFrameAck', { sessionId });
  }
};
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(1500);
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: +W, maxHeight: +H, everyNthFrame: 1 });
await sleep(300);
await send('Runtime.evaluate', { expression: readFileSync(tourFile, 'utf8') });
for (let i = 0; i < 240; i++) {
  await sleep(500);
  const r = await send('Runtime.evaluate', { expression: 'window.__tour', returnByValue: true });
  if (r.result?.result?.value === 'done') break;
}
// keep sending frames on a static screen so the last moment is held
const end = Date.now() / 1000;
await send('Page.stopScreencast');
ws.close(); chrome.kill('SIGKILL');

// Screencast frames arrive only when the screen changes: give each frame the time until the next one.
let list = '';
shots.forEach((s, i) => {
  const f = join(frames, `${String(i).padStart(5, '0')}.jpg`);
  writeFileSync(f, Buffer.from(s.data, 'base64'));
  const next = i + 1 < shots.length ? shots[i + 1].t : Math.max(s.t + 0.04, end);
  list += `file '${f}'\nduration ${Math.max(0.001, next - s.t).toFixed(4)}\n`;
});
list += `file '${join(frames, `${String(shots.length - 1).padStart(5, '0')}.jpg`)}'\n`;
writeFileSync(join(frames, 'list.txt'), list);
const ff = (args) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); if (r.status) process.exit(r.status); };
ff(['-f', 'concat', '-safe', '0', '-i', join(frames, 'list.txt'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-movflags', '+faststart', `${out}.mp4`]);
ff(['-i', `${out}.mp4`, '-vf', 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle', `${out}.gif`]);
rmSync(prof, { recursive: true, force: true }); rmSync(frames, { recursive: true, force: true });
console.log(`${shots.length} frames -> ${out}.mp4, ${out}.gif`);
process.exit(0);
