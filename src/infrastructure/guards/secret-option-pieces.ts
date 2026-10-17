// RF-141: the pieces of the command-line option rules (`--token <value>` and its siblings), shared by
// the masker rules and the extra rules. Moved out of secret-masker.ts unchanged (P2-43).

// A blank, or a shell line continuation (a backslash, `^` or a backtick at the end of the line, then
// any line terminator: LF, CRLF, a lone CR, U+2028 or U+2029), so a value on the next line is still
// the value. The alternatives start with different characters, so a run of them can be read one
// way only.
export const lineEnd = String.raw`(?:\r\n|[\n\r\u2028\u2029])`;
export const tokenBlank = String.raw`(?:[ \t]|[\\^\x60][ \t]*${lineEnd})`;
// A continuation mark that ends the line, which no value starts with (so a run of blanks that gives
// back its last blank cannot make the mark a value, and masking stays idempotent).
export const notContinuation = String.raw`(?![\\^\x60][ \t]*(?:${lineEnd}|$))`;
// The value of a long option such as `--password <value>`: one quoted value (to its closing quote or
// the end of the line) or a bare word that does not start with `-`, a quote or a shell operator.
export const optionValue = String.raw`(?:"[^"\r\n]*"?|'[^'\r\n]*'?|[^\s\-"'<>|&;][^\s"'<>|&;]*)`;
const schemeNames =
  'bearer|basic|token|digest|negotiate|ntlm|kerberos|oauth|hawk|mutual|dpop|apikey|jwt|aws4-hmac-sha256';
// What a value may start with: a character that is not a flag or an operator, or a dash and at least
// six more characters (`-<value>`; a short `-v` is a flag). A lone continuation mark that ends the
// line is not a value.
const tokenValueStart = String.raw`(?=[^\s\-<>|&;]|-[^\s\-"'<>|&;][^\s"'<>|&;]{5,})${notContinuation}`;
const dashValue = String.raw`-[^\s\-"'<>|&;][^\s"'<>|&;]{5,}`;
// A scheme word before the value of `--token` stays visible, bare or quoted, once or repeated, with
// any run of blanks or continuations after it: `--token Bearer <value>`. A scheme word joins the run
// only when a value starts after it; before a flag, a redirect or an operator it is the value
// (`--token Negotiate -v`).
const tokenSchemeWord = String.raw`(?:"(?:${schemeNames})"|'(?:${schemeNames})'|(?:${schemeNames})(?![\w-]))`;
// The run of scheme words is atomic (a lookahead capture, then a back reference), so a failed value
// never retries a shorter run and the scan stays linear.
export const tokenScheme = String.raw`(?=(?<schemes>(?:${tokenSchemeWord}${tokenBlank}+${tokenValueStart})*))\k<schemes>`;
// A word that starts with a scheme name and has more characters (`Bearer-x`, `Bearerx`) is a value,
// and so is the word after it, bare or quoted, so that word does not stay visible.
const schemePrefixedValue = String.raw`(?:${schemeNames})[\w-]+(?:${tokenBlank}+(?!\[MASKED:)${tokenValueStart}(?:"[^"\r\n]*"?|'[^'\r\n]*'?|[^\s"'<>|&;]+))?`;
export const tokenValue = String.raw`(?:${schemePrefixedValue}|${dashValue}|${optionValue})`;
// Not preceded by a letter, digit or dash, so `x--token` and `---token` are left alone.
export const optionStart = '(?<![A-Za-z0-9-])--';
// After `--token=` and one blank, one of these words is prose (`the --token= flag`), not a value
// (P2-40). Any other word, a longer word (`flags`), two blanks or a tab is still a value.
export const tokenProse = String.raw`(?:flag|option|parameter|argument|value|switch|is)(?![\w.+/=@#$%^*~!:-])`;
