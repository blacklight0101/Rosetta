import { describe, expect, it, vi } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-006, RF-1108, RNF-002, P8-111: a run that ends `Interrupted` records why: the Stop of its owner,
// a restart of the server (recovery or shutdown), a cancel while it waited; `run.ended` says it too.

type Harness = ReturnType<typeof createRunHarness>;

async function runningWithStop(h: Harness): Promise<string> {
  const run = await h.start(userAmy);
  await vi.waitFor(() => {
    expect(h.executor.started).toHaveLength(1);
  });
  h.executor.started[0]?.signal.addEventListener('abort', () => {
    h.executor.settle(run.id, { endState: 'Interrupted' });
  });
  return run.id;
}

describe('the reason of a run that its owner stopped or cancelled', () => {
  it('RF-006 records UserStop when the owner stops a running run, in the row and in run.ended', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const id = await runningWithStop(h);

    await h.queue.stop(userAmy.userId, id);
    await vi.waitFor(async () => {
      expect((await h.runs.find(userAmy.userId, id))?.queueState).toBe('Ended');
    });

    const run = await h.runs.find(userAmy.userId, id);
    expect(run).toMatchObject({ endState: 'Interrupted', endReason: 'UserStop' });
    if (run === undefined) throw new Error('No run');
    await vi.waitFor(async () => {
      expect((await h.events.read(h.scopeOf(run), 0)).at(-1)?.type).toBe('run.ended');
    });
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.at(-1)?.data).toMatchObject({ endState: 'Interrupted', endReason: 'UserStop' });
  });

  it('RF-1108 records QueueCancel when a queued run is cancelled', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    await h.start(userAmy);
    const waiting = await h.start(userBob);

    await h.queue.stop(userBob.userId, waiting.id);

    expect(await h.runs.find(userBob.userId, waiting.id)).toMatchObject({
      endState: 'Interrupted',
      endReason: 'QueueCancel',
    });
  });
});

describe('the reason of a run that a restart interrupted', () => {
  it('RNF-002 records Restart when a recovery ends a run an earlier process left running', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);

    await h.restart().recover();

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      endState: 'Interrupted',
      endReason: 'Restart',
    });
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.at(-1)?.data).toMatchObject({ endReason: 'Restart' });
  });

  it('RNF-002 records Restart when a shutdown stops a running run', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const id = await runningWithStop(h);

    await h.queue.shutDown();

    expect(await h.runs.find(userAmy.userId, id)).toMatchObject({
      endState: 'Interrupted',
      endReason: 'Restart',
    });
  });
});

describe('the reason of a run that was stopped twice or stopped by itself', () => {
  it('RF-006 keeps the owner reason when the owner stopped the run before a shutdown', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const id = await runningWithStop(h);

    await h.queue.stop(userAmy.userId, id);
    await h.queue.shutDown();

    expect((await h.runs.find(userAmy.userId, id))?.endReason).toBe('UserStop');
  });

  it('RF-006 records no reason for a run whose executor reported Interrupted by itself', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const run = await h.start(userAmy);

    h.executor.settle(run.id, { endState: 'Interrupted' });
    await h.ended(run);

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      endState: 'Interrupted',
      endReason: null,
    });
  });
});

describe('the owner stop of a run that ends before the Stop is acted on', () => {
  it('P8-122 forgets a Stop that came while the run was being ended, so a later run of it is not blamed on the owner', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const run = await h.start(userAmy);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const end = h.runs.end.bind(h.runs);
    const reached = vi.fn();
    vi.spyOn(h.runs, 'end').mockImplementation(async (...args) => {
      reached();
      await gate;
      return end(...args);
    });

    h.executor.settle(run.id, { endState: 'Failed' });
    await vi.waitFor(() => {
      expect(reached).toHaveBeenCalled();
    });
    expect(await h.queue.stop(userAmy.userId, run.id)).toMatchObject({ ok: true });
    release();
    await h.ended(run);
    vi.restoreAllMocks();
    await vi.waitFor(async () => {
      expect(await h.queue.positionOf(run.id)).toBeUndefined();
    });

    await h.runs.reopen(userAmy.userId, run.id, h.clock.now().getTime());
    await h.queue.dispatch();
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(2);
    });
    h.executor.settle(run.id, { endState: 'Interrupted' });
    await vi.waitFor(async () => {
      expect((await h.runs.find(userAmy.userId, run.id))?.queueState).toBe('Ended');
    });

    expect((await h.runs.find(userAmy.userId, run.id))?.endReason).toBeNull();
  });
});
