// Settings. Everything comes from the environment (see .env.example), so one folder runs anywhere.
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ModelOption } from '../shared/types.ts';

const root = path.resolve(import.meta.dir, '..');
const env = (k: string, d = '') => process.env[k] ?? d;
const expand = (p: string) => p.replace(/^~(?=$|\/)/, homedir());

const dataDir = path.resolve(root, expand(env('TASKBOARD_DATA', 'data')));

export const config = {
  root,
  port: Number(env('PORT', '8823')),
  host: env('HOST', '127.0.0.1'),
  dataDir,
  webDist: path.resolve(root, 'web/dist'),
  // Serve under a sub-path (e.g. "/taskboard" behind a shared domain). The web app uses relative URLs, so only the
  // server needs to know.
  basePath: env('TASKBOARD_BASE_PATH').replace(/\/+$/, ''),

  // 'open':   built-in sign-in page. People pick their name from the team list and enter TASKBOARD_PASSCODE.
  // 'header': trust the X-Auth-Request-User header set by a reverse proxy in front (oauth2-proxy, Caddy, Pomerium...).
  //           Only safe when nothing but that proxy can reach the server.
  auth: env('TASKBOARD_AUTH', 'open') as 'header' | 'open',
  passcode: env('TASKBOARD_PASSCODE'),
  owner: env('TASKBOARD_OWNER', 'owner'),
  ownerName: env('TASKBOARD_OWNER_NAME'),
  // Team as "login:Name,login2:Name2". More people: data/team.json ({"login": "Name"}), or (header auth) on first sign-in.
  team: env('TASKBOARD_TEAM'),
  // Bearer token that acts as the owner, for scripts (bin/card) and integrations.
  ownerTokenFile: expand(env('TASKBOARD_OWNER_TOKEN_FILE', '~/.config/taskboard/owner-token')),

  // How to run the Aside CLI. ASIDE_WRAP is a command prefix, for when the server runs as a background service and has
  // to reach Aside inside a desktop session (e.g. "sudo launchctl asuser 501 sudo -u alice").
  asideBin: expand(env('ASIDE_BIN', '~/.local/bin/aside')),
  asideWrap: env('ASIDE_WRAP').split(' ').filter(Boolean),

  // Models people can pick for card agents: a JSON file (ModelOption[]), or a command that prints that JSON
  // (refreshed every minute). Neither set = the built-in list below.
  modelsFile: expand(env('TASKBOARD_MODELS_FILE')),
  modelsCommand: env('TASKBOARD_MODELS_CMD'),

  // The board agent (team chat) and the screenshot reader run on the Claude Code CLI.
  claudeBin: expand(env('CLAUDE_BIN', 'claude')),
  boardModel: env('BOARD_MODEL', 'claude-haiku-5-5'),
  readerModel: env('READER_MODEL', 'claude-sonnet-5-5'),
};

mkdirSync(path.join(config.dataDir, 'shots'), { recursive: true });

export function ownerToken(): string | null {
  const t = process.env.TASKBOARD_OWNER_TOKEN?.trim();
  if (t) return t;
  try { return existsSync(config.ownerTokenFile) ? readFileSync(config.ownerTokenFile, 'utf8').trim() || null : null; } catch { return null; }
}

/** Secret for signing sign-in cookies. Kept in the data folder so people stay signed in across restarts. */
export function cookieSecret(): string {
  const f = path.join(config.dataDir, '.secret');
  try { if (existsSync(f)) return readFileSync(f, 'utf8').trim(); } catch {}
  const s = randomBytes(32).toString('base64url');
  writeFileSync(f, s, { mode: 0o600 });
  return s;
}

/** The team from TASKBOARD_TEAM, with the owner always on it. */
export function defaultTeam(): Record<string, string> {
  const t: Record<string, string> = { [config.owner]: config.ownerName || config.owner };
  for (const part of config.team.split(',').map(s => s.trim()).filter(Boolean)) {
    const [login, ...name] = part.split(':');
    if (login) t[login.trim()] = name.join(':').trim() || login.trim();
  }
  return t;
}

export const palette = ['#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

// Built-in model list ("asideProvider/model"). Override with TASKBOARD_MODELS_FILE or TASKBOARD_MODELS_CMD.
export const models: ModelOption[] = [
  { id: 'claude-code/claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'Claude', group: 'Claude' },
  { id: 'claude-code/claude-sonnet-5-5', label: 'Claude Sonnet 5.5', provider: 'Claude', group: 'Claude' },
  { id: 'claude-code/claude-haiku-5-5', label: 'Claude Haiku 5.5', provider: 'Claude', group: 'Claude' },
  { id: 'claude-code/claude-fable-5-1', label: 'Claude Fable 5.1', provider: 'Claude', group: 'Claude' },
  { id: 'openai-codex/gpt-6.1-sol', label: 'GPT-6.1 Sol', provider: 'ChatGPT', group: 'ChatGPT' },
  { id: 'openai-codex/gpt-6-sol', label: 'GPT-6 Sol', provider: 'ChatGPT', group: 'ChatGPT' },
  { id: 'openai-codex/gpt-6-luna', label: 'GPT-6 Luna', provider: 'ChatGPT', group: 'ChatGPT' },
];
export const defaultModel = env('TASKBOARD_DEFAULT_MODEL', models[0].id);
