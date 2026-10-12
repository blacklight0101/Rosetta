import { describe, expect, it } from 'vitest';
import { queuePositions, runsToStart } from '../../../../src/domain/runs/queue-rules.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';

// RF-1108: more running runs than the limit queue; one user has at most one running run; a run
// starts when a slot frees, in the order the runs were queued.

const amy = '00000000-0000-4000-9000-0000000000a1';
const bob = '00000000-0000-4000-9000-0000000000b2';
const cyd = '00000000-0000-4000-9000-0000000000c3';

describe('runsToStart', () => {
  it('RF-1108 starts queued runs in queue order up to the limit', () => {
    const first = sampleRun({ userId: amy });
    const second = sampleRun({ userId: bob });
    const third = sampleRun({ userId: cyd });

    const chosen = runsToStart([third, first, second], [], 2);

    expect(chosen).toEqual([first, second]);
  });

  it('RF-1108 counts the running runs against the limit', () => {
    const queued = sampleRun({ userId: bob });
    const running = runningRun({ userId: amy });

    expect(runsToStart([queued], [running], 1)).toEqual([]);
    expect(runsToStart([queued], [running], 2)).toEqual([queued]);
  });

  it('RF-1108 starts at most one run per user and lets the next user go ahead', () => {
    const amyFirst = sampleRun({ userId: amy });
    const amySecond = sampleRun({ userId: amy });
    const bobRun = sampleRun({ userId: bob });

    const chosen = runsToStart([amyFirst, amySecond, bobRun], [], 3);

    expect(chosen).toEqual([amyFirst, bobRun]);
  });

  it('RF-1108 does not start a second run of a user who already has one running', () => {
    const running = runningRun({ userId: amy });
    const waiting = sampleRun({ userId: amy });
    const other = sampleRun({ userId: bob });

    expect(runsToStart([waiting, other], [running], 3)).toEqual([other]);
  });
});

describe('runsToStart tie and limit', () => {
  it('RF-1108 breaks a tie on the queue time by run id', () => {
    const later = sampleRun({
      userId: amy,
      queuedAt: 5,
      id: '00000000-0000-4000-b000-0000000000bb',
    });
    const earlier = sampleRun({
      userId: bob,
      queuedAt: 5,
      id: '00000000-0000-4000-b000-0000000000aa',
    });

    expect(runsToStart([later, earlier], [], 1)).toEqual([earlier]);
  });

  it('RF-1108 starts nothing with a limit of zero', () => {
    expect(runsToStart([sampleRun()], [], 0)).toEqual([]);
  });
});

describe('queuePositions', () => {
  it('RF-1108 numbers the queued runs from 1 in queue order', () => {
    const first = sampleRun({ queuedAt: 1 });
    const second = sampleRun({ queuedAt: 2 });
    const third = sampleRun({ queuedAt: 3 });

    const positions = queuePositions([third, first, second]);

    expect([first, second, third].map((run) => positions.get(run.id))).toEqual([1, 2, 3]);
  });
});
