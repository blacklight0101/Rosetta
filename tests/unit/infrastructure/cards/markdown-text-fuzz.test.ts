import { describe, expect, it } from 'vitest';
import { markdownEscaper } from '../../../../src/infrastructure/cards/markdown-text.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { hostile } from '../../../support/hostile-markdown.js';
import { renderMarkdown } from '../../../support/render-markdown.js';

// P5-26, RF-507: a seeded fuzz of the escaper. Whatever mix of letters and Markdown or HTML
// characters model text holds, a real renderer shows no link, image, script or raw HTML.

const esc = markdownEscaper(new SecretMasker());

/** Any tag other than the structure the files write themselves (paragraphs, lists, tables). */
const foreignTag =
  /<(?!\/?(?:p|ul|ol|li|blockquote|table|thead|tbody|tr|th|td|h[1-6])[\s>/])[a-z!/?]/i;

const pieces = [
  'a',
  'b',
  'x',
  'w',
  'Z',
  'http',
  'https',
  'HTTP',
  'www',
  'WWW',
  'ftp',
  'mailto',
  ':',
  '/',
  '.',
  '[',
  ']',
  '(',
  ')',
  '<',
  '>',
  '&',
  '#',
  '`',
  '|',
  '*',
  '_',
  '~',
  '!',
  '-',
  '+',
  '=',
  '@',
  '\\',
  ' ',
  ' ',
  '1',
  'script',
  'img',
  'onerror',
];

/** A small deterministic generator (mulberry32), so a failure reproduces from its seed. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textFrom(next: () => number): string {
  const length = 1 + Math.floor(next() * 14);
  return Array.from({ length }, () => pieces[Math.floor(next() * pieces.length)] ?? '').join('');
}

const positions: readonly (readonly [string, (text: string) => string])[] = [
  ['paragraph', (text) => esc.inline(text)],
  ['list item', (text) => `- ${esc.inline(text)}`],
  ['table cell', (text) => `| a | b |\n|---|---|\n| ${esc.inline(text)} | x |`],
  ['block quote', (text) => esc.block(text)],
  ['heading', (text) => `## ${esc.inline(text)}`],
  ['link label', (text) => `[${esc.label(text)}](cards/c.md)`],
];

function problem(position: string, html: string): boolean {
  const owned =
    position === 'link label' ? html.replace(/<a href="cards\/c\.md">|<\/a>/g, '') : html;
  return foreignTag.test(owned);
}

describe('markdownEscaper fuzz', () => {
  it.each(positions)(
    'RF-507 2000 random texts in a %s form no link, image or raw HTML',
    (name, write) => {
      const next = random(26);
      const bad: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const text = textFrom(next);
        if (problem(name, renderMarkdown(write(text)))) bad.push(text);
      }
      expect(bad.slice(0, 5)).toEqual([]);
    },
  );

  it('RF-507 mutation: with the escaper swapped for the identity the hostile table fails', () => {
    const live = hostile.filter(([, text]) => problem('paragraph', renderMarkdown(text)));
    const names = live.map(([name]) => name);

    expect(names).toEqual(
      expect.arrayContaining([
        'a script tag',
        'a javascript link',
        'a remote image',
        'an autolink',
        'a bare URL',
        'a glued http URL',
        'a glued www host',
      ]),
    );
    const escaped = hostile.filter(([, text]) =>
      problem('paragraph', renderMarkdown(esc.inline(text))),
    );
    expect(escaped).toEqual([]);
  });
});
