import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-429, P5-20, DEC-170: the readers of a run stop starting work when the claims they wrote could no
// longer be judged with what the caps leave, or when their own share has no room for another call.
// understand-claim-heavy.json: Catalog uses about 33,000 tokens and writes twelve claims; Services
// would read a file and give no card. At a run cap of 100,000 tokens the verifier share is 20,000,
// and twelve claims at the default estimate (2,000 tokens each) are 24,000.

const temp = useTempRoot('rosetta-understand-claim-room-');
const areas = ['Catalog', 'Services'];

function withRun(maxTokens: number) {
  return (settings: ProjectSettings): ProjectSettings => ({
    ...settings,
    budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens } },
  });
}

const indexSchema = z.object({
  cards: z.array(z.object({ claimCounts: z.record(z.string(), z.number()) })),
});

async function claimTotals(h: UnderstandHarness, run: Run): Promise<Record<string, number>> {
  const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
  const totals: Record<string, number> = {};
  for (const card of index.cards) {
    for (const [status, n] of Object.entries(card.claimCounts)) {
      totals[status] = (totals[status] ?? 0) + n;
    }
  }
  return totals;
}

async function started(recording: string, maxTokens: number) {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording,
    verifierRecording: 'verifier-all-supported.json',
    settings: understandSettings(withRun(maxTokens)),
  });
  await h.scan();
  const run = await h.understand({ areas });
  return { h, run };
}

const readerTasksAsked = (h: UnderstandHarness): string[] =>
  [...new Set(h.providers.requests().map((r) => r.context.agentTaskId))].filter((id) =>
    id.startsWith('reader-'),
  );

describe('a run whose readers wrote more claims than can be judged', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 starts no reader task once the claims written could not all be judged, and judges every one', async () => {
    const { h, run } = await started('understand-claim-heavy.json', 100_000);

    expect(run.endState).toBe('Completed');
    expect(readerTasksAsked(h)).toEqual(['reader-001']);
    expect((await h.manifestOf(run)).agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'Done'],
      ['Services', 'Planned'],
    ]);
    expect(await claimTotals(h, run)).toMatchObject({ Supported: 12, Unverified: 0, Proposed: 0 });
  });

  it('RF-429 says once, in the event log, that the readers stopped to leave room to judge the claims', async () => {
    const { h, run } = await started('understand-claim-heavy.json', 100_000);

    const stops = (await h.eventsOf(run)).filter((e) => e.type === 'budget.readersStopped');
    expect(stops.map((event) => event.data)).toMatchObject([{ reason: 'judging' }]);
  });

  it('RF-429 a run with few claims behaves as before: both tasks run and the run Completes', async () => {
    const { h, run } = await started('understand-few-claims.json', 100_000);

    expect(run.endState).toBe('Completed');
    expect(readerTasksAsked(h)).toEqual(['reader-001', 'reader-002']);
    expect((await h.eventsOf(run)).some((e) => e.type === 'budget.readersStopped')).toBe(false);
    expect(await claimTotals(h, run)).toMatchObject({ Supported: 2, Unverified: 0 });
  });
});

describe('a run whose readers reach their own share', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 starts no further reader task and records no refused reader call, and the run ends CapReached', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-cap.json',
      verifierRecording: 'verifier-all-supported.json',
      settings: understandSettings(withRun(293_000)),
    });
    await h.scan();

    const run = await h.understand({ areas });

    expect(run.endState).toBe('CapReached');
    expect(readerTasksAsked(h)).toEqual(['reader-001']);
    const events = await h.eventsOf(run);
    expect(events.filter((e) => e.type === 'budget.capReached')).toEqual([]);
    expect(
      events.filter((e) => e.type === 'budget.readersStopped').map((e) => e.data),
    ).toMatchObject([{ reason: 'share' }]);
    expect(await claimTotals(h, run)).toMatchObject({ Supported: 1, Unverified: 0 });
  });
});

describe('resuming a run whose claims were written before the stop', UNDERSTAND_TIMEOUT, () => {
  it('RF-429 counts the claims written before the stop: the resume judges them and starts no reader task', async () => {
    // Run 1: the readers' own cap and a verifier cap too small for one call stop it with the twelve
    // claims written and Unverified.
    const first = understandSettings((settings) => ({
      ...withRun(100_000)(settings),
      budget: {
        ...withRun(100_000)(settings).budget,
        roles: { reader: { maxTokens: 33_100 }, verifier: { maxTokens: 100 } },
      },
    }));
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-claim-heavy.json',
      verifierRecording: 'verifier-all-supported.json',
      settings: first,
    });
    await h.scan();
    const run = await h.understand({ areas });
    expect(run.endState).toBe('CapReached');
    expect(await claimTotals(h, run)).toMatchObject({ Unverified: 12 });
    await h.changeSettings((settings) => {
      return { ...settings, budget: { ...withRun(100_000)(settings).budget, roles: {} } };
    });

    await h.resume(run);

    expect(readerTasksAsked(h)).toEqual(['reader-001']);
    expect(await claimTotals(h, run)).toMatchObject({ Supported: 12, Unverified: 0 });
  });
});
