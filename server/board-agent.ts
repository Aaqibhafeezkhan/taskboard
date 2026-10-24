// The board agent: one voice in the team chat that knows the whole board.
// It announces answers, nudges people who haven't entered them, and answers @board questions.
// It only talks: it runs Claude with no tools at all.
import type { Answer, Card } from '../shared/types.ts';
import { config } from './config.ts';
import { syncAnswers } from './store.ts';
import { addChat, addScreenshot, addStep, allCards, broadcast, chatLog, createCard, getCard, getRound, teamLogins, updateCard, user } from './store.ts';
import { defaultModel } from './config.ts';
import { currentModels } from './providers.ts';
import { startAgent, stopAgent } from './agents.ts';
import { readScreenshots } from './reader.ts';

const missing = (c: Card) => teamLogins().filter(l => !c.entered[l]);
const missingFor = (a: Answer) => teamLogins().filter(l => !a.entered[l]);
const mentions = (logins: string[]) => logins.map(l => '@' + l).join(' ');

const reminders = new Map<string, ReturnType<typeof setTimeout>>();

/** One chat message per answer, as soon as it is found, so people can enter Q1 while the agent works on Q2. */
export function announceAnswer(card: Card, a: Answer) {
  const what = a.label ? `${card.title}, ${a.label}` : card.title;
  addChat({
    author: 'board', kind: 'answer', cardId: card.id, answer: a.value, answerId: a.id, answerLabel: a.label,
    text: `${what}: enter this on your account:`, // the app shows who is still missing under the answer
  });
  scheduleReminder(card.id);
}

export function announceDone(card: Card) {
  if (card.answers.length > 1) addChat({ author: 'board', kind: 'text', cardId: card.id, text: `${card.title} is done: all ${card.answers.length} answers are in.` });
}

export function announceHelp(card: Card) {
  const who = card.people.length ? mentions(card.people) + ' ' : '';
  addChat({ author: 'board', kind: 'text', cardId: card.id, text: `${who}the agent on ${card.title} needs help: ${card.agent?.question ?? ''}` });
}

/** One nudge, 4 minutes after an answer lands, for whoever still hasn't entered it. */
function scheduleReminder(cardId: string) {
  clearTimeout(reminders.get(cardId));
  reminders.set(cardId, setTimeout(() => {
    reminders.delete(cardId);
    const c = getCard(cardId);
    if (!c?.answers.length) return;
    const left = missing(c);
    if (left.length) addChat({ author: 'board', kind: 'text', cardId, text: `${mentions(left)} still need to enter ${c.answers.length > 1 ? 'the answers' : c.answers[0].value} for ${c.title}. Tap 👍 when done.` });
  }, 4 * 60_000));
}

/** Someone confirmed they entered a card's answers: all of them, or one (answerId). */
export function markEntered(cardId: string, login: string, entered = true, answerId?: string) {
  return updateCard(cardId, c => {
    for (const a of c.answers) {
      if (answerId && a.id !== answerId) continue;
      if (entered) a.entered[login] = a.entered[login] ?? Date.now();
      else delete a.entered[login];
    }
    syncAnswers(c);
  });
}

let busy = false;
type Action =
  | { type: 'create_card'; title?: string; task?: string; link?: string; useImages?: boolean; startModel?: string | null }
  | { type: 'start_agent'; card: string; model?: string }
  | { type: 'stop_agent'; card: string };

/** A teammate wrote @board: answer, and do what they asked if the board's rules allow it for them. */
let queue: Promise<void> = Promise.resolve();
export function answerQuestion(question: string, from: string, images: string[] = []) {
  queue = queue.then(() => handle(question, from, images)); // one at a time, nobody gets dropped
  return queue;
}

async function handle(question: string, from: string, images: string[]) {
  busy = true;
  const typing = setInterval(() => broadcast({ type: 'typing', login: 'board' }), 2500);
  broadcast({ type: 'typing', login: 'board' });
  try {
    const round = getRound();
    const board = {
      you_are_talking_to: { login: from, isOwner: from === config.owner },
      attachedImages: images.length,
      models: currentModels().map(m => ({ id: m.id, label: m.label, account: m.group })),
      round: { ...round, minutesLeft: round.endsAt ? Math.round((round.endsAt - Date.now()) / 60000) : null },
      team: teamLogins().map(l => ({ login: l, name: user(l).name, online: user(l).online })),
      cards: allCards().map(c => ({
        title: c.title, column: c.column, people: c.people, link: c.link,
        agent: c.agent ? { model: c.agent.model, state: c.agent.state, lastStep: c.agent.lastStep, question: c.agent.question } : null,
        answers: c.answers.map(a => ({ label: a.label, value: a.value, enteredBy: Object.keys(a.entered), stillMissing: missingFor(a) })),
        allAnswered: c.allAnswered,
      })),
      recentChat: chatLog(30).map(m => `${m.author}: ${m.text}${m.images?.length ? ` [${m.images.length} image(s)]` : ''}`),
    };
    const sys = `You are "board", the board agent in a small team's chat during a timed event. You see the whole task board as JSON on stdin.
Reply with ONLY one JSON object, no prose around it: {"reply": "...", "actions": [...]}.
"reply": 1-3 short, friendly sentences in plain words. Use @login to address people. Name cards by their exact title, without quotes.
"actions": what to do on the board, only when the teammate asks for it, otherwise []. Possible actions:
- {"type":"create_card","title":"short title","task":"the task written out","link":"url or empty","useImages":true|false,"startModel":"model id or null"}
  Creates a task card in To do. useImages=true attaches the images from this message as the card's screenshots and reads them
  (then title/task may be left empty). startModel starts an agent on it right away (only if they asked for that).
  Only the owner may create cards (you_are_talking_to.isOwner). If someone else asks, say only the owner can add tasks.
- {"type":"start_agent","card":"exact card title","model":"model id"}  (default model: ${defaultModel})
- {"type":"stop_agent","card":"exact card title"}
Never invent cards, answers or codes. The board itself enforces who may do what.`;
    const p = Bun.spawn([config.claudeBin, '-p', '--model', config.boardModel, '--tools', '', '--output-format', 'text',
      '--append-system-prompt', sys, `${from} says: ${question || '(no text)'}`], { stdin: new Blob([JSON.stringify(board)]), stdout: 'pipe', stderr: 'pipe' });
    const timer = setTimeout(() => p.kill(), 60_000);
    const out = (await new Response(p.stdout).text()).trim();
    clearTimeout(timer);
    let reply = out, actions: Action[] = [];
    const m = out.match(/\{[\s\S]*\}/);
    if (m) { try { const j = JSON.parse(m[0]); reply = String(j.reply ?? ''); actions = Array.isArray(j.actions) ? j.actions : []; } catch {} }
    const done: string[] = [];
    for (const a of actions.slice(0, 10)) {
      try { const r = await act(a, from, images); if (r) done.push(r); } catch (e: any) { done.push(`Couldn't do that: ${e.message}`); }
    }
    const text = [reply, ...done].filter(Boolean).join('\n');
    addChat({ author: 'board', kind: 'text', text: text || `Sorry @${from}, I couldn't answer that just now.` });
  } catch {
    addChat({ author: 'board', kind: 'text', text: `Sorry @${from}, I couldn't answer that just now.` });
  } finally {
    clearInterval(typing);
    busy = false;
  }
}

const byTitle = (t: string) => {
  const all = allCards();
  return all.find(c => c.title === t) ?? all.find(c => c.title.toLowerCase() === String(t).toLowerCase());
};
const modelOk = (id?: string | null) => (id && currentModels().some(m => m.id === id) ? id : currentModels().some(m => m.id === defaultModel) ? defaultModel : currentModels()[0]?.id ?? defaultModel);

async function act(a: Action, from: string, images: string[]): Promise<string | null> {
  const owner = from === config.owner;
  if (a.type === 'create_card') {
    if (!owner) return `Only ${user(config.owner).name} can add tasks.`;
    const withImages = !!a.useImages && images.length > 0;
    const card = createCard({ title: a.title || (withImages ? 'Reading screenshots…' : 'New task'), task: a.task ?? '', link: a.link ?? '' });
    for (const url of withImages ? images : []) addScreenshot(card.id, url);
    addStep(card.id, 'system', `Created from chat by ${from}`, '');
    const start = async () => {
      if (withImages) await readScreenshots(card.id);
      if (a.startModel) { updateCard(card.id, c => { if (!c.people.includes(from)) c.people.push(from); }); await startAgent(card.id, modelOk(a.startModel), from); }
    };
    start();
    return `Added ${withImages ? 'a new card from your screenshots' : card.title} to To do${a.startModel ? ' and started its agent' : ''}.`;
  }
  const c = byTitle(a.card);
  if (!c) return `I can't find a card called ${a.card}.`;
  if (!owner && c.people.length && !c.people.includes(from)) return `Only people on ${c.title} can do that. Join it first.`;
  if (a.type === 'start_agent') {
    updateCard(c.id, x => { if (!x.people.includes(from)) x.people.push(from); });
    await startAgent(c.id, modelOk(a.model), from);
    return null;
  }
  if (a.type === 'stop_agent') { await stopAgent(c.id, from); return null; }
  return null;
}
