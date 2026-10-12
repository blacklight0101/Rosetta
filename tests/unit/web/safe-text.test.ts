import { describe, expect, it } from 'vitest';
import { splitText } from '../../../web/src/lib/safe-text';

// RF-507 rule 2: inside repository and model text only https://github.com/ links stay links.

const linksOf = (text: string) =>
  splitText(text).flatMap((part) => (part.kind === 'link' ? [part.href] : []));

describe('RF-507 text-only rendering helper', () => {
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
    expect(linksOf('Read https://github.com/owner/repo.')).toEqual([
      'https://github.com/owner/repo',
    ]);
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
});
