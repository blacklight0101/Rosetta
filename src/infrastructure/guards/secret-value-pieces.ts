// P2-40 (RF-141): the values that are not secrets, for the masker rules that name a value by its key.
// Each piece is the whole value (it ends at a blank, quote, comma or semicolon) and is bounded or has
// no overlapping repeat, so a rule that uses it stays linear on hostile input.

const valueEnd = String.raw`(?![^\s"',;])`;

/**
 * A placeholder or a word of prose, never a secret: `<token>`, `{token}`, `${TOKEN}`, `$token`,
 * `[token]`, `YOUR_TOKEN`, `xxxx`, or the word `token` or `header` (as in "the Authorization: Bearer
 * header"). It must be the whole value, so `xxxx1234` is still a secret.
 */
export const placeholderValue = String.raw`(?:<[^>\s]{1,40}>|\{[^}\s]{1,40}\}|\$\{?[A-Za-z_]\w{0,40}\}?|\[[^\]\s]{1,40}\]|your[_-]?(?:[a-z]+[_-])?token|x{4,}|token|header)${valueEnd}`;

/**
 * A value that is code, not a key: a dotted name (`process.env.KEY`) or a words-only constant
 * (`YOUR_API_KEY`).
 */
export const identifierValue = String.raw`(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+|[A-Za-z]+(?:_[A-Za-z]+)+)${valueEnd}`;
