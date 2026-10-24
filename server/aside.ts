// Talking to Aside: the CLI for agent sessions, and `aside mcp` (Playwright-style REPL) for tabs, transcripts and live frames.
import { config } from './config.ts';

export const asideArgv = (args: string[]) => [...config.asideWrap, config.asideBin, ...args];
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

/** Run one short Aside CLI command and return its output. */
export async function asideCli(args: string[], timeoutMs = 60_000): Promise<{ code: number; out: string }> {
  const p = Bun.spawn(asideArgv(args), { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
  const timer = setTimeout(() => p.kill(), timeoutMs);
  const [out, err] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
  clearTimeout(timer);
  const code = await p.exited;
  return { code, out: strip(out + err).split('\n').filter(l => !l.includes('SecItemCopyMatching')).join('\n') };
}

export interface ReplResult { text: string; images: Buffer[]; error: boolean }

/** One `aside mcp` process. Each instance is its own REPL context (its own attached tabs and globals). */
export class AsideMcp {
  private proc: ReturnType<typeof Bun.spawn> | null = null;
  private waiting = new Map<number, (m: any) => void>();
  private nextId = 0;
  private starting: Promise<void> | null = null;
  dead = false;

  constructor(readonly label: string) {}

  start(): Promise<void> {
    if (this.starting) return this.starting;
    this.starting = (async () => {
      const proc = Bun.spawn(asideArgv(['mcp']), { stdin: 'pipe', stdout: 'pipe', stderr: 'ignore' });
      this.proc = proc;
      this.readLoop(proc.stdout as ReadableStream<Uint8Array>);
      proc.exited.then(() => {
        this.dead = true;
        for (const [, fn] of this.waiting) fn({ error: { message: 'aside mcp exited' } });
        this.waiting.clear();
      });
      await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'taskboard', version: '1' } }, 30_000);
      this.send({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
    })();
    return this.starting;
  }

  private async readLoop(stream: ReadableStream<Uint8Array>) {
    const dec = new TextDecoder();
    let buf = '';
    for await (const chunk of stream) {
      buf += dec.decode(chunk, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (!line.trim()) continue;
        let m: any; try { m = JSON.parse(line); } catch { continue; }
        if (m.id != null && this.waiting.has(m.id)) { this.waiting.get(m.id)!(m); this.waiting.delete(m.id); }
      }
    }
  }

  private send(obj: unknown) {
    const stdin = this.proc?.stdin as import('bun').FileSink | undefined;
    stdin?.write(JSON.stringify(obj) + '\n');
    stdin?.flush();
  }

  private rpc(method: string, params: unknown, timeoutMs: number): Promise<any> {
    return new Promise(resolve => {
      const id = ++this.nextId;
      const t = setTimeout(() => { this.waiting.delete(id); resolve({ error: { message: `timeout after ${timeoutMs} ms` } }); }, timeoutMs);
      this.waiting.set(id, m => { clearTimeout(t); resolve(m); });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  async repl(code: string, title = 'Taskboard', timeoutMs = 130_000): Promise<ReplResult> {
    if (this.dead) throw new Error(`${this.label}: aside mcp is not running`);
    await this.start();
    const r = await this.rpc('tools/call', { name: 'repl', arguments: { title, code } }, timeoutMs);
    if (r.error) return { text: String(r.error.message ?? r.error), images: [], error: true };
    const content: any[] = r.result?.content ?? [];
    const text = strip(content.filter(c => c.type === 'text').map(c => c.text).join('\n'));
    const images = content.filter(c => c.type === 'image').map(c => Buffer.from(c.data, 'base64'));
    return { text, images, error: !!r.result?.isError || /\[error \|/.test(text) };
  }

  /** Run code that console.logs exactly one JSON value, return it parsed. */
  async json<T>(code: string, title?: string): Promise<T> {
    const r = await this.repl(code, title);
    // Aside adds its own lines, e.g. "[warning] 6 tabs are open", so take the first line that really is JSON
    for (const l of r.text.split('\n').map(l => l.trim())) {
      if (r.error || !(l.startsWith('{') || l.startsWith('['))) continue;
      try { return JSON.parse(l); } catch {}
    }
    throw new Error(`${this.label}: ${r.text.slice(0, 300)}`);
  }

  close() { this.dead = true; try { this.proc?.kill(); } catch {} }
}

// One shared control connection for opening tabs and reading transcripts.
let control: AsideMcp | null = null;
export function controlMcp(): AsideMcp {
  if (!control || control.dead) control = new AsideMcp('control');
  return control;
}

const js = (v: unknown) => JSON.stringify(v);

/** Open a tab for a card and return its target id. */
export async function openCardTab(url: string): Promise<string> {
  const target = /^https?:\/\//.test(url) ? url : 'about:blank';
  const code = `{ const t = await openTab(${js(target)}); console.log(JSON.stringify({ id: t.targetId })); }`;
  try {
    return (await controlMcp().json<{ id: string }>(code, 'Open task tab')).id;
  } catch (e: any) {
    // Aside needs one normal browser window (e.g. after a restart): open one, then try again
    if (!/no normal browser window|isn't running|not running/i.test(e.message)) throw e;
    await ensureAsideWindow();
    return (await controlMcp().json<{ id: string }>(code, 'Open task tab')).id;
  }
}

export async function ensureAsideWindow() {
  if (process.platform !== 'darwin') return;
  const p = Bun.spawn([...config.asideWrap, 'open', '-g', '-a', 'Aside', 'about:blank'], { stdout: 'ignore', stderr: 'ignore' });
  await p.exited;
  await Bun.sleep(4000);
}

export async function closeTab(targetId: string) {
  await controlMcp().repl(
    `{ const ts = await listBrowserTabs(); if (ts.some(x => x.targetId === ${js(targetId)})) { const p = await attachBrowserTab(${js(targetId)}); await closeTab(p); } console.log('ok'); }`,
    'Close task tab').catch(() => {});
}

export async function tabUrl(targetId: string): Promise<string | null> {
  try {
    const r = await controlMcp().json<{ url: string | null }>(
      `{ const ts = await listBrowserTabs(); const t = ts.find(x => x.targetId === ${js(targetId)}); console.log(JSON.stringify({ url: t ? t.url : null })); }`);
    return r.url;
  } catch { return null; }
}

export interface TMsg { i: number; role: string; at: number; items: { type: string; name?: string; title?: string; code?: string; text?: string }[]; result?: string; event?: string }

/** Transcript messages of a session from index `from`, trimmed for size. */
export async function transcript(sessionId: string, from: number): Promise<TMsg[]> {
  return controlMcp().json<TMsg[]>(`{
    const ms = await aside.sessions.messages(${js(sessionId)}, { limit: 1000, order: 'asc' });
    const out = ms.slice(${from}).map((m, k) => {
      const c = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.content || []);
      return {
        i: ${from} + k, role: m.role, at: m.timestamp || 0, event: m.event,
        items: m.role === 'toolResult' ? [] : c.map(x => ({ type: x.type, name: x.name,
          title: x.arguments && x.arguments.title, code: x.arguments && (x.arguments.code || x.arguments.prompt || '').slice(0, 1500),
          text: (x.text || x.thinking || '').slice(0, 3000) })),
        result: m.role === 'toolResult' ? c.map(x => x.text || '').join('\\n').slice(0, 4000) : undefined,
      };
    });
    console.log(JSON.stringify(out));
  }`, 'Read agent steps');
}

export async function sessionStatus(sessionId: string): Promise<string> {
  try {
    const r = await controlMcp().json<{ s: string }>(`console.log(JSON.stringify({ s: (aside.sessions.get(${js(sessionId)}) || {}).status || 'unknown' }))`);
    return r.s;
  } catch { return 'unknown'; }
}
