// Taskboard server: API, realtime updates, live view, static web app.
import type { ServerWebSocket } from 'bun';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import type { Answer, Card, Column, Round } from '../shared/types.ts';
import { config, cookieSecret as loadCookieSecret, defaultModel, ownerToken } from './config.ts';
import { currentModels, modelNotes, onModels, startModelSync } from './providers.ts';
import { disposeAgent, handbackAgent, messageAgent, recoverAgents, startAgent, stopAgent, takeoverAgent } from './agents.ts';
import { announceAnswer, answerQuestion, markEntered } from './board-agent.ts';
import { live, type LiveData } from './live.ts';
import { readScreenshots } from './reader.ts';
import { search } from './search.ts';
import * as store from './store.ts';

type MainData = { kind: 'main'; login: string };
type WSData = MainData | LiveData;

class HttpError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { 'Cache-Control': 'no-store' } });
const isOwner = (login: string) => login === config.owner;
const columns: Column[] = ['todo', 'working', 'done'];

// ---------- who is asking ----------
const cookieSecret = loadCookieSecret();
const sign = (login: string) => `${login}.${createHmac('sha256', cookieSecret).update(login).digest('base64url')}`;
function verifyCookie(v: string | undefined): string | null {
  if (!v) return null;
  const i = v.lastIndexOf('.');
  const login = v.slice(0, i);
  const a = Buffer.from(sign(login)), b = Buffer.from(v);
  return a.length === b.length && timingSafeEqual(a, b) ? login : null;
}
const cookie = (req: Request, name: string) =>
  req.headers.get('cookie')?.split(/;\s*/).find(c => c.startsWith(name + '='))?.slice(name.length + 1);

const same = (x: string, y: string) => { const a = Buffer.from(x), b = Buffer.from(y); return a.length === b.length && timingSafeEqual(a, b); };

function whoIs(req: Request): string | null {
  const tok = ownerToken();
  const auth = req.headers.get('authorization');
  if (tok && auth && same(auth, `Bearer ${tok}`)) return config.owner;
  if (config.auth === 'header') return req.headers.get('x-auth-request-user');
  return verifyCookie(cookie(req, 'tb_login'));
}

// ---------- helpers ----------
function card(id: string): Card {
  const c = store.getCard(id);
  if (!c) throw new HttpError(404, 'No such card');
  return c;
}
const canDrive = (login: string, c: Card) => isOwner(login) || c.people.includes(login);
async function body<T = any>(req: Request): Promise<T> { try { return await req.json() as T; } catch { return {} as T; } }

function snapshot(login: string) {
  return { type: 'snapshot', me: store.user(login), users: store.users(), cards: store.allCards(), chat: store.chatLog(), round: store.getRound(), models: currentModels(), modelNotes: modelNotes() };
}

async function saveImage(req: Request): Promise<string> {
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length || buf.length > 25_000_000) throw new HttpError(400, 'Send one image (max 25 MB) as the request body');
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta?.format) throw new HttpError(400, 'Not an image');
  const file = `${randomUUID().slice(0, 13)}.png`;
  await sharp(buf).rotate().png().toFile(path.join(config.dataDir, 'shots', file));
  return `shots/${file}`;
}

const pickDefault = () => (currentModels().some(m => m.id === defaultModel) ? defaultModel : currentModels()[0]?.id ?? defaultModel);

// ---------- API ----------
async function api(req: Request, url: URL, login: string, p: string): Promise<Response> {
  const m = req.method;
  const parts = p.split('/').filter(Boolean); // ['api', ...]
  const [, a, id, b, c2] = parts;

  if (m === 'GET' && a === 'me') return json(store.user(login));
  if (m === 'GET' && a === 'state') return json(snapshot(login));
  if (m === 'GET' && a === 'models') return json(currentModels());
  if (m === 'GET' && a === 'search') return json(search(url.searchParams.get('q') ?? ''));

  if (a === 'round' && m === 'PUT') {
    if (!isOwner(login)) throw new HttpError(403, 'Only the owner can set the round');
    const r = await body<Round>(req);
    return json(store.setRound({ name: String(r.name || 'Round'), endsAt: r.endsAt ? Number(r.endsAt) : null, practice: !!r.practice }));
  }

  if (a === 'agents' && id === 'start' && m === 'POST') {
    const { cardIds = [], model = pickDefault() } = await body<{ cardIds: string[]; model: string }>(req);
    if (!currentModels().some(x => x.id === model)) throw new HttpError(400, 'That model is not available right now');
    const out: Card[] = [];
    for (const cid of cardIds) {
      const c = card(cid);
      if (!isOwner(login) && !c.people.includes(login) && c.people.length) throw new HttpError(403, `${c.title}: only people on the card can start its agent`);
      if (!c.people.includes(login)) store.updateCard(cid, x => { x.people.push(login); });
      await startAgent(cid, model, login);
      out.push(store.getCard(cid)!);
    }
    return json(out);
  }

  if (a === 'uploads' && m === 'POST' && !id) return json({ url: await saveImage(req) });

  if (a === 'chat') {
    if (m === 'DELETE' && !id) {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can clear the chat');
      store.clearChat();
      for (const ws of mainSockets) ws.send(JSON.stringify(snapshot(ws.data.login))); // everyone gets the empty chat
      return json({ ok: true });
    }
    if (m === 'POST' && !id) {
      const { text = '', cardId, images = [] } = await body<{ text: string; cardId?: string; images?: string[] }>(req);
      const t = String(text).trim().slice(0, 4000);
      const imgs = (Array.isArray(images) ? images : []).map(String).filter(u => /^shots\/[A-Za-z0-9-]+\.png$/.test(u)).slice(0, 12);
      if (!t && !imgs.length) throw new HttpError(400, 'Empty message');
      const msg = store.addChat({ author: login, text: t, kind: 'text', cardId, ...(imgs.length ? { images: imgs } : {}) });
      if (/(^|\s)@board\b/i.test(t)) answerQuestion(t.replace(/(^|\s)@board\b/ig, ' ').trim(), login, imgs);
      return json(msg);
    }
    if (m === 'POST' && b === 'react') {
      const { reaction = '👍' } = await body<{ reaction: string }>(req);
      const r = String(reaction).slice(0, 16);
      let nowOn = false;
      const msg = store.updateChat(Number(id), mm => {
        const list = mm.reactions[r] ?? [];
        nowOn = !list.includes(login);
        mm.reactions[r] = nowOn ? [...list, login] : list.filter(x => x !== login);
      });
      if (!msg) throw new HttpError(404, 'No such message');
      if ((r === 'entered' || r === 'had_it') && msg.cardId) markEntered(msg.cardId, login, nowOn || !!msg.reactions.entered?.includes(login) || !!msg.reactions.had_it?.includes(login), msg.answerId);
      return json(msg);
    }
  }

  if (a === 'cards') {
    if (m === 'POST' && !id) {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can create cards');
      return json(store.createCard(await body(req)));
    }
    if (!id) throw new HttpError(404, 'Not found');
    const c = card(id);

    if (m === 'DELETE' && !b) {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can delete cards');
      await disposeAgent(id);
      live.drop(id);
      store.deleteCard(id);
      return json({ ok: true });
    }
    if (m === 'PATCH' && !b) {
      const x = await body<Partial<Card>>(req);
      return json(store.updateCard(id, cc => {
        if (x.column && columns.includes(x.column) && x.column !== cc.column) { cc.column = x.column; cc.position = x.position ?? store.nextPosition(x.column); }
        else if (typeof x.position === 'number') cc.position = x.position;
        if (typeof x.notes === 'string') cc.notes = x.notes.slice(0, 10_000);
        if (typeof x.link === 'string') cc.link = x.link.slice(0, 2000);
        if ('answer' in x && x.answer) { // old clients: one typed answer
          store.upsertAnswer(cc, '', String(x.answer), login);
          cc.allAnswered = true;
        }
        if (typeof x.allAnswered === 'boolean') cc.allAnswered = x.allAnswered;
        if (cc.allAnswered && cc.answers.length && cc.column !== 'done') { cc.column = 'done'; cc.position = store.nextPosition('done'); }
        if (isOwner(login)) {
          if (typeof x.title === 'string') cc.title = x.title.slice(0, 200);
          if (typeof x.task === 'string') cc.task = x.task;
          if (typeof x.screenshotText === 'string') cc.screenshotText = x.screenshotText;
        }
      }));
    }
    if (m === 'POST' && b === 'screenshots') {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can add screenshots');
      const url = await saveImage(req);
      return json(store.addScreenshot(id, url));
    }
    if (m === 'POST' && b === 'read') {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can do this');
      const { overwrite = false } = await body<{ overwrite?: boolean }>(req);
      return json(await readScreenshots(id, !!overwrite));
    }
    if (m === 'DELETE' && b === 'screenshots' && c2) {
      if (!isOwner(login)) throw new HttpError(403, 'Only the owner can remove screenshots');
      return json(store.updateCard(id, cc => { cc.screenshots = cc.screenshots.filter(s => s.id !== c2); }));
    }
    if (m === 'POST' && (b === 'join' || b === 'leave')) {
      return json(store.updateCard(id, cc => {
        cc.people = cc.people.filter(x => x !== login);
        if (b === 'join') cc.people.push(login);
      }));
    }
    if (m === 'POST' && b === 'entered') {
      const { entered = true } = await body<{ entered: boolean }>(req);
      if (!c.answers.length) throw new HttpError(400, 'This card has no answer yet');
      return json(markEntered(id, login, !!entered));
    }
    if (b === 'answers') {
      if (m === 'POST' && !c2) {
        const { label = '', value = '' } = await body<{ label?: string; value: string }>(req);
        if (!String(value).trim()) throw new HttpError(400, 'Empty answer');
        let added: Answer | null = null;
        const card2 = store.updateCard(id, cc => { const r = store.upsertAnswer(cc, String(label), String(value), login); if (r.changed) added = r.answer; });
        if (added && card2) announceAnswer(card2, added);
        return json(card2);
      }
      const ans = c.answers.find(x => x.id === c2);
      if (!ans) throw new HttpError(404, 'No such answer');
      const sub = parts[5];
      if (m === 'POST' && sub === 'entered') {
        const { entered = true } = await body<{ entered: boolean }>(req);
        return json(markEntered(id, login, !!entered, ans.id));
      }
      if (m === 'PATCH' && !sub) {
        const x = await body<{ label?: string; value?: string }>(req);
        return json(store.updateCard(id, cc => {
          const a = cc.answers.find(y => y.id === ans.id)!;
          if (typeof x.label === 'string') a.label = x.label.slice(0, 40);
          if (typeof x.value === 'string' && x.value.trim() && x.value.trim() !== a.value) { a.value = x.value.trim().slice(0, 500); a.by = login; a.at = Date.now(); a.entered = {}; }
          store.syncAnswers(cc);
        }));
      }
      if (m === 'DELETE' && !sub) {
        return json(store.updateCard(id, cc => { cc.answers = cc.answers.filter(y => y.id !== ans.id); if (!cc.answers.length) cc.allAnswered = false; store.syncAnswers(cc); }));
      }
    }
    if (m === 'GET' && b === 'steps') return json(store.steps(id));
    if (b === 'agent' && m === 'POST') {
      if (!canDrive(login, c) && !(c2 === 'start' && !c.people.length)) throw new HttpError(403, 'Join the card first');
      if (c2 === 'start') {
        const { model = c.agent?.model ?? pickDefault() } = await body<{ model: string }>(req);
        if (!currentModels().some(x => x.id === model)) throw new HttpError(400, 'That model is not available right now');
        await startAgent(id, model, login);
      } else if (c2 === 'stop') await stopAgent(id, login);
      else if (c2 === 'message') {
        const { text = '' } = await body<{ text: string }>(req);
        if (!String(text).trim()) throw new HttpError(400, 'Empty message');
        await messageAgent(id, String(text).slice(0, 4000), login);
      } else if (c2 === 'takeover') await takeoverAgent(id, login);
      else if (c2 === 'handback') {
        const { note } = await body<{ note?: string }>(req);
        await handbackAgent(id, login, note ? String(note).slice(0, 2000) : undefined);
      } else throw new HttpError(404, 'Not found');
      return json(store.getCard(id));
    }
  }
  throw new HttpError(404, 'Not found');
}

// ---------- laptop sign-in page (TASKBOARD_AUTH=open) ----------
function loginPage(err = '') {
  const opts = store.teamLogins().map(l => `<option value="${l}">${store.user(l).name} (${l})</option>`).join('');
  return new Response(`<!doctype html><meta name=viewport content="width=device-width"><title>Taskboard sign in</title>
<style>body{font:15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh;margin:0;background:#f4f4f5}form{background:#fff;padding:28px;border-radius:22px;display:grid;gap:12px;min-width:280px;box-shadow:0 10px 30px #0001}select,input,button{font:inherit;padding:10px 14px;border-radius:999px;border:1px solid #e4e4e7}button{background:#0a0a0a;color:#fff;border:0;font-weight:600}</style>
<form method=post action="login"><b style="font-family:ui-monospace,monospace">▦ taskboard</b>${err ? `<span style="color:#b91c1c">${err}</span>` : ''}
<select name=login>${opts}</select><input name=passcode type=password placeholder="Team passcode"><button>Sign in</button></form>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ---------- realtime ----------
const mainSockets = new Set<ServerWebSocket<MainData>>();
store.onChange(msg => {
  const s = JSON.stringify(msg);
  for (const ws of mainSockets) ws.send(s);
});

// ---------- static ----------
function staticFile(p: string): Response | null {
  if (p.startsWith('/shots/')) {
    const f = path.join(config.dataDir, 'shots', path.basename(p));
    return existsSync(f) ? new Response(Bun.file(f), { headers: { 'Cache-Control': 'private, max-age=86400' } }) : null;
  }
  const rel = p === '/' ? 'index.html' : p.slice(1);
  const f = path.join(config.webDist, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (f.startsWith(config.webDist) && existsSync(f) && !f.endsWith('/')) {
    const immutable = rel.startsWith('assets/');
    return new Response(Bun.file(f), { headers: { 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' } });
  }
  const index = path.join(config.webDist, 'index.html');
  return existsSync(index) ? new Response(Bun.file(index), { headers: { 'Cache-Control': 'no-cache' } }) : new Response('Web app not built yet (cd web && npm run build)', { status: 503 });
}

// ---------- refuse unsafe setups ----------
const loopback = ['127.0.0.1', 'localhost', '::1'].includes(config.host);
if (config.auth === 'open' && !config.passcode && !loopback) {
  console.error('Refusing to start: TASKBOARD_AUTH=open on a network address needs TASKBOARD_PASSCODE, or anyone could sign in as anyone.');
  process.exit(1);
}
if (config.auth === 'header' && !loopback) {
  console.warn('Warning: TASKBOARD_AUTH=header trusts X-Auth-Request-User. Make sure only your reverse proxy can reach this port.');
}

const server = Bun.serve<WSData>({
  port: config.port,
  hostname: config.host,
  idleTimeout: 120,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const p = (config.basePath && (url.pathname === config.basePath || url.pathname.startsWith(config.basePath + '/'))
      ? url.pathname.slice(config.basePath.length) : url.pathname) || '/';

    if (config.auth === 'open' && p === '/login') {
      if (req.method === 'POST') {
        const f = await req.formData();
        const login = String(f.get('login') || '');
        if (!store.teamLogins().includes(login) || (config.passcode && f.get('passcode') !== config.passcode)) return loginPage('Wrong passcode');
        return new Response(null, { status: 303, headers: { Location: './', 'Set-Cookie': `tb_login=${sign(login)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` } });
      }
      return loginPage();
    }

    const login = whoIs(req);
    if (!login) {
      if (config.auth === 'open' && !p.startsWith('/api') && !p.startsWith('/ws')) return Response.redirect(new URL('login', url.href.replace(/[^/]*$/, '')).href, 303);
      return json({ error: 'Not signed in' }, 401);
    }
    store.ensureUser(login);

    if (p === '/ws') return srv.upgrade(req, { data: { kind: 'main', login } }) ? undefined : new Response('Expected WebSocket', { status: 400 });
    if (p === '/ws/live') {
      const cardId = url.searchParams.get('card') ?? '';
      if (!store.getCard(cardId)) return new Response('No such card', { status: 404 });
      const data: LiveData = { kind: 'live', login, cardId, fps: Number(url.searchParams.get('fps') ?? 2) || 2, w: Number(url.searchParams.get('w') ?? 0) || 0 };
      return srv.upgrade(req, { data }) ? undefined : new Response('Expected WebSocket', { status: 400 });
    }
    if (p.startsWith('/api/')) {
      try { return await api(req, url, login, p); }
      catch (e: any) { return json({ error: e.message ?? String(e) }, e instanceof HttpError ? e.status : 500); }
    }
    if (req.method !== 'GET') return json({ error: 'Not found' }, 404);
    return staticFile(p) ?? json({ error: 'Not found' }, 404);
  },
  websocket: {
    maxPayloadLength: 1 << 20,
    open(ws) {
      if (ws.data.kind === 'live') return live.open(ws as ServerWebSocket<LiveData>);
      mainSockets.add(ws as ServerWebSocket<MainData>);
      store.setOnline(ws.data.login, +1);
      ws.send(JSON.stringify(snapshot(ws.data.login)));
    },
    message(ws, raw) {
      if (ws.data.kind === 'live') return void live.message(ws as ServerWebSocket<LiveData>, raw as string);
      try {
        const m = JSON.parse(String(raw));
        if (m.type === 'typing') for (const o of mainSockets) if (o !== ws) o.send(JSON.stringify({ type: 'typing', login: ws.data.login }));
      } catch {}
    },
    close(ws) {
      if (ws.data.kind === 'live') return live.close(ws as ServerWebSocket<LiveData>);
      mainSockets.delete(ws as ServerWebSocket<MainData>);
      store.setOnline(ws.data.login, -1);
    },
  },
});

recoverAgents(store.allCards());
onModels((models, notes) => { const s = JSON.stringify({ type: 'models', models, notes }); for (const ws of mainSockets) ws.send(s); });
startModelSync();
console.log(`taskboard on http://${server.hostname}:${server.port} (auth: ${config.auth})`);
