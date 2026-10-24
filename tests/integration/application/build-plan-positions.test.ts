import { describe, expect, it } from 'vitest';
import { withTasks } from '../../support/coverage-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-54, RF-601, RF-627, ADR-013, ADR-008: the plan answer, not only the gap answer, reads the
// positions of a task card written as objects, and every card the package leaves out is logged with
// its position and the reason, never with text of the answer.

const temp = useTempRoot('rosetta-positions-');

const sentinel = 'sentinel-title-0451';

function card(title: string, more: Record<string, unknown> = {}) {
  return {
    ...{ title, phase: 1, requirements: [{ position: 1 }], dependsOn: [] },
    acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
    ...{ invariant: 'An order posted is an order stored.', riskClass: 'none' },
    ...more,
  };
}

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

describe('BuildPlan: the plan answer with object positions', () => {
  it('Q-54 RF-601 reads requirements and dependsOn written as objects', async () => {
    const tasks = [
      card('First card'),
      card('Second card', { dependsOn: [{ position: 1, builds: ['T-005'] }] }),
    ];
    const h = await seededUxPlan(temp.path, { recording: await withTasks(tasks) });

    const written = await h.handoffOf(await h.plan());

    const cards = plain(written['tasks.md']).split(/^## /mu);
    // The first card of the package creates the tables, so the answer's cards are T-005 and T-006 (the skeleton, the migrations, the data access and the harness come first).
    const second = cards.find((each) => each.includes('**Second card**')) ?? '';
    expect(second).toMatch(/^T-006\n/u);
    expect(second).toMatch(/Depends on:.*\[T-005\]/u);
    expect(second).toContain('REQ-001');
  });

  it('Q-54 RF-627 a card the package leaves out is logged with its position and the field, no text', async () => {
    const tasks = [
      card('First card'),
      card(sentinel, { phase: 7 }),
      card(`${sentinel}-2`, { invariant: '' }),
    ];
    const h = await seededUxPlan(temp.path, { recording: await withTasks(tasks) });

    await h.plan();

    const left = h.s.logger.entries
      .map((entry) => entry.message)
      .filter((text) => text.includes('Task card at position'));
    expect(left.some((text) => /position 2 of the plan answer.*field "phase"/u.test(text))).toBe(
      true,
    );
    expect(
      left.some((text) => /position 3 of the plan answer.*field "invariant"/u.test(text)),
    ).toBe(true);
    expect(JSON.stringify(h.s.logger.entries)).not.toContain(sentinel);
  });
});
