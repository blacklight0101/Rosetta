import { expect, it } from 'vitest';
import { splitText } from '../../../web/src/lib/safe-text.js';

// RF-507 rule 2: inside repository and model text only https://github.com/ links stay links.

const linksOf = (text: string) =>
  splitText(text).flatMap((part) => (part.kind === 'link' ? [part.href] : []));

it('RF-507 keeps a bare https://github.com/ link as a link', () => {
  expect(splitText('see https://github.com/owner/repo/blob/abc/a.cs#L4-L9 now')).toEqual([
    { kind: 'text', text: 'see ' },
    {
      kind: 'link',
      href: 'https://github.com/owner/repo/blob/abc/a.cs#L4-L9',
      label: 'https://github.com/owner/repo/blob/abc/a.cs#L4-L9',
    },
    { kind: 'text', text: ' now' },
  ]);
});

it('RF-507 leaves trailing punctuation outside the link', () => {
  expect(linksOf('Read https://github.com/owner/repo.')).toEqual(['https://github.com/owner/repo']);
  expect(splitText('(https://github.com/owner/repo),').at(-1)).toEqual({
    kind: 'text',
    text: '),',
  });
});

it('RF-507 keeps a Markdown link to github.com as a link with its label', () => {
  expect(splitText('[the file](https://github.com/o/r/blob/c/f.ts#L1)')).toEqual([
    { kind: 'link', href: 'https://github.com/o/r/blob/c/f.ts#L1', label: 'the file' },
  ]);
});

it.each([
  'https://evil.example/phish',
  'http://github.com/owner/repo',
  'https://github.com.evil.example/owner',
  'https://github.com@evil.example/owner',
  'https://user:pw@github.com/owner',
  'https://github.com:8443/owner',
  'https://gist.github.com/owner/abc',
  'https://www.github.com/owner',
  'javascript:alert(1)',
  'data:text/html,<script>1</script>',
  'ftp://github.com/owner',
  '//github.com/owner',
])('RF-507 shows %s as plain text', (url) => {
  expect(linksOf(url)).toEqual([]);
  expect(linksOf(`[click](${url})`)).toEqual([]);
  expect(splitText(`[click](${url})`)).toEqual([{ kind: 'text', text: `[click](${url})` }]);
});

it('RF-507 never turns raw HTML into anything but text', () => {
  const html = '<a href="https://github.com/o/r">x</a><img src=x onerror=alert(1)>';
  const parts = splitText(html);
  expect(parts.map((part) => part.kind)).toContain('text');
  expect(
    parts
      .filter((part) => part.kind === 'text')
      .map((part) => part.text)
      .join(''),
  ).toContain('<img src=x onerror=alert(1)>');
});

it('RF-507 returns the whole text unchanged when it has no link', () => {
  expect(splitText('plain text')).toEqual([{ kind: 'text', text: 'plain text' }]);
  expect(splitText('')).toEqual([]);
});

// RF-507, RNF-010 (P3-62, owner test 2026-10-20): `inline code` in model text is a code part, still
// only text; the backticks do not show.

it('RF-507 turns text between single backticks into a code part without the backticks', () => {
  expect(splitText('Calls `GetOrders()` twice')).toEqual([
    { kind: 'text', text: 'Calls ' },
    { kind: 'code', text: 'GetOrders()' },
    { kind: 'text', text: ' twice' },
  ]);
});

it('RF-507 keeps a backtick that has no partner as text', () => {
  expect(splitText('a lone ` backtick')).toEqual([{ kind: 'text', text: 'a lone ` backtick' }]);
  expect(splitText('empty `` pair')).toEqual([{ kind: 'text', text: 'empty `` pair' }]);
});

it('RF-507 does not run a code part across a line break', () => {
  expect(splitText('one `two\nthree` four')).toEqual([
    { kind: 'text', text: 'one `two\nthree` four' },
  ]);
});

it('RF-507 keeps markup and a link inside backticks as code text, never a link or an element', () => {
  expect(splitText('`<b>x</b>` and `https://github.com/o/r`')).toEqual([
    { kind: 'code', text: '<b>x</b>' },
    { kind: 'text', text: ' and ' },
    { kind: 'code', text: 'https://github.com/o/r' },
  ]);
});

it('RF-507 still finds a link outside the backticks', () => {
  expect(linksOf('Run `x` then https://github.com/o/r.')).toEqual(['https://github.com/o/r']);
});
