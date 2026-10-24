// The contract between the Taskboard server and the web app. Both sides import this file.

export type Column = 'todo' | 'working' | 'done';

export type AgentState =
  | 'starting'    // session being created
  | 'running'     // agent is working
  | 'needs_help'  // agent asked a question it can't answer itself
  | 'paused'      // a person took over the browser
  | 'finished'    // agent ended (answer found or gave up)
  | 'stopped'     // stopped by a person (Stop / Delete)
  | 'error';

export interface Shot {
  id: string;
  url: string;        // relative to the app root, e.g. "shots/ab12.png"
  width?: number;
  height?: number;
}

export interface Agent {
  model: string;          // "provider/model", e.g. "claude-code/claude-opus-5-5"
  state: AgentState;
  sessionId?: string;     // Aside session id
  tabId?: string;         // Aside browser tab the agent works in (the live view shows this one)
  startedAt?: number;     // ms
  endedAt?: number;
  lastStep?: string;      // one-line summary of the newest step
  question?: string;      // set while state === 'needs_help'
  driver: 'agent' | 'human';
  driverLogin?: string;   // who took over
  startedBy?: string;
  error?: string;
}

/** One answer a task produced. A task can have any number (Q1, Q2, ...). */
export interface Answer {
  id: string;
  label: string;                   // "Q1", "Part 2", or "" when the task has a single answer
  value: string;                   // exactly what to enter
  by: string;                      // 'agent' or a github login
  at: number;
  entered: Record<string, number>; // login -> ms when they confirmed entering THIS answer
}

export interface Card {
  id: string;
  title: string;
  task: string;            // instructions as read from the screenshots
  screenshotText: string;  // all text read from the screenshots (searchable)
  link: string;
  column: Column;
  position: number;        // order inside the column (ascending)
  people: string[];        // github logins on it
  screenshots: Shot[];
  agent: Agent | null;
  answers: Answer[];       // every answer found so far, in task order
  allAnswered: boolean;    // the agent (or a person) said every question of the task is answered
  // summaries kept in sync by the server, for old code paths and quick checks:
  answer: string | null;   // all answers as one line ("Q1: abc · Q2: def"), null when there are none
  answerBy: string | null;
  answerAt: number | null;
  entered: Record<string, number>; // login -> ms when they had entered EVERY answer of the card
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export type StepKind = 'tool' | 'thought' | 'message' | 'help' | 'answer' | 'system' | 'human';

export interface Step {
  id: number;
  cardId: string;
  at: number;
  kind: StepKind;
  title: string;  // short, e.g. 'Click "reset link"'
  text: string;   // detail, e.g. 'on /account/recover'
}

export interface User {
  login: string;
  name: string;
  color: string;           // hex, stable per person
  role: 'owner' | 'member';
  online: boolean;
}

export interface ChatMsg {
  id: number;
  at: number;
  author: string;          // github login, or 'board' for the board agent
  text: string;            // plain text; @login mentions are literal "@login"
  cardId?: string;         // card it is about
  kind: 'text' | 'answer'; // 'answer' = board agent announcing a found answer
  answer?: string;         // for kind 'answer': the value to enter
  answerId?: string;       // which Answer of the card this message announces
  answerLabel?: string;    // its label ("Q2"), '' for a single answer
  images?: string[];       // attached images, relative urls like "shots/ab12.png"
  reactions: Record<string, string[]>; // emoji or 'entered' / 'had_it' -> logins
}

export interface Round {
  name: string;            // e.g. "Practice round"
  endsAt: number | null;   // ms; null = no timer
  practice: boolean;
}

export interface ModelOption {
  id: string;              // "asideProvider/model", e.g. "claude-code/claude-opus-5-5"
  label: string;           // "Claude Opus 5.5"
  provider: string;        // "Claude", "ChatGPT", "Grok", ...
  group?: string;          // menu group, e.g. "Claude" or "Claude · Work account"
}

export interface SearchHit {
  cardId: string;
  title: string;
  column: Column;
  agentState: AgentState | null;
  matches: { where: string; snippet: string; stepId?: number }[]; // snippet has the match wrapped in <mark>…</mark>
}

// ---- WebSocket /ws (JSON) ----
export type ServerMsg =
  | { type: 'snapshot'; me: User; users: User[]; cards: Card[]; chat: ChatMsg[]; round: Round; models: ModelOption[]; modelNotes?: string[] }
  | { type: 'models'; models: ModelOption[]; notes: string[] }   // the model list changed
  | { type: 'card'; card: Card }
  | { type: 'card_deleted'; id: string }
  | { type: 'step'; step: Step }
  | { type: 'chat'; msg: ChatMsg }
  | { type: 'presence'; users: User[] }
  | { type: 'round'; round: Round }
  | { type: 'typing'; login: string };

export type ClientMsg = { type: 'typing' } | { type: 'ping' };

// ---- WebSocket /ws/live?card=<id>&fps=<n>&w=<maxWidth> ----
// Server -> client: binary messages, each one JPEG frame; plus JSON text {type:'meta', url, width, height, driver}.
// Client -> server (JSON text), coordinates normalised 0..1 of the frame:
export type LiveInput =
  | { type: 'click'; x: number; y: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'scroll'; x: number; y: number; dy: number }
  | { type: 'text'; text: string }
  | { type: 'key'; key: string }       // "Enter", "Tab", "Backspace", "Escape", "ArrowDown", ...
  | { type: 'fps'; fps: number };

// ---- REST (JSON unless noted), all under the app root ----
// GET    api/me                         -> User
// GET    api/state                      -> same payload as the 'snapshot' message
// POST   api/cards                      (owner) {title, task, link?, notes?, screenshotText?} -> Card
// POST   api/cards/:id/screenshots      (owner) raw image body, Content-Type image/* -> Card
// PATCH  api/cards/:id                  {column?, position?, notes?, link?, allAnswered?} (+ title/task owner only) -> Card
// DELETE api/cards/:id                  (owner) stops its agent -> {ok}
// POST   api/cards/:id/read             (owner) {overwrite?} read the screenshots, fill title/task/link -> Card
// DELETE api/cards/:id/screenshots/:sid (owner) -> Card
// POST   api/cards/:id/join | leave     -> Card
// POST   api/cards/:id/entered          {entered: boolean} -> Card   (all answers of the card at once)
// POST   api/cards/:id/answers          {label?, value} -> Card       (add an answer by hand)
// PATCH  api/cards/:id/answers/:aid     {label?, value?} -> Card
// DELETE api/cards/:id/answers/:aid     -> Card
// POST   api/cards/:id/answers/:aid/entered {entered: boolean} -> Card
// GET    api/cards/:id/steps            -> Step[]
// POST   api/cards/:id/agent/start      {model} -> Card      (owner, or someone on the card)
// POST   api/cards/:id/agent/stop       -> Card
// POST   api/cards/:id/agent/message    {text} -> Card       (tell the agent something)
// POST   api/cards/:id/agent/takeover   -> Card              (agent pauses, you drive)
// POST   api/cards/:id/agent/handback   {note?} -> Card      (agent continues)
// POST   api/agents/start               {cardIds: string[], model} -> Card[]
// GET    api/search?q=                  -> SearchHit[]
// POST   api/uploads                    raw image body (any member) -> {url}   (for chat images)
// POST   api/chat                       {text, cardId?, images?} -> ChatMsg
// DELETE api/chat                       (owner) clear the whole chat
// POST   api/chat/:id/react             {reaction} -> ChatMsg   (toggle; 'entered' also marks the card as entered)
// PUT    api/round                      (owner) Round -> Round
// GET    api/models                     -> ModelOption[]
