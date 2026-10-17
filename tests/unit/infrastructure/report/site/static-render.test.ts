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
