import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { RunEvent } from '../../../src/domain/runs/run-event.js';
import { completedRun } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';

// RF-209, RF-1002, RF-1006: a Deepen run tells the live page where it stands: the cards it starts
// from, each round as it begins and ends, and why it stopped. The events are the log the page,
// a reload and the replay all read, so they are what the three show the same.

const temp = useTempRoot('rosetta-deepen-events-');

const deepenEvents = (events: readonly RunEvent[]) =>
  events.filter((event) => event.type.startsWith('deepen.'));

function runCap(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens } },
  });
}

async function deepened(options?: { readonly cap?: number }) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording: 'deepen-no-progress.json',
    verifierRecording: 'verifier-deepen-supported.json',
  });
  if (options?.cap !== undefined) await h.changeSettings(runCap(options.cap));
  const result = await h.deepen(run, { coveragePass: false, maxRounds: 2 });
  if (!result.ok) throw new Error(result.error);
  return { h, run, deep: result.value, events: await h.eventsOf(result.value) };
}

describe('RF-209 the events of a Deepen run', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 announces the cards it starts from before any agent works', async () => {
    const { run, events } = await deepened();

    const started = events.find((event) => event.type === 'deepen.started');
    expect(started?.data).toEqual({
      parentRunId: run.id,
      parentRunKey: run.runKey,
      maxRounds: 2,
      coveragePass: false,
      seeded: { cards: 2, claims: 2, supported: 1, rejected: 1, citationInvalid: 0, notJudged: 0 },
    });
    const at = (type: string): number => events.findIndex((event) => event.type === type);
    expect(at('deepen.started')).toBeGreaterThanOrEqual(0);
    expect(at('deepen.started')).toBeLessThan(at('agent.planned'));
  });

  it('RF-209 announces each round as it begins and as it ends, then why the run stopped', async () => {
    const { events } = await deepened();

    expect(deepenEvents(events).map((event) => event.type)).toEqual([
      'deepen.started',
      'deepen.round.started',
      'deepen.round.ended',
      'deepen.ended',
    ]);
    const [, begun, ended, stop] = deepenEvents(events);
    expect(begun?.data).toEqual({
      ...{ round: 1, maxRounds: 2, judge: 0, reread: 1 },
      ...{ outOfScope: 0, unreadFiles: 0 },
    });
    expect(ended?.data).toMatchObject({
      ...{ round: 1, complete: true, newClaims: 1, newSupported: 1 },
      ...{ filesRead: 0 },
    });
    expect(stop?.data).toEqual({ stopReason: 'noProgress', roundsDone: 1, maxRounds: 2 });
  });

  it('RF-209 marks the round a cap cut short as not complete and names the cap as the reason', async () => {
    const { events } = await deepened({ cap: 500 });

    const ended = deepenEvents(events).filter((event) => event.type === 'deepen.round.ended');
    expect(ended.map((event) => event.data['complete'])).toEqual([false]);
    expect(deepenEvents(events).at(-1)?.data).toMatchObject({
      stopReason: 'capReached',
      roundsDone: 0,
    });
  });
});

describe('RF-209 the counts of the events of a Deepen', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 counts the claims it starts from by their status, the one left unjudged apart', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-judge.json',
      verifierRecording: 'verifier-deepen-judge.json',
    });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    const started = (await h.eventsOf(deepen.value)).find(
      (event) => event.type === 'deepen.started',
    );
    expect(started?.data['seeded']).toEqual({
      cards: 2,
      claims: 2,
      supported: 1,
      rejected: 0,
      citationInvalid: 0,
      notJudged: 1,
    });
  });

  it('RF-209 counts a new claim that was rejected as new but not as supported', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-no-progress.json',
    });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    const ended = (await h.eventsOf(deepen.value)).find(
      (event) => event.type === 'deepen.round.ended',
    );
    expect(ended?.data).toMatchObject({ newClaims: 1, newSupported: 0 });
  });
});
