// Live view: streams an agent's Aside tab as JPEG frames to everyone watching that card, and passes
// a person's clicks and typing back into the tab while they have taken over.
import type { ServerWebSocket } from 'bun';
import sharp from 'sharp';
import type { LiveInput } from '../shared/types.ts';
import { AsideMcp } from './aside.ts';
import { getCard } from './store.ts';

export interface LiveData { kind: 'live'; login: string; cardId: string; fps: number; w: number }
type WS = ServerWebSocket<LiveData>;

const js = (v: unknown) => JSON.stringify(v);
const MAX_BUFFER = 1_500_000; // skip frames for slow viewers

class Stream {
  viewers = new Set<WS>();
  private mcp: AsideMcp | null = null;
  private attachedTab = '';
  private running = false;
  private vp = { width: 1440, height: 900 };
  private lastUrl = '';

  constructor(readonly cardId: string) {}

  add(ws: WS) { this.viewers.add(ws); this.loop(); }
  remove(ws: WS) {
    this.viewers.delete(ws);
    if (!this.viewers.size) setTimeout(() => { if (!this.viewers.size) this.close(); }, 15_000);
  }
  close() { this.mcp?.close(); this.mcp = null; this.attachedTab = ''; streams.delete(this.cardId); }

  private targetTab() { return getCard(this.cardId)?.agent?.tabId ?? ''; }

  private async ensureAttached(): Promise<boolean> {
    const tab = this.targetTab();
    if (!tab) return false;
    if (!this.mcp || this.mcp.dead) { this.mcp = new AsideMcp(`live:${this.cardId}`); this.attachedTab = ''; }
    if (this.attachedTab === tab) return true;
    const r = await this.mcp.repl(`globalThis.lt = await attachBrowserTab(${js(tab)});
      { const vp = lt.viewportSize ? lt.viewportSize() : null; console.log(JSON.stringify({ vp, url: lt.url() })); }`, 'Live view');
    if (r.error) return false;
    try {
      const j = JSON.parse(r.text.split('\n').find(l => l.trim().startsWith('{')) || '{}');
      if (j.vp?.width) this.vp = j.vp;
      this.lastUrl = j.url ?? '';
    } catch {}
    this.attachedTab = tab;
    this.sendMeta();
    return true;
  }

  private sendMeta() {
    const a = getCard(this.cardId)?.agent;
    const meta = js({ type: 'meta', url: this.lastUrl, width: this.vp.width, height: this.vp.height, driver: a?.driver ?? 'agent', driverLogin: a?.driverLogin });
    for (const v of this.viewers) v.send(meta);
  }

  private watching() { return [...this.viewers].filter(v => v.data.fps > 0); }
  private fps() { return Math.min(20, Math.max(0.5, ...this.watching().map(v => v.data.fps))); }

  private async loop() {
    if (this.running) return;
    this.running = true;
    let fails = 0, n = 0;
    try {
      while (this.viewers.size) {
        const t0 = Date.now();
        if (!this.watching().length) { await Bun.sleep(500); continue; } // every viewer's tab is hidden
        if (!(await this.ensureAttached())) { await Bun.sleep(2000); continue; }
        const fps = this.fps();
        const q = fps >= 8 ? 60 : fps >= 3 ? 50 : 40;
        const r = await this.mcp!.repl(`await display(await lt.screenshot({ type: 'jpeg', quality: ${q} }));${n++ % 10 === 0 ? ' console.log(lt.url());' : ''}`, 'Live view', 20_000);
        const frame = r.images[0];
        if (!frame) {
          if (++fails > 3) { this.attachedTab = ''; fails = 0; }
          await Bun.sleep(1000);
          continue;
        }
        fails = 0;
        const url = r.text.split('\n').map(s => s.trim()).find(s => /^https?:|^about:/.test(s));
        if (url && url !== this.lastUrl) { this.lastUrl = url; this.sendMeta(); }
        await this.broadcast(frame);
        const wait = 1000 / fps - (Date.now() - t0);
        if (wait > 0) await Bun.sleep(wait);
      }
    } finally {
      this.running = false;
    }
  }

  private async broadcast(frame: Buffer) {
    const sized = new Map<number, Buffer>();
    for (const v of this.viewers) {
      if (v.data.fps <= 0 || v.getBufferedAmount() > MAX_BUFFER) continue;
      const w = v.data.w && v.data.w < this.vp.width ? Math.round(v.data.w / 80) * 80 || 80 : 0;
      let out = sized.get(w);
      if (!out) {
        out = w ? await sharp(frame).resize({ width: w }).jpeg({ quality: 55 }).toBuffer() : frame;
        sized.set(w, out);
      }
      v.send(out);
    }
  }

  async input(ws: WS, msg: LiveInput) {
    if (msg.type === 'fps') { ws.data.fps = msg.fps <= 0 ? 0 : Math.max(0.5, Math.min(20, msg.fps)); return; }
    const a = getCard(this.cardId)?.agent;
    if (!a || a.driver !== 'human' || a.driverLogin !== ws.data.login) return; // only the person who took over drives
    if (!(await this.ensureAttached())) return;
    const X = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * this.vp.width);
    const Y = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * this.vp.height);
    let code = '';
    switch (msg.type) {
      case 'click': code = `await lt.mouse.click(${X(msg.x)}, ${Y(msg.y)});`; break;
      case 'move': code = `await lt.mouse.move(${X(msg.x)}, ${Y(msg.y)});`; break;
      case 'scroll': code = `await lt.mouse.move(${X(msg.x)}, ${Y(msg.y)}); await lt.mouse.wheel(0, ${Math.round(msg.dy)});`; break;
      case 'text': code = `await lt.keyboard.type(${js(msg.text.slice(0, 2000))});`; break;
      case 'key': if (/^[A-Za-z0-9+]{1,20}$/.test(msg.key)) code = `await lt.keyboard.press(${js(msg.key)});`; break;
    }
    if (code) await this.mcp!.repl(code, 'Teammate input', 20_000);
  }
}

const streams = new Map<string, Stream>();
const streamFor = (cardId: string) => {
  let s = streams.get(cardId);
  if (!s) { s = new Stream(cardId); streams.set(cardId, s); }
  return s;
};

export const live = {
  open(ws: WS) { streamFor(ws.data.cardId).add(ws); },
  close(ws: WS) { streams.get(ws.data.cardId)?.remove(ws); },
  async message(ws: WS, raw: string | Buffer) {
    let msg: LiveInput; try { msg = JSON.parse(String(raw)); } catch { return; }
    await streams.get(ws.data.cardId)?.input(ws, msg).catch(() => {});
  },
  /** Card deleted or agent gone: drop its stream. */
  drop(cardId: string) { streams.get(cardId)?.close(); },
};
