import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  cardsOfRun,
  firstRunOf,
  readersAskedSince,
  readersOfProject,
} from '../../support/retry-run.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { copyFixture } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { readJson, UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';

// RF-208, Q-43 (default applies), RF-209, RF-614, RF-615: a retry of the failed areas starts from the
// cards, claim statuses and coverage of the run it retries, reads only the failed areas, is linked to
// that run and leaves it as it was. Its Supported claims never fall below that run's, so the
// journey and Plan setup still have them whether the retry works or fails again.

const temp = useTempRoot('rosetta-retry-run-');
const again = 'understand-retry-run-again.json';
const recovers = 'understand-retry-run-recovers.json';

describe('a retry whose area fails again', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 keeps every card and Supported claim of the run it retries and reads only the failed area', async () => {
    const { h, first } = await firstRunOf(temp.path, again);
    const asked = h.providers.requests().length;

    const retry = await h.understand({ areas: ['Catalog'], retryOf: first.id });

    expect(retry).toMatchObject({ endState: 'Completed', failedAreas: 1 });
    expect(await cardsOfRun(h, retry)).toEqual([['FEAT-001', 'Services', 1]]);
    const readers = readersAskedSince(h, asked);
    expect(readers).toHaveLength(8);
    expect(readers.every((id) => id.startsWith('reader-001'))).toBe(true);
    const coverage = JSON.stringify(await readJson(join(h.runFolder(retry), 'coverage.json')));
    expect(coverage).toContain('Services/CatalogService.cs');
    expect(coverage).toContain('invalid output');
  });

  it('RF-615 RF-614 the journey and Plan setup take the retry as the source, with its Supported claims', async () => {
    const { h, first } = await firstRunOf(temp.path, again);
    const retry = await h.understand({ areas: ['Catalog'], retryOf: first.id });
    const read = readersOfProject(h);

    const journey = await read.journey();
    const source = await read.planSource();

    expect(journey).toMatchObject({
      ok: true,
      value: { source: { id: retry.id, endState: 'Completed', supportedClaims: 1 } },
    });
    expect(source).toMatchObject({
      ok: true,
      value: { runId: retry.id, runKey: retry.runKey, supportedClaims: 1, newest: true },
    });
  });
});

describe('the run it retries', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 is left as it was by a retry', async () => {
    const { h, first } = await firstRunOf(temp.path, again);
    const results = join(h.runFolder(first), 'task-results.json');
    const before = {
      manifest: await h.manifestOf(first),
      results: await readFile(results, 'utf8'),
      cards: await cardsOfRun(h, first),
    };

    await h.understand({ areas: ['Catalog'], retryOf: first.id });

    expect(await h.manifestOf(first)).toEqual(before.manifest);
    expect(await readFile(results, 'utf8')).toBe(before.results);
    expect(await cardsOfRun(h, first)).toEqual(before.cards);
  });
});

describe('a retry that works', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 gives the new card an id after the parent cards and holds both Supported claims', async () => {
    const { h, first } = await firstRunOf(temp.path, recovers);

    const retry = await h.understand({ areas: ['Catalog'], retryOf: first.id });

    expect(retry).toMatchObject({ endState: 'Completed', failedAreas: 0 });
    expect(await cardsOfRun(h, retry)).toEqual([
      ['FEAT-001', 'Services', 1],
      ['FEAT-002', 'Catalog', 1],
    ]);
    expect(await cardsOfRun(h, first)).toEqual([['FEAT-001', 'Services', 1]]);
    const source = await readersOfProject(h).planSource();
    expect(source).toMatchObject({ ok: true, value: { runId: retry.id, supportedClaims: 2 } });
  });
});

describe('a retry of a retry', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 holds the cards of the whole chain and is linked to the retry it retries', async () => {
    const { h, first } = await firstRunOf(temp.path, again);
    const second = await h.understand({ areas: ['Catalog'], retryOf: first.id });

    const third = await h.understand({ areas: ['Catalog'], retryOf: second.id });

    expect(third).toMatchObject({ endState: 'Completed', failedAreas: 1 });
    expect(await cardsOfRun(h, third)).toEqual([['FEAT-001', 'Services', 1]]);
    expect((await h.manifestOf(third)).options).toMatchObject({ retryOf: second.id });
    expect((await h.manifestOf(second)).options).toMatchObject({ retryOf: first.id });
  });
});

describe('what the retry says of itself', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 plans only the retried area and announces the run it retries before its agents', async () => {
    const { h, first } = await firstRunOf(temp.path, again);

    const retry = await h.understand({ areas: ['Catalog'], retryOf: first.id });

    const events = await h.eventsOf(retry);
    const types = events.map((event) => event.type);
    expect(types.filter((type) => type === 'agent.planned')).toHaveLength(1);
    expect(types.indexOf('retry.started')).toBeGreaterThanOrEqual(0);
    expect(types.indexOf('retry.started')).toBeLessThan(types.indexOf('agent.planned'));
    expect(events.find((event) => event.type === 'retry.started')?.data).toEqual({
      ...{ parentRunId: first.id, parentRunKey: first.runKey, areas: 1 },
      seeded: { cards: 1, claims: 1, supported: 1, rejected: 0, citationInvalid: 0, notJudged: 0 },
    });
    expect((await h.manifestOf(retry)).agentTasks.map((task) => task.area)).toEqual(['Catalog']);
  });

  it('RF-208 a run that retries nothing announces nothing', async () => {
    const { h, first } = await firstRunOf(temp.path, again);

    expect((await h.eventsOf(first)).map((event) => event.type)).not.toContain('retry.started');
  });
});

describe('an area the run it retries read well', UNDERSTAND_TIMEOUT, () => {
  it('RF-208 is kept as it is, not read again, so the retry never has fewer Supported claims', async () => {
    const { h, first } = await firstRunOf(temp.path, again);
    const asked = h.providers.requests().length;

    const retry = await h.understand({ areas: ['Catalog', 'Services'], retryOf: first.id });

    expect(await cardsOfRun(h, retry)).toEqual([['FEAT-001', 'Services', 1]]);
    expect(readersAskedSince(h, asked).some((id) => id.startsWith('reader-002'))).toBe(false);
    expect((await h.manifestOf(retry)).agentTasks.map((task) => task.area)).toEqual(['Catalog']);
  });
});

describe('a retry on a code map that changed', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 RF-208 is refused, because the kept cards cite lines of the code map the run read', async () => {
    const repository = join(temp.path, 'repository');
    await copyFixture('webforms-csharp', repository);
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, repository, recording: again },
      verifierRecording: 'verifier-all-supported.json',
    });
    await h.scan();
    const first = await h.understand({ areas: ['Catalog', 'Services'] });
    await writeFile(
      join(repository, 'Catalog', 'Extra.aspx.cs'),
      'public class Extra {}\n',
      'utf8',
    );
    await h.scan();
    const asked = h.providers.requests().length;

    const retry = await h.understand({ areas: ['Catalog'], retryOf: first.id });

    expect(retry.endState).toBe('Failed');
    const ended = (await h.eventsOf(retry)).find((event) => event.type === 'run.ended');
    expect(ended?.data).toMatchObject({
      endState: 'Failed',
      errorCode: ERROR_CODES.resumeSourceChanged,
    });
    expect(readersAskedSince(h, asked)).toEqual([]);
  });
});
