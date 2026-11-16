import { describe, expect, it } from 'vitest';
import { withProjectLock } from '../../../../src/application/journey/journey-lock.js';
import type { JourneyRecords } from '../../../../src/application/ports/journey-records.js';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import type { JourneyRecord } from '../../../../src/domain/journey/journey-record.js';
import { MemoryJourneyRecords } from '../../../../src/infrastructure/db/memory-journey-records.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import {
  approvedOf,
  journeyAt,
  journeyStepSet,
  remainderOf,
  stateOf,
  stoppedStep,
  type JourneyStepSet,
} from '../../../support/journey-step-set.js';
import { userAmy } from '../../../support/run-harness.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';

// RF-006, RF-432, RF-435, RF-1108, P9-16: Resume keeps a run in the journey it was queued under,
// as Continue does (P9-01). A run queued before the current journey keeps its queue time when
// resumed, so its spend never moves into the newer journey; a run of the current journey, or of no
// journey, is queued at the end of the queue as before.

async function resumeOf(
  set: JourneyStepSet,
  withJourneys: boolean | JourneyRecords = true,
): Promise<ResumeRun> {
  const projects = new MemoryProjectRepository();
  await projects.insertOrFind(set.project);
  const { runs, manifests, queue, clock } = set.harness;
  return new ResumeRun({
    ...{ projects, runs, manifests, queue, clock, roleKeys: ALL_KEYS_SERVED },
    problem: () => Promise.resolve(undefined),
    ...(withJourneys === false
      ? {}
      : { journeys: withJourneys === true ? set.journeys : withJourneys }),
  });
}

/** Analyse, then the understand step spends its line and is interrupted. */
async function interruptedStep(set: JourneyStepSet): Promise<Run> {
  const run = await stoppedStep(set);
  set.harness.executor.settle(run.id, { endState: 'Interrupted' });
  return stateOf(set.harness, run, 'Ended');
}

describe('RF-006 Resume of a run queued before the current journey', () => {
  it('RF-006 RF-435 P9-16 keeps its queue time, so the newer journey remainder is unchanged', async () => {
    const set = await journeyStepSet();
    const ended = await interruptedStep(set);
    const approved = { tokens: 2_000_000, costMicros: 0 };
    await journeyAt(set, approved, ended.queuedAt + 1);
    set.harness.clock.advance(60_000);

    const resumed = await (await resumeOf(set)).execute({ actor: userAmy, runId: ended.id });

    expect(resumed.ok).toBe(true);
    const queued = await set.harness.runs.find(userAmy.userId, ended.id);
    expect(queued?.queuedAt).toBe(ended.queuedAt);
    expect(await remainderOf(set)).toEqual(approved);
    expect((await set.journeys.find(userAmy.userId, set.project.id))?.approved).toEqual(approved);
  });
});

describe('RF-006 Resume of a run of the current journey or of no journey', () => {
  it('RF-006 P9-16 a step of the current journey is queued at the end of the queue, as before', async () => {
    const set = await journeyStepSet();
    const ended = await interruptedStep(set);
    const line = await approvedOf(set.harness, ended);
    set.harness.clock.advance(60_000);

    const resumed = await (await resumeOf(set)).execute({ actor: userAmy, runId: ended.id });

    expect(resumed.ok).toBe(true);
    const queued = await set.harness.runs.find(userAmy.userId, ended.id);
    expect(queued?.queuedAt).toBe(set.harness.clock.now().getTime());
    expect(queued?.queuedAt).toBeGreaterThan(ended.queuedAt);
    expect(await approvedOf(set.harness, ended)).toEqual(line);
  });

  it('RF-006 P9-16 with no journey records wired the run is queued at the end of the queue', async () => {
    const set = await journeyStepSet();
    const ended = await interruptedStep(set);
    await journeyAt(set, { tokens: 2_000_000, costMicros: 0 }, ended.queuedAt + 1);
    set.harness.clock.advance(60_000);

    await (await resumeOf(set, false)).execute({ actor: userAmy, runId: ended.id });

    const queued = await set.harness.runs.find(userAmy.userId, ended.id);
    expect(queued?.queuedAt).toBe(set.harness.clock.now().getTime());
  });
});

describe('RF-006 Resume of a run of a project with no journey record', () => {
  it('RF-006 RF-435 P9-18 journeys wired with no record queue the run at the end of the queue', async () => {
    const set = await journeyStepSet();
    const ended = await interruptedStep(set);
    const none = new MemoryJourneyRecords();
    set.harness.clock.advance(60_000);

    const resumed = await (await resumeOf(set, none)).execute({ actor: userAmy, runId: ended.id });

    expect(resumed.ok).toBe(true);
    expect(await none.find(userAmy.userId, set.project.id)).toBeUndefined();
    const queued = await set.harness.runs.find(userAmy.userId, ended.id);
    expect(queued?.queuedAt).toBe(set.harness.clock.now().getTime());
  });
});

/** Records of the set whose first read waits at a gate, so a test can run an Analyse in between. */
function pausedReads(set: JourneyStepSet) {
  let release = (): void => undefined;
  let entered = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const reading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let first = true;
  const records: JourneyRecords = {
    save: (record) => set.journeys.save(record),
    find: async (userId, projectId) => {
      const record = await set.journeys.find(userId, projectId);
      if (first) {
        first = false;
        entered();
        await gate;
      }
      return record;
    },
  };
  return { records, reading, release };
}

describe('RF-435 a Resume and an Analyse of the same project', () => {
  it('RF-435 RF-006 P9-18 an Analyse that records a journey during the Resume cannot make the run its step', async () => {
    const set = await journeyStepSet();
    const ended = await interruptedStep(set);
    const reads = pausedReads(set);
    const resume = await resumeOf(set, reads.records);

    const resumed = resume.execute({ actor: userAmy, runId: ended.id });
    await reads.reading;
    // The Analyse takes the project lock as a start does, then records a journey of its own.
    const analysed: Promise<JourneyRecord> = withProjectLock(set.project.id, async () => {
      set.harness.clock.advance(60_000);
      const earlier = await set.journeys.find(userAmy.userId, set.project.id);
      if (earlier === undefined) throw new Error('No journey.');
      const record = { ...earlier, createdAt: set.harness.clock.now().getTime() };
      await set.journeys.save(record);
      return record;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    reads.release();
    const [result, journey] = await Promise.all([resumed, analysed]);

    expect(result.ok).toBe(true);
    const queued = await set.harness.runs.find(userAmy.userId, ended.id);
    expect(queued?.queuedAt).toBeLessThan(journey.createdAt);
    expect(await remainderOf(set)).toEqual(journey.approved);
  });
});
