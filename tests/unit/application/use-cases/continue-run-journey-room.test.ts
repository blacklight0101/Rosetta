import { describe, expect, it, vi } from 'vitest';
import { withProjectLock } from '../../../../src/application/journey/journey-lock.js';
import { MAX_RUN_TOKENS } from '../../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  approvedOf,
  journeyAt,
  journeyStepSet,
  pausedStep,
  remainderOf,
  stateOf,
  stopAtLine,
  stoppedStep,
  worst,
  type JourneyStepSet,
} from '../../../support/journey-step-set.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-432, RF-435, DEC-206, P9-01: Continue (+N) on a journey step never adds nothing. Where the
// journey's approved amount sits at an administrator ceiling, Continue could add nothing, so the
// step does not pause there and ends `CapReached` as at a hard ceiling; where it has some room, the
// pause offers only that room. A run queued before the current journey stays out of it.

const extra = { tokens: 1_000_000, costMicros: 0 };

async function eventsOf(set: JourneyStepSet, runId: string) {
  const run = await set.harness.runs.find(userAmy.userId, runId);
  if (run === undefined) throw new Error('No run.');
  return set.harness.events.read(set.harness.scopeOf(run), 0);
}

describe('RF-432 the pause of a journey step at the administrator ceiling', () => {
  it('RF-432 DEC-206 P9-01 with no room left in the journey the step ends CapReached, it does not pause', async () => {
    const set = await journeyStepSet();
    const run = await stoppedStep(set);
    await journeyAt(set, { tokens: MAX_RUN_TOKENS, costMicros: 0 });

    stopAtLine(set, run);

    const ended = await stateOf(set.harness, run, 'Ended');
    expect(ended.endState).toBe('CapReached');
    const types = (await eventsOf(set, run.id)).map((event) => event.type);
    expect(types).not.toContain('run.awaitingApproval');
  });

  it('RF-432 P9-01 with some room left the pause offers only the room the journey can take', async () => {
    const set = await journeyStepSet();
    const run = await stoppedStep(set);
    const room = 1_000;
    await journeyAt(set, { tokens: MAX_RUN_TOKENS - room, costMicros: 0 });

    stopAtLine(set, run);
    const paused = await stateOf(set.harness, run, 'AwaitingApproval');

    const events = await eventsOf(set, run.id);
    expect(events.at(-1)).toMatchObject({
      type: 'run.awaitingApproval',
      data: { continueAmount: { tokens: room, costMicros: 0 } },
    });
    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id });
    expect(continued.ok).toBe(true);
    expect(await approvedOf(set.harness, paused)).toMatchObject({ tokens: worst.tokens + room });
  });

  it('RF-432 P9-01 a Continue the journey can take none of is refused with RST-2311 and raises nothing', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    const line = await approvedOf(set.harness, paused);
    const full = { tokens: MAX_RUN_TOKENS, costMicros: 0 };
    await journeyAt(set, full);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued).toEqual({ ok: false, error: ERROR_CODES.journeyAmountUsed });
    expect((await set.journeys.find(userAmy.userId, set.project.id))?.approved).toEqual(full);
    expect(await approvedOf(set.harness, paused)).toEqual(line);
    await stateOf(set.harness, paused, 'AwaitingApproval');
  });
});

describe('RF-432 a Continue that fails after the journey was raised', () => {
  it('RF-432 P9-01 a manifest write that throws leaves neither amount raised', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    const line = await approvedOf(set.harness, paused);
    vi.spyOn(set.harness.manifests, 'write').mockRejectedValueOnce(new Error('disk full'));

    const continued = set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    await expect(continued).rejects.toThrow('disk full');
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens, costMicros: 0 });
    expect(await approvedOf(set.harness, paused)).toEqual(line);
  });

  it('RF-432 P9-01 a row update that throws leaves neither amount raised', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    const line = await approvedOf(set.harness, paused);
    const failure = new Error('connection lost');
    vi.spyOn(set.harness.runs, 'continueAwaiting').mockRejectedValueOnce(failure);

    const continued = set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    await expect(continued).rejects.toThrow('connection lost');
    const record = await set.journeys.find(userAmy.userId, set.project.id);
    expect(record?.approved).toEqual({ tokens: worst.tokens, costMicros: 0 });
    expect(await approvedOf(set.harness, paused)).toEqual(line);
  });
});

describe('RF-435 a Continue and a start of the same project', () => {
  it('RF-435 P9-01 the Continue waits for the journey lock a start holds before it raises the journey', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = withProjectLock(set.project.id, () => gate);

    const continued = set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const during = await set.journeys.find(userAmy.userId, set.project.id);
    release();
    await start;

    expect(during?.approved).toEqual({ tokens: worst.tokens, costMicros: 0 });
    expect((await continued).ok).toBe(true);
    const after = await set.journeys.find(userAmy.userId, set.project.id);
    expect(after?.approved).toEqual({ tokens: worst.tokens + extra.tokens, costMicros: 0 });
  });
});

describe('RF-432 Continue on a run queued before the current journey', () => {
  it('RF-432 P9-01 keeps its queue time, so its spend never counts against the newer journey', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    const approved = { tokens: 2_000_000, costMicros: 0 };
    await journeyAt(set, approved, paused.queuedAt + 1);
    set.harness.clock.advance(60_000);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    expect(continued.ok).toBe(true);
    const queued = await set.harness.runs.find(userAmy.userId, paused.id);
    expect(queued?.queuedAt).toBe(paused.queuedAt);
    expect(await remainderOf(set)).toEqual(approved);
    expect((await set.journeys.find(userAmy.userId, set.project.id))?.approved).toEqual(approved);
  });
});

describe('RF-432 a Continue whose room shrank after the pause', () => {
  it('RF-432 P9-14 says the run got less than the N that was offered', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);
    const room = 1_000;
    await journeyAt(set, { tokens: MAX_RUN_TOKENS - room, costMicros: 0 });

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id });

    if (!continued.ok) throw new Error('The Continue was refused.');
    expect(continued.value.granted).toEqual({ tokens: room, costMicros: 0 });
    expect(continued.value.offered.tokens).toBeGreaterThan(room);
  });

  it('RF-432 P9-14 an untouched room grants the whole N that was offered', async () => {
    const set = await journeyStepSet();
    const paused = await pausedStep(set);

    const continued = await set.continueRun.execute({ actor: userAmy, runId: paused.id, extra });

    if (!continued.ok) throw new Error('The Continue was refused.');
    expect(continued.value.granted).toEqual(continued.value.offered);
  });
});
