import { describe, expect, it } from 'vitest';
import { planMessage } from '../../../../src/application/plan/plan-message.js';
import { buildBrief, type BriefAnswers } from '../../../../src/domain/planning/planning-brief.js';
import { workbookSetup } from '../../../../src/domain/planning/workbook-setup.js';
import { shippedCatalogue } from '../../../support/planning-brief-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-648, RF-649, RF-650, ADR-013: the answers to the workbook questions reach the planner inside
// the owner's data block only, and only for a project of workbooks.

function briefOf(answers: BriefAnswers) {
  return { ...buildBrief(answers, shippedCatalogue), savedAt: '2026-11-01T09:00:00.000Z' };
}

function messageOf(answers: BriefAnswers, workbook: boolean): { text: string; owner: string } {
  const brief = briefOf(answers);
  const ids = new SequenceIdGenerator();
  const text = planMessage(
    {
      ...{ cards: [], brief, catalogue: shippedCatalogue, answered: [] },
      ...(workbook ? { workbook: workbookSetup(brief) } : {}),
    },
    () => ids.dataBlockTag(),
  );
  return { text, owner: text.slice(text.indexOf('<<<ROSETTA-DATA', 10)) };
}

describe('planMessage: the workbook answers', () => {
  it('RF-648 RF-649 RF-650 the owner block holds the sign-in, the secrets store and the screens', () => {
    const { text, owner } = messageOf({ chosen: { 'workbook.signIn': 'accounts' } }, true);

    expect(owner).toContain('"workbookSetup"');
    expect(owner).toContain('Accounts of the application');
    expect(owner).toContain('The secret store of the hosting platform');
    expect(owner).toContain('List, edit and search screens');
    expect(text.slice(0, text.indexOf('<<<ROSETTA-DATA', 10))).not.toContain('workbookSetup');
  });

  it('RF-648 says which answers are defaults, so the planner does not treat them as decisions', () => {
    const { owner } = messageOf({ chosen: { 'workbook.signIn': 'accounts' } }, true);

    expect(owner).toMatch(/"signIn": \{[^}]*"default": false/u);
    expect(owner).toMatch(/"secretsStore": \{[^}]*"default": true/u);
  });

  it('RF-648 a project that is not a workbook sends exactly what it sent before', () => {
    const { owner } = messageOf({ chosen: { 'workbook.signIn': 'accounts' } }, false);

    expect(owner).not.toContain('workbookSetup');
    expect(owner).not.toContain('Accounts of the application');
  });
});
