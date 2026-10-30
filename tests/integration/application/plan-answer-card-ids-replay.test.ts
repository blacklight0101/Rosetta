import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../src/application/plan/plan-answer.js';
import { assemblePlan } from '../../../src/domain/planning/plan-content.js';
import { requirementLines } from '../../../src/infrastructure/handoff/handoff-requirement-notes-markdown.js';
import { invariant, scenario } from '../../support/task-card-fixtures.js';

// P7-15 round 2, EV-67, RF-607, RF-601, DEC-176: the real planner-package answer of the eShop plan
// a9700a80 (tests/fixtures/plan-answers/eshop-card-ids.json). Cards 2-5 name source card ids and
// keep their requirements. Cards 6 and 7 name only ids no requirement cites, so their list ends
// empty: under SDD they follow P7-14's rule and are kept, and checks.md says each needs a
// requirement, under "Requirements of the task cards", never under "Left out".

async function real() {
  const text = await readFile(
    join('tests', 'fixtures', 'plan-answers', 'eshop-card-ids.json'),
    'utf8',
  );
  const draft = parsePlanAnswer(text);
  if (draft === undefined) throw new Error('the real answer must read');
  const supported = new Set(draft.requirements.flatMap((each) => each.sources));
  return assemblePlan(draft, supported, { specificationDriven: true });
}

describe('the real eShop plan a9700a80 under SDD (P7-15)', () => {
  it('RF-607 P7-15 all seven cards are kept', async () => {
    const plan = await real();

    expect(plan.leftOut).toEqual([]);
    expect(plan.content.tasks).toHaveLength(7);
    expect(plan.content.tasks.map((each) => each.requirements.length > 0)).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('RF-607 P7-15 a card whose ids resolve to nothing is noted as needing a requirement', async () => {
    const plan = await real();

    expect(plan.content.requirementNotes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'none', task: 'T-006' }),
        expect.objectContaining({ kind: 'none', task: 'T-007' }),
      ]),
    );
  });

  it('RF-627 P7-15 the notes are in "Requirements of the task cards" and say the card was kept', async () => {
    const plan = await real();

    const text = requirementLines(plan.content.requirementNotes ?? []).join('\n');

    expect(text).toContain('## Requirements of the task cards');
    expect(text).toContain('was kept');
    expect(text).not.toMatch(/left out/iu);
    expect(plan.unreadable).toEqual([]);
    expect(text).not.toMatch(/FEAT-|BR-093|SCRN-/u);
  });
});

describe('a package card whose requirement ids resolve to nothing (P7-15)', () => {
  const answer = {
    requirements: [{ title: 'Orders', statement: 'Place an order.', sources: ['FEAT-001'] }],
    phases: [{ name: 'One', goal: 'Build it.', exitCriteria: ['Done.'] }],
    tasks: [
      {
        ...{ title: 'Orders', phase: 1, requirements: ['FEAT-999', 'abc'], riskClass: 'none' },
        ...{ acceptanceCriteria: [scenario], invariant },
      },
      {
        ...{ title: 'Plain', phase: 1, requirements: [], riskClass: 'none' },
        ...{ acceptanceCriteria: [scenario], invariant },
      },
    ],
  };

  it('RF-607 P7-15 is kept with a note; a card that named nothing is still left out', () => {
    const draft = parsePlanAnswer(JSON.stringify(answer));
    if (draft === undefined) throw new Error('the answer must read');

    const plan = assemblePlan(draft, new Set(['FEAT-001']), { specificationDriven: true });

    expect(plan.content.tasks.map((each) => each.title)).toEqual(['Orders']);
    expect(plan.leftOut.map((each) => [each.position, each.field])).toEqual([[2, 'requirements']]);
    expect(plan.content.requirementNotes).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'none', task: 'T-001' })]),
    );
  });

  it('RF-607 P7-15 without SDD no note is made', () => {
    const draft = parsePlanAnswer(JSON.stringify(answer));
    if (draft === undefined) throw new Error('the answer must read');

    const plan = assemblePlan(draft, new Set(['FEAT-001']), {});

    expect(plan.content.requirementNotes ?? []).not.toContainEqual(
      expect.objectContaining({ kind: 'none' }),
    );
  });
});
