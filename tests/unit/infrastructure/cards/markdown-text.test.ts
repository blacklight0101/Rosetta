import { describe, expect, it } from 'vitest';
import { markdownEscaper } from '../../../../src/infrastructure/cards/markdown-text.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { liveElement, renderMarkdown, visibleText } from '../../../support/render-markdown.js';

// P5-26, RF-507, RF-145, RF-1013: the escaper writes only what changes the Markdown meaning in
// its position, so a package file reads cleanly raw, and model text stays inert in a real renderer.

const esc = markdownEscaper(new SecretMasker());

const hostile = [
  ['a script tag', '<script>alert(1)</script>'],
  ['an event handler tag', '<img src=x onerror=alert(1)>'],
  ['a javascript link', '[x](javascript:alert(1))'],
  ['a remote image', '![x](http://evil.example/p.png)'],
  ['an autolink', '<http://evil.example>'],
  ['a bare URL', 'see http://evil.example/a and https://evil.example and www.evil.example'],
  ['an e-mail address', 'mail me@evil.example'],
  ['a leading heading', '# Heading'],
  ['a pipe', 'a | b | c'],
  ['backticks', 'run `rm -rf` now'],
  ['a code fence', '```\n# breakout\n```'],
  ['a reference definition', '[ref]: http://evil.example/def\n[ref]'],
  ['a reference link', '[a][ref] and [ref]'],
  ['entities', '&lt;b&gt; &#60;i&#62; &amp; &#x3c;'],
  ['emphasis', '**bold** *it* _under_ __strong__ ~~gone~~'],
  ['a setext underline', 'Title\n===\nOther\n---'],
  ['a rule', '* * *\n___\n- - -'],
  ['a list and a quote', '- item\n+ item\n1. item\n2) item\n> quote'],
  ['a task item', '[ ] todo'],
  ['a trailing backslash', 'path\\'],
  ['a html comment', '<!-- hidden -->'],
] as const;

const asParagraph = (text: string): string => esc.inline(text);
const asListItem = (text: string): string => `- ${esc.inline(text)}`;
const asCell = (text: string): string => `| a | b |\n|---|---|\n| ${esc.inline(text)} | x |`;
const asBlock = (text: string): string => esc.block(text);
const asLabel = (text: string): string => `[${esc.label(text)}](cards/c.md)`;

describe('markdownEscaper keeps hostile text inert in a real renderer', () => {
  const positions = [
    ['a paragraph', asParagraph],
    ['a list item', asListItem],
    ['a table cell', asCell],
    ['a block quote', asBlock],
  ] as const;

  for (const [position, write] of positions) {
    it.each(hostile)(`RF-507 %s as text in ${position} forms no live element`, (_name, text) => {
      const html = renderMarkdown(write(text));
      expect(liveElement(html)).toBeUndefined();
      expect(html).not.toMatch(/<[a-z][^>]*s(?:href|src|onerror)=/i);
    });
  }
});

describe('markdownEscaper shows hostile text as typed', () => {
  it.each(hostile)('RF-507 %s shows the characters it was given', (_name, text) => {
    const shown = visibleText(renderMarkdown(asParagraph(text)));
    expect(shown).toBe(text.replace(/\s+/g, ' ').trim());
  });
});

describe('markdownEscaper in labels and cells', () => {
  it.each(hostile)('RF-507 %s inside a link label cannot end or nest the link', (_name, text) => {
    const html = renderMarkdown(asLabel(text));
    expect(html.match(/<a /g)?.length).toBe(1);
    expect(html).toContain('href="cards/c.md"');
    expect(html).not.toMatch(/<(?:img|script|iframe)/i);
  });

  it('RF-1013 a pipe in a table cell does not add a cell', () => {
    const html = renderMarkdown(asCell('a | b'));
    expect(html.match(/<td>/g)).toHaveLength(2);
  });

  it('RF-507 mutation: text written without escaping forms a link, an image and a script', () => {
    const html = renderMarkdown(
      '[x](javascript:alert(1)) ![x](http://z.example) <script>1</script>',
    );
    expect(liveElement(html)).toBeDefined();
  });
});

describe('markdownEscaper reads cleanly raw', () => {
  it('P5-26 hyphens, parentheses, dots, a # inside a word and a colon stay plain', () => {
    expect(esc.inline('20261023-143644-understand')).toBe('20261023-143644-understand');
    expect(esc.inline('the decisions (ADRs) are non-development, v1.2.3')).toBe(
      'the decisions (ADRs) are non-development, v1.2.3',
    );
    expect(esc.inline('C# and F# Outcome: done')).toBe('C# and F# Outcome: done');
  });

  it('P5-26 a word-internal underscore stays plain', () => {
    expect(esc.inline('catalog_brand')).toBe('catalog_brand');
    expect(esc.inline('the catalog_brand column')).toBe('the catalog_brand column');
  });

  it('P5-26 a star between spaces and a lone dash stay plain', () => {
    expect(esc.inline('3 * 4 - 1')).toBe('3 * 4 - 1');
  });

  it('P5-26 a path with a Windows separator stays plain', () => {
    expect(esc.inline('C:\\src\\app.cs')).toBe('C:\\src\\app.cs');
  });
});

describe('markdownEscaper escapes only the position that needs it', () => {
  it('P5-26 only the line start of a list marker, heading, quote or number is escaped', () => {
    expect(esc.inline('# Title')).toBe('\\# Title');
    expect(esc.inline('- item')).toBe('\\- item');
    expect(esc.inline('+ item')).toBe('\\+ item');
    expect(esc.inline('> quote')).toBe('\\> quote');
    expect(esc.inline('1. first')).toBe('1\\. first');
    expect(esc.inline('2) second')).toBe('2\\) second');
    expect(esc.inline('2026 was')).toBe('2026 was');
  });

  it('P5-26 a pipe, a backtick and an HTML tag are escaped where they matter', () => {
    expect(esc.inline('a|b')).toBe('a\\|b');
    expect(esc.inline('use `x`')).toBe('use \\`x\\`');
    expect(esc.inline('a <b> c & d < e')).toBe('a \\<b> c & d < e');
    expect(esc.inline('AT&amp;T')).toBe('AT\\&amp;T');
  });

  it('P5-26 a block quote escapes the start of each of its lines', () => {
    expect(esc.block('# one\n- two\nthree-four')).toBe('> \\# one\n> \\- two\n> three-four');
  });

  it('P5-26 the source URL is written plain; anything else is escaped as text', () => {
    expect(esc.url('https://github.com/dotnet-architecture/eshopmodernizing')).toBe(
      'https://github.com/dotnet-architecture/eshopmodernizing',
    );
    const odd = esc.url('https://evil.example/x)![y](http://z.example');
    expect(liveElement(renderMarkdown(odd))).toBeUndefined();
  });
});
