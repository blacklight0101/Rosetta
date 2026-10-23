import { plainWords } from './open-question.js';

// RF-243, P5-02, EV-09: an open question that asks what a header, a column or a module means or does,
// when the lines it cites already hold the name it asks about, is the agent's own reading left
// undone: the answer sits in the cited lines. The check is deterministic (no model call). The name is
// one the question marks: quoted, in brackets, or written like a code identifier (`modLoans`,
// `unit_cost`). A question about a reason, the business, people, volumes or what is expected is kept,
// and so is any question whose names the cited lines do not hold. A name written plain, without a mark,
// is not found, so the rule leaves such a question to the user.

const asksMeaning: readonly RegExp[] = [
  // "What does column D (Qty) represent?", "What does the Unit cost column mean?"
  /^what\s+(?:does|do)\s+.+\s+(?:mean|represent|represents|stand for|hold|contain|store)(?:\s+in\s+.+)?$/u,
  // "What is the role of the modLoans module?"
  /^what\s+(?:is|are)\s+the\s+(?:role|purpose|meaning|function)\s+of\b/u,
  // "What does the modLoans module do?"
  /^what\s+(?:does|do)\s+.+\s+do$/u,
  // "What is the Qty column used for?"
  /^what\s+(?:is|are)\s+.+\s+used\s+for$/u,
];

const intent =
  /\b(?:why|reasons?|business|users?|team|volumes?|agreed|expect|expects|expected|production|who)\b/u;

const marked: readonly RegExp[] = [
  /["“”`]([^"“”`]{2,40})["“”`]/gu,
  /(?<![\p{L}\p{N}])'([^']{2,40})'(?![\p{L}\p{N}])/gu,
  /\(([^()]{2,40})\)/gu,
  /\b([a-z]+[A-Z][A-Za-z0-9]*|[A-Za-z0-9]+_[A-Za-z0-9_]+)\b/gu,
];

function namesIn(question: string): readonly string[] {
  const names = marked.flatMap((pattern) =>
    [...question.matchAll(pattern)].map((found) =>
      (found[1] ?? '').replace(/^["“”`']+|["“”`']+$/gu, '').trim(),
    ),
  );
  return [...new Set(names.filter((name) => name.length >= 2))];
}

function holds(cited: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
  const edge = String.raw`[\p{L}\p{N}_]`;
  return new RegExp(`(?<!${edge})${escaped}(?!${edge})`, 'iu').test(cited);
}

/** The name the cited lines hold that the question asks about, or undefined when the question stands. */
// RF-243
export function nameAnsweredByCitedLines(question: string, cited: string): string | undefined {
  const lower = plainWords(question).toLowerCase();
  if (intent.test(lower) || !asksMeaning.some((shape) => shape.test(lower))) return undefined;
  return namesIn(question).find((name) => holds(cited, name));
}
