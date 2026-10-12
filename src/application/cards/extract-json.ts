import { cardLimits } from './card-limits.js';

// RF-202: models answer with fenced or prose-wrapped JSON even when told not to (Ollama pre-spike).
// This finds the JSON texts in an answer, most likely first, and parses them without ever letting
// a `__proto__`, `constructor` or `prototype` key through.

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const fence = /```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/g;

function safeParse(text: string): { readonly value: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(text, (key: string, item: unknown) =>
      forbiddenKeys.has(key) ? undefined : item,
    );
    return { value };
  } catch {
    return undefined;
  }
}

/** The index of the quote that closes the string opened at `open`, or the end of the text. */
function stringEnd(text: string, open: number): number {
  for (let index = open + 1; index < text.length; index += 1) {
    if (text[index] === '\\') index += 1;
    else if (text[index] === '"') return index;
  }
  return text.length;
}

/** The end of the JSON value that starts at `start`, or -1; strings and escapes are respected. */
function balancedEnd(text: string, start: number): number {
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') index = stringEnd(text, index);
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function* scanTexts(text: string): Generator<string> {
  yield text.trim();
  for (const block of text.matchAll(fence)) yield (block[1] ?? '').trim();
  const opening = /[{[]/g;
  for (let tries = 0; tries < cardLimits.maxJsonCandidates; tries += 1) {
    const found = opening.exec(text);
    if (found === null) return;
    const end = balancedEnd(text, found.index);
    if (end < 0) continue;
    yield text.slice(found.index, end + 1);
    opening.lastIndex = end + 1; // top-level values only, never the parts inside one
  }
}

/** Every JSON value found in the answer, at most `maxJsonCandidates` parse attempts. */
export function* jsonCandidates(text: string): Generator {
  let attempts = 0;
  for (const candidate of scanTexts(text)) {
    if (attempts >= cardLimits.maxJsonCandidates) return;
    attempts += 1;
    const parsed = safeParse(candidate);
    if (parsed !== undefined) yield parsed.value;
  }
}
