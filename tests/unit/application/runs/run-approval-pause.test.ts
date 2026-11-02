import { describe, expect, it, vi } from 'vitest';
import { ContinueRun } from '../../../../src/application/use-cases/continue-run.js';
import { readUnderstandOptions } from '../../../../src/application/understand/understand-options.js';
import { ApprovalPause } from '../../../../src/domain/budget/cap-stop.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import {
  createRunHarness,
  userAmy,
  userBob,
  type RunHarness,
} from '../../../support/run-harness.js';

// RF-432, ADR-026, DEC-196: a run stopped at its approved amount pauses in `AwaitingApproval`
// instead of ending: it releases its running slot, survives a restart, and only its owner answers.
// Continue (+N) raises the amount and queues it again; Stop here ends it `CapReached` as at a cap.

const approvedAmount = {
  tokens: 1_000,
  costMicros: 2_000,
  remainder: { tokens: 500, costMicros: 900 },
};

async function startUnderstand(h: RunHarness, actor: Actor): Promise<Run> {
  const project = sampleProject({ userId: actor.userId });
  const options = { cloudConsent: false, approvedAmount };
  const submitted = await h.submit.execute({ actor, project, stage: 'understand', options });
  if (!submitted.ok) throw new Error('The run was not accepted');
  return submitted.value.run;
}

async function stateOf(h: RunHarness, run: Run, state: Run['queueState']): Promise<Run> {
  let latest: Run | undefined;
  await vi.waitFor(
    async () => {
      latest = await h.runs.find(run.userId, run.id);
      if (latest?.queueState !== state) throw new Error(`The run is not ${state}`);
    },
    { interval: 2, timeout: 20_000 },
  );
  if (latest === undefined) throw new Error('The run vanished');
  return latest;
}

/** Starts Amy's run and stops it at its approved amount; the executor saved its work. */
async function pausedRun(h: RunHarness): Promise<Run> {
  const run = await startUnderstand(h, userAmy);
  h.executor.started[0]?.stop(new ApprovalPause());
  h.executor.settle(run.id, { endState: 'Completed', unreadAreas: 1 });
  return stateOf(h, run, 'AwaitingApproval');
}

function continuer(h: RunHarness): ContinueRun {
  return new ContinueRun({ runs: h.runs, manifests: h.manifests, queue: h.queue, clock: h.clock });
}

describe('RF-432 a run that reaches its approved amount', () => {
  it('RF-432 waits for approval, keeps its unread areas and releases its running slot', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const run = await pausedRun(h);
    const other = await startUnderstand(h, userBob);

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      queueState: 'AwaitingApproval',
      endState: null,
      unreadAreas: 1,
    });
    await stateOf(h, other, 'Running');
    const events = await h.events.read(h.scopeOf(run), 0);
    expect(events.at(-1)).toMatchObject({
      type: 'run.awaitingApproval',
      data: { continueAmount: { tokens: 500, costMicros: 900 }, unreadAreas: 1 },
    });
  });

  it('RF-432 Stop here ends it CapReached with the same end as a cap', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);

    const stopped = await h.stop.execute({ actor: userAmy, runId: run.id });

    expect(stopped).toMatchObject({ ok: true });
    const ended = await h.runs.find(userAmy.userId, run.id);
    expect(ended).toMatchObject({ queueState: 'Ended', endState: 'CapReached', unreadAreas: 1 });
    const events = await h.events.read(h.scopeOf(run), 0);
    expect(events.at(-1)).toMatchObject({
      type: 'run.ended',
      data: { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached, unreadAreas: 1 },
    });
    expect((await h.manifests.read(h.scopeOf(run)))?.endState).toBe('CapReached');
  });
});

describe('RF-432 Continue (+N) of a paused run', () => {
  it('RF-432 Continue raises the approved amount by N and queues the run to run again', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);

    const continued = await continuer(h).execute({ actor: userAmy, runId: run.id });

    expect(continued.ok).toBe(true);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(2);
    });
    const manifest = await h.manifests.read(h.scopeOf(run));
    expect(readUnderstandOptions(manifest?.options ?? {}).approvedAmount).toEqual({
      tokens: 1_500,
      costMicros: 2_900,
      remainder: approvedAmount.remainder,
    });
    h.executor.settle(run.id, { endState: 'Completed' });
    expect((await h.ended(run)).endState).toBe('Completed');
  });

  it('RF-432 Continue takes the N the owner gives', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);

    await continuer(h).execute({
      actor: userAmy,
      runId: run.id,
      extra: { tokens: 10, costMicros: 20 },
    });

    const manifest = await h.manifests.read(h.scopeOf(run));
    expect(readUnderstandOptions(manifest?.options ?? {}).approvedAmount).toMatchObject({
      tokens: 1_010,
      costMicros: 2_020,
    });
  });
});

describe('RF-432 a paused run and the server', () => {
  it('RF-1105 another user cannot continue it (404) and a run that is not paused answers 409', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);

    expect(await continuer(h).execute({ actor: userBob, runId: run.id })).toEqual({
      ok: false,
      error: ERROR_CODES.notFound,
    });
    await continuer(h).execute({ actor: userAmy, runId: run.id });
    expect(await continuer(h).execute({ actor: userAmy, runId: run.id })).toEqual({
      ok: false,
      error: ERROR_CODES.conflict,
    });
  });

  it('RF-432 is still waiting for approval after a restart of the server', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);

    await h.restart().recover();

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      queueState: 'AwaitingApproval',
    });
  });

  it('RF-432 ends CapReached when the pause cannot be recorded (fail closed)', async () => {
    const h = createRunHarness();
    vi.spyOn(h.runs, 'pause').mockRejectedValue(new Error('the database is down'));
    const run = await startUnderstand(h, userAmy);

    h.executor.started[0]?.stop(new ApprovalPause());
    h.executor.settle(run.id, { endState: 'Completed', unreadAreas: 1 });

    expect(await h.ended(run)).toMatchObject({ endState: 'CapReached', unreadAreas: 1 });
  });

  it('RF-422 a plain cap stop still ends the run CapReached', async () => {
    const h = createRunHarness();
    const run = await startUnderstand(h, userAmy);

    h.executor.started[0]?.stop(new RosettaError(ERROR_CODES.budgetCapReached));
    h.executor.settle(run.id, { endState: 'Completed' });

    expect((await h.ended(run)).endState).toBe('CapReached');
  });
});

describe('RF-432 a crafted Continue', () => {
  it('RF-432 a crafted Continue with a huge N adds only the offered remainder', async () => {
    const h = createRunHarness();
    const run = await pausedRun(h);
    const huge = { tokens: Number.MAX_SAFE_INTEGER, costMicros: Number.MAX_SAFE_INTEGER };

    await continuer(h).execute({ actor: userAmy, runId: run.id, extra: huge });

    const manifest = await h.manifests.read(h.scopeOf(run));
    expect(readUnderstandOptions(manifest?.options ?? {}).approvedAmount).toMatchObject({
      tokens: 1_500,
      costMicros: 2_900,
    });
  });
});
