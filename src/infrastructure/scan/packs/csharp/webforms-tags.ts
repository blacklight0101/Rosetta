// P5-31, RF-626: the tags of a WebForms page with the offsets that locate them. The page is
// untrusted text: it is read with a character scanner (no regular expression over the input), and
// every count is capped.

const maxTags = 5000;
const maxTagCharacters = 20_000;
const maxInnerCharacters = 2000;
const maxAttributes = 60;

export interface Tag {
  /** Lower case, with the prefix: `asp:textbox`. */
  readonly name: string;
  /** Keys in lower case; the first occurrence of a key wins. */
  readonly attributes: ReadonlyMap<string, string>;
  /** Offset of the `<`. */
  readonly start: number;
  /** Offset of the last character of the element: its `>`, or the `>` of its closing tag. */
  readonly end: number;
  /** The text between the tag and its closing tag, for the tags that hold text. */
  readonly text: string;
}

const isSpace = (char: string | undefined): boolean =>
  char === ' ' || char === '\t' || char === '\r' || char === '\n';

/** The text with the server comments blanked out, newlines kept, so offsets and lines stay. */
export function withoutServerComments(text: string): string {
  let result = '';
  let from = 0;
  for (let seen = 0; seen < maxTags; seen += 1) {
    const open = text.indexOf('<%--', from);
    if (open < 0) break;
    const close = text.indexOf('--%>', open + 4);
    const stop = close < 0 ? text.length : close + 4;
    result += text.slice(from, open) + text.slice(open, stop).replaceAll(/[^\r\n]/gu, ' ');
    from = stop;
  }
  return result + text.slice(from);
}

interface Opening {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly end: number;
  readonly selfClosed: boolean;
}

class TagReader {
  private position = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  /** Reads the tag whose `<` is at `start`; undefined when it is not an element. */
  read(start: number): Opening | undefined {
    if (!/[A-Za-z]/u.test(this.source[start + 1] ?? '')) return undefined;
    this.position = start + 1;
    const name = this.word();
    const attributes = new Map<string, string>();
    const limit = Math.min(this.source.length, start + maxTagCharacters);
    while (this.position < limit && attributes.size < maxAttributes) {
      this.skipSpaces();
      const char = this.source[this.position];
      if (char === '>') return { name, attributes, end: this.position, selfClosed: false };
      if (char === '/' && this.source[this.position + 1] === '>') {
        return { name, attributes, end: this.position + 1, selfClosed: true };
      }
      if (char === undefined) return undefined;
      this.attribute(attributes);
    }
    return undefined;
  }

  private attribute(attributes: Map<string, string>): void {
    const key = this.word().toLowerCase();
    if (key === '') {
      this.position += 1;
      return;
    }
    this.skipSpaces();
    const value = this.source[this.position] === '=' ? this.afterEquals() : '';
    if (!attributes.has(key)) attributes.set(key, value);
  }

  private afterEquals(): string {
    this.position += 1;
    this.skipSpaces();
    return this.value();
  }

  private skipSpaces(): void {
    while (isSpace(this.source[this.position])) this.position += 1;
  }

  private word(): string {
    const begin = this.position;
    for (;;) {
      const char = this.source[this.position];
      if (char === undefined || isSpace(char) || '=>/'.includes(char)) break;
      this.position += 1;
    }
    return this.source.slice(begin, this.position);
  }

  private value(): string {
    const quote = this.source[this.position];
    if (quote === '"' || quote === "'") {
      const close = this.source.indexOf(quote, this.position + 1);
      const stop = close < 0 ? this.source.length : close;
      const value = this.source.slice(this.position + 1, stop);
      this.position = Math.min(stop + 1, this.source.length);
      return value;
    }
    const begin = this.position;
    while (this.position < this.source.length && !isSpace(this.source[this.position])) {
      if (this.source[this.position] === '>') break;
      this.position += 1;
    }
    return this.source.slice(begin, this.position);
  }
}

/** The text between a tag and its closing tag without nested tags, and where the closing tag ends. */
function innerOf(
  source: string,
  name: string,
  from: number,
): { readonly text: string; readonly end: number } | undefined {
  const close = source.toLowerCase().indexOf(`</${name}`, from);
  if (close < 0 || close - from > maxInnerCharacters) return undefined;
  const end = source.indexOf('>', close);
  if (end < 0) return undefined;
  let text = '';
  let inTag = false;
  for (const char of source.slice(from, close)) {
    if (char === '<') inTag = true;
    else if (char === '>') inTag = false;
    else if (!inTag) text += char;
  }
  return { text: text.split(/\s+/u).filter(Boolean).join(' '), end };
}

const holdsText = new Set(['a', 'button', 'label', 'asp:linkbutton', 'asp:label', 'asp:hyperlink']);

/** The elements of the page in document order. */
export function tagsOf(source: string): readonly Tag[] {
  const reader = new TagReader(source);
  const tags: Tag[] = [];
  let from = 0;
  while (tags.length < maxTags) {
    const open = source.indexOf('<', from);
    if (open < 0) break;
    from = open + 1;
    const read = reader.read(open);
    if (read === undefined) continue;
    const name = read.name.toLowerCase();
    const wanted = !read.selfClosed && holdsText.has(name);
    const inner = wanted ? innerOf(source, name, read.end + 1) : undefined;
    const end = inner?.end ?? read.end;
    tags.push({ name, attributes: read.attributes, start: open, end, text: inner?.text ?? '' });
  }
  return tags;
}

/** The offset where each line starts. */
export function lineStartsOf(source: string): readonly number[] {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\n') starts.push(index + 1);
  }
  return starts;
}

/** The 1-based line of an offset. */
export function lineAt(starts: readonly number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return low + 1;
}
