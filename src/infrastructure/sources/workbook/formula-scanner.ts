// RF-153: the character-level reading of a formula. A formula is untrusted text, so every read here
// moves forward and is capped: a word, a quoted name or a bracket group is read at most up to a
// fixed length, a string literal is skipped with one search. Nothing evaluates or allocates more
// than the caps allow, and no call leaves the position where it found it.

/** A formula longer than this is read up to here (Excel itself stops at 8,192). */
export const MAX_FORMULA_CHARS = 32_768;
const MAX_WORD = 255;
const MAX_QUOTED = 1000;
const MAX_BRACKET = 1000;
const MAX_ERROR = 12;

/** A letter, digit, `_`, `.`, `$`, `\` or any character beyond ASCII (names may use them). */
const WORD_CHAR = /[A-Za-z0-9_.$\\]/u;

export function isWordChar(char: string): boolean {
  return WORD_CHAR.test(char) || char.charCodeAt(0) > 127;
}

export class Scanner {
  pos = 0;
  readonly text: string;
  /** True when the formula was longer than `MAX_FORMULA_CHARS`. */
  readonly cut: boolean;

  constructor(formula: string) {
    this.cut = formula.length > MAX_FORMULA_CHARS;
    this.text = this.cut ? formula.slice(0, MAX_FORMULA_CHARS) : formula;
  }

  get atEnd(): boolean {
    return this.pos >= this.text.length;
  }

  /** The character `offset` places ahead, or an empty string past the end. */
  peek(offset = 0): string {
    return this.text.charAt(this.pos + offset);
  }

  /** The word at the position (at most 255 characters kept); the whole word is consumed. */
  readWord(): string {
    const start = this.pos;
    while (this.pos < this.text.length && isWordChar(this.text.charAt(this.pos))) this.pos += 1;
    return this.text.slice(start, Math.min(this.pos, start + MAX_WORD));
  }

  /** Skips a string literal; `""` inside it is a quote. An unterminated one runs to the end. */
  skipString(): void {
    let at = this.pos + 1;
    for (;;) {
      const close = this.text.indexOf('"', at);
      if (close < 0) {
        this.pos = this.text.length;
        return;
      }
      if (this.text.charAt(close + 1) !== '"') {
        this.pos = close + 1;
        return;
      }
      at = close + 2;
    }
  }

  /** Skips an error value such as `#REF!`, `#N/A` or `#DIV/0!`, or just the `#` after a reference. */
  skipError(): void {
    const start = this.pos;
    this.pos += 1;
    while (this.pos - start < MAX_ERROR && /[A-Za-z0-9/]/u.test(this.peek())) this.pos += 1;
    if (this.peek() === '!' || this.peek() === '?') this.pos += 1;
  }

  /**
   * The text of a `'quoted name'` with `''` read as a quote, or undefined when it is not closed or is
   * longer than a name can be. The position ends after the closing quote (or at the end).
   */
  readQuoted(): string | undefined {
    let at = this.pos + 1;
    let decoded = '';
    let tooLong = false;
    while (at < this.text.length) {
      const char = this.text.charAt(at);
      if (char === "'" && this.text.charAt(at + 1) !== "'") {
        this.pos = at + 1;
        return tooLong ? undefined : decoded;
      }
      if (decoded.length < MAX_QUOTED) decoded += char;
      else tooLong = true;
      at += char === "'" ? 2 : 1;
    }
    this.pos = this.text.length;
    return undefined;
  }

  /**
   * A bracket group `[...]` with nested groups; `'` escapes the next character (`'[`, `']`, `'#`).
   * An unclosed group is read up to the cap; the result then does not end with `]`.
   */
  readBracket(): string {
    const start = this.pos;
    let depth = 0;
    let at = start;
    while (at < this.text.length && at - start < MAX_BRACKET) {
      const char = this.text.charAt(at);
      at += char === "'" ? 2 : 1;
      if (char === '[') depth += 1;
      if (char === ']') depth -= 1;
      if (depth === 0) break;
    }
    this.pos = Math.min(at, this.text.length);
    return this.text.slice(start, this.pos);
  }
}
