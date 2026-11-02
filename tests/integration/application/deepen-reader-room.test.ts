import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { claimsOf, completedRun, deepenOf, readerTasksAsked } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import type { UnderstandHarness } from '../../support/understand-run-harness.js';

// RF-429, P5-30, DEC-170, DEC-193: the readers of a Deepen stop starting work when the claims the
// Deepen wrote could no longer be judged with what the run cap leaves. deepen-claim-heavy.json: the
// first task of the round (the re-read of the rejected Catalog claim) writes twelve claims; the second
// (the unread Catalog/Details.aspx) would write one more. At a run cap of 27,000 tokens the readers
// and the verifier share 24,300 (the rest is the summariser's), and twelve claims at the default
// estimate (2,000 tokens each) are 24,000 beside what the first task spent.

const temp = useTempRoot('rosetta-deepen-reader-room-');

function withRun(maxTokens: number, roles: ProjectSettings['budget']['roles'] = {}) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { ...settings.budget.run, maxTokens }, roles },
  });
}

async function deepened(recording: string, maxTokens: number, maxRounds = 3) {
  const { h, run } = await completedRun({
    dataDir: temp.path,
    recording,
    verifierRecording: 'verifier-deepen-claim-heavy.json',
  });
  await h.changeSettings(withRun(maxTokens));
  const result = await h.deepen(run, { maxRounds });
  if (!result.ok) throw new Error(result.error);
  return { h, deep: result.value };
}

const deepenReaders = (h: UnderstandHarness): string[] =>
  [...new Set(readerTasksAsked(h))].filter((id) => id > 'reader-002');

async function waiting(h: UnderstandHarness, run: Run): Promise<number> {
  const claims = await claimsOf(h, run);
  return claims.filter((c) => c.status === 'Proposed' || c.status === 'Unverified').length;
}

describe('RF-429 P5-30 a Deepen whose readers wrote more claims than can be judged', () => {
  it(
    'RF-429 starts no further reader task, judges every written claim and ends with its stop reason',
    UNDERSTAND_TIMEOUT,
    async () => {
      const { h, deep } = await deepened('deepen-claim-heavy.json', 27_000);

      expect(deep.endState).toBe('Completed');
      expect(deepenReaders(h)).toEqual(['reader-003']);
      expect(await waiting(h, deep)).toBe(0);
      expect((await claimsOf(h, deep)).filter((c) => c.status === 'Supported')).toHaveLength(13);
      const record = await deepenOf(h, deep);
      expect(record.stopReason).toBe('readersStopped');
      expect(record.rounds.map((round) => [round.complete, round.newClaims.length])).toEqual([
        [true, 12],
      ]);
    },
  );

  it(
    'RF-429 says once, in the event log, that the readers stopped, and ends the Deepen with that reason',
    UNDERSTAND_TIMEOUT,
    async () => {
      const { h, deep } = await deepened('deepen-claim-heavy.json', 27_000);

      const events = await h.eventsOf(deep);
      const stops = events.filter((event) => event.type === 'budget.readersStopped');
      expect(stops.map((event) => event.data)).toMatchObject([
        { reason: 'judging', claimsWaiting: 12 },
      ]);
      const ended = events.filter((event) => event.type === 'deepen.ended');
      expect(ended.map((event) => event.data)).toMatchObject([
        { stopReason: 'readersStopped', roundsDone: 1 },
      ]);
      expect(events.some((event) => event.type === 'budget.capReached')).toBe(false);
    },
  );
});

describe('RF-429 P5-30 a light Deepen', () => {
  it(
    'RF-429 a light Deepen behaves as before: both tasks run, no readersStopped event',
    UNDERSTAND_TIMEOUT,
    async () => {
      const { h, deep } = await deepened('deepen-coverage.json', 100_000, 1);

      expect(deep.endState).toBe('Completed');
      expect(deepenReaders(h)).toEqual(['reader-003', 'reader-004']);
      expect((await h.eventsOf(deep)).some((e) => e.type === 'budget.readersStopped')).toBe(false);
      expect(await deepenOf(h, deep)).toMatchObject({ stopReason: 'roundLimit', roundsDone: 1 });
    },
  );
});

describe('RF-429 P5-30 a resumed Deepen whose earlier round wrote claims', () => {
  it(
    'RF-429 judges the claims written before the stop, then reads on: the room counts the whole Deepen',
    UNDERSTAND_TIMEOUT,
    async () => {
      const { h, run } = await completedRun({
        dataDir: temp.path,
        recording: 'deepen-claim-heavy.json',
        verifierRecording: 'verifier-deepen-claim-heavy.json',
      });
      // The verifier cap is too small for one call: the readers stop for the claims, the judgement
      // is refused and the twelve claims stay Unverified.
      await h.changeSettings(withRun(27_000, { verifier: { maxTokens: 100 } }));
      const first = await h.deepen(run, { maxRounds: 3 });
      if (!first.ok) throw new Error(first.error);
      expect(first.value.endState).toBe('CapReached');
      expect(await waiting(h, first.value)).toBe(12);
      await h.changeSettings(withRun(27_000));

      const resumed = await h.resume(first.value);

      if (!resumed.ok) throw new Error(resumed.error);
      expect(await waiting(h, first.value)).toBe(0);
      const events = await h.eventsOf(first.value);
      expect(events.filter((e) => e.type === 'budget.readersStopped')).toHaveLength(1);
    },
  );
});
