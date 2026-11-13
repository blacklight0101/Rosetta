import { describe, expect, it } from 'vitest';
import type { Run } from '../../../../src/domain/runs/run.js';
import { endRun, reopenRun } from '../../../../src/domain/runs/run.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';

// RF-006, P8-111: a run that ended `Interrupted` keeps why (a Stop of its owner, a restart of the
// server, a cancel while queued); a run without a reason has none, and a resume clears it.

const pausedRun = (): Run => ({ ...runningRun(), queueState: 'AwaitingApproval' });

describe('the end reason of a run', () => {
  it('RF-006 records the reason a running run was stopped for', () => {
    const ended = endRun(runningRun(), 'Interrupted', 9_000, { endReason: 'UserStop' });

    expect(ended).toMatchObject({
      ok: true,
      value: { endState: 'Interrupted', endReason: 'UserStop' },
    });
  });

  it('RF-006 records the cancel of a queued run', () => {
    const ended = endRun(sampleRun(), 'Interrupted', 9_000, { endReason: 'QueueCancel' });

    expect(ended).toMatchObject({ ok: true, value: { endReason: 'QueueCancel' } });
  });

  it('RF-006 leaves the reason empty when none is given, and for a run that was not interrupted', () => {
    const interrupted = endRun(runningRun(), 'Interrupted', 9_000);
    const completed = endRun(runningRun(), 'Completed', 9_000, { endReason: 'Restart' });

    expect(interrupted).toMatchObject({ ok: true, value: { endReason: null } });
    expect(completed).toMatchObject({ ok: true, value: { endReason: null } });
  });

  it('RF-006 clears the reason when a resume queues the run again', () => {
    const ended = endRun(runningRun(), 'Interrupted', 9_000, { endReason: 'Restart' });
    if (!ended.ok) throw new Error('The run did not end');

    expect(reopenRun(ended.value, 20_000)).toMatchObject({ ok: true, value: { endReason: null } });
  });

  it('RF-432 records that its owner stopped a paused run at the approved amount', () => {
    const ended = endRun(pausedRun(), 'CapReached', 9_000, { endReason: 'StoppedAtApproval' });

    expect(ended).toMatchObject({
      ok: true,
      value: { endState: 'CapReached', endReason: 'StoppedAtApproval' },
    });
  });

  it('RF-432 a run a cap stopped has no reason, and an interrupted run never has this one', () => {
    const capped = endRun(runningRun(), 'CapReached', 9_000);
    const interrupted = endRun(runningRun(), 'Interrupted', 9_000, {
      endReason: 'StoppedAtApproval',
    });

    expect(capped).toMatchObject({ ok: true, value: { endReason: null } });
    expect(interrupted).toMatchObject({ ok: true, value: { endReason: null } });
  });
});
