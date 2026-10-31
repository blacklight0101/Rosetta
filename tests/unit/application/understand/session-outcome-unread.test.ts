import { describe, expect, it } from 'vitest';
import { sessionOutcome } from '../../../../src/application/understand/session-outcome.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';

// P7-02, DEC-194, RF-429: a run that left planned areas unread did not read what it was asked to,
// so it is never `Completed`, whatever stopped the readers (EV-62: the claim check ended them).

const done = { state: 'Done', drafts: [] } as const;
const base = { aborted: false, outputFailure: undefined, resumed: false } as const;

describe('sessionOutcome with areas no reader started', () => {
  it('P7-02 ends CapReached with the count when readers stopped to leave room to judge', () => {
    const outcome = sessionOutcome({ ...base, ends: [done], unreadAreas: 3 });

    expect(outcome).toEqual({
      endState: 'CapReached',
      errorCode: ERROR_CODES.budgetCapReached,
      unreadAreas: 3,
    });
  });

  it('P7-02 keeps the count on a run-wide cap stop, so the end state can show Partly read', () => {
    const outcome = sessionOutcome({ ...base, aborted: true, ends: [done], unreadAreas: 2 });

    expect(outcome).toMatchObject({ unreadAreas: 2 });
  });

  it('P7-02 a run that read every planned area still ends Completed', () => {
    expect(sessionOutcome({ ...base, ends: [done], unreadAreas: 0 })).toEqual({
      endState: 'Completed',
    });
  });

  it('P7-02 a task stopped by a cap with every area started carries no unread count', () => {
    const outcome = sessionOutcome({
      ...base,
      ends: [done, { state: 'StoppedByCap', drafts: [] }],
      unreadAreas: 0,
    });

    expect(outcome.endState).toBe('CapReached');
    expect(outcome.unreadAreas).toBeUndefined();
  });
});
