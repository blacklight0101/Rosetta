import type { TextMasker } from '../guards/secret-masker.js';

// ADR-013, RF-507: model text is text. This is the one place that turns it into Markdown that
// shows the characters and nothing else, so only the links Rosetta builds itself (the RF-125
// permalinks and the relative card links) are live. Every piece of model text in a card file and
// in spec.md goes through here. P5-26: the files are read raw by people and agents, so only what
// would change the Markdown meaning in its position gets a backslash; hyphens, parentheses, dots
// and a `#` inside a word stay plain.

const BS = String.fromCharCode(92);

const isSpace = (char: string | undefined): boolean => char === undefined || /\s/.test(char);
const isWordChar = (char: string | undefined): boolean =>
  char !== undefined && /[\p{L}\p{N}]/u.test(char);

/** A backslash before an ASCII punctuation character (or at the end) is never literal. */
const asciiPunctuation = /[!-/:-@[-`{-~]/;

/** A character reference (`&amp;`, `&#58;`, `&#x3a;`) would be decoded, so its `&` is escaped. */
const entityAt = /^&(?:#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z][A-Za-z0-9]{1,31});/;

/** Where a character stands: the text, its index, its neighbours and how many `~` the text has. */
interface Spot {
  readonly text: string;
  readonly at: number;
  readonly prev: string | undefined;
  readonly next: string | undefined;
  readonly tildes: number;
}

/** Whether the character `Spot` points at needs a backslash, by character. */
const needsBackslash: Readonly<Record<string, (spot: Spot) => boolean>> = {
  [BS]: ({ next }) => next === undefined || asciiPunctuation.test(next),
  '`': () => true,
  '|': () => true,
  '*': ({ prev, next }) => !(isSpace(prev) && isSpace(next)),
  _: ({ prev, next }) =>
    !((isWordChar(prev) && isWordChar(next)) || (isSpace(prev) && isSpace(next))),
  '~': ({ tildes }) => tildes >= 2,
  '<': ({ next }) => next !== undefined && /[A-Za-z/!?]/.test(next),
  '&': ({ text, at }) => entityAt.test(text.slice(at)),
  '[': ({ prev, at }) => prev === '!' || at === 0,
  ']': ({ next }) => next === undefined || '([:'.includes(next),
};

/** Some viewers drop the backslash before a bracket inside a link label, so use a reference. */
const labelBrackets: Readonly<Record<string, string>> = { '[': '&#91;', ']': '&#93;' };

/** Escapes the characters of `text` that change the meaning inside a line. */
function escapeChars(text: string, label: boolean): string {
  const tildes = (text.match(/~/g) ?? []).length;
  return text
    .split('')
    .map((char, at) => {
      const reference = label ? labelBrackets[char] : undefined;
      if (reference !== undefined) return reference;
      const spot = { text, at, prev: text[at - 1], next: text[at + 1], tildes };
      return needsBackslash[char]?.(spot) === true ? `${BS}${char}` : char;
    })
    .join('');
}

/**
 * Bare URLs, `www.` hosts and e-mail addresses are linked by many viewers: the colon, the dot or
 * the at sign gets a backslash, which renders as the character itself.
 */
function breakAutolinks(text: string): string {
  return text
    .replace(/\b(https?|ftp|mailto):/gi, `$1${BS}:`)
    .replace(/\bwww\./gi, (match) => `${match.slice(0, 3)}${BS}.`)
    .replaceAll('@', `${BS}@`);
}

/** What would start a block when the text opens a line (after a list marker or a `> `). */
function escapeLineStart(line: string): string {
  if (line.startsWith(BS)) return line;
  return line
    .replace(/^(#{1,6})(?=\s|$)/, `${BS}$1`)
    .replace(/^([-+*_])(?=\s|$|-)/, `${BS}$1`)
    .replace(/^(=+\s*$)/, `${BS}$1`)
    .replace(/^>/, `${BS}>`)
    .replace(/^(\d{1,9})([.)])(?=\s|$)/, `$1${BS}$2`);
}

function escapeLine(line: string, label: boolean): string {
  const text = line.trim();
  const escaped = label ? escapeChars(text, true) : breakAutolinks(escapeChars(text, false));
  return label ? escaped : escapeLineStart(escaped);
}

/** One line of text: white space (and so line breaks) collapses to single spaces. */
function escapeInline(text: string): string {
  return escapeLine(text.replace(/\s+/g, ' '), false);
}

/** A block quote; every line of the text is escaped and starts with `> `. */
function escapeBlock(text: string): string {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => `> ${escapeLine(line, false)}`.trimEnd())
    .join('\n');
}

/** Text inside the brackets of a link Rosetta builds: only what could end or nest the link. */
export function escapeLabel(text: string): string {
  return escapeLine(text.replace(/\s+/g, ' '), true);
}

/** Escapes model text for Markdown; each piece is masked first, so no secret survives escaping. */
export interface MarkdownEscaper {
  inline(text: string): string;
  block(text: string): string;
  label(text: string): string;
  /** A validated source URL, written as the plain URL; anything else is escaped as text. */
  url(text: string): string;
}

/** A URL of the characters a validated `https` repository address holds, nothing else. */
const plainUrl = /^https:\/\/[A-Za-z0-9._~/-]+$/;

export function markdownEscaper(masker: TextMasker): MarkdownEscaper {
  const masked = (text: string): string => masker.mask(text).text;
  return {
    inline: (text) => escapeInline(masked(text)),
    block: (text) => escapeBlock(masked(text)),
    label: (text) => escapeLabel(masked(text)),
    url: (text) => {
      const value = masked(text);
      return plainUrl.test(value) ? value : escapeInline(value);
    },
  };
}
