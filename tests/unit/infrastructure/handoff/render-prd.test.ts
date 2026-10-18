import { describe, expect, it } from 'vitest';
import type { PrdContent } from '../../../../src/domain/planning/prd-content.js';
import { emptyPrd } from '../../../../src/domain/planning/prd-content.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { renderHandoff } from '../../../../src/infrastructure/handoff/file-handoff-writer.js';
import { handoffOf } from '../../../support/handoff-package-fixture.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-620, RF-621, RF-602, RF-603, RNF-003: prd.md as it is written. Every statement links its
// source cards or carries the placeholder marker; model text shows as text.

const masker = new SecretMasker();

const filled: PrdContent = {
  problem: { text: 'The shop is slow.', sources: ['FEAT-001'] },
  goal: { text: 'Replace the shop.', sources: ['FEAT-001'] },
  roles: [{ name: 'Clerk', description: 'Cancels orders.', sources: ['FEAT-001'] }],
  features: [
    { title: 'Export', description: 'Export a day.', priority: 'Could', sources: ['FEAT-001'] },
    { title: 'Order', description: 'Place an order.', priority: 'Must', sources: ['FEAT-001'] },
    { title: 'Print', description: 'Print a label.', priority: 'Wont', sources: ['FEAT-001'] },
  ],
  rules: [{ text: 'Orders over 50 ship free.', sources: ['FEAT-001'] }],
  outOfScope: [{ text: 'Mobile apps.', sources: ['FEAT-001'] }],
  nonFunctional: [{ text: 'Orders save in two seconds.', sources: ['FEAT-001'] }],
};

function prdOf(prd: PrdContent, text = 'Plain text.'): string {
  return renderHandoff(handoffOf(text, prd), masker)['prd.md'] ?? '';
}

/** The lines that state something: not blank and not a heading. */
function statements(prd: string): string[] {
  return prd.split('\n').filter((line) => line.trim() !== '' && !line.startsWith('#'));
}

describe('prd.md', () => {
  it('RF-621 holds the sections of the PRD in order', () => {
    const headings = prdOf(filled).match(/^#+ .*$/gmu);

    expect(headings).toEqual([
      '# Product requirements document',
      '## Problem',
      '## Goal',
      '## Users and roles',
      '## Features',
      '## Business rules to keep',
      '## Out of scope',
      '## Non-functional expectations',
      '## Success measures',
    ]);
  });

  it('RF-621 lists the features by MoSCoW priority, each with its FEAT card link', () => {
    const lines = statements(prdOf(filled)).filter((line) =>
      /^- \*\*(Must|Should|Could|Won)/u.test(line),
    );

    expect(lines.map((line) => /^- \*\*([\w']+)/u.exec(line)?.[1])).toEqual([
      'Must',
      'Could',
      "Won't",
    ]);
    expect(lines[0]).toContain('[FEAT-001](sources.md#feat-001)');
  });

  it('RF-620 RF-602 a feature links the package requirements built from its cards', () => {
    const order =
      prdOf(filled)
        .split('\n')
        .find((line) => line.includes('Place an order')) ?? '';

    expect(order).toContain('[REQ-001](requirements.md#req-001)');
  });

  it('RF-602 RF-621 every statement links a source card or carries the placeholder marker', () => {
    for (const prd of [prdOf(filled), prdOf(emptyPrd)]) {
      for (const line of statements(prd)) {
        expect(line).toMatch(/\]\(sources\.md#[a-z]+-\d+\)|To be confirmed/u);
      }
    }
  });
});

describe('prd.md: placeholders', () => {
  it('RF-621 DEC-80 a section the cards could not fill holds a marked placeholder naming its question', () => {
    const prd = prdOf(emptyPrd);

    for (const id of [
      'prd.problem',
      'prd.goal',
      'prd.roles',
      'prd.features',
      'prd.success-measures',
    ]) {
      expect(prd).toContain(`To be confirmed`);
      expect(prd).toContain(`[${id}](open-questions.md)`);
    }
  });

  it('RF-621 the success measures are a placeholder even when every other section is filled', () => {
    const measures = prdOf(filled).split('## Success measures')[1] ?? '';

    expect(measures).toContain('To be confirmed');
    expect(measures).toContain('[prd.success-measures](open-questions.md)');
    expect(prdOf(filled).split('## Goal')[1]?.split('##')[0]).not.toContain('To be confirmed');
  });
});

describe('prd.md: untrusted text', () => {
  it('RF-603 model text adds no HTML, link, heading or fence', () => {
    const hostile = '<img src=x onerror=alert(1)> [x](javascript:alert(1))\n# Title\n```js';
    const text = hostile;
    const prd = prdOf(
      {
        ...filled,
        problem: { text, sources: ['FEAT-001'] },
        features: [{ title: text, description: text, priority: 'Must', sources: ['FEAT-001'] }],
        roles: [{ name: text, description: text, sources: ['FEAT-001'] }],
        rules: [{ text, sources: ['FEAT-001'] }],
        outOfScope: [{ text, sources: ['FEAT-001'] }],
        nonFunctional: [{ text, sources: ['FEAT-001'] }],
      },
      text,
    );

    expect(prd).not.toMatch(/<[A-Za-z!/?]/u);
    expect(prd).not.toContain('](javascript');
    expect(prd).not.toMatch(/^# Title/mu);
    expect(prd).not.toMatch(/^```/mu);
    expect(prd.match(/&lt;img src/gu)).toHaveLength(8);
  });

  it('RNF-003 masks a secret in PRD text', () => {
    const text = `key ${fakeOpenAiKey}`;
    const sources = ['FEAT-001'];
    const prd = prdOf({
      ...filled,
      goal: { text, sources },
      roles: [{ name: text, description: text, sources }],
      rules: [{ text, sources }],
      outOfScope: [{ text, sources }],
      nonFunctional: [{ text, sources }],
    });

    expect(prd).not.toContain(fakeOpenAiKey.slice(8, 30));
    expect(prd.match(/key /gu)).toHaveLength(6);
  });
});

describe('README and open questions with the PRD', () => {
  it('RF-620 the reading order lists the PRD first, then the parts of RF-601, each linking its file', () => {
    const files = renderHandoff(handoffOf('Plain text.', filled), masker);

    const order = (files['README.md'] ?? '').split('## Reading order')[1]?.split('##')[0] ?? '';
    const links = [...order.matchAll(/\]\(([^)#]+)\)/gu)].map((match) => match[1]);
    expect(links[0]).toBe('prd.md');
    expect(links.slice(1, 5)).toEqual([
      ...['trd.md', 'data-model.md', 'requirements.md', 'architecture.md'],
    ]);
    for (const link of links) expect(Object.keys(files)).toContain(link);
  });

  it('RF-621 DEC-80 the open questions list the PRD questions with their defaults', () => {
    const files = renderHandoff(handoffOf('Plain text.', emptyPrd), masker);

    const questions = files['open-questions.md'] ?? '';
    expect(questions).toContain('## Product requirements document questions');
    expect(questions).toContain('| prd.success-measures |');
    expect(questions).toContain('| prd.goal |');
  });

  it('RF-621 a PRD with only the success measures open lists only that question', () => {
    const files = renderHandoff(handoffOf('Plain text.', filled), masker);

    const questions = files['open-questions.md'] ?? '';
    expect(questions).toContain('| prd.success-measures |');
    expect(questions).not.toContain('| prd.goal |');
  });
});
