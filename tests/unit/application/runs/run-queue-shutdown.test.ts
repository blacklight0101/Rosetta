import { describe, expect, it, vi, type MockInstance } from 'vitest';
import { acceptedManifest } from '../../../../src/application/runs/accepted-manifest.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RNF-002, RF-1108: a shutdown that comes while the queue is starting runs leaves none behind. A
// run whose start was under way is stopped and awaited like the others; a run the same dispatch
// had not reached yet stays queued for the next server.

type Harness = ReturnType<typeof createRunHarness>;

interface HeldStarts {
  readonly calls: MockInstance;
  readonly open: () => void;
}

/** Holds every `runs.start` (the first step of starting a run) until `open` is called. */
function holdStarts(h: Harness): HeldStarts {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const start = h.runs.start.bind(h.runs);
  const calls = vi.spyOn(h.runs, 'start').mockImplementation(async (runId, at) => {
    await gate;
    return start(runId, at);
  });
  return { calls, open };
}

interface HeldList {
  readonly release: () => void;
  /** The queued runs, read past the hold. */
  readonly queued: () => Promise<readonly Run[]>;
}

/** Holds the first `runs.listQueued` until `release` is called, so one dispatch sees both runs. */
function holdFirstList(h: Harness): HeldList {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const listQueued = h.runs.listQueued.bind(h.runs);
  vi.spyOn(h.runs, 'listQueued').mockImplementationOnce(async () => {
    await gate;
    return listQueued();
  });
  return { release, queued: listQueued };
}

/**
 * A queued run of the user with its manifest, put in the stores without a dispatch: Submit run takes the
 * queue's step for it (P3-59), so two submits cannot be waiting for one dispatch to read both.
 */
async function queueRun(h: Harness, actor: Actor): Promise<Run> {
  const project = sampleProject({ userId: actor.userId });
  const run = sampleRun({ userId: actor.userId, projectId: project.id });
  await h.runs.insert(run);
  const options = {};
  await h.manifests.write(
    h.scopeOf(run),
    acceptedManifest({ run, project, rosettaVersion: '1.2.3-test', options }),
  );
  return run;
}

/** Lets every pending promise callback run. */
async function settleCallbacks(): Promise<void> {
  for (let round = 0; round < 20; round += 1) await new Promise((resolve) => setImmediate(resolve));
}

describe('RunQueue.shutDown while a run is starting', () => {
  it('RNF-002 aborts and awaits a run whose start was under way when the shutdown began', async () => {
    const h = createRunHarness();
    const starts = holdStarts(h);
    const submitted = h.start(userAmy);
    await vi.waitFor(() => {
      expect(starts.calls).toHaveBeenCalledTimes(1);
    });
    let closed = false;

    const closing = h.queue.shutDown().then(() => {
      closed = true;
    });
    starts.open();
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(1);
    });
    await settleCallbacks();

    expect(h.executor.started[0]?.signal.aborted).toBe(true);
    expect(closed).toBe(false);
    const run: Run = await submitted;
    h.executor.settle(run.id, { endState: 'Interrupted' });
    await closing;
    expect((await h.runs.find(userAmy.userId, run.id))?.endState).toBe('Interrupted');
  });
});

describe('RunQueue.shutDown while a dispatch has more runs to start', () => {
  it('RNF-002 starts no further run of the same dispatch once the shutdown began', async () => {
    const h = createRunHarness();
    const list = holdFirstList(h);
    const starts = holdStarts(h);
    const amy = await queueRun(h, userAmy);
    const bob = await queueRun(h, userBob);
    const dispatching = h.queue.dispatch();
    await vi.waitFor(async () => {
      expect(await list.queued()).toHaveLength(2);
    });
    list.release();
    await vi.waitFor(() => {
      expect(starts.calls).toHaveBeenCalledTimes(1);
    });

    const closing = h.queue.shutDown();
    starts.open();
    await dispatching;
    h.executor.settle(amy.id, { endState: 'Interrupted' });
    await closing;
    await settleCallbacks();

    expect(h.executor.startedKeys).toEqual([amy.runKey]);
    expect((await h.runs.find(userBob.userId, bob.id))?.queueState).toBe('Queued');
  });
});
