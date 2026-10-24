// Which models the card agents may use. By default the built-in list from config.ts. Point TASKBOARD_MODELS_FILE at a
// JSON file, or TASKBOARD_MODELS_CMD at a command that prints JSON, to manage the list yourself; the command is re-run
// every minute and the board gets the new list live.
//
// Accepted JSON: ModelOption[] ([{"id": "claude-code/claude-opus-5-5", "label": "Claude Opus 5.5", "provider": "Claude"}])
// or {"models": ModelOption[], "notes": string[]}, where notes are shown in the model menu (e.g. "ChatGPT is not connected").
import { existsSync, readFileSync } from 'node:fs';
import type { ModelOption } from '../shared/types.ts';
import { config, models as builtIn } from './config.ts';

type Listener = (m: ModelOption[], notes: string[]) => void;

let cache: { models: ModelOption[]; notes: string[] } = { models: builtIn, notes: [] };
const listeners: Listener[] = [];
export const onModels = (fn: Listener) => { listeners.push(fn); };
export const currentModels = () => cache.models;
export const modelNotes = () => cache.notes;

/** Parse a model list. Throws on anything that is not a usable list. */
export function parseModels(raw: string): { models: ModelOption[]; notes: string[] } {
  const j = JSON.parse(raw);
  const list: unknown[] = Array.isArray(j) ? j : Array.isArray(j?.models) ? j.models : [];
  const models = list
    .filter((m: any) => m && typeof m.id === 'string' && m.id.includes('/'))
    .map((m: any): ModelOption => {
      const provider = String(m.provider ?? m.id.split('/')[0]);
      return { id: m.id, label: String(m.label ?? m.id.split('/').slice(1).join('/')), provider, group: String(m.group ?? provider) };
    });
  if (!models.length) throw new Error('no models in the list (each needs an "id" like "provider/model")');
  const notes = Array.isArray(j?.notes) ? j.notes.map(String) : [];
  return { models, notes };
}

async function load(): Promise<string | null> {
  if (config.modelsCommand) {
    const p = Bun.spawn(['sh', '-c', config.modelsCommand], { stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    const timer = setTimeout(() => p.kill(), 30_000);
    const out = await new Response(p.stdout).text();
    clearTimeout(timer);
    if ((await p.exited) !== 0) throw new Error(`TASKBOARD_MODELS_CMD exited with ${p.exitCode}`);
    return out;
  }
  if (config.modelsFile) {
    if (!existsSync(config.modelsFile)) throw new Error(`${config.modelsFile} does not exist`);
    return readFileSync(config.modelsFile, 'utf8');
  }
  return null;
}

export async function refreshModels() {
  let raw: string | null;
  try { raw = await load(); } catch (e: any) {
    console.error('models: keeping the last list:', e.message);
    return cache;
  }
  if (raw === null) return cache;
  let next: typeof cache;
  try { next = parseModels(raw); } catch (e: any) {
    console.error('models: could not read the model list, keeping the last one:', e.message);
    return cache;
  }
  const changed = JSON.stringify(next) !== JSON.stringify(cache);
  cache = next;
  if (changed) for (const fn of listeners) fn(cache.models, cache.notes);
  return cache;
}

export function startModelSync() {
  refreshModels();
  if (config.modelsCommand || config.modelsFile) setInterval(refreshModels, 60_000);
}
