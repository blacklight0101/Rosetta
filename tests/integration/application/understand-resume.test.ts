import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { ProjectSettings } from '../../../src/application/projects/project-settings.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-006, RF-304, ADR-007, DEC-13: a run that a cap, a failure or the user stopped is resumed in
// its own folder and manifest: only the unfinished tasks run, the cards of the finished ones stay
// and the claims left unjudged at a cap stay `Unverified`.

const temp = useTempRoot('rosetta-understand-resume-');
const areas = ['Catalog', 'Services'];

const capped = understandSettings((settings) => ({
  ...settings,
  budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 205_000 } },
}));

/** The cap the owner raises before pressing Resume. */
function raised(settings: ProjectSettings): ProjectSettings {
  const run = { maxCostMicros: 50_000_000, maxTokens: 5_000_000 };
  return { ...settings, budget: { ...settings.budget, run } };
}

const indexSchema = z.object({
  cards: z.array(
    z.object({
      id: z.string(),
      area: z.string(),
      claimCounts: z.object({ Proposed: z.number(), Unverified: z.number() }),
    }),
  ),
});

async function indexOf(h: UnderstandHarness, run: Run) {
  return indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
}

/** The reader task ids the fake reader was asked about, in call order (not the summariser). */
function askedTasks(h: UnderstandHarness): string[] {
  const asked = h.providers.requests().map((request) => request.context.agentTaskId);
  return asked.filter((id) => id.startsWith('reader-'));
}

async function cappedRun() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-resume.json',
    settings: capped,
  });
  await h.scan();
  const run = await h.understand({ areas });
  return { h, run };
}

describe('RF-304 a run stopped at its cap', UNDERSTAND_TIMEOUT, () => {
  it('RF-304 leaves the claims not yet judged Unverified when the cap stops the run', async () => {
    const { h, run } = await cappedRun();

    expect(run.endState).toBe('CapReached');
    const index = await indexOf(h, run);
    expect(index.cards.map((card) => [card.id, card.claimCounts])).toEqual([
      ['BR-001', expect.objectContaining({ Proposed: 0, Unverified: 1 })],
    ]);
    const card = await readFile(join(h.runFolder(run), 'cards', 'BR', 'BR-001.md'), 'utf8');
    expect(card).toContain('status: "Unverified"');
  });

  it('RF-304 keeps the claims Proposed when the user stops the run instead of a cap', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-stopped.json',
      beforeCall: async (call, harness) => {
        if (call === 2) await harness.stopRunning();
      },
    });
    await h.scan();

    const run = await h.understand({ areas });

    expect(run.endState).toBe('Interrupted');
    const index = await indexOf(h, run);
    expect(index.cards.map((card) => card.claimCounts)).toEqual([
      expect.objectContaining({ Proposed: 1, Unverified: 0 }),
    ]);
  });
});

describe('RF-006 resuming a run', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 runs only the unfinished task and joins its card to the same run', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);

    const resumed = await h.resume(run);

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.value).toMatchObject({ id: run.id, runKey: run.runKey, endState: 'Completed' });
    expect(askedTasks(h)).toEqual(['reader-001', 'reader-002']);
    expect(await h.runs.list(run.userId, run.projectId)).toHaveLength(2);
    const manifest = await h.manifestOf(run);
    expect(manifest.runId).toBe(run.runKey);
    expect(manifest.endState).toBe('Completed');
    expect(manifest.caps.run).toEqual({ maxCostMicros: 50_000_000, maxTokens: 5_000_000 });
    expect(manifest.totals.calls).toBe(2);
    expect(manifest.agentTasks.map((task) => [task.area, task.state, task.cards])).toEqual([
      ['Catalog', 'Done', 1],
      ['Services', 'Done', 1],
    ]);
  });

  it('RF-006 keeps the card of the finished task and gives the new card the next id', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);

    await h.resume(run);

    const index = await indexOf(h, run);
    expect(index.cards.map((card) => [card.id, card.area])).toEqual([
      ['BR-001', 'Catalog'],
      ['BR-002', 'Services'],
    ]);
    const spec = await readFile(join(h.runFolder(run), 'spec.md'), 'utf8');
    expect(spec).toContain('BR-001');
    expect(spec).toContain('BR-002');
  });
});

describe('RF-006 resuming a run, what stays', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 does not judge the Unverified claim again and processes nothing it already finished', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);

    await h.resume(run);

    const index = await indexOf(h, run);
    expect(index.cards.map((card) => card.claimCounts)).toEqual([
      expect.objectContaining({ Proposed: 0, Unverified: 1 }),
      expect.objectContaining({ Proposed: 1, Unverified: 0 }),
    ]);
    const coverage = z
      .object({ areas: z.array(z.object({ area: z.string() })) })
      .parse(await readJson(join(h.runFolder(run), 'coverage.json')));
    expect(coverage.areas.map((each) => each.area)).toEqual(['Catalog', 'Services']);
  });
});

describe('RF-006 resuming a run, the log and a stop', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 continues the event log of the run: two starts, two ends, no gap in seq', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);

    await h.resume(run);

    const events = await h.eventsOf(run);
    expect(events.map((event) => event.seq)).toEqual(events.map((_event, index) => index + 1));
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === 'run.started')).toHaveLength(2);
    expect(types.filter((type) => type === 'run.ended')).toHaveLength(2);
    expect(types.at(-1)).toBe('run.ended');
  });

  it('RF-006 resumes a run the user stopped and runs the task that did not finish', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-stopped.json',
      beforeCall: async (call, harness) => {
        if (call === 2) await harness.stopRunning();
      },
    });
    await h.scan();
    const run = await h.understand({ areas });
    expect(run.endState).toBe('Interrupted');

    const resumed = await h.resume(run);

    expect(resumed.ok && resumed.value.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'Done'],
      ['Services', 'Done'],
    ]);
    expect((await indexOf(h, run)).cards.map((card) => card.id)).toEqual(['BR-001']);
  });
});

describe('RF-006 resuming a run that completed', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 refuses a run that completed: it has nothing left to resume', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-resume.json',
      settings: understandSettings(raised),
    });
    await h.scan();
    const run = await h.understand({ areas });
    expect(run.endState).toBe('Completed');

    const resumed = await h.resume(run);

    expect(resumed).toEqual({ ok: false, error: ERROR_CODES.runNotResumable });
    expect(askedTasks(h)).toEqual(['reader-001', 'reader-002']);
  });
});

describe('RF-006 a resume that cannot trust what the run left', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 runs again a finished task whose result file is gone, rather than lose its cards', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);
    await rm(join(h.runFolder(run), 'task-results.json'));

    await h.resume(run);

    expect(askedTasks(h)).toEqual(['reader-001', 'reader-001', 'reader-002']);
  });

  it('RF-006 fails the resume with RST-1309 when the result file is not readable', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);
    await writeFile(join(h.runFolder(run), 'task-results.json'), '{"schemaVersion": 7}');

    const resumed = await h.resume(run);

    expect(resumed.ok && resumed.value.endState).toBe('Failed');
    const events = await h.eventsOf(run);
    expect(events.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.taskResultsUnreadable });
    expect(askedTasks(h)).toEqual(['reader-001']);
  });

  it('RF-006 fails the resume with RST-1308 when the code map is not the one the run read', async () => {
    const { h, run } = await cappedRun();
    await h.changeSettings(raised);
    const file = join(h.runFolder(run), 'manifest.json');
    const manifest = z.record(z.string(), z.unknown()).parse(await readJson(file));
    await writeFile(file, JSON.stringify({ ...manifest, codemapHash: `sha256:${'0'.repeat(64)}` }));

    const resumed = await h.resume(run);

    expect(resumed.ok && resumed.value.endState).toBe('Failed');
    const events = await h.eventsOf(run);
    expect(events.at(-1)?.data).toMatchObject({ errorCode: ERROR_CODES.resumeSourceChanged });
    expect(askedTasks(h)).toEqual(['reader-001']);
  });
});
