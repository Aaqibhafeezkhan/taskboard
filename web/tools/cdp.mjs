// Dev-only: drive headless Chromium over CDP for real-time screenshots and interaction checks.
// node tools/cdp.mjs <url> <out.png> [width] [height] [scale] [steps-json]
// steps: [{"clickText":"Start"} | {"hold":[x,y,ms]} | {"wait":ms} | {"eval":"js"} | {"click":"css"} | {"type":"text"} | {"key":"Enter"} | {"shot":"file.png", "clip":[x,y,w,h]}]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { findChrome } from './chrome.mjs';
const B = findChrome();
const [url, out, W = '1440', H = '900', S = '1', stepsJson = '[]'] = process.argv.slice(2);
const port = 9400 + Math.floor(Math.random() * 400);
const prof = mkdtempSync(join(tmpdir(), 'tbcdp-'));
const chrome = spawn(B, ['--headless', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0; const pending = new Map(); const errors = [];
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(100); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails?.exception?.description || d.params.exceptionDetails?.text); if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map((a) => a.value ?? a.description).join(' ')); };
  const send = (method, params = {}) => new Promise((r) => { const k = ++id; pending.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: +S, mobile: +W < 600 });
  if (process.env.CDP_HEADERS) { await send('Network.enable'); await send('Network.setExtraHTTPHeaders', { headers: JSON.parse(process.env.CDP_HEADERS) }); }
  await send('Page.navigate', { url });
  await sleep(1800);
  const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (file, clip) => {
    const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3], scale: 1 } } : {}) });
    writeFileSync(file, Buffer.from(r.result.data, 'base64'));
  };
  for (const s of JSON.parse(stepsJson)) {
    if (s.wait) await sleep(s.wait);
    if (s.eval) console.log('eval:', JSON.stringify(await evalJs(s.eval)));
    if (s.click) {
      const p = await evalJs(`(()=>{const e=document.querySelector(${JSON.stringify(s.click)}); if(!e) return null; const r=e.getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]})()`);
      if (!p) { console.log('no element', s.click); continue; }
      for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: p[0], y: p[1], button: 'left', clickCount: 1 });
    }
    if (s.clickText) console.log('clickText:', await evalJs(`(()=>{const t=${JSON.stringify(s.clickText)}; const b=[...document.querySelectorAll('button,a')].find(b=>b.innerText.trim().includes(t)); if(!b) return 'missing '+t; b.click(); return 'ok'})()`));
    if (s.hold) {
      const [hx, hy, ms] = s.hold;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hx, y: hy, button: 'left', clickCount: 1 });
      await sleep(ms);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hx, y: hy, button: 'left', clickCount: 1 });
    }
    if (s.at) for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: s.at[0], y: s.at[1], button: 'left', clickCount: 1 });
    if (s.drag) {
      const [x1, y1, x2, y2] = s.drag;
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1 + ((x2 - x1) * i) / 12, y: y1 + ((y2 - y1) * i) / 12, button: 'left', buttons: 1 }); await sleep(25); }
      if (s.shotMid) await shot(s.shotMid);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1 });
    }
    if (s.type) await send('Input.insertText', { text: s.type });
    if (s.key) { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: s.key, code: s.code || s.key, windowsVirtualKeyCode: s.vk || 0, modifiers: s.mod || 0 }); }
    if (s.shot) await shot(s.shot, s.clip);
  }
  if (out && out !== '-') await shot(out);
  if (errors.length) console.log('page errors:', errors.slice(0, 8));
} finally {
  try { ws?.close(); } catch {}
  chrome.kill('SIGKILL');
  await sleep(200);
  rmSync(prof, { recursive: true, force: true });
}
process.exit(0);
