import { describe, expect, test } from 'bun:test';
import { parseModels } from '../server/providers.ts';

describe('parseModels', () => {
  test('plain list, labels and groups filled in', () => {
    const { models, notes } = parseModels(JSON.stringify([
      { id: 'claude-code/claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'Claude' },
      { id: 'openai-codex/gpt-6-luna' },
    ]));
    expect(models).toEqual([
      { id: 'claude-code/claude-opus-5-5', label: 'Claude Opus 5.5', provider: 'Claude', group: 'Claude' },
      { id: 'openai-codex/gpt-6-luna', label: 'gpt-6-luna', provider: 'openai-codex', group: 'openai-codex' },
    ]);
    expect(notes).toEqual([]);
  });

  test('object form with notes', () => {
    const r = parseModels(JSON.stringify({ models: [{ id: 'a/b', group: 'A · Work' }], notes: ['ChatGPT is not connected'] }));
    expect(r.models[0].group).toBe('A · Work');
    expect(r.notes).toEqual(['ChatGPT is not connected']);
  });

  test('rejects lists without usable models', () => {
    expect(() => parseModels('[]')).toThrow();
    expect(() => parseModels('[{"id": "no-provider"}]')).toThrow();
    expect(() => parseModels('not json')).toThrow();
  });
});
