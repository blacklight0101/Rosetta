import { describe, expect, it } from 'vitest';
import { transitionClaim } from '../../../../src/domain/cards/card.js';
import { draftOf, oqDraft } from '../../../support/card-fixtures.js';
import { dangerousIn, renderMarkdown } from '../../../support/render-markdown.js';
import { cardsOf, fileOf, writeCards } from '../../../support/card-output-harness.js';

// ADR-013, RF-507, RF-125: model text is text. After the links Rosetta builds itself are taken
// out, no link, image, autolink, raw HTML, entity, reference definition or code fence is left.

const hostile = [
  ['an inline link', '[click](http://evil.example/x)'],
  ['a remote image', '![i](http://evil.example/p.png)'],
  ['an autolink', '<http://auto.example>'],
  ['bare URLs', 'see http://bare.example/a and https://bare.example and www.bare.example'],
  ['a script tag', '<script>alert(1)</script>'],
  ['an event handler tag', '<img src=x onerror=alert(1)>'],
  ['HTML entities', '&lt;b&gt; &#60;i&#62; &amp;'],
  ['a reference definition', '[ref]: http://evil.example/def\n[ref]'],
  ['backtick and tilde fences', '```\n# breakout\n```\n~~~\nx'],
  ['an e-mail address', 'mail me@evil.example'],
  ['a heading and a rule', '# Heading\n---\n* item\n1. item'],
  ['setext underlines', 'Title\n===\nOther\n  ---\nThird\n=  '],
] as const;

const generatedHref = /^(?:\.\.?\/|cards\/|https:\/\/github\.com\/octo\/demo\/blob\/)/;

/** The rules a text breaks once rendered as Markdown; empty when it stayed inert text. */
function breaks(text: string): string[] {
  const html = renderMarkdown(text);
  const hrefs = [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((match) => match[1] ?? '');
  const found = [
    dangerousIn(text) === undefined ? '' : 'dangerous HTML or link',
    hrefs.some((href) => !generatedHref.test(href)) ? 'foreign link or image' : '',
    /<(?:hr|pre|code|em|strong|del)[\s>/]/.test(html) ? 'rule, code or emphasis' : '',
    /<h[1-6][^>]*>(?:Heading|breakout|Title|Other|Third)/.test(html) ? 'heading' : '',
    /<(?:ul|ol)>\s*<li>item/.test(html) ? 'list' : '',
  ];
  return found.filter((name) => name !== '');
}

function bodyOf(file: string): string {
  return file.split('\n---\n').slice(1).join('\n---\n');
}

function headerOf(file: string): string {
  return file.split('\n---\n')[0] ?? '';
}

function hostileTasks(text: string) {
  const claim = { text, citations: [{ path: 'a/b.cs', startLine: 1, endLine: 2 }] };
  const base = { title: text, summary: text, claims: [claim], area: text };
  const oq = { ...oqDraft(), ...base, question: text, whyItMatters: text };
  return [{ agentTaskId: 't', area: text, drafts: [draftOf(base), oq] }];
}

describe('card files keep model text inert', () => {
  it.each(hostile)('RF-507 %s in any field of a card file stays text', async (_name, text) => {
    const cards = cardsOf(hostileTasks(text));
    const first = cards[0];
    if (first === undefined) throw new Error('fixture');
    const judged = transitionClaim(first, `${first.id}.c1`, 'Rejected', {
      step: 'judgement',
      reason: text,
      model: text,
      at: '2026-10-12T10:00:00.000Z',
    });
    if (!judged.ok) throw new Error('fixture');

    const { writer } = await writeCards([judged.value, ...cards.slice(1)]);

    expect(breaks(bodyOf(fileOf(writer, 'cards/FEAT/FEAT-001.md')))).toEqual([]);
    expect(breaks(bodyOf(fileOf(writer, 'cards/OQ/OQ-001.md')))).toEqual([]);
  });

  it.each(hostile)('RF-507 %s in the YAML header stays out of live Markdown', async (_n, text) => {
    const { writer } = await writeCards(cardsOf(hostileTasks(text)));

    const header = headerOf(fileOf(writer, 'cards/FEAT/FEAT-001.md'));
    expect(header).not.toMatch(/[<>[\]&]/);
    expect(header).not.toMatch(/https?:/i);
  });

  it('RF-125 the citations Rosetta builds are still real links', async () => {
    const { writer } = await writeCards(cardsOf(hostileTasks('x')));

    expect(fileOf(writer, 'cards/FEAT/FEAT-001.md')).toContain(
      '(https://github.com/octo/demo/blob/3f786850e387550fdab836ed7e6dc881de23001b/a/b.cs#L1-L2)',
    );
  });
});

describe('spec.md keeps model text inert', () => {
  it.each(hostile)('RF-507 %s in area, title, summary or claim stays text', async (_name, text) => {
    const { writer } = await writeCards(cardsOf(hostileTasks(text)));

    expect(breaks(fileOf(writer, 'spec.md'))).toEqual([]);
  });
});
