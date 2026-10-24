import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../src/domain/errors/rosetta-error.js';
import { withCoverageAnswer } from '../../support/coverage-plan-harness.js';
import { closingGapRecording } from '../../support/gap-plan-harness.js';
import { seededUxPlan } from '../../support/ux-plan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';

// Q-45, RF-401, RF-422, RF-423, RST-1522: the call for the items no task card builds goes through
// the same guards as every planner call. When the Ollama context guard or a cap refuses it, the
// package of the first answer is kept (the gaps listed in checks.md) and the run ends with the
// guard's own code, not with RST-1806.

const temp = useTempRoot('rosetta-gap-refused-');

const linksOne = JSON.stringify({ links: [{ task: 1, builds: ['feature:F-001'] }] });

async function refusedBy(error: RosettaError) {
  return seededUxPlan(temp.path, {
    harness: {
      coverageRecording: await withCoverageAnswer(linksOne),
      gapRecording: await closingGapRecording(),
      beforeGapCall: () => Promise.reject(error),
    },
  });
}

const plain = (text: string | undefined): string => (text ?? '').replaceAll('\\', '');

describe('BuildPlan: the gap call refused by the Ollama context guard', () => {
  const specific = 'The planner prompt is about 31361 tokens but the context is 32768.';

  it('Q-45 RST-1522 ends the run Failed with the guard message, and the first package is kept', async () => {
    const h = await refusedBy(new RosettaError(ERROR_CODES.ollamaPromptTooLarge, specific));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(
      expect.objectContaining({ code: 'RST-1522', message: specific }),
    );
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const written = await h.handoffOf(run);
    expect(Object.keys(written)).toEqual(
      expect.arrayContaining(['README.md', 'tasks.md', 'roadmap.md', 'checks.md']),
    );
    expect(plain(written['checks.md'])).toContain('8 items of 12 are built by no task card');
    expect(plain(written['tasks.md'])).not.toContain('## T-004');
  });
});

describe('BuildPlan: the gap call refused by a cap', () => {
  it('Q-45 RF-422 ends the run CapReached with RST-1600, and the first package is kept', async () => {
    const h = await refusedBy(
      new RosettaError(ERROR_CODES.budgetCapReached, 'The call would pass the cap.'),
    );

    const run = await h.plan();

    expect(run.endState).toBe('CapReached');
    const entries = h.s.logger.entries;
    expect(entries).toContainEqual(expect.objectContaining({ code: 'RST-1600' }));
    expect(entries).not.toContainEqual(expect.objectContaining({ code: 'RST-1806' }));
    const written = await h.handoffOf(run);
    expect(Object.keys(written)).toEqual(expect.arrayContaining(['tasks.md', 'checks.md']));
    expect(plain(written['checks.md'])).toContain('operation:placeOrder');
  });

  it('Q-45 another failure of the call also keeps the first package and names the code', async () => {
    const h = await refusedBy(new RosettaError(ERROR_CODES.providerUnavailable, 'No provider.'));

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(h.s.logger.entries).toContainEqual(
      expect.objectContaining({ code: ERROR_CODES.providerUnavailable }),
    );
    expect(Object.keys(await h.handoffOf(run))).toContain('checks.md');
  });
});

describe('BuildPlan: a stop during the gap call', () => {
  it('RF-1108 a run stopped during the call ends Interrupted, not with the code of the call', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(linksOne),
        gapRecording: await closingGapRecording(),
        beforeGapCall: async (harness) => {
          await harness.stopRunning();
          throw new RosettaError(ERROR_CODES.providerUnavailable, 'Stopped.');
        },
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Interrupted');
    expect(h.s.logger.entries).not.toContainEqual(
      expect.objectContaining({ code: ERROR_CODES.providerUnavailable }),
    );
  });
});

describe('BuildPlan: a fault in the gap call that is no refusal', () => {
  it('Q-45 a plain error is not taken for a refusal: no package is written under a code it does not have', async () => {
    const h = await seededUxPlan(temp.path, {
      harness: {
        coverageRecording: await withCoverageAnswer(linksOne),
        beforeGapCall: () => Promise.reject(new TypeError('A fault of the program.')),
      },
    });

    const run = await h.plan();

    expect(run.endState).toBe('Failed');
    expect(await h.handoffOf(run)).toEqual({});
  });
});
