import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-003, RF-126, RF-1006: the manifest is written when the run is accepted, rewritten when it
// starts and when it ends; the events start with run.started and end with run.ended.

describe('the manifest of a run', () => {
  it('RF-003 is written when the run is accepted and rewritten with the start time when it starts', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const running = await h.start(userAmy);
    h.clock.advance(5_000);
    const waiting = await h.start(userBob);

    expect((await h.manifests.read(h.scopeOf(running)))?.startedAt).toBe(
      '2026-10-12T10:00:00.000Z',
    );
    expect(await h.manifests.read(h.scopeOf(waiting))).toMatchObject({
      startedAt: null,
      endState: null,
      stage: 'scan',
      rosettaVersion: '1.2.3-test',
    });
  });

  it('RF-003 records the end state and the time when the run ends', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(90_000);

    h.executor.settle(run.id, { endState: 'CapReached' });
    await h.ended(run);

    expect(await h.manifests.read(h.scopeOf(run))).toMatchObject({
      startedAt: '2026-10-12T10:00:00.000Z',
      endState: 'CapReached',
      endedAt: '2026-10-12T10:01:30.000Z',
    });
  });
});

describe('the source of a run', () => {
  it('RF-126 records the commit and the snapshot of the source once it is resolved', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const source = {
      commitSha: 'a'.repeat(40),
      snapshotKey: `owner__repo@${'a'.repeat(40)}`,
      snapshotHash: `sha256:${'b'.repeat(64)}`,
    };

    await h.executor.started[0]?.recordSource(source);

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      commitSha: source.commitSha,
      snapshotKey: source.snapshotKey,
    });
    expect((await h.manifests.read(h.scopeOf(run)))?.source).toMatchObject({
      commitSha: source.commitSha,
      snapshotHash: source.snapshotHash,
    });
  });
});

describe('the events of a run', () => {
  it('RF-1006 start with run.started and end with run.ended, numbered without gaps', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });

    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.map((event) => [event.seq, event.type])).toEqual([
      [1, 'run.started'],
      [2, 'agent.turn'],
      [3, 'run.ended'],
    ]);
    expect(stored[0]?.data).toMatchObject({ stage: 'scan', source: { owner: 'owner' } });
    expect(stored[2]?.data).toMatchObject({ endState: 'Completed' });
  });
});

describe('a run that fails', () => {
  it('RF-003 ends as Failed with the code of the error the executor threw', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);

    h.executor.fail(run.id, new RosettaError(ERROR_CODES.githubRateLimited));
    const ended = await h.ended(run);

    expect(ended.endState).toBe('Failed');
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.at(-1)?.data).toMatchObject({
      endState: 'Failed',
      errorCode: ERROR_CODES.githubRateLimited,
    });
  });

  it('RF-007 ends as Failed with RST-2006 for an error without a code, and logs it', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);

    h.executor.fail(run.id, new Error('boom'));
    await h.ended(run);

    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.unexpected });
    expect(h.logger.entries.some((entry) => entry.level === 'error')).toBe(true);
  });

  it('RF-1108 ends a run whose stage has no executor as Failed with RST-2305', async () => {
    const h = createRunHarness({ stages: ['scan'] });

    const run = await h.start(userAmy, 'plan');
    const ended = await h.ended(run);

    expect(ended.endState).toBe('Failed');
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.runStageNotAvailable });
  });
});
