import { create } from 'zustand';
import type { Card, ChatMsg, Column, ModelOption, Round, SearchHit, ServerMsg, Step, User } from '../../../shared/types.ts';
import type { StateConn, Transport } from '../api/transport.ts';

export type View = 'board' | 'wall';
export type Filter = 'everyone' | 'mine' | 'running' | 'nobody';

export interface Toast { id: number; title: string; tone?: 'ok' | 'warn' | 'bad' | 'info' }

interface S {
  transport: Transport | null;
  conn: StateConn | null;
  status: 'connecting' | 'open' | 'closed';
  me: User | null;
  users: User[];
  cards: Record<string, Card>;
  chat: ChatMsg[];
  round: Round;
  models: ModelOption[];
  modelNotes: string[];
  steps: Record<string, Step[]>;
  typing: Record<string, number>;
  // ui
  view: View;
  filter: Filter;
  selected: string[];
  openCardId: string | null;
  openStepId: number | null;
  highlight: string;
  liveCardId: string | null;
  searchOpen: boolean;
  chatOpen: boolean;
  mentionedAt: number;
  celebrate: { cardId: string; at: number } | null;
  toasts: Toast[];
  lastModel: string;

  init(t: Transport): void;
  apply(m: ServerMsg): void;
  set(p: Partial<S>): void;
  toast(title: string, tone?: Toast['tone']): void;

  api<T>(method: string, path: string, body?: unknown): Promise<T>;
  moveCard(id: string, column: Column, position: number): Promise<void>;
  patchCard(id: string, patch: Partial<Pick<Card, 'column' | 'position' | 'notes' | 'answer' | 'link' | 'title' | 'task' | 'allAnswered'>>): Promise<void>;
  join(id: string): Promise<void>;
  leave(id: string): Promise<void>;
  setEntered(id: string, entered: boolean): Promise<void>;
  setAnswerEntered(id: string, answerId: string, entered: boolean): Promise<void>;
  addAnswer(id: string, label: string, value: string): Promise<void>;
  patchAnswer(id: string, answerId: string, patch: { label?: string; value?: string }): Promise<void>;
  deleteAnswer(id: string, answerId: string): Promise<void>;
  startAgent(id: string, model: string): Promise<void>;
  startAgents(ids: string[], model: string): Promise<void>;
  stopAgent(id: string): Promise<void>;
  messageAgent(id: string, text: string): Promise<void>;
  takeover(id: string): Promise<void>;
  handback(id: string, note?: string): Promise<void>;
  deleteCard(id: string): Promise<void>;
  loadSteps(id: string): Promise<void>;
  sendChat(text: string, cardId?: string, images?: string[]): Promise<void>;
  uploadImage(file: Blob): Promise<string>;
  createTask(fields: { title?: string; task?: string; link?: string; notes?: string }, files: Blob[], read: boolean): Promise<Card | null>;
  newTask: { open: boolean; files: File[] };
  react(msgId: number, reaction: string): Promise<void>;
  search(q: string): Promise<SearchHit[]>;
}

const upsert = (s: S, c: Card) => ({ cards: { ...s.cards, [c.id]: c } });

/** Optimistic: mark my "entered" on one answer (or all), and recompute the card's "entered every answer" map. */
function markMine(c: Card, me: string, entered: boolean, answerId?: string): Card {
  const answers = (c.answers ?? []).map((a) => {
    if (answerId && a.id !== answerId) return a;
    const e = { ...a.entered };
    if (entered) e[me] = e[me] ?? Date.now(); else delete e[me];
    return { ...a, entered: e };
  });
  const all: Record<string, number> = {};
  if (answers.length) {
    const logins = new Set(answers.flatMap((a) => Object.keys(a.entered)));
    for (const l of logins) if (answers.every((a) => a.entered[l])) all[l] = Date.now();
  }
  return { ...c, answers, entered: answers.length ? all : c.entered };
}

export const useStore = create<S>((set, get) => ({
  transport: null,
  conn: null,
  status: 'connecting',
  me: null,
  users: [],
  cards: {},
  chat: [],
  round: { name: 'Taskboard', endsAt: null, practice: true },
  models: [],
  modelNotes: [],
  steps: {},
  typing: {},
  view: 'board',
  filter: 'everyone',
  selected: [],
  openCardId: null,
  openStepId: null,
  highlight: '',
  liveCardId: null,
  searchOpen: false,
  chatOpen: false,
  mentionedAt: 0,
  celebrate: null,
  toasts: [],
  lastModel: localStorage.getItem('tb.model') || '',

  init(t) {
    const conn = t.connect((m) => get().apply(m), (st) => set({ status: st }));
    set({ transport: t, conn });
  },

  apply(m) {
    const s = get();
    switch (m.type) {
      case 'models':
        set({ models: m.models, modelNotes: m.notes });
        break;
      case 'snapshot': {
        const cards: Record<string, Card> = {};
        m.cards.forEach((c) => (cards[c.id] = c));
        set({ me: m.me, users: m.users, cards, chat: m.chat, round: m.round, models: m.models, modelNotes: m.modelNotes ?? [] });
        break;
      }
      case 'card': {
        const prev = s.cards[m.card.id];
        if (prev && !prev.allAnswered && m.card.allAnswered) set({ celebrate: { cardId: m.card.id, at: Date.now() } });
        if (prev) {
          const known = new Set((prev.answers ?? []).map((a) => a.id));
          for (const a of m.card.answers ?? []) if (!known.has(a.id)) s.toast(`${m.card.title}: ${a.label ? `${a.label} found` : 'answer found'}`, 'ok');
        }
        set(upsert(s, m.card));
        break;
      }
      case 'card_deleted': {
        const cards = { ...s.cards };
        delete cards[m.id];
        set({
          cards,
          selected: s.selected.filter((x) => x !== m.id),
          openCardId: s.openCardId === m.id ? null : s.openCardId,
          liveCardId: s.liveCardId === m.id ? null : s.liveCardId,
        });
        break;
      }
      case 'step': {
        const list = s.steps[m.step.cardId];
        if (list && !list.some((x) => x.id === m.step.id)) set({ steps: { ...s.steps, [m.step.cardId]: [...list, m.step] } });
        break;
      }
      case 'chat': {
        const i = s.chat.findIndex((x) => x.id === m.msg.id);
        const chat = i >= 0 ? s.chat.map((x) => (x.id === m.msg.id ? m.msg : x)) : [...s.chat, m.msg];
        const me = s.me?.login;
        const mentioned = i < 0 && !!me && m.msg.author !== me && new RegExp(`@${me}\\b`, 'i').test(m.msg.text);
        set({ chat, ...(mentioned ? { mentionedAt: Date.now() } : {}) });
        break;
      }
      case 'presence':
        set({ users: m.users });
        break;
      case 'round':
        set({ round: m.round });
        break;
      case 'typing':
        set({ typing: { ...s.typing, [m.login]: Date.now() } });
        break;
    }
  },

  set: (p) => set(p),

  toast(title, tone = 'info') {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, title, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 4200);
  },

  async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const t = get().transport!;
    try {
      return await t.request<T>(method, path, body);
    } catch (e) {
      get().toast(e instanceof Error ? `Didn't work: ${e.message}` : "Didn't work", 'bad');
      throw e;
    }
  },

  async moveCard(id, column, position) {
    const s = get();
    const c = s.cards[id];
    if (!c) return;
    set(upsert(s, { ...c, column, position })); // optimistic
    const card = await s.api<Card>('PATCH', `api/cards/${id}`, { column, position }).catch(() => null);
    if (card) set(upsert(get(), card));
    else set(upsert(get(), c));
  },

  async patchCard(id, patch) {
    const card = await get().api<Card>('PATCH', `api/cards/${id}`, patch);
    set(upsert(get(), card));
  },
  async join(id) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/join`))); },
  async leave(id) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/leave`))); },
  async setEntered(id, entered) {
    const s = get();
    const c = s.cards[id];
    const me = s.me?.login;
    if (c && me) set(upsert(s, markMine(c, me, entered)));
    set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/entered`, { entered })));
  },
  async setAnswerEntered(id, answerId, entered) {
    const s = get();
    const c = s.cards[id];
    const me = s.me?.login;
    if (c && me) set(upsert(s, markMine(c, me, entered, answerId)));
    set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/answers/${answerId}/entered`, { entered })));
  },
  async addAnswer(id, label, value) {
    set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/answers`, { label, value })));
  },
  async patchAnswer(id, answerId, patch) {
    set(upsert(get(), await get().api<Card>('PATCH', `api/cards/${id}/answers/${answerId}`, patch)));
  },
  async deleteAnswer(id, answerId) {
    set(upsert(get(), await get().api<Card>('DELETE', `api/cards/${id}/answers/${answerId}`)));
  },
  async startAgent(id, model) {
    localStorage.setItem('tb.model', model);
    set({ lastModel: model });
    set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/agent/start`, { model })));
  },
  async startAgents(ids, model) {
    localStorage.setItem('tb.model', model);
    set({ lastModel: model });
    const cards = await get().api<Card[]>('POST', 'api/agents/start', { cardIds: ids, model });
    const next = { ...get().cards };
    cards.forEach((c) => (next[c.id] = c));
    set({ cards: next, selected: [] });
  },
  async stopAgent(id) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/agent/stop`))); },
  async messageAgent(id, text) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/agent/message`, { text }))); },
  async takeover(id) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/agent/takeover`))); },
  async handback(id, note) { set(upsert(get(), await get().api<Card>('POST', `api/cards/${id}/agent/handback`, { note }))); },
  async deleteCard(id) {
    await get().api('DELETE', `api/cards/${id}`);
    get().apply({ type: 'card_deleted', id });
  },
  async loadSteps(id) {
    const steps = await get().api<Step[]>('GET', `api/cards/${id}/steps`);
    set({ steps: { ...get().steps, [id]: steps } });
  },
  newTask: { open: false, files: [] },
  async uploadImage(file) {
    const r = await get().api<{ url: string }>('POST', 'api/uploads', file);
    return r.url;
  },
  async createTask(fields, files, read) {
    const reading = read && files.length > 0;
    const title = fields.title?.trim() || (reading ? 'Reading screenshots…' : 'New task');
    let card = await get().api<Card>('POST', 'api/cards', { ...fields, title });
    for (const f of files) card = await get().api<Card>('POST', `api/cards/${card.id}/screenshots`, f);
    get().apply({ type: 'card', card });
    if (reading) {
      get().toast('Reading the screenshots…', 'info');
      get().api<Card>('POST', `api/cards/${card.id}/read`, {})
        .then((c) => { if (c) { get().apply({ type: 'card', card: c }); get().toast(`${c.title} is ready`, 'ok'); } })
        .catch(() => {});
    }
    return card;
  },
  async sendChat(text, cardId, images) {
    const msg = await get().api<ChatMsg>('POST', 'api/chat', { text, cardId, ...(images?.length ? { images } : {}) });
    get().apply({ type: 'chat', msg });
  },
  async react(msgId, reaction) {
    const msg = await get().api<ChatMsg>('POST', `api/chat/${msgId}/react`, { reaction });
    get().apply({ type: 'chat', msg });
  },
  async search(q) {
    return get().transport!.request<SearchHit[]>('GET', `api/search?q=${encodeURIComponent(q)}`);
  },
}));

// ---- derived helpers ----
export const userColor = (users: User[], login: string) => users.find((u) => u.login === login)?.color || '#a1a1aa';
export const userName = (users: User[], login: string) => {
  const u = users.find((x) => x.login === login);
  return u ? u.login : login;
};
export const isOnCard = (me: User | null, c: Card) => !!me && c.people.includes(me.login);
export const canDrive = (me: User | null, c: Card) => !!me && (me.role === 'owner' || c.people.includes(me.login));
export const modelLabel = (models: ModelOption[], id: string) => models.find((m) => m.id === id)?.label || id.split('/').pop() || id;
export const agentActive = (c: Card) => !!c.agent && ['starting', 'running', 'needs_help', 'paused'].includes(c.agent.state);

/** Soft tint of a hex colour, for name chips. */
export function tint(hex: string, alpha = 0.16): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
export function shade(hex: string, f = 0.45): string {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const c = (v: number) => Math.round(v * (1 - f)).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

export function since(ms?: number, now = Date.now()): string {
  if (!ms) return '';
  const m = Math.max(0, Math.floor((now - ms) / 60000));
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
