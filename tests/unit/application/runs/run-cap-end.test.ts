import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-422, RF-1106, ADR-007: a cap refusal aborts the run's one signal with the budget code, every
// running task stops, and the run ends `CapReached` (a user's Stop still ends it `Interrupted`).

describe('a run stopped by a cap', () => {
  it('RF-422 ends CapReached with RST-1600 whatever the executor reports', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const execution = h.executor.started[0];
    execution?.signal.addEventListener('abort', () => {
      h.executor.fail(run.id, new Error('a task stopped'));
    });

    execution?.stop(new RosettaError(ERROR_CODES.budgetCapReached));
    const ended = await h.ended(run);

    expect(execution?.signal.aborted).toBe(true);
    expect(ended.endState).toBe('CapReached');
  });

  it('RF-422 also ends CapReached when the executor saved its results and returned Completed', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const execution = h.executor.started[0];

    execution?.stop(new RosettaError(ERROR_CODES.budgetCapReached));
    h.executor.settle(run.id, { endState: 'Completed' });

    expect((await h.ended(run)).endState).toBe('CapReached');
  });

  it('RF-1108 a stop for another reason ends the run Interrupted', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const execution = h.executor.started[0];

    execution?.stop(new RosettaError(ERROR_CODES.providerCallCancelled));
    h.executor.settle(run.id, { endState: 'Failed', errorCode: ERROR_CODES.providerCallCancelled });

    expect((await h.ended(run)).endState).toBe('Interrupted');
  });
});
