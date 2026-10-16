import { cardLimits } from './card-limits.js';

// RF-202: models answer with fenced or prose-wrapped JSON even when told not to (Ollama pre-spike).
// This finds the JSON texts in an answer, most likely first, and parses them without ever letting
// a `__proto__`, `constructor` or `prototype` key through.

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);
const fence = /```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)```/g;
// A brace or bracket followed by a quote, another brace or bracket, or the end: the start of an
// object or list a model meant as JSON. `{x}` or `[a]` in prose is not.
const jsonStart = /[{[]\s*(?:["{[\]}]|$)/y;

function startsLikeJson(text: string, at: number): boolean {
  jsonStart.lastIndex = at;
  return jsonStart.test(text);
}

function parseJson(text: string): { readonly value: unknown } | undefined {
  try {
    const value: unknown = JSON.parse(text, (key: string, item: unknown) =>
      forbiddenKeys.has(key) ? undefined : item,
    );
    return { value };
  } catch {
    return undefined;
  }
}

/** RF-208: the text without the commas that sit right before a closing brace or bracket. */
function withoutTrailingCommas(text: string): string {
  let result = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? '';
    if (char === '"') {
      const end = stringEnd(text, index);
      result += text.slice(index, end + 1);
      index = end;
    } else if (char === ',' && /^\s*[}\]]/u.test(text.slice(index + 1, index + 65))) {
      continue;
    } else result += char;
  }
  return result;
}

/** Valid JSON, or JSON that is valid once its trailing commas are taken out (RF-208). */
function safeParse(text: string): { readonly value: unknown } | undefined {
  const parsed = parseJson(text);
  if (parsed !== undefined) return parsed;
  return parseJson(withoutTrailingCommas(text));
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
  /** JSON was started (see `startsLikeJson`) but never closed, or is not valid JSON. */
  truncated: boolean;
  /** JSON was started but never closed: the answer ends inside it (RF-208). */
  unclosed: boolean;
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
      const started = startsLikeJson(text, start.index);
      found.truncated ||= started;
      found.unclosed ||= started;
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
  /** Some JSON was started but is cut off or not valid; braces in prose do not count. */
  readonly truncated: boolean;
  /** Some JSON was started and the answer ends before it is closed (RF-208). */
  readonly unclosed: boolean;
}

/** Every JSON value found in the answer, from at most `maxJsonCandidates` candidate texts. */
export function searchJson(text: string): JsonSearch {
  const found: Candidates = {
    texts: [text.trim()],
    capped: false,
    truncated: false,
    unclosed: false,
  };
  addFences(text, found);
  if (!found.capped) addBraceGroups(text, found);
  const values: unknown[] = [];
  for (const candidate of found.texts) {
    const parsed = safeParse(candidate);
    if (parsed !== undefined) values.push(parsed.value);
    else if (startsLikeJson(candidate, 0)) found.truncated = true;
  }
  return {
    values,
    capped: found.capped,
    truncated: found.truncated,
    unclosed: found.unclosed,
  };
}
