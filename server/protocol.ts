// The plain-text protocol card agents use to report back. The agent writes these lines anywhere in its reply:
//   ANSWER Q1: <value>     one answer of a task with several questions (any label: Q2, Part 3, ...)
//   ANSWER: <value>        the answer of a single-answer task
//   DONE                   every question is answered
//   NEED HELP: <question>  the agent needs a person (login code, captcha, unclear task)

/** Every answer line in a text: "ANSWER Q1: abc", "ANSWER: abc", "**ANSWER (Part 2):** abc". */
export function parseAnswers(text: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const re = /^[\s>*_-]*ANSWER(?:[ \t]+\(?([^:\n)]{1,40}?)\)?)?[ \t]*\**[ \t]*:[ \t]*\**[ \t]*(.+?)[ \t]*$/gim;
  for (const m of text.matchAll(re)) {
    const value = m[2].replace(/^[`"'*]+|[`"'*]+$/g, '').trim();
    if (value) out.push({ label: (m[1] ?? '').trim(), value });
  }
  return out;
}
export const isDone = (t: string) => /^[\s*_]*DONE[\s*_.!]*$/m.test(t);
export const helpOf = (t: string) => t.match(/^[\s*_]*NEED HELP[\s*_]*:[\s*_]*(.+)$/im)?.[1].trim();
