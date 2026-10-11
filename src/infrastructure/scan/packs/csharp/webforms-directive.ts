import type { PackReference } from '../../../../application/ports/language-pack.js';

// RF-111: an `.aspx`, `.ascx` or `.master` file starts with a directive such as
// `<%@ Page CodeBehind="Default.aspx.cs" Inherits="Shop.DefaultPage" %>` that names its code-behind.
// The page is untrusted text: only the head of the file is read, with indexOf and a character
// scanner (no regular expression over the input), and every count is capped.

const headCharacters = 65_536;
const maxDirectives = 20;
const maxAttributes = 40;
const maxValueCharacters = 500;
const pageDirectives = new Set(['page', 'control', 'master']);

interface Directive {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
}

const isSpace = (char: string | undefined): boolean =>
  char === ' ' || char === '\t' || char === '\r' || char === '\n';

class Scanner {
  private position = 0;
  private readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  get done(): boolean {
    return this.position >= this.text.length;
  }

  skipSpaces(): void {
    while (!this.done && isSpace(this.text[this.position])) this.position += 1;
  }

  /** Reads up to a space or an equals sign. */
  word(): string {
    const start = this.position;
    while (!this.done) {
      const char = this.text[this.position];
      if (isSpace(char) || char === '=') break;
      this.position += 1;
    }
    return this.text.slice(start, this.position);
  }

  /** Skips one equals sign; false when the next character is something else. */
  equals(): boolean {
    if (this.text[this.position] !== '=') return false;
    this.position += 1;
    return true;
  }

  /** A quoted value, or an unquoted one up to the next space. */
  value(): string {
    const quote = this.text[this.position];
    if (quote === '"' || quote === "'") {
      const end = this.text.indexOf(quote, this.position + 1);
      const stop = end < 0 ? this.text.length : end;
      const value = this.text.slice(this.position + 1, stop);
      this.position = Math.min(stop + 1, this.text.length);
      return value;
    }
    const start = this.position;
    while (!this.done && !isSpace(this.text[this.position])) this.position += 1;
    return this.text.slice(start, this.position);
  }
}

function parseDirective(inner: string): Directive {
  const scanner = new Scanner(inner);
  scanner.skipSpaces();
  const name = scanner.word().toLowerCase();
  const attributes = new Map<string, string>();
  while (!scanner.done && attributes.size < maxAttributes) {
    scanner.skipSpaces();
    const key = scanner.word().toLowerCase();
    scanner.skipSpaces();
    if (!scanner.equals()) {
      // A key without a value, or stray text: the word was consumed, so the scan moves on.
      if (key === '') break;
      continue;
    }
    scanner.skipSpaces();
    attributes.set(key, scanner.value().slice(0, maxValueCharacters));
  }
  return { name, attributes };
}

/** The first Page, Control or Master directive in the head of the file. */
function pageDirective(text: string): Directive | undefined {
  const head = text.length > headCharacters ? text.slice(0, headCharacters) : text;
  let from = 0;
  for (let seen = 0; seen < maxDirectives; seen += 1) {
    const open = head.indexOf('<%@', from);
    const close = open < 0 ? -1 : head.indexOf('%>', open);
    if (close < 0) return undefined;
    from = close + 2;
    const directive = parseDirective(head.slice(open + 3, close));
    if (pageDirectives.has(directive.name)) return directive;
  }
  return undefined;
}

/** `target` against the folder of `path`; undefined when it is absolute or leaves the repository. */
function resolveSibling(path: string, target: string): string | undefined {
  const slashed = target.replaceAll('\\', '/');
  if (slashed.startsWith('/') || slashed.startsWith('~') || slashed.includes(':')) return undefined;
  const parts = path.split('/').slice(0, -1);
  for (const part of slashed.split('/')) {
    if (part === '' || part === '.') continue;
    if (part !== '..') parts.push(part);
    else if (parts.pop() === undefined) return undefined;
  }
  return parts.length === 0 ? undefined : parts.join('/');
}

/**
 * The link from a WebForms page, user control or master page to its code-behind file, and the class
 * it names (RF-111). Undefined when the file has no such directive or no code-behind attribute.
 */
export function codeBehindReference(path: string, text: string): PackReference | undefined {
  const directive = pageDirective(text);
  const target = directive?.attributes.get('codebehind') ?? directive?.attributes.get('codefile');
  const to = target === undefined ? undefined : resolveSibling(path, target);
  if (directive === undefined || to === undefined) return undefined;
  const symbol = directive.attributes.get('inherits');
  return {
    from: path,
    to,
    kind: 'code-behind',
    ...(symbol === undefined || symbol === '' ? {} : { symbol }),
  };
}
