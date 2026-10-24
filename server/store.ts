// Everything the board knows, kept in memory and written through to one SQLite file (data/taskboard.db).
import { Database } from 'bun:sqlite';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import type { Card, ChatMsg, Round, Step, StepKind, User } from '../shared/types.ts';
import { config, defaultTeam, palette } from './config.ts';

const db = new Database(path.join(config.dataDir, 'taskboard.db'), { create: true });
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT, card_id TEXT NOT NULL, at INTEGER NOT NULL,
    kind TEXT NOT NULL, title TEXT NOT NULL, text TEXT NOT NULL, extra TEXT NOT NULL DEFAULT '');
  CREATE INDEX IF NOT EXISTS steps_card ON steps(card_id, id);
  CREATE TABLE IF NOT EXISTS chat (id INTEGER PRIMARY KEY AUTOINCREMENT, json TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

type Listener = (msg: any) => void;
const listeners = new Set<Listener>();
export const onChange = (fn: Listener) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (msg: any) => { for (const fn of listeners) fn(msg); };
export const broadcast = emit;

// ---------- people ----------
function loadTeam(): Record<string, string> {
  const f = path.join(config.dataDir, 'team.json');
  let extra: Record<string, string> = {};
  try { if (existsSync(f)) extra = JSON.parse(readFileSync(f, 'utf8')); } catch {}
  const saved = kvGet<Record<string, string>>('team', {});
  return { ...defaultTeam(), ...saved, ...extra };
}
const team = loadTeam();
const online = new Map<string, number>(); // login -> open sockets

export function ensureUser(login: string) {
  if (!team[login]) { team[login] = login; kvSet('team', team); emit({ type: 'presence', users: users() }); }
}
export function user(login: string): User {
  const logins = Object.keys(team);
  const i = Math.max(0, logins.indexOf(login));
  return {
    login, name: team[login] ?? login, color: palette[i % palette.length],
    role: login === config.owner ? 'owner' : 'member', online: (online.get(login) ?? 0) > 0,
  };
}
export const users = (): User[] => Object.keys(team).map(user);
export const teamLogins = () => Object.keys(team);
export function setOnline(login: string, delta: number) {
  online.set(login, Math.max(0, (online.get(login) ?? 0) + delta));
  emit({ type: 'presence', users: users() });
}

// ---------- kv ----------
function kvGet<T>(key: string, d: T): T {
  const r = db.query('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | null;
  return r ? JSON.parse(r.value) : d;
}
function kvSet(key: string, v: unknown) {
  db.query('INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(v));
}

// ---------- round ----------
let round: Round = kvGet<Round>('round', { name: 'Practice round', endsAt: null, practice: true });
export const getRound = () => round;
export function setRound(r: Round) { round = r; kvSet('round', r); emit({ type: 'round', round }); return round; }

// ---------- cards ----------
const cards = new Map<string, Card>();
for (const r of db.query('SELECT json FROM cards').all() as { json: string }[]) {
  const c = JSON.parse(r.json) as Card;
  if (!Array.isArray(c.answers)) { // cards from before multiple answers
    c.answers = c.answer ? [{ id: 'a1', label: '', value: c.answer, by: c.answerBy ?? 'agent', at: c.answerAt ?? c.updatedAt, entered: { ...(c.entered ?? {}) } }] : [];
    c.allAnswered = !!c.answer;
  }
  cards.set(c.id, c);
}

/** Keep the summary fields (answer, answerBy, answerAt, entered) in line with card.answers. */
export function syncAnswers(c: Card) {
  const a = c.answers;
  c.answer = a.length ? a.map(x => (x.label ? `${x.label}: ${x.value}` : x.value)).join(' · ') : null;
  c.answerBy = a.length ? a[a.length - 1].by : null;
  c.answerAt = a.length ? Math.max(...a.map(x => x.at)) : null;
  const logins = new Set(a.flatMap(x => Object.keys(x.entered)));
  c.entered = {};
  if (a.length) for (const l of logins) if (a.every(x => x.entered[l])) c.entered[l] = Math.max(...a.map(x => x.entered[l]));
}

const norm = (l: string) => l.trim().replace(/[\s.:)(]+/g, '').toUpperCase();
/** Add or replace an answer; returns it and whether it is new or changed. */
export function upsertAnswer(c: Card, label: string, value: string, by: string) {
  value = value.trim().replace(/^`+|`+$/g, '').slice(0, 500);
  label = label.trim().slice(0, 40);
  let a = c.answers.find(x => norm(x.label) === norm(label));
  if (a && a.value === value) return { answer: a, changed: false };
  if (a) { a.value = value; a.by = by; a.at = Date.now(); a.entered = {}; }
  else { a = { id: crypto.randomUUID().slice(0, 6), label, value, by, at: Date.now(), entered: {} }; c.answers.push(a); }
  syncAnswers(c);
  return { answer: a, changed: true };
}
const saveStmt = db.query('INSERT INTO cards(id, json) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json');

export const allCards = () => [...cards.values()].sort((a, b) => a.position - b.position);
export const getCard = (id: string) => cards.get(id);
export function putCard(c: Card) {
  c.updatedAt = Date.now();
  cards.set(c.id, c);
  saveStmt.run(c.id, JSON.stringify(c));
  emit({ type: 'card', card: c });
  return c;
}
export function deleteCard(id: string) {
  cards.delete(id);
  db.query('DELETE FROM cards WHERE id = ?').run(id);
  db.query('DELETE FROM steps WHERE card_id = ?').run(id);
  emit({ type: 'card_deleted', id });
  sweepShots();
}
export function nextPosition(column: Card['column']) {
  const inCol = allCards().filter(c => c.column === column);
  return inCol.length ? Math.max(...inCol.map(c => c.position)) + 1 : 1;
}
export function createCard(b: Partial<Card>): Card {
  const now = Date.now();
  return putCard({
    id: crypto.randomUUID().slice(0, 8), title: String(b.title || 'Untitled task').slice(0, 200), task: String(b.task || ''),
    screenshotText: String(b.screenshotText || ''), link: String(b.link || ''), column: 'todo', position: nextPosition('todo'),
    people: [], screenshots: [], agent: null, answers: [], allAnswered: false, answer: null, answerBy: null, answerAt: null, entered: {},
    notes: String(b.notes || ''), createdAt: now, updatedAt: now,
  });
}
/** Attach an already saved image (url "shots/<file>.png") to a card as a screenshot. */
export function addScreenshot(id: string, url: string) {
  const file = path.join(config.dataDir, url);
  const dims = (() => { try { const b = readFileSync(file); return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }; } catch { return {}; } })();
  return updateCard(id, c => { c.screenshots.push({ id: path.basename(url, '.png'), url, ...dims }); });
}
export function updateCard(id: string, fn: (c: Card) => void) {
  const c = cards.get(id);
  if (!c) return null;
  fn(c);
  return putCard(c);
}

// ---------- steps ----------
// `extra` is searchable text that is not shown (e.g. the page text a tool call returned).
export function addStep(cardId: string, kind: StepKind, title: string, text = '', extra = '', at = Date.now()): Step {
  const r = db.query('INSERT INTO steps(card_id, at, kind, title, text, extra) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .get(cardId, at, kind, title.slice(0, 300), text.slice(0, 4000), extra.slice(0, 6000)) as { id: number };
  const step: Step = { id: r.id, cardId, at, kind, title: title.slice(0, 300), text: text.slice(0, 4000) };
  emit({ type: 'step', step });
  return step;
}
export function setStepExtra(id: number, extra: string) {
  db.query('UPDATE steps SET extra = ? WHERE id = ?').run(extra.slice(0, 6000), id);
}
export function steps(cardId: string): Step[] {
  return db.query('SELECT id, card_id as cardId, at, kind, title, text FROM steps WHERE card_id = ? ORDER BY id').all(cardId) as Step[];
}
export function allStepsForSearch(): (Step & { extra: string })[] {
  return db.query('SELECT id, card_id as cardId, at, kind, title, text, extra FROM steps ORDER BY id').all() as any;
}

// ---------- chat ----------
const chat: ChatMsg[] = (db.query('SELECT json FROM chat ORDER BY id').all() as { json: string }[]).map(r => JSON.parse(r.json));
export const chatLog = (limit = 300) => chat.slice(-limit);
export function addChat(m: Omit<ChatMsg, 'id' | 'at' | 'reactions'> & { reactions?: ChatMsg['reactions'] }): ChatMsg {
  const msg: ChatMsg = { id: 0, at: Date.now(), reactions: {}, ...m };
  const r = db.query('INSERT INTO chat(json) VALUES (?) RETURNING id').get('{}') as { id: number };
  msg.id = r.id;
  db.query('UPDATE chat SET json = ? WHERE id = ?').run(JSON.stringify(msg), msg.id);
  chat.push(msg);
  emit({ type: 'chat', msg });
  return msg;
}
export function clearChat() {
  chat.length = 0;
  db.exec('DELETE FROM chat');
  sweepShots();
}

/** Remove image files no card and no chat message uses any more (older than a minute, so fresh uploads survive). */
export function sweepShots() {
  const used = new Set<string>();
  for (const c of cards.values()) for (const s of c.screenshots) used.add(path.basename(s.url));
  for (const m of chat) for (const u of m.images ?? []) used.add(path.basename(u));
  const dir = path.join(config.dataDir, 'shots');
  for (const f of readdirSync(dir)) {
    const full = path.join(dir, f);
    try { if (!used.has(f) && Date.now() - statSync(full).mtimeMs > 60_000) unlinkSync(full); } catch {}
  }
}
export function updateChat(id: number, fn: (m: ChatMsg) => void) {
  const m = chat.find(x => x.id === id);
  if (!m) return null;
  fn(m);
  db.query('UPDATE chat SET json = ? WHERE id = ?').run(JSON.stringify(m), m.id);
  emit({ type: 'chat', msg: m });
  return m;
}
