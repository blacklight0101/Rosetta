import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { gapRecordingOfAll } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-54, Q-45, RF-401, RF-422, RF-423, RST-1522: the repair attempt of the gap call goes through the
// same guards as every planner call. When the Ollama context guard or a cap refuses it, the package
// the first answer made is kept (its cards are written, the gaps left are listed in checks.md) and
// the run ends with the guard's own code, not with RST-1806.

const temp = useTempRoot('rosetta-gap-repair-refused-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

const card = {
  ...{ title: 'Operations', phase: 1, requirements: [1] },
  acceptanceCriteria: ['Given a basket of 60, when it is posted, then the order is stored.'],
  ...{ invariant: 'An order posted is an order stored.', riskClass: 'none' },
  builds: ['operation:placeOrder', 'operation:getOrder', 'operation:listOrders'],
};
const unreadable = {
  ...card,
  title: 'The journey',
  requirements: [{ id: 1 }],
  builds: ['flow:FLOW-001'],
};
const first = JSON.stringify({ tasks: [card, unreadable] });

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

/** The repair is the second call of the gap round: a guard that refuses it lets the first through. */
async function repairRefusedBy(error: RosettaError) {
  return seededUxPlan(temp.path, {
    harness: {
      coverageRecording: await withCoverageAnswer(linksOne),
      gapRecording: gapRecordingOfAll(first, '{"tasks": []}'),
      beforeGapCall: (harness) =>
        harness.providers.gapRequests().length === 0 ? Promise.resolve() : Promise.reject(error),
    },
  });
}

describe('BuildPlan: the repair refused by the Ollama context guard', () => {
  const specific = 'The planner prompt is about 31361 tokens but the context is 32768.';

  it('Q-54 RST-1522 ends the run Failed with the guard message, and the first package is kept', async () => {
    const h = await repairRefusedBy(new RosettaError(ERROR_CODES.ollamaPromptTooLarge, specific));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(
      expect.objectContaining({ code: 'RST-1522', message: specific }),
    );
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const written = await h.handoffOf(run);
    expect(plain(written['tasks.md'])).toContain('## T-004');
    expect(plain(written['tasks.md'])).toContain('Operations');
    expect(plain(written['checks.md'])).toContain('flow:FLOW-001');
    expect(plain(written['checks.md'])).not.toContain('operation:placeOrder');
  });
});

describe('BuildPlan: the repair refused by a cap', () => {
  it('Q-54 RF-422 ends the run CapReached with RST-1600, and the first package is kept', async () => {
    const h = await repairRefusedBy(
      new RosettaError(ERROR_CODES.budgetCapReached, 'The call would pass the cap.'),
    );

    const run = await h.plan();

    expect(run.endState).toBe('CapReached');
    expect(h.s.logger.entries).toContainEqual(expect.objectContaining({ code: 'RST-1600' }));
    expect(plain((await h.handoffOf(run))['tasks.md'])).toContain('Operations');
  });

  it('Q-54 RF-1108 a stop during the repair ends Interrupted, not with the code of the call', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(linksOne),
        gapRecording: gapRecordingOfAll(first, '{"tasks": []}'),
        beforeGapCall: async (harness) => {
          if (harness.providers.gapRequests().length === 0) return;
          await harness.stopRunning();
          throw new RosettaError(ERROR_CODES.providerUnavailable, 'Stopped.');
        },
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
  });
});

describe('BuildPlan: a fault in the repair that is no refusal', () => {
  it('Q-54 a plain error is not taken for a refusal: no package is written under a code it does not have', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(linksOne),
        gapRecording: gapRecordingOfAll(first),
        beforeGapCall: (harness) =>
          harness.providers.gapRequests().length === 0
            ? Promise.resolve()
            : Promise.reject(new TypeError('A fault of the program.')),
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(await h.handoffOf(run)).toEqual({});
  });
});
