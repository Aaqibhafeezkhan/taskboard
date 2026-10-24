// Search across everything on every card: title, task, text read from screenshots, link, notes, answer, people,
// chat about the card, and every agent step (including the page text its browser actions returned).
import type { SearchHit } from '../shared/types.ts';
import { allCards, allStepsForSearch, chatLog } from './store.ts';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function snippet(text: string, terms: string[]): string | null {
  const low = text.toLowerCase();
  const phrase = terms.join(' ');
  let at = low.indexOf(phrase);
  if (at < 0) {
    if (!terms.every(t => low.includes(t))) return null;
    at = low.indexOf(terms[0]);
  }
  const start = Math.max(0, at - 50), end = Math.min(text.length, at + phrase.length + 70);
  let out = esc(text.slice(start, end).replace(/\s+/g, ' '));
  for (const t of [phrase, ...terms].filter((v, i, a) => v && a.indexOf(v) === i)) {
    out = out.replace(new RegExp(esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), m => `<mark>${m}</mark>`);
    if (out.includes('<mark>')) break;
  }
  return (start > 0 ? '…' : '') + out + (end < text.length ? '…' : '');
}

export function search(q: string): SearchHit[] {
  const terms = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const hits = new Map<string, SearchHit>();
  const cards = new Map(allCards().map(c => [c.id, c]));
  const add = (cardId: string, where: string, text: string, stepId?: number) => {
    const c = cards.get(cardId);
    if (!c || !text) return;
    const s = snippet(text, terms);
    if (!s) return;
    let h = hits.get(cardId);
    if (!h) { h = { cardId, title: c.title, column: c.column, agentState: c.agent?.state ?? null, matches: [] }; hits.set(cardId, h); }
    if (h.matches.length < 5) h.matches.push({ where, snippet: s, stepId });
  };
  for (const c of cards.values()) {
    add(c.id, 'title', c.title);
    add(c.id, 'task', c.task);
    add(c.id, 'screenshots', c.screenshotText);
    add(c.id, 'link', c.link);
    add(c.id, 'notes', c.notes);
    for (const a of c.answers ?? []) add(c.id, a.label ? `answer ${a.label}` : 'answer', a.value);
    add(c.id, 'on it', c.people.join(' '));
  }
  for (const s of allStepsForSearch().reverse()) {
    const label = `agent ${s.kind === 'tool' ? 'step' : s.kind} ${new Date(s.at).toTimeString().slice(0, 5)}`;
    const text = `${s.title} ${s.text}`;
    if (snippet(text, terms)) add(s.cardId, label, text, s.id);
    else if (s.extra) add(s.cardId, `${label} (page)`, s.extra, s.id);
  }
  for (const m of chatLog(1000)) if (m.cardId) add(m.cardId, 'chat', m.text);
  return [...hits.values()].sort((a, b) => b.matches.length - a.matches.length).slice(0, 30);
}
