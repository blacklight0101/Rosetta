import { describe, expect, it } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-1108, RNF-002, RF-1105: StopRun aborts the signal of a running run (it ends as Interrupted),
// cancels a queued run, refuses a run that has ended, and answers not-found for another user's run.

const unknownRun = '00000000-0000-4000-b000-00000000ffff';

describe('StopRun', () => {
  it('RF-1108 aborts the signal of a running run, which then ends as Interrupted', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.started[0]?.signal.addEventListener('abort', () => {
      h.executor.settle(run.id, { endState: 'Interrupted' });
    });

    const stopped = await h.stop.execute({ actor: userAmy, runId: run.id });

    expect(stopped).toMatchObject({ ok: true, value: { kind: 'stopping' } });
    expect(h.executor.signalOf(run.id)?.aborted).toBe(true);
    expect((await h.ended(run)).endState).toBe('Interrupted');
  });

  it('RNF-002 ends a stopped run as Interrupted even when the executor reports a failure', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.started[0]?.signal.addEventListener('abort', () => {
      h.executor.fail(run.id, new Error('aborted'));
    });

    await h.stop.execute({ actor: userAmy, runId: run.id });

    expect((await h.ended(run)).endState).toBe('Interrupted');
  });

  it('RF-1108 frees the slot of a stopped run for the next queued run', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const first = await h.start(userAmy);
    const second = await h.start(userBob);
    h.executor.started[0]?.signal.addEventListener('abort', () => {
      h.executor.settle(first.id, { endState: 'Interrupted' });
    });

    await h.stop.execute({ actor: userAmy, runId: first.id });
    await h.ended(first);

    expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
  });

  it('RF-1108 cancels a queued run as Interrupted without it ever running', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    await h.start(userAmy);
    const waiting = await h.start(userBob);

    const stopped = await h.stop.execute({ actor: userBob, runId: waiting.id });

    expect(stopped).toMatchObject({
      ok: true,
      value: { kind: 'cancelled', run: { queueState: 'Ended', endState: 'Interrupted' } },
    });
    expect(h.executor.startedKeys).toHaveLength(1);
    const stored = await h.events.read(h.scopeOf(waiting), 0);
    expect(stored.map((event) => event.type)).toEqual(['run.ended']);
    expect(await h.manifests.read(h.scopeOf(waiting))).toMatchObject({ endState: 'Interrupted' });
  });
});

describe('StopRun refusals', () => {
  it('RF-1105 answers not-found for another user run and leaves it running', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);

    const stopped = await h.stop.execute({ actor: userBob, runId: run.id });

    expect(stopped).toEqual({ ok: false, error: 'not-found' });
    expect(h.executor.signalOf(run.id)?.aborted).toBe(false);
  });

  it('RF-1105 answers not-found for an unknown run', async () => {
    const h = createRunHarness();

    expect(await h.stop.execute({ actor: userAmy, runId: unknownRun })).toEqual({
      ok: false,
      error: 'not-found',
    });
  });

  it('RF-003 refuses to stop a run that has already ended', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    expect(await h.stop.execute({ actor: userAmy, runId: run.id })).toEqual({
      ok: false,
      error: 'already-ended',
    });
  });
});
