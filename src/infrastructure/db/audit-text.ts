// RF-1109, RNF-003, P1-77: what an audit row's text goes through before it is stored, on top of
// the shared secret masking (P1-04). PostgreSQL text and jsonb cannot hold NUL, so every NUL
// becomes U+FFFD and the row is still stored. A detail value is masked whole when a word of its
// key names a secret (`secret`, `clientSecret`, `pass`, `pw`, `value`, ...), and the word or the
// quoted phrase after "password is" (and the like) in free text is masked.

const NUL = String.fromCodePoint(0);
const REPLACEMENT = String.fromCodePoint(0xfffd);
const MASKED = '[MASKED:password]';
const SECRET_KEY_WORDS: ReadonlySet<string> = new Set([
  'pass',
  'passphrase',
  'passwd',
  'password',
  'pw',
  'pwd',
  'secret',
  'secrets',
  'value',
]);
// The value is one word, or a quoted phrase taken whole up to its closing quote (or the end of
// the text when the quote is never closed), so no word of a multi-word password is kept (P1-101).
const SECRET_IN_TEXT =
  /\b(?<keep>(?:password|passwd|passphrase|pwd|pw|pass|secret)\s+(?:is|was)\s*[:=]?\s*)(?!\[MASKED:)(?:"[^"]*"?|'[^']*'?|\u201c[^\u201d]*\u201d?|[^\s,;]+)/giu;

/** The text with every NUL replaced by U+FFFD. */
// RF-1109
export function withoutNul(text: string): string {
  return text.replaceAll(NUL, REPLACEMENT);
}

/** True when a word of the key (camelCase, snake_case, kebab-case) names a secret. */
function isSecretKey(key: string): boolean {
  const words = key
    .replace(/(?<lower>[a-z0-9])(?=[A-Z])/gu, '$<lower> ')
    .toLowerCase()
    .split(/[^a-z0-9]+/u);
  return words.some((word) => SECRET_KEY_WORDS.has(word));
}

function maskEntry(key: string, item: unknown): [string, unknown] {
  const cleanKey = withoutNul(key);
  if (item !== null && isSecretKey(cleanKey)) return [cleanKey, MASKED];
  return [cleanKey, auditSafeDetail(item)];
}

/** The detail value without NUL, secret-named keys masked whole and secrets in text masked. */
// RF-1109
export function auditSafeDetail(value: unknown): unknown {
  if (typeof value === 'string') {
    return withoutNul(value).replace(SECRET_IN_TEXT, `$<keep>${MASKED}`);
  }
  if (Array.isArray(value)) return value.map((item: unknown) => auditSafeDetail(item));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]: [string, unknown]) => maskEntry(key, item)),
    );
  }
  return value;
}
