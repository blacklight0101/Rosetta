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

/** The first Page, Control or Master directive in the head of the file, outside server comments. */
function pageDirective(text: string): Directive | undefined {
  const head = text.length > headCharacters ? text.slice(0, headCharacters) : text;
  let from = 0;
  for (let seen = 0; seen < maxDirectives; seen += 1) {
    const open = head.indexOf('<%@', from);
    if (open < 0) return undefined;
    const comment = head.indexOf('<%--', from);
    if (comment >= 0 && comment < open) {
      const end = head.indexOf('--%>', comment + 4);
      if (end < 0) return undefined;
      from = end + 4;
      continue;
    }
    const close = head.indexOf('%>', open);
    if (close < 0) return undefined;
    from = close + 2;
    const directive = parseDirective(head.slice(open + 3, close));
    if (pageDirectives.has(directive.name)) return directive;
  }
  return undefined;
}

/** Control characters (including NUL), `%` and `:` never appear in a plain sibling file name. */
function hasUnsafeCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code === 37 || code === 58) return true;
  }
  return false;
}

/**
 * `target` against the folder of `path`. A code-behind file sits beside its page, so anything else is
 * refused: an empty value, control characters, `%` (encoded tricks), a drive letter, an absolute,
 * UNC or home-relative path, and any `..` segment.
 */
function resolveSibling(path: string, target: string): string | undefined {
  const slashed = target.replaceAll('\\', '/');
  if (slashed === '' || hasUnsafeCharacter(slashed)) return undefined;
  if (slashed.startsWith('/') || slashed.startsWith('~')) return undefined;
  const parts = path.split('/').slice(0, -1);
  for (const part of slashed.split('/')) {
    if (part === '..') return undefined;
    if (part !== '' && part !== '.') parts.push(part);
  }
  return parts.length === 0 ? undefined : parts.join('/');
}

function codeFileOf(directive: Directive): string | undefined {
  const { attributes } = directive;
  return attributes.get('codebehind') ?? attributes.get('codefile') ?? attributes.get('src');
}

/**
 * The link from a WebForms page, user control or master page to its code-behind file, and the class
 * it names (RF-111). Undefined when the file has no such directive or no code-behind attribute.
 */
export function codeBehindReference(path: string, text: string): PackReference | undefined {
  const directive = pageDirective(text);
  if (directive === undefined) return undefined;
  const target = codeFileOf(directive);
  const to = target === undefined ? undefined : resolveSibling(path, target);
  if (to === undefined) return undefined;
  const symbol = directive.attributes.get('inherits');
  return {
    from: path,
    to,
    kind: 'code-behind',
    ...(symbol === undefined || symbol === '' ? {} : { symbol }),
  };
}

export type PageLanguage = 'csharp' | 'vb' | 'other';

const languageIds = new Map<string, PageLanguage>([
  ['c#', 'csharp'],
  ['cs', 'csharp'],
  ['csharp', 'csharp'],
  ['vb', 'vb'],
  ['vb.net', 'vb'],
  ['visualbasic', 'vb'],
]);

/**
 * The language of the server code of a page (RF-111): the `Language` attribute of its directive;
 * without one, the extension of the code-behind file; without that, C#. A language that is neither
 * C# nor VB.NET (for example `JScript`) is `other`.
 */
export function pageLanguage(text: string): PageLanguage {
  const directive = pageDirective(text);
  if (directive === undefined) return 'csharp';
  const declared = directive.attributes.get('language')?.trim().toLowerCase();
  if (declared !== undefined && declared !== '') return languageIds.get(declared) ?? 'other';
  const codeFile = (codeFileOf(directive) ?? '').toLowerCase();
  return codeFile.endsWith('.vb') ? 'vb' : 'csharp';
}
