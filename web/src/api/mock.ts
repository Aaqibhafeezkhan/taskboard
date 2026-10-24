// Mock-only backend (VITE_MOCK=1): the whole contract in memory, with fake agents, chat and live view.
import type { Card, ChatMsg, Column, LiveInput, ModelOption, Round, SearchHit, ServerMsg, Step, StepKind, User } from '../../../shared/types.ts';
import type { LiveConn, LiveHandlers, StateConn, Transport } from './transport.ts';
import { drawPage, pageDataUrl, type PageKind } from './fakepage.ts';

const now = Date.now();
const min = 60000;
const as = new URLSearchParams(location.search).get('as') || 'maya';

const users: User[] = [
  { login: 'maya', name: 'Maya Chen', color: '#f59e0b', role: 'owner', online: true },
  { login: 'theo', name: 'Theo Brandt', color: '#10b981', role: 'member', online: true },
  { login: 'jun', name: 'Jun Park', color: '#3b82f6', role: 'member', online: true },
  { login: 'priya', name: 'Priya Nair', color: '#ec4899', role: 'member', online: true },
  { login: 'sam', name: 'Sam Okafor', color: '#8b5cf6', role: 'member', online: false },
];
users.forEach((u) => { if (u.login === as) u.online = true; });
const me = users.find((u) => u.login === as) || users[0];

const models: ModelOption[] = [
  { id: 'claude-code/claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'claude' },
  { id: 'claude-code/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'claude' },
  { id: 'claude-code/claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'claude' },
  { id: 'claude-code/claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'claude' },
  { id: 'openai-codex/gpt-6-sol', label: 'GPT-6 Sol', provider: 'chatgpt' },
  { id: 'openai-codex/gpt-6-luna', label: 'GPT-6 Luna', provider: 'chatgpt' },
  { id: 'openai-codex/gpt-6-astra', label: 'GPT-6 Astra', provider: 'chatgpt' },
  { id: 'openai-codex/gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'chatgpt' },
];

let round: Round = { name: 'Practice round', endsAt: now + (2 * 60 + 14) * min + 37000, practice: true };

const kinds: Record<string, PageKind[]> = {};
const shotCache: Record<string, string> = {};
function shots(id: string, list: [PageKind, string?][]) {
  kinds[id] = list.map((x) => x[0]);
  return list.map(([k, t], i) => {
    const key = `${k}-${t || ''}`;
    shotCache[key] ||= pageDataUrl(k, t);
    return { id: `${id}-${i}`, url: shotCache[key], width: 640, height: 400 };
  });
}

let pos = 0;
type Seed = Partial<Card> & { id: string; title: string; column: Column; qa?: [string, string][] };
function card(p: Seed, shotList: [PageKind, string?][]): Card {
  const { qa, ...rest } = p;
  const c: Card = {
    task: '', screenshotText: '', link: `https://play.example/tasks/${p.id}`, position: pos++, people: [],
    screenshots: shots(p.id, shotList), agent: null, answers: [], allAnswered: false, answer: null, answerBy: null, answerAt: null, entered: {}, notes: '',
    createdAt: now - 50 * min, updatedAt: now - 5 * min, ...rest,
  };
  // seeds give either one legacy answer (+ entered) or several labelled ones (qa)
  const list: [string, string][] = qa ?? (p.answer ? [['', p.answer]] : []);
  c.answers = list.map(([label, value], i) => ({ id: `${p.id}-a${i}`, label, value, by: p.answerBy ?? 'agent', at: (p.answerAt ?? now - 10 * min) - i, entered: { ...(p.entered ?? {}) } }));
  c.allAnswered = c.answers.length > 0;
  return sync(c);
}
/** Same as the server's syncAnswers: summary fields follow card.answers. */
function sync(c: Card): Card {
  const a = c.answers;
  c.answer = a.length ? a.map((x) => (x.label ? `${x.label}: ${x.value}` : x.value)).join(' · ') : null;
  c.answerBy = a.length ? a[a.length - 1].by : null;
  c.answerAt = a.length ? Math.max(...a.map((x) => x.at)) : null;
  c.entered = {};
  const logins = new Set(a.flatMap((x) => Object.keys(x.entered)));
  if (a.length) for (const l of logins) if (a.every((x) => x.entered[l])) c.entered[l] = Math.max(...a.map((x) => x.entered[l]));
  return c;
}

const cards: Card[] = [
  card({ id: 'login-maze', title: 'Login maze', column: 'todo', task: 'Find a way past the three login screens. Each one has a different trick. The last page shows the answer (looks like WORD-0000).' }, [['login', 'Sign in'], ['text', 'Login maze']]),
  card({ id: 'broken-calc', title: 'Broken calculator', column: 'todo', people: ['maya'], task: 'The calculator on the page gives one wrong result. Find which input breaks it; the error message holds the answer.' }, [['text', 'Calculator']]),
  card({ id: 'photo-meta', title: 'Old photo metadata', column: 'todo', task: 'Download the old photo from the gallery and read when and where it was taken. The answer is the city name in capitals plus the year.' }, [['tiles'], ['text', 'Old photo'], ['tiles', 'Archive']]),
  card({ id: 'locked-form', title: 'The locked form', column: 'todo', task: 'The submit button on the form is disabled. Get the form submitted anyway.' }, [['login', 'Order form']]),
  card({ id: 'cookie-jar', title: 'Cookie jar', column: 'working', people: ['jun'],
    task: "Log in to the shop with the test account from screenshot 1. Somewhere in the account area there's a jar of saved items. One of them holds the answer. It looks like WORD-0000.",
    screenshotText: 'PlayShop Account Saved items test account: player07', notes: 'Don\'t press "delete account", it resets the task.',
    agent: { model: 'claude-code/claude-opus-5-5', state: 'running', sessionId: 'mock1', startedAt: now - 12 * min, lastStep: 'Clicked "reset link" on /account/recover', driver: 'agent', startedBy: 'jun' } }, [['account'], ['text', 'Cookie jar']]),
  card({ id: 'word-ladder', title: 'Word ladder', column: 'working', people: ['priya'], task: 'Climb the word ladder from COLD to WARM. The final page gives the answer.',
    agent: { model: 'claude-code/claude-sonnet-5-5', state: 'needs_help', sessionId: 'mock2', startedAt: now - 6 * min, lastStep: 'The page asks for a code sent to a phone.', question: 'The page asks for a code sent to a phone. I can\'t get that. What should I do?', driver: 'agent', startedBy: 'priya' } }, [['login', 'Verify']]),
  card({ id: 'mirror-api', title: 'Mirror API', column: 'working', people: ['sam'], task: 'Call the mirror API so that it returns the secret word.',
    agent: { model: 'openai-codex/gpt-6-luna', state: 'running', sessionId: 'mock3', startedAt: now - 3 * min, lastStep: 'Reading the docs page', driver: 'agent', startedBy: 'sam' } }, [['docs']]),
  card({ id: 'count-tiles', title: 'Count the tiles', column: 'working', people: ['maya'], task: 'Count the blue tiles across all gallery pages.' }, [['tiles']]),
  card({ id: 'lost-password', title: 'Lost password', column: 'done', people: ['theo'], task: "Recover the admin's lost password (Q1), then the security word on the reset page (Q2).", qa: [['Q1', 'ORBIT-7731'], ['Q2', 'MAPLE']], answerBy: 'agent', answerAt: now - 2 * min, entered: { 'theo': now - 1 * min, maya: now - 1 * min },
    agent: { model: 'claude-code/claude-opus-5-5', state: 'finished', startedAt: now - 20 * min, endedAt: now - 2 * min, lastStep: 'Found the answer', driver: 'agent' } }, [['login', 'Reset password']]),
  card({ id: 'welcome', title: 'Welcome task', column: 'done', answer: 'HELLO-0001', answerBy: 'maya', answerAt: now - 40 * min, entered: { maya: 1, 'theo': 1, jun: 1, priya: 1 } }, [['text', 'Welcome']]),
  card({ id: 'odd-one', title: 'Odd one out', column: 'done', qa: [['Q1', 'PRISM-42'], ['Q2', 'CEDAR-9'], ['Q3', '17']], answerBy: 'agent', answerAt: now - 30 * min, entered: { maya: 1, 'theo': 1, jun: 1 } }, [['tiles', 'Odd one out']]),
  card({ id: 'robots', title: 'Robots file', column: 'done', answer: 'BOT-9F3A', answerBy: 'jun', answerAt: now - 25 * min, entered: { jun: 1 } }, [['text', 'robots.txt']]),
];
const byId: Record<string, Card> = Object.fromEntries(cards.map((c) => [c.id, c]));

let stepId = 1;
const steps: Step[] = [];
function addStep(cardId: string, kind: StepKind, title: string, text: string, at = Date.now()) {
  const st = { id: stepId++, cardId, at, kind, title, text };
  steps.push(st);
  return st;
}
[
  ['tool', 'Opened task link', 'play.example/tasks/cookie-jar', 11],
  ['tool', 'Read page', 'found login form, 2 fields', 10],
  ['tool', 'Typed + submitted login', 'test account from screenshot 1', 9],
  ['tool', 'Found "saved items"', 'under /account, 9 items', 5],
  ['thought', 'Thought', 'The 9th item links to a recovery page with a reset link, the answer may be there.', 3],
  ['tool', 'Click "reset link"', 'on /account/recover, reading the result…', 0],
].forEach(([k, t, x, m]) => addStep('cookie-jar', k as StepKind, t as string, x as string, now - (m as number) * min));
addStep('word-ladder', 'tool', 'Opened task link', 'play.example/tasks/word-ladder', now - 6 * min);
addStep('word-ladder', 'tool', 'Climbed COLD → CORD → CARD', '3 rungs done', now - 4 * min);
addStep('word-ladder', 'help', 'Needs help', "The page asks for a code sent to a phone. I can't get that. What should I do?", now - 1 * min);
addStep('mirror-api', 'tool', 'Opened task link', 'play.example/tasks/mirror-api', now - 3 * min);
addStep('mirror-api', 'tool', 'Reading the docs page', '/docs/endpoints', now - 1 * min);
addStep('lost-password', 'answer', 'Found the answer', 'ORBIT-7731', now - 2 * min);

let chatId = 1;
const chat: ChatMsg[] = [
  { id: chatId++, at: now - 3 * min, author: 'board', text: 'Lost password, Q1: enter this on your account:', cardId: 'lost-password', kind: 'answer', answer: 'ORBIT-7731', answerId: 'lost-password-a0', answerLabel: 'Q1', reactions: { entered: ['theo', 'maya'] } },
  { id: chatId++, at: now - 2 * min, author: 'board', text: 'Lost password, Q2: enter this on your account:', cardId: 'lost-password', kind: 'answer', answer: 'MAPLE', answerId: 'lost-password-a1', answerLabel: 'Q2', reactions: { entered: ['theo', 'maya'] } },
  { id: chatId++, at: now - 1 * min, author: 'theo', text: '👍 done. @jun can you look at Word ladder? its agent is stuck on a phone code', kind: 'text', reactions: {} },
  { id: chatId++, at: now - 20000, author: 'board', text: 'Left: 8 to do, 3 running, 1 stuck. Nobody is on The locked form or Login maze yet.', kind: 'text', reactions: {} },
];

// ---- pub/sub ----
const listeners = new Set<(m: ServerMsg) => void>();
const emit = (m: ServerMsg) => setTimeout(() => listeners.forEach((l) => l(structuredClone(m))), 0);
const touch = (c: Card) => { c.updatedAt = Date.now(); emit({ type: 'card', card: c }); return structuredClone(c); };

// ---- fake agents ----
const scripts: Record<string, [StepKind, string, string][]> = {
  default: [
    ['tool', 'Opened task link', 'reading the page'],
    ['tool', 'Read page', 'found 4 links and a form'],
    ['thought', 'Thought', 'The form looks like the way in. Trying the obvious values first.'],
    ['tool', 'Typed into the form', 'submitted'],
    ['tool', 'Read result', 'a new page with a hint'],
    ['answer', 'Found the answer', ''],
  ],
};
const answers = ['NOVA-1184', 'EMBER-3307', 'QUARTZ-55', 'ATLAS-9020', 'LUMEN-7712'];
const progress: Record<string, number> = {};
setInterval(() => {
  for (const c of cards) {
    const a = c.agent;
    if (!a || a.driver === 'human') continue;
    if (a.state === 'starting') { a.state = 'running'; touch(c); continue; }
    if (a.state !== 'running' || c.id === 'cookie-jar' || c.id === 'mirror-api') {
      // the sketch cards keep "working" forever, with a new step now and then
      if (a.state === 'running' && Math.random() < 0.25) {
        const st = addStep(c.id, 'tool', ['Scrolled the page', 'Read page', 'Clicked a link', 'Checked the source'][Math.floor(Math.random() * 4)], 'still looking…');
        a.lastStep = st.title; emit({ type: 'step', step: st }); touch(c);
      }
      continue;
    }
    const i = (progress[c.id] = (progress[c.id] ?? -1) + 1);
    const sc = scripts.default[i];
    if (!sc) continue;
    if (sc[0] === 'answer') {
      const ans = answers[Math.floor(Math.random() * answers.length)];
      const st = addStep(c.id, 'answer', 'Found the answer', ans);
      emit({ type: 'step', step: st });
      const aid = `${c.id}-a${c.answers.length}`;
      c.answers.push({ id: aid, label: '', value: ans, by: 'agent', at: Date.now(), entered: {} });
      Object.assign(c, { allAnswered: true, column: 'done' as Column, position: -Date.now() });
      sync(c);
      Object.assign(a, { state: 'finished', endedAt: Date.now(), lastStep: 'Found the answer' });
      touch(c);
      const m: ChatMsg = { id: chatId++, at: Date.now(), author: 'board', text: `${c.title}: enter this on your account:`, cardId: c.id, kind: 'answer', answer: ans, answerId: aid, answerLabel: '', reactions: {} };
      chat.push(m); emit({ type: 'chat', msg: m });
    } else {
      const st = addStep(c.id, sc[0], sc[1], sc[2]);
      a.lastStep = st.title;
      emit({ type: 'step', step: st }); touch(c);
    }
  }
}, 3200);

// ---- search ----
function snippet(text: string, q: string): string | null {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const s = Math.max(0, i - 40), e = Math.min(text.length, i + q.length + 50);
  const esc = (x: string) => x.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));
  return (s > 0 ? '…' : '') + esc(text.slice(s, i)) + '<mark>' + esc(text.slice(i, i + q.length)) + '</mark>' + esc(text.slice(i + q.length, e)) + (e < text.length ? '…' : '');
}
function search(q: string): SearchHit[] {
  q = q.trim();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const c of cards) {
    const matches: SearchHit['matches'] = [];
    const fields: [string, string][] = [['title', c.title], ['task', c.task], ['screenshots', c.screenshotText], ['link', c.link], ['notes', c.notes], ['answer', c.answer || ''], ['on it', c.people.join(' ')]];
    for (const [w, t] of fields) { const sn = snippet(t, q); if (sn) matches.push({ where: w, snippet: sn }); }
    for (const st of steps.filter((x) => x.cardId === c.id)) {
      const sn = snippet(`${st.title} ${st.text}`, q);
      if (sn) matches.push({ where: `agent ${st.kind === 'thought' ? 'thought' : 'step'} ${new Date(st.at).toTimeString().slice(0, 5)}`, snippet: sn, stepId: st.id });
    }
    for (const m of chat.filter((x) => x.cardId === c.id)) { const sn = snippet(m.text, q); if (sn) matches.push({ where: 'chat', snippet: sn }); }
    if (matches.length) hits.push({ cardId: c.id, title: c.title, column: c.column, agentState: c.agent?.state ?? null, matches: matches.slice(0, 4) });
  }
  return hits.sort((a, b) => b.matches.length - a.matches.length);
}

// ---- REST ----
class E extends Error { constructor(public status: number, m: string) { super(m); } }
const need = (c: Card | undefined) => { if (!c) throw new E(404, 'card not found'); return c; };
const owner = () => { if (me.role !== 'owner') throw new E(403, 'only the owner can do that'); };

function startAgent(c: Card, model: string) {
  c.agent = { model, state: 'starting', sessionId: `mock-${c.id}`, startedAt: Date.now(), lastStep: 'Starting…', driver: 'agent', startedBy: me.login };
  if (c.column === 'todo') { c.column = 'working'; c.position = -Date.now(); }
  if (!c.people.includes(me.login) && me.role !== 'owner') c.people.push(me.login);
  progress[c.id] = -1;
  const st = addStep(c.id, 'system', 'Agent started', model);
  emit({ type: 'step', step: st });
  return touch(c);
}

async function route(method: string, path: string, body: any): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 60));
  const [p, qs] = path.split('?');
  const seg = p.split('/').filter(Boolean); // ['api', ...]
  const q = new URLSearchParams(qs || '');
  if (seg[1] === 'me') return me;
  if (seg[1] === 'models') return models;
  if (seg[1] === 'search') return search(q.get('q') || '');
  if (seg[1] === 'round' && method === 'PUT') { owner(); round = body; emit({ type: 'round', round }); return round; }
  if (seg[1] === 'agents' && seg[2] === 'start') return (body.cardIds as string[]).map((id) => startAgent(need(byId[id]), body.model));
  if (seg[1] === 'chat') {
    if (seg.length === 2) {
      const m: ChatMsg = { id: chatId++, at: Date.now(), author: me.login, text: body.text, cardId: body.cardId, kind: 'text', reactions: {} };
      chat.push(m); emit({ type: 'chat', msg: m });
      if (/@board\b/i.test(body.text)) setTimeout(() => {
        const todo = cards.filter((c) => c.column === 'todo').length, run = cards.filter((c) => c.agent?.state === 'running').length;
        const r: ChatMsg = { id: chatId++, at: Date.now(), author: 'board', text: `@${me.login} ${todo} to do, ${run} agents running. Nobody is on ${cards.filter((c) => c.column === 'todo' && !c.people.length).map((c) => c.title).join(' or ') || 'anything open'}.`, kind: 'text', reactions: {} };
        chat.push(r); emit({ type: 'chat', msg: r });
      }, 1400);
      return m;
    }
    const m = chat.find((x) => x.id === Number(seg[2]));
    if (!m) throw new E(404, 'no message');
    const r = body.reaction as string;
    const list = (m.reactions[r] ||= []);
    const had = list.includes(me.login);
    m.reactions[r] = had ? list.filter((x) => x !== me.login) : [...list, me.login];
    if ((r === 'entered' || r === 'had_it') && m.cardId && byId[m.cardId]) {
      const c = byId[m.cardId];
      for (const x of c.answers) { if (m.answerId && x.id !== m.answerId) continue; if (had) delete x.entered[me.login]; else x.entered[me.login] = Date.now(); }
      sync(c); touch(c);
    }
    emit({ type: 'chat', msg: m });
    return structuredClone(m);
  }
  if (seg[1] === 'cards') {
    if (seg.length === 2 && method === 'POST') {
      owner();
      const c = card({ id: `card-${Date.now()}`, title: body.title, column: 'todo', task: body.task || '', link: body.link || '' }, []);
      cards.push(c); byId[c.id] = c; return touch(c);
    }
    const c = need(byId[seg[2]]);
    const act = seg[3];
    if (!act) {
      if (method === 'DELETE') { owner(); cards.splice(cards.indexOf(c), 1); delete byId[c.id]; emit({ type: 'card_deleted', id: c.id }); return { ok: true }; }
      if (method === 'PATCH') {
        if ((body.title !== undefined || body.task !== undefined)) owner();
        const { answer, ...rest } = body;
        Object.assign(c, rest);
        if (answer) { c.answers.push({ id: `${c.id}-a${Date.now()}`, label: '', value: String(answer), by: me.login, at: Date.now(), entered: {} }); c.allAnswered = true; }
        if (c.allAnswered && c.answers.length && c.column !== 'done') c.column = 'done';
        return touch(sync(c));
      }
    }
    if (act === 'steps') return steps.filter((x) => x.cardId === c.id);
    if (act === 'join') { if (!c.people.includes(me.login)) c.people.push(me.login); return touch(c); }
    if (act === 'leave') { c.people = c.people.filter((x) => x !== me.login); return touch(c); }
    if (act === 'entered') { for (const x of c.answers) { if (body.entered) x.entered[me.login] = Date.now(); else delete x.entered[me.login]; } return touch(sync(c)); }
    if (act === 'answers') {
      if (!seg[4] && method === 'POST') {
        const x = { id: `${c.id}-a${Date.now()}`, label: String(body.label ?? ''), value: String(body.value), by: me.login, at: Date.now(), entered: {} };
        c.answers.push(x); touch(sync(c));
        const m: ChatMsg = { id: chatId++, at: Date.now(), author: 'board', text: `${c.title}${x.label ? `, ${x.label}` : ''}: enter this on your account:`, cardId: c.id, kind: 'answer', answer: x.value, answerId: x.id, answerLabel: x.label, reactions: {} };
        chat.push(m); emit({ type: 'chat', msg: m });
        return structuredClone(c);
      }
      const x = c.answers.find((y) => y.id === seg[4]);
      if (!x) throw new E(404, 'answer not found');
      if (seg[5] === 'entered') { if (body.entered) x.entered[me.login] = Date.now(); else delete x.entered[me.login]; return touch(sync(c)); }
      if (method === 'PATCH') { if (body.label !== undefined) x.label = body.label; if (body.value) { x.value = body.value; x.entered = {}; x.at = Date.now(); } return touch(sync(c)); }
      if (method === 'DELETE') { c.answers = c.answers.filter((y) => y !== x); if (!c.answers.length) c.allAnswered = false; return touch(sync(c)); }
    }
    if (act === 'agent') {
      const a = seg[4];
      if (a === 'start') return startAgent(c, body.model);
      if (!c.agent) throw new E(400, 'no agent');
      if (a === 'stop') { c.agent.state = 'stopped'; c.agent.endedAt = Date.now(); emit({ type: 'step', step: addStep(c.id, 'system', 'Stopped', `by ${me.login}`) }); return touch(c); }
      if (a === 'message') { emit({ type: 'step', step: addStep(c.id, 'human', `${me.login} said`, body.text) }); if (c.agent.state === 'needs_help') { c.agent.state = 'running'; c.agent.question = undefined; } return touch(c); }
      if (a === 'takeover') { Object.assign(c.agent, { state: 'paused', driver: 'human', driverLogin: me.login }); emit({ type: 'step', step: addStep(c.id, 'human', `${me.login} took over`, 'agent paused') }); return touch(c); }
      if (a === 'handback') { Object.assign(c.agent, { state: 'running', driver: 'agent', driverLogin: undefined }); emit({ type: 'step', step: addStep(c.id, 'human', 'Handed back to the agent', body.note || '') }); return touch(c); }
    }
  }
  throw new E(404, `mock has no ${method} ${path}`);
}

// ---- live view ----
const cursors: Record<string, { x: number; y: number; click?: number; tx: number; ty: number }> = {};
const typed: Record<string, string> = {};

function live(cardId: string, fps: number, width: number, h: LiveHandlers): LiveConn {
  const c = byId[cardId];
  const kind = kinds[cardId]?.[0] || 'text';
  const W = Math.min(1280, Math.max(320, width)), H = Math.round(W * 0.625);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d')!;
  const cur = (cursors[cardId] ||= { x: 0.2, y: 0.5, tx: 0.3, ty: 0.6 });
  let rate = fps;
  let alive = true;
  h.onStatus?.('open');
  h.onMeta?.({ type: 'meta', url: c?.link.replace('https://', ''), width: W, height: H, driver: c?.agent?.driver });
  const tick = () => {
    if (!alive) return;
    const t = Date.now();
    if (c?.agent?.driver !== 'human' && agentLive(c)) {
      cur.x += (cur.tx - cur.x) * 0.12; cur.y += (cur.ty - cur.y) * 0.12;
      if (Math.abs(cur.tx - cur.x) < 0.01 && Math.random() < 0.08) { cur.click = t; cur.tx = 0.08 + Math.random() * 0.6; cur.ty = 0.2 + Math.random() * 0.6; }
    }
    drawPage(ctx, kind, W, H, { cursor: cur, t, typed: typed[cardId] });
    cv.toBlob((b) => b && alive && h.onFrame(b), 'image/jpeg', 0.7);
    setTimeout(tick, 1000 / Math.max(1, rate));
  };
  tick();
  return {
    send(i: LiveInput) {
      if (i.type === 'fps') rate = i.fps;
      if (i.type === 'click' || i.type === 'move') { cur.x = cur.tx = i.x; cur.y = cur.ty = i.y; if (i.type === 'click') cur.click = Date.now(); }
      if (i.type === 'text') typed[cardId] = (typed[cardId] || '') + i.text;
      if (i.type === 'key' && i.key === 'Backspace') typed[cardId] = (typed[cardId] || '').slice(0, -1);
    },
    close() { alive = false; },
  };
}
const agentLive = (c?: Card) => !!c?.agent && ['running', 'starting'].includes(c.agent.state);

export const mockTransport: Transport = {
  async request<T>(method: string, path: string, body?: unknown) {
    try { return structuredClone(await route(method, path, body)) as T; }
    catch (e) { throw e instanceof E ? e : new E(500, String(e)); }
  },
  connect(onMsg, onStatus): StateConn {
    listeners.add(onMsg);
    setTimeout(() => {
      onStatus('open');
      onMsg(structuredClone({ type: 'snapshot', me, users, cards, chat, round, models }));
    }, 120);
    return { send: () => {}, close: () => listeners.delete(onMsg) };
  },
  live,
};
