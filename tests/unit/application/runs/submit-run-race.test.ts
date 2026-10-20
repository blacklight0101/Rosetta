import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';

// RF-003, RF-1108, P3-59: a run is queued in the index before its manifest is written. Another run
// ending or being submitted looks for runs to start in that moment; it must not start this one
// without its manifest, which ended the run Failed with "The run has no manifest" (RST-2106) in
// the end-to-end journeys, with several accounts running at once.

const SETTLE_MS = 20;

describe('SubmitRun while the queue looks for runs to start', () => {
  it('RF-1108 does not start a queued run before its manifest is stored', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const store = h.manifests.write.bind(h.manifests);
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let writing = false;
    vi.spyOn(h.manifests, 'write').mockImplementation(async (...args) => {
      writing = true;
      await held;
      return store(...args);
    });
    const project = sampleProject({ userId: userAmy.userId });

    const submitting = h.submit.execute({ actor: userAmy, project, stage: 'scan', options: {} });
    await vi.waitFor(() => {
      expect(writing).toBe(true);
    });
    const dispatching = h.queue.dispatch();
    await delay(SETTLE_MS);
    release();
    await Promise.all([submitting, dispatching]);

    expect(h.executor.started).toHaveLength(1);
    const [run] = await h.runs.list(userAmy.userId, project.id);
    expect(run).toMatchObject({ queueState: 'Running', endState: null });
  });
});
