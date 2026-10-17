import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
  type UnderstandHarnessOptions,
} from '../../support/understand-run-harness.js';

// RF-208, DEC-138: a reader task that ends with no usable card is run once more from the start with
// a fresh conversation (an area too large for the model's context is split in two); an area that
// still fails is reported in the coverage and with the end of the run, which is never a plain
// success. Every call of a retry goes through the guarded provider, and a task never runs more than
// its turn limit plus one retry.

const temp = useTempRoot('rosetta-retry-');

const coverageSchema = z.object({
  areas: z.array(z.object({ area: z.string(), failure: z.string().optional() })),
});
const indexSchema = z.object({ cards: z.array(z.object({ id: z.string(), title: z.string() })) });

async function started(
  options: Omit<UnderstandHarnessOptions, 'dataDir'>,
): Promise<UnderstandHarness> {
  const h = await createUnderstandHarness({ dataDir: temp.path, ...options });
  await h.scan();
  return h;
}

async function endDataOf(h: UnderstandHarness, run: Parameters<UnderstandHarness['eventsOf']>[0]) {
  const events = await h.eventsOf(run);
  return events.find((event) => event.type === 'run.ended')?.data;
}

describe('a task that ends without a card is retried once', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 the retry has a fresh conversation, gives the card and the run completes without failed areas', async () => {
    const h = await started({ recording: 'understand-retry-recovers.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'Done'],
    ]);
    const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
    expect(index.cards.map((card) => card.title)).toEqual(['Product details page']);
    expect(await endDataOf(h, run)).not.toHaveProperty('failedAreas');
    const requests = h.providers.requests();
    expect(requests).toHaveLength(6);
    // The retry starts again from the area, not from the conversation that failed.
    expect(requests[4]?.messages).toHaveLength(1);
    expect(requests[4]?.messages[0]?.role).toBe('user');
  });

  it('RF-208 RF-420 every call of the task and of its retry is counted by the budget guard', async () => {
    const h = await started({ recording: 'understand-retry-recovers.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    const manifest = await h.manifestOf(run);
    expect(manifest.totals.calls).toBe(6);
    // RF-301: the verifier's judgement of the claims makes calls of its own role.
    const { reservations, entries } = h.providers.ledger;
    expect(reservations.filter((each) => each.reservation.role === 'reader')).toHaveLength(6);
    expect(entries.filter((each) => each.role === 'reader')).toHaveLength(6);
  });

  it('RF-208 the retry keeps its own transcript, and the raw answers of the failed first run are saved', async () => {
    const h = await started({ recording: 'understand-retry-recovers.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    const folder = h.runFolder(run);
    expect(readerTranscripts(await readdir(join(folder, 'transcripts')))).toEqual([
      'reader-001-retry.jsonl',
      'reader-001.jsonl',
    ]);
    const raw = await readFile(join(folder, 'invalid-output', 'reader-001.txt'), 'utf8');
    expect(raw).toContain('=== attempt 3 ===');
    expect(raw).toContain('Nothing yet.');
  });
});

describe('an area that still fails', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 is named failed in the coverage with why, and the run says how many areas failed', async () => {
    const h = await started({ recording: 'understand-retry-fails.json' });

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('Completed');
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => [task.area, task.state])).toEqual([
      ['Catalog', 'InvalidOutput'],
      ['Services', 'Done'],
    ]);
    expect(await endDataOf(h, run)).toMatchObject({ endState: 'Completed', failedAreas: 1 });
    expect(run.failedAreas).toBe(1);
    const folder = h.runFolder(run);
    const coverage = coverageSchema.parse(await readJson(join(folder, 'coverage.json')));
    expect(coverage.areas.map((entry) => [entry.area, entry.failure])).toEqual([
      ['Catalog', 'invalid output (RST-1300)'],
      ['Services', undefined],
    ]);
    const markdown = await readFile(join(folder, 'coverage.md'), 'utf8');
    expect(markdown).toContain('## Failed areas');
    expect(markdown).toContain('- Catalog: invalid output \\(RST\\-1300\\)');
  });

  it('RF-208 fails the same way three times and the run still ends: 4 calls, a retry of 4, then the next area', async () => {
    const h = await started({ recording: 'understand-retry-fails.json' });

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    // The Catalog task: read + answer + two repairs; its retry the same; then Services: 2 calls.
    expect(h.providers.requests()).toHaveLength(10);
    expect(run.queueState).toBe('Ended');
  });

  it('RF-208 a run in which no area gave a card ends Completed as before, and names every area failed', async () => {
    const h = await started({ recording: 'understand-read-then-invalid.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    expect(await endDataOf(h, run)).toMatchObject({ endState: 'Completed', failedAreas: 1 });
    expect(run.failedAreas).toBe(1);
  });
});

describe('the turn limit holds for a task and its retry', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 RF-201 a task that never answers makes at most its turn limit of calls, and its retry the same', async () => {
    const limited = understandSettings((settings) => ({
      ...settings,
      roles: { ...settings.roles, reader: { ...settings.roles.reader, maxTurns: 3 } },
    }));
    const h = await started({ recording: 'understand-retry-turn-limit.json', settings: limited });

    const run = await h.understand({ areas: ['Catalog'] });

    expect(h.providers.requests()).toHaveLength(6);
    const manifest = await h.manifestOf(run);
    expect(manifest.agentTasks.map((task) => task.state)).toEqual(['TurnLimitReached']);
    expect(run.endState).toBe('Completed');
  });
});

/** The transcripts of the reader tasks, sorted; the verifier's are `verifier-<claim>` (RF-301). */
function readerTranscripts(names: readonly string[]): string[] {
  return names.filter((name) => name.startsWith('reader-')).sort();
}

describe('an area too large for the context is split in two', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 each half is read on its own, the cards of both are kept, and the retry has its own transcripts', async () => {
    const h = await started({ recording: 'understand-retry-split.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
    expect(index.cards.map((card) => card.title).sort()).toEqual(['Code behind', 'Page layout']);
    const requests = h.providers.requests();
    expect(requests).toHaveLength(5);
    const area = (index: number): string => requests[index]?.messages[0]?.content ?? '';
    expect(area(1)).toContain('Catalog/Details.aspx');
    expect(area(1)).not.toContain('Catalog/Details.aspx.cs');
    expect(area(3)).toContain('Catalog/Details.aspx.cs');
    const transcripts = await readdir(join(h.runFolder(run), 'transcripts'));
    expect(readerTranscripts(transcripts)).toEqual([
      'reader-001-retry-1.jsonl',
      'reader-001-retry-2.jsonl',
      'reader-001.jsonl',
    ]);
  });
});

describe('the retry of an area that cannot be split', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 a one-file area that met its context limit is not read again, and is reported failed', async () => {
    const h = await started({ recording: 'understand-retry-one-file.json' });

    const run = await h.understand({ areas: ['Services'] });

    expect(h.providers.requests()).toHaveLength(1);
    const coverage = coverageSchema.parse(await readJson(join(h.runFolder(run), 'coverage.json')));
    expect(coverage.areas[0]?.failure).toMatch(/^turn limit reached without a card \(RST-/u);
    expect(run.endState).toBe('Completed');
  });

  it('RF-208 RF-201 the two halves of a split area share one turn limit: 4 turns, 1 call, then 2 and 2', async () => {
    const limited = understandSettings((settings) => ({
      ...settings,
      roles: { ...settings.roles, reader: { ...settings.roles.reader, maxTurns: 4 } },
    }));
    const h = await started({ recording: 'understand-retry-split-turns.json', settings: limited });

    await h.understand({ areas: ['Catalog'] });

    expect(h.providers.requests()).toHaveLength(5);
  });

  it('RF-208 the split retry announces each half as the task starting again', async () => {
    const h = await started({ recording: 'understand-retry-split.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    const events = await h.eventsOf(run);
    expect(events.filter((event) => event.type === 'agent.started')).toHaveLength(3);
    expect(events.filter((event) => event.type === 'agent.ended')).toHaveLength(1);
    // Nothing was dropped and no answer was invalid: no raw answers kept, nothing logged as dropped.
    expect(await readdir(h.runFolder(run))).not.toContain('invalid-output');
    expect(h.logger.entries.map((entry) => entry.message).join(' ')).not.toContain('dropped');
  });
});

describe('a card with a claim that stays invalid', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 is kept with its valid claim, the dropped claim is logged and the raw answers are saved', async () => {
    const h = await started({ recording: 'understand-partial-card.json' });

    const run = await h.understand({ areas: ['Catalog'] });

    expect(run.endState).toBe('Completed');
    expect(await endDataOf(h, run)).not.toHaveProperty('failedAreas');
    const index = indexSchema.parse(await readJson(join(h.runFolder(run), 'cards', 'index.json')));
    expect(index.cards.map((card) => card.title)).toEqual(['Product details page']);
    const card = await readFile(
      join(h.runFolder(run), 'cards', 'FEAT', `${index.cards[0]?.id ?? ''}.md`),
      'utf8',
    );
    expect(card).toContain('The page shows the product name.');
    expect(card).not.toContain('The page shows a price.');
    const logged = h.logger.entries.map((entry) => entry.message).join('\n');
    expect(logged).toContain('some claims or cards were dropped');
    expect(logged).toContain('cards.0.claims.1.citations.0');
    const raw = await readFile(join(h.runFolder(run), 'invalid-output', 'reader-001.txt'), 'utf8');
    expect(raw).toContain('=== attempt 3 ===');
    expect(h.providers.requests()).toHaveLength(4);
  });
});
