import { describe, expect, it } from 'vitest';
import { separateFrontEnd } from '../../support/api-plan-harness.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { screenCardLinks, screenCardRecording } from '../../support/screen-card-plan-harness.js';
import { plain, seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-627, RF-630, RF-631, ADR-008: a task card's requirements agree with what it builds. In the
// recorded case the planner counted its requirements one too high for the screen cards, while the
// coverage call linked the cards to the right screens. Code puts the right requirements on the
// cards, takes the others off, and lists each change and each position outside the list in
// checks.md. The behaviours follow the requirements (RF-631).

const temp = useTempRoot('rosetta-alignment-');

/** The recorded case, planned under a brief without SDD (an SDD plan leaves a card without requirement out, RF-607). */
async function plannedCase() {
  const h = await seededUxPlan(temp.path, {
    recording: await screenCardRecording(),
    harness: { coverageRecording: await withCoverageAnswer(screenCardLinks) },
  });
  await h.saveBrief({ ...separateFrontEnd, principles: ['tdd'] });
  return await h.handoffOf(await h.plan());
}

/** The task card of tasks.md with this id; T-001 is the migration card, so draft task n is T-(n+1). */
function cardOf(tasks: string, id: string): string {
  return tasks.split(/^## /mu).find((card) => card.startsWith(`${id}\n`)) ?? '';
}

describe('RF-627 the recorded case: screen cards counted one requirement too high', () => {
  it('RF-627 the three screen cards get requirements 11, 12 and 13 and their behaviours', async () => {
    const tasks = plain((await plannedCase())['tasks.md']);

    const invoice = cardOf(tasks, 'T-008');
    const masterdata = cardOf(tasks, 'T-009');
    const dashboard = cardOf(tasks, 'T-010');

    expect(invoice).toContain('REQ-011');
    expect(invoice).not.toContain('REQ-012');
    expect(invoice).toContain('SCRN-001.c1');
    expect(masterdata).toContain('REQ-012');
    expect(masterdata).not.toContain('REQ-013');
    expect(masterdata).toContain('SCRN-002.c1');
    expect(dashboard).toContain('REQ-013');
    expect(dashboard).toContain('SCRN-005.c1');
  });

  it('RF-627 checks.md lists the position outside the list and each change', async () => {
    const checks = plain((await plannedCase())['checks.md']);

    expect(checks).toContain('## Requirements of the task cards');
    expect(checks).toContain(
      'The task card at position 9 of the plan answer lists requirement position 14, but the plan has 13 requirements; that position was ignored.',
    );
    expect(checks).toContain('T-008 gained REQ-011');
    expect(checks).toContain('T-008 lost REQ-012');
    expect(checks).toContain('T-009 gained REQ-012');
    expect(checks).toContain('T-009 lost REQ-013');
    expect(checks).toContain('T-010 gained REQ-013');
  });
});
