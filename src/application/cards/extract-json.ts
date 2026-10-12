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

interface Candidates {
  readonly texts: string[];
  /** More candidates existed than `maxJsonCandidates`; the rest were not looked at. */
  capped: boolean;
  /** A `{` or `[` was never closed, or a candidate that starts like JSON is not valid JSON. */
  truncated: boolean;
}

function addFences(text: string, found: Candidates): void {
  // The last block is the most likely final answer, so blocks are taken from the end.
  const blocks = [...text.matchAll(fence)].reverse();
  for (const block of blocks) {
    if (found.texts.length >= cardLimits.maxJsonCandidates) {
      found.capped = true;
      return;
    }
    found.texts.push((block[1] ?? '').trim());
  }
}

function addBraceGroups(text: string, found: Candidates): void {
  const opening = /[{[]/g;
  for (let tries = 0; ; tries += 1) {
    const start = opening.exec(text);
    if (start === null) return;
    if (
      tries >= cardLimits.maxJsonCandidates ||
      found.texts.length >= cardLimits.maxJsonCandidates
    ) {
      found.capped = true;
      return;
    }
    const end = balancedEnd(text, start.index);
    if (end < 0) {
      found.truncated = true;
      continue;
    }
    found.texts.push(text.slice(start.index, end + 1));
    opening.lastIndex = end + 1; // top-level values only, never the parts inside one
  }
}

/** What the answer holds that may be JSON, and whether the search was cut short. */
export interface JsonSearch {
  readonly values: readonly unknown[];
  readonly capped: boolean;
  /** Some JSON was started but is cut off or not valid. */
  readonly truncated: boolean;
  /** The answer has a bracket or brace at all, so it was probably meant as JSON. */
  readonly looksLikeJson: boolean;
}

/** Every JSON value found in the answer, from at most `maxJsonCandidates` candidate texts. */
export function searchJson(text: string): JsonSearch {
  const found: Candidates = { texts: [text.trim()], capped: false, truncated: false };
  addFences(text, found);
  if (!found.capped) addBraceGroups(text, found);
  const values: unknown[] = [];
  for (const candidate of found.texts) {
    const parsed = safeParse(candidate);
    if (parsed !== undefined) values.push(parsed.value);
    else if (/^[{[]/.test(candidate)) found.truncated = true;
  }
  return {
    values,
    capped: found.capped,
    truncated: found.truncated,
    looksLikeJson: /[{[]/.test(text),
  };
}
