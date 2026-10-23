// RF-111: the line-level helpers of the light VB.NET reader. No grammar and no regular expression
// over the file as a whole: every function works on one line that is already cut to a fixed length.

const maxLineCharacters = 2000;
const maxNameCharacters = 200;

/** Words that may stand before the keyword of a declaration. */
const modifiers = new Set([
  'public',
  'private',
  'protected',
  'friend',
  'shared',
  'shadows',
  'overloads',
  'overrides',
  'overridable',
  'notoverridable',
  'mustoverride',
  'mustinherit',
  'notinheritable',
  'partial',
  'readonly',
  'writeonly',
  'default',
  'async',
  'iterator',
  'narrowing',
  'widening',
]);

/** The line without string contents, `'` comments and `REM` comments; trimmed. */
export function codeOf(line: string): string {
  const cut = line.length > maxLineCharacters ? line.slice(0, maxLineCharacters) : line;
  let code = '';
  let inString = false;
  for (const char of cut) {
    if (char === '"') {
      inString = !inString;
    } else if (!inString) {
      if (char === "'") break;
      code += char;
    }
  }
  const trimmed = code.trim();
  const lower = trimmed.toLowerCase();
  return lower === 'rem' || lower.startsWith('rem ') ? '' : trimmed;
}

/** The text after leading attributes such as `<Serializable()>`; empty when the attribute never closes. */
function withoutAttributes(code: string): string {
  let rest = code;
  while (rest.startsWith('<')) {
    const close = rest.indexOf('>');
    if (close < 0) return '';
    rest = rest.slice(close + 1).trimStart();
  }
  return rest;
}

export interface Words {
  /** Lower case, modifiers removed. The first one is the declaration keyword. */
  readonly rest: readonly string[];
  /** Original case, aligned with `rest`. */
  readonly original: readonly string[];
  /** The modifiers that stood before the keyword, lower case. */
  readonly modifiers: ReadonlySet<string>;
}

export function wordsOf(code: string): Words {
  const original = withoutAttributes(code)
    .split(/\s+/u)
    .filter((word) => word !== '');
  const seen = new Set<string>();
  let start = 0;
  while (start < original.length && modifiers.has((original[start] ?? '').toLowerCase())) {
    seen.add((original[start] ?? '').toLowerCase());
    start += 1;
  }
  const tail = original.slice(start);
  return { rest: tail.map((word) => word.toLowerCase()), original: tail, modifiers: seen };
}

/** The identifier at the start of a word: `Save(ByVal` gives `Save`, `[End]` gives `End`. */
export function identifierOf(word: string | undefined): string | undefined {
  if (word === undefined) return undefined;
  let name = '';
  for (const char of word.replaceAll(/^\[|\]$/gu, '')) {
    const isWordChar = /[\p{L}\p{N}_]/u.test(char);
    if (!isWordChar) break;
    name += char;
  }
  return name === '' ? undefined : name.slice(0, maxNameCharacters);
}

/** Whether the word starts a `get` or `set` accessor (`Get`, `Private Set(value As T)`). */
export function startsAccessor(code: string): boolean {
  const first = wordsOf(code).rest[0] ?? '';
  return first === 'get' || first.startsWith('set');
}

/** The text after the parameter list of the `keyword (` at `at`, or undefined when there is none. */
function afterParameters(lower: string, at: number, keyword: string): string | undefined {
  const before = at === 0 ? ' ' : (lower[at - 1] ?? ' ');
  if (/[\p{L}\p{N}_]/u.test(before)) return undefined;
  const open = lower.slice(at + keyword.length).trimStart();
  const close = open.startsWith('(') ? open.indexOf(')') : -1;
  return close < 0 ? undefined : open.slice(close + 1).trim();
}

/**
 * True when the line opens a lambda that goes on over the next lines: `Sub()` or `Function(x) _`
 * with nothing (or only `As Type`) after the parameter list. Its `End Sub` is not the method's.
 */
export function opensMultiLineLambda(code: string): boolean {
  const lower = code.toLowerCase();
  for (const keyword of ['sub', 'function']) {
    for (let at = lower.indexOf(keyword); at >= 0; at = lower.indexOf(keyword, at + 1)) {
      const after = afterParameters(lower, at, keyword);
      if (after === undefined) continue;
      if (after === '' || after === '_') return true;
      if (keyword === 'function' && after.startsWith('as ')) return true;
    }
  }
  return false;
}
