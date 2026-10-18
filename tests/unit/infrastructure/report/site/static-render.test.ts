import { Fragment, h, type ComponentChild, type ComponentChildren } from 'preact';
import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { renderStatic } from '../../../../../src/infrastructure/report/site/static-render.js';

// RF-500, RF-507, ADR-021: Preact components become static HTML when the report is built. Every
// text and attribute value is escaped by the renderer, and anything that could run is refused.

function Greeting(props: { readonly name: string; readonly children?: ComponentChildren }) {
  return h('p', { class: 'greeting' }, 'Hello, ', props.name, props.children);
}

function refusal(build: () => string): unknown {
  try {
    build();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('renderStatic', () => {
  it('RF-500 writes elements, attributes and text, and runs function components and fragments', () => {
    const tree = h(
      Fragment,
      null,
      h('h1', { id: 'top' }, 'Title'),
      h(Greeting, { name: 'Ada' }, ' (admin)'),
    );

    expect(renderStatic(tree)).toBe(
      '<h1 id="top">Title</h1><p class="greeting">Hello, Ada (admin)</p>',
    );
  });

  it('RF-507 escapes element text and attribute values', () => {
    const tree = h('p', { title: 'say "hi" & <go>' }, "<b>bold</b> & 'quoted'");

    expect(renderStatic(tree)).toBe(
      '<p title="say &quot;hi&quot; &amp; &lt;go&gt;">&lt;b&gt;bold&lt;/b&gt; &amp; &#39;quoted&#39;</p>',
    );
  });

  it('RF-500 writes void elements without a closing tag and boolean attributes bare', () => {
    expect(
      renderStatic(h('div', null, h('br', null), h('input', { type: 'text', hidden: true }))),
    ).toBe('<div><br><input type="text" hidden></div>');
  });

  it('RF-500 skips null, undefined, true and false, and writes numbers and nested lists', () => {
    const tree = h('ul', null, [
      h('li', { key: 1 }, 1),
      null,
      undefined,
      false,
      true,
      h('li', null, 0),
    ]);

    expect(renderStatic(tree)).toBe('<ul><li>1</li><li>0</li></ul>');
  });

  it('RF-500 leaves out an attribute that is false or undefined', () => {
    expect(renderStatic(h('input', { disabled: false, 'aria-label': undefined }))).toBe('<input>');
  });
});

describe('renderStatic output', () => {
  it('RF-500 gives the same bytes for the same tree', () => {
    const build = () => h(Greeting, { name: 'Ada' });

    expect(renderStatic(build())).toBe(renderStatic(build()));
  });
});

describe('renderStatic refusals', () => {
  it.each<[string, () => ComponentChild]>([
    ['dangerouslySetInnerHTML', () => h('p', { dangerouslySetInnerHTML: { __html: '<b>x</b>' } })],
    ['an event handler', () => h('p', { onclick: 'window.__pwned = 1' }, 'text')],
    ['a style attribute', () => h('p', { style: 'color: red' }, 'text')],
    ['an attribute name that could close the tag', () => h('p', { 'a"><script>': 'x' }, 'text')],
  ])('RF-507 refuses %s with the report write code', (_name, make) => {
    const error = refusal(() => renderStatic(make()));

    expect(error).toBeInstanceOf(RosettaError);
    expect(error instanceof RosettaError ? error.code : '').toBe(ERROR_CODES.reportWriteFailed);
  });

  it.each([
    'javascript:window.__pwned = 1',
    'data:text/html,<script>1</script>',
    'https://example.com/',
    '//example.com/',
  ])('RF-507 refuses the address %s in a link', (address) => {
    expect(refusal(() => renderStatic(h('a', { href: address }, 'x')))).toBeInstanceOf(
      RosettaError,
    );
  });

  it.each(['replay.html', '../spec.md', '#cards', 'https://github.com/octo/demo/blob/abc/a.cs#L1'])(
    'RF-507 keeps the link to %s',
    (address) => {
      expect(renderStatic(h('a', { href: address }, 'x'))).toBe(`<a href="${address}">x</a>`);
    },
  );

  it('RF-507 refuses a script element', () => {
    expect(refusal(() => renderStatic(h('script', null, '1')))).toBeInstanceOf(RosettaError);
  });
});

describe('renderStatic address rules', () => {
  it.each([
    'java\tscript:1',
    'java\nscript:1',
    '\x5Cevil.com',
    '/\x5Cevil.com',
    'a\u0000b',
    ' javascript:1',
  ])('RF-507 refuses the address %j in a link', (address) => {
    expect(refusal(() => renderStatic(h('a', { href: address }, 'x')))).toBeInstanceOf(
      RosettaError,
    );
  });

  it.each<[string, () => ComponentChild]>([
    ['img src', () => h('img', { src: 'data:image/svg+xml,<svg/>' })],
    ['img src to another host', () => h('img', { src: 'https://example.com/x.png' })],
    ['action', () => h('div', { action: 'javascript:1' })],
    ['svg use xlink:href', () => h('svg', null, h('use', { 'xlink:href': 'javascript:1' }))],
    ['upper-case HREF', () => h('a', { HREF: 'javascript:1' })],
  ])('RF-507 checks the address of %s', (_name, make) => {
    expect(refusal(() => renderStatic(make()))).toBeInstanceOf(RosettaError);
  });

  it('RF-507 keeps a relative src', () => {
    expect(renderStatic(h('img', { src: 'a.png' }))).toBe('<img src="a.png">');
  });
});

describe('renderStatic element and attribute rules', () => {
  it.each([
    ...['iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta', 'base'],
    ...['form', 'template', 'noscript', 'style', 'IFRAME', 'ScRiPt', 'animate', 'set', 'math'],
    'foreignObject',
  ])('RF-507 refuses the element %s', (tag) => {
    expect(refusal(() => renderStatic(h(tag, null, 'x')))).toBeInstanceOf(RosettaError);
  });

  it.each(['a b', 'a>', 'a-b', '1a', ''])('RF-507 refuses the element name %j', (tag) => {
    expect(refusal(() => renderStatic(h(tag, null, 'x')))).toBeInstanceOf(RosettaError);
  });

  it.each([
    ...['ONCLICK', 'OnError', 'StYlE', 'srcset', 'poster', 'ping', 'background', 'data'],
    'attributeName',
  ])('RF-507 refuses the attribute %s', (name) => {
    expect(refusal(() => renderStatic(h('p', { [name]: 'x' }, 'x')))).toBeInstanceOf(RosettaError);
  });

  it('RF-507 gives a node with props and no type the report write code, not a TypeError', () => {
    const error = refusal(() => renderStatic({ props: 1 }));

    expect(error).toBeInstanceOf(RosettaError);
  });

  it('RF-507 adds rel to a link that opens a new window', () => {
    expect(renderStatic(h('a', { href: 'a.html', target: '_blank' }, 'x'))).toBe(
      '<a href="a.html" target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(renderStatic(h('a', { href: 'a.html', target: '_blank', rel: 'me' }, 'x'))).toContain(
      'rel="noopener noreferrer"',
    );
  });

  it('RF-507 drops NUL and bidi controls from text and attributes', () => {
    expect(renderStatic(h('p', { title: 'a\u202Eb' }, 'x\u0000y\u2066z'))).toBe(
      '<p title="ab">xyz</p>',
    );
  });
});

describe('renderStatic addresses with invisible characters', () => {
  it.each(['\u202E', '\u2066', '\u2069', '\u0000', '\u007F', '\u202A'])(
    'RF-507 refuses href and src containing %j',
    (mark) => {
      for (const name of ['href', 'src']) {
        const address = `java${mark}script:1`;
        expect(refusal(() => renderStatic(h('a', { [name]: address }, 'x')))).toBeInstanceOf(
          RosettaError,
        );
      }
    },
  );

  it.each(['lowsrc', 'dynsrc', 'longdesc', 'cite', 'manifest', 'to'])(
    'RF-507 checks the address in %s',
    (name) => {
      expect(refusal(() => renderStatic(h('p', { [name]: 'javascript:1' }, 'x')))).toBeInstanceOf(
        RosettaError,
      );
      expect(renderStatic(h('p', { [name]: 'a.html' }, 'x'))).toContain('a.html');
    },
  );

  it('RF-507 refuses the is attribute', () => {
    expect(refusal(() => renderStatic(h('p', { is: 'x-evil' }, 'x')))).toBeInstanceOf(RosettaError);
  });
});
