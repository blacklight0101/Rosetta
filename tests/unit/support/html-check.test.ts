import { describe, expect, it } from 'vitest';
import { htmlProblems } from '../../support/html-check.js';

// RF-626, RF-507: the HTML check the wireframes pass in the tests. It has its own tests that feed
// it pages with each kind of thing it must catch, so a check that stopped looking would fail here.

const clean = [
  '<!doctype html>',
  '<html lang="en"><head><meta charset="utf-8">',
  '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'">',
  '<title>Orders</title><style>.box { border: 1px solid #000; }</style></head>',
  '<body><h1>Orders &lt;script&gt;alert(1)&lt;/script&gt;</h1>',
  '<nav><ul><li><a href="SCRN-003.html">Checkout</a></li></ul></nav></body></html>',
].join('\n');

function withBody(body: string): string {
  return clean.replace('</body>', `${body}</body>`);
}

describe('htmlProblems', () => {
  it('RF-626 finds nothing wrong with a plain page whose text is escaped', () => {
    expect(htmlProblems(clean)).toEqual([]);
  });

  it.each([
    ['a script element', '<script>alert(1)</script>', 'script'],
    ['a script element in capitals', '<SCRIPT SRC=x></SCRIPT>', 'script'],
    ['an event attribute', '<p onclick="x()">a</p>', 'event attribute onclick on <p>'],
    [
      'an event attribute on a tag with other attributes',
      '<p class="a" onMouseOver=x>a</p>',
      'event attribute onmouseover on <p>',
    ],
    ['a javascript: link', '<a href="javascript:alert(1)">a</a>', 'javascript: address in href'],
    [
      'a javascript: link with a leading space',
      '<a href=" JavaScript:alert(1)">a</a>',
      'javascript: address in href',
    ],
    [
      'an external link',
      '<a href="https://example.com/">a</a>',
      'href="https://example.com/" on <a> is not a link to a sibling wireframe',
    ],
    [
      'a protocol-relative link',
      '<a href="//example.com/x">a</a>',
      'href="//example.com/x" on <a> is not a link to a sibling wireframe',
    ],
    [
      'a link to a path',
      '<a href="../README.md">a</a>',
      'href="../README.md" on <a> is not a link to a sibling wireframe',
    ],
  ])('RF-626 finds %s', (_name, body, problem) => {
    expect(htmlProblems(withBody(body))).toContain(problem);
  });
});

describe('htmlProblems: frames, objects and styles', () => {
  it.each([
    ['an external image', '<img src="https://example.com/x.png">', '<img>'],
    ['an iframe', '<iframe src="x"></iframe>', '<iframe>'],
    ['an object', '<object data="x"></object>', '<object>'],
    ['an embed', '<embed src="x">', '<embed>'],
    [
      'an external stylesheet',
      '<link rel="stylesheet" href="https://example.com/a.css">',
      '<link>',
    ],
    [
      'a style block that loads a file',
      '<style>.a { background: url(https://example.com/x) }</style>',
      'style block loads or runs',
    ],
    ['a style block that imports', '<style>@import "x.css";</style>', 'style block loads or runs'],
    [
      'a style attribute that loads a file',
      '<p style="background:url(x)">a</p>',
      'style attribute loads or runs',
    ],
  ])('RF-626 finds %s', (_name, body, problem) => {
    expect(htmlProblems(withBody(body))).toContain(problem);
  });
});

describe('htmlProblems: other ways to load or hide something', () => {
  it.each([
    [
      'a meta refresh',
      '<meta http-equiv="refresh" content="0;url=https://example.com">',
      'meta refresh',
    ],
    ['a comment', '<!-- hidden -->', 'comment'],
    ['a raw less-than sign in the text', '<p>1 < 2</p>', 'a < that starts no tag'],
    [
      'a greater-than sign in an attribute value that hides an event attribute',
      '<p title="a>" onclick="x()">a</p>',
      'a > that closes no tag',
    ],
  ])('RF-626 finds %s', (_name, body, problem) => {
    expect(htmlProblems(withBody(body))).toContain(problem);
  });
});
