import { describe, expect, it } from 'vitest';
import { roundTasks } from '../../../../src/application/deepen/deepen-tasks.js';
import type { RoundPlan } from '../../../../src/domain/deepen/round-plan.js';
import { agentCodeMap } from '../../../support/agent-fixtures.js';

// P5-35, RF-209, ADR-013: the re-read task lists the reason kind of a claim in the data block of
// the rejected claims; a claim without a kind has no such field.

const cite = [{ path: 'src/Orders/Order.cs', startLine: 1, endLine: 3 }];

function planOf(...defined: readonly boolean[]): RoundPlan {
  return {
    judge: [],
    reread: defined.map((isDefined, index) => ({
      claimId: `ENT-00${String(index + 1)}.c1`,
      area: 'orders',
      text: 'An order is rejected.',
      citations: cite,
      reason: 'The lines do not say it.',
      ...(isDefined ? { reasonKind: 'definedElsewhere' as const } : {}),
    })),
    outOfScope: [],
    gaps: [],
    failedAreas: [],
  };
}

function rejectedOf(plan: RoundPlan): { rejected: object[] } {
  const [task] = roundTasks(plan, agentCodeMap, 1);
  return JSON.parse(task?.rejected ?? '{"rejected":[]}') as { rejected: object[] };
}

describe('P5-35 the rejected claims of a re-read task', () => {
  it('names the reason kind of the claim whose verdict has one', () => {
    expect(rejectedOf(planOf(true))).toEqual({
      rejected: [
        {
          claimId: 'ENT-001.c1',
          text: 'An order is rejected.',
          citations: ['src/Orders/Order.cs:1-3'],
          reason: 'The lines do not say it.',
          reasonKind: 'definedElsewhere',
        },
      ],
    });
  });

  it('leaves the field out for a claim without a kind', () => {
    const [claim] = rejectedOf(planOf(false)).rejected;

    expect(claim).toBeDefined();
    expect(claim).not.toHaveProperty('reasonKind');
  });

  it('keeps a claim with a kind and one without in the one task of their area', () => {
    const tasks = roundTasks(planOf(true, false), agentCodeMap, 1);

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.replaceable).toEqual(['ENT-001.c1', 'ENT-002.c1']);
  });
});
