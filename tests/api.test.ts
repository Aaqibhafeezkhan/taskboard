// End to end: start a real server on a free port with an empty data folder and talk to it over HTTP and WebSocket.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const TOKEN = 'test-owner-token';
const PASS = 'letmein';
const port = 20000 + Math.floor(Math.random() * 20000);
const base = `http://127.0.0.1:${port}/board`;
let server: ReturnType<typeof Bun.spawn>;

const owner = { Authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };
const api = (p: string, init: RequestInit = {}, headers: Record<string, string> = owner) =>
  fetch(`${base}/api/${p}`, { ...init, headers: { ...headers, ...(init.headers as any) } });

beforeAll(async () => {
  server = Bun.spawn(['bun', 'server/main.ts'], {
    cwd: path.resolve(import.meta.dir, '..'),
    env: {
      ...process.env, PORT: String(port), HOST: '127.0.0.1',
      TASKBOARD_DATA: mkdtempSync(path.join(tmpdir(), 'taskboard-api-')),
      TASKBOARD_AUTH: 'open', TASKBOARD_PASSCODE: PASS, TASKBOARD_BASE_PATH: '/board',
      TASKBOARD_OWNER: 'maya', TASKBOARD_OWNER_NAME: 'Maya', TASKBOARD_TEAM: 'theo:Theo,jun:Jun',
      TASKBOARD_OWNER_TOKEN: TOKEN, TASKBOARD_OWNER_TOKEN_FILE: '/nonexistent',
    },
    stdout: 'ignore', stderr: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try { await fetch(`${base}/login`); return; } catch { await Bun.sleep(50); }
  }
  throw new Error('server did not start');
});
afterAll(() => server?.kill());

async function signIn(login: string, passcode: string) {
  const r = await fetch(`${base}/login`, { method: 'POST', body: new URLSearchParams({ login, passcode }), redirect: 'manual' });
  return { status: r.status, cookie: r.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('auth', () => {
  test('no sign-in: API answers 401, pages redirect to the sign-in page', async () => {
    expect((await fetch(`${base}/api/me`)).status).toBe(401);
    const r = await fetch(`${base}/`, { redirect: 'manual' });
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toContain('/board/login');
  });

  test('owner token acts as the owner', async () => {
    const me = await (await api('me')).json();
    expect(me).toMatchObject({ login: 'maya', name: 'Maya', role: 'owner' });
  });

  test('sign-in page lists the team and checks the passcode', async () => {
    const page = await (await fetch(`${base}/login`)).text();
    for (const l of ['maya', 'theo', 'jun']) expect(page).toContain(`value="${l}"`);
    expect((await signIn('theo', 'wrong')).cookie).toBe('');
    expect((await signIn('stranger', PASS)).cookie).toBe('');
    const ok = await signIn('theo', PASS);
    expect(ok.status).toBe(303);
    const me = await (await api('me', {}, { cookie: ok.cookie })).json();
    expect(me).toMatchObject({ login: 'theo', role: 'member' });
  });

  test('a forged cookie is rejected', async () => {
    expect((await api('me', {}, { cookie: 'tb_login=maya.forged' })).status).toBe(401);
  });
});

describe('cards', () => {
  let id = '';
  let theo = '';
  beforeAll(async () => { theo = (await signIn('theo', PASS)).cookie; });

  test('owner creates a card, it lands in To do', async () => {
    const c = await (await api('cards', { method: 'POST', body: JSON.stringify({ title: 'Cookie jar', task: 'Find the saved item with the reset link.', link: 'https://example.com/jar' }) })).json();
    expect(c).toMatchObject({ title: 'Cookie jar', column: 'todo', link: 'https://example.com/jar', answers: [] });
    id = c.id;
  });

  test('members cannot create or delete cards', async () => {
    expect((await api('cards', { method: 'POST', body: '{"title":"x"}' }, { cookie: theo, 'content-type': 'application/json' })).status).toBe(403);
    expect((await api(`cards/${id}`, { method: 'DELETE' }, { cookie: theo })).status).toBe(403);
  });

  test('join, move, answer, enter', async () => {
    const member = { cookie: theo, 'content-type': 'application/json' };
    let c = await (await api(`cards/${id}/join`, { method: 'POST' }, member)).json();
    expect(c.people).toContain('theo');
    c = await (await api(`cards/${id}`, { method: 'PATCH', body: '{"column":"working"}' }, member)).json();
    expect(c.column).toBe('working');
    c = await (await api(`cards/${id}/answers`, { method: 'POST', body: '{"label":"Q1","value":"ORBIT-7731"}' }, member)).json();
    expect(c.answers).toHaveLength(1);
    expect(c.answers[0]).toMatchObject({ label: 'Q1', value: 'ORBIT-7731', by: 'theo' });
    c = await (await api(`cards/${id}/entered`, { method: 'POST', body: '{"entered":true}' }, member)).json();
    expect(Object.keys(c.entered)).toContain('theo');
  });

  test('search finds the card by its answer and its task text', async () => {
    const byAnswer = await (await api('search?q=ORBIT')).json();
    expect(byAnswer.map((h: any) => h.cardId)).toContain(id);
    const byTask = await (await api('search?q=reset%20link')).json();
    expect(byTask[0].matches.some((m: any) => m.snippet.includes('<mark>'))).toBe(true);
  });

  test('every change reaches connected browsers over the WebSocket', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/board/ws`, { headers: { cookie: theo } } as any);
    const msgs: any[] = [];
    ws.onmessage = e => msgs.push(JSON.parse(String(e.data)));
    await new Promise(r => (ws.onopen = r));
    await api(`cards/${id}`, { method: 'PATCH', body: '{"notes":"try the second account"}' });
    for (let i = 0; i < 40 && !msgs.some(m => m.type === 'card'); i++) await Bun.sleep(25);
    ws.close();
    expect(msgs.some(m => m.type === 'snapshot')).toBe(true);
    expect(msgs.find(m => m.type === 'card')?.card.notes).toBe('try the second account');
  });

  test('owner deletes the card', async () => {
    expect((await api(`cards/${id}`, { method: 'DELETE' })).status).toBe(200);
    expect((await api(`cards/${id}/steps`)).status).toBe(404);
  });
});
