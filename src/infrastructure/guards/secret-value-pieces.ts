// P2-40 (RF-141): the values that are not secrets, for the masker rules that name a value by its key.
// Each piece is the whole value (it ends at a blank, quote, comma or semicolon) and is bounded or has
// no overlapping repeat, so a rule that uses it stays linear on hostile input.

const valueEnd = String.raw`(?![^\s"',;])`;

// A short word of letters, dashes and underscores (no digit), so `<token>` is a placeholder and
// `<eyJhbGciOi...>` is not.
const word = String.raw`(?!eyJ)[A-Za-z][A-Za-z_-]{0,29}`;
/**
 * A word that matches in any case without the `i` flag, so a rule that needs one case-sensitive part
 * (the upper snake case of a variable) can still match its keywords in any case. (A `(?-i:` group
 * is not an option: V8 turns case-insensitive matching off for the whole pattern when it is used.)
 */
export function caseless(word: string): string {
  return Array.from(word)
    .map((c) => (/[A-Za-z]/.test(c) ? `[${c.toUpperCase()}${c.toLowerCase()}]` : c))
    .join('');
}

// A variable name: upper snake case (`$API_TOKEN`, `${TOKEN}`) or the word `token`, never `$abc123x`.
const variable = String.raw`(?:[A-Z][A-Z0-9_]{0,40}|${caseless('token')})`;

/**
 * A placeholder or a word of prose, never a secret: `<token>`, `{token}`, `${TOKEN}`, `$token`,
 * `[token]`, `YOUR_TOKEN`, `xxxx`, or the word `token` or `header` (as in "the Authorization: Bearer
 * header"). It must be the whole value, so `xxxx1234` is still a secret. Case-sensitive in itself:
 * the rules that use it carry no `i` flag and write their keywords with `caseless`.
 */
export const placeholderValue = String.raw`(?:<${word}>|\{${word}\}|\[${word}\]|${caseless('your')}[_-]?(?:[A-Za-z]+[_-])?${caseless('token')}|[Xx]{4,}|${caseless('token')}|${caseless('header')}|\$\{?${variable}\}?)${valueEnd}`;

/**
 * A value that is code, not a key: `process.env.KEY` (a known environment root and one name), a
 * name with one dot (`config.apiKey`), or a words-only constant (`YOUR_API_KEY`). A value that
 * starts with `eyJ` or has more dots (a JWT, `abc.def.ghijkl`) is never code.
 */
export const identifierValue = String.raw`(?!eyJ)(?:(?:process\.env|import\.meta\.env|os\.environ)\.[A-Za-z_]\w*|[A-Za-z_]\w*\.[A-Za-z_]\w*|[A-Za-z]+(?:_[A-Za-z]+)+)${valueEnd}`;
