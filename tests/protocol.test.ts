import { describe, expect, test } from 'bun:test';
import { helpOf, isDone, parseAnswers } from '../server/protocol.ts';

describe('parseAnswers', () => {
  test('single answer', () => {
    expect(parseAnswers('I found it.\nANSWER: ORBIT-7731')).toEqual([{ label: '', value: 'ORBIT-7731' }]);
  });

  test('labelled answers, in order', () => {
    const text = 'ANSWER Q1: PRISM-42\nsome thinking\nANSWER Q2: CEDAR-9\nANSWER Q3: 17';
    expect(parseAnswers(text)).toEqual([
      { label: 'Q1', value: 'PRISM-42' },
      { label: 'Q2', value: 'CEDAR-9' },
      { label: 'Q3', value: '17' },
    ]);
  });

  test('markdown decoration and parenthesised labels', () => {
    expect(parseAnswers('**ANSWER (Part 2):** `maple`')).toEqual([{ label: 'Part 2', value: 'maple' }]);
    expect(parseAnswers('- answer q1: "abc"')).toEqual([{ label: 'q1', value: 'abc' }]);
    expect(parseAnswers('> ANSWER: *BOT-9F3A*')).toEqual([{ label: '', value: 'BOT-9F3A' }]);
  });

  test('ignores the word inside a sentence and empty values', () => {
    expect(parseAnswers('The ANSWER: is not here yet')).toEqual([]);
    expect(parseAnswers('I will write the ANSWER: line later')).toEqual([]);
    expect(parseAnswers('ANSWER:   ')).toEqual([]);
  });
});

describe('DONE and NEED HELP', () => {
  test('DONE on its own line', () => {
    expect(isDone('ANSWER: x\nDONE')).toBe(true);
    expect(isDone('**DONE.**')).toBe(true);
    expect(isDone('Not done yet, still working')).toBe(false);
  });

  test('NEED HELP question', () => {
    expect(helpOf('NEED HELP: The page asks for a code sent to a phone.')).toBe('The page asks for a code sent to a phone.');
    expect(helpOf('**Need help:** which account?')).toBe('which account?');
    expect(helpOf('All good')).toBeUndefined();
  });
});
