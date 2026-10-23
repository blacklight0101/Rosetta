import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseOverview } from '../../../src/application/overview/overview-file.js';
import type { Run } from '../../../src/domain/runs/run.js';
import { copyFixture } from '../../support/scan-harness.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';

// RF-264, RF-250, RF-420, RF-427: after an understand run, the summariser writes `overview.md` and
// `overview.json` from the cards whose citations passed. Every statement links its cards, a
// statement with no card is dropped, a thin or stopped run says so, spec.md opens with the overview
// and the call goes through the budget guard like any other.

const temp = useTempRoot('rosetta-understand-overview-');
const allSupported = 'verifier-all-supported.json';
const costFile = z.looseObject({ roles: z.array(z.looseObject({ role: z.string() })).optional() });

interface FullRun {
  readonly h: UnderstandHarness;
  readonly run: Run;
  readonly folder: string;
}

/** One run for the tests that only read what it left, made once in its own folder. */
const shared: { dir?: string; made?: FullRun } = {};

beforeAll(async () => {
  shared.dir = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-overview-shared-')));
  const h = await createUnderstandHarness({
    dataDir: shared.dir,
    recording: 'understand-overview.json',
    verifierRecording: allSupported,
  });
  await h.scan();
  const run = await h.understand();
  shared.made = { h, run, folder: h.runFolder(run) };
}, 300_000);

afterAll(async () => {
  if (shared.dir !== undefined) {
    await rm(shared.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

function fullRun(): Promise<FullRun> {
  if (shared.made === undefined) throw new Error('The shared run did not start.');
  return Promise.resolve(shared.made);
}

const read = (folder: string, name: string): Promise<string> =>
  readFile(join(folder, name), 'utf8');

async function overviewOf(folder: string) {
  const overview = parseOverview(await read(folder, 'overview.json'));
  if (overview === undefined) throw new Error('overview.json is not an overview.');
  return overview;
}

describe('the overview of an understand run', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 is written from the cards that passed, each statement linking its cards', async () => {
    const { run, folder } = await fullRun();

    expect(run.endState).toBe('Completed');
    const overview = await overviewOf(folder);
    expect(overview.state).toBe('full');
    expect(overview.sections.map((section) => section.id)).toEqual([
      'application',
      'users',
      'features',
      'screens',
      'data',
    ]);
    for (const section of overview.sections) {
      for (const statement of section.statements) expect(statement.cards.length).toBeGreaterThan(0);
    }
    const markdown = await read(folder, 'overview.md');
    expect(markdown).toContain('A catalog web site that lists items and shows one item.');
    expect(markdown).toContain('[FEAT-001](cards/FEAT/FEAT-001.md)');
    expect(markdown).toContain('[ENT-001](cards/ENT/ENT-001.md)');
  });

  it('RF-264 drops a statement with no card and one whose card nobody wrote', async () => {
    const { h, run, folder } = await fullRun();

    const all = `${await read(folder, 'overview.md')}${await read(folder, 'overview.json')}`;
    expect(all).not.toContain('send an email');
    expect(all).not.toContain('card payments');
    expect(all).toContain('The home page lists every catalog item.');
    const warned = h.logger.entries.filter((entry) => entry.message.includes('overview statement'));
    expect(warned.map((entry) => entry.message)).toEqual([
      '2 overview statement(s) without a card were dropped.',
    ]);
    expect(run.endState).toBe('Completed');
  });
});

describe('the overview and what was not covered', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 lists what the run could not cover from the areas, not from the model', async () => {
    const { folder } = await fullRun();

    const { notCovered } = await overviewOf(folder);

    expect(notCovered.slice(-1)).toEqual([
      'Controllers: no card passed the citation check and the judgement.',
    ]);
  });

  it('RF-264 links the open question to the section of the overview it concerns', async () => {
    const { folder } = await fullRun();

    const overview = await overviewOf(folder);

    expect(overview.questions).toEqual([{ cardId: 'OQ-001', section: 'application' }]);
    expect(await read(folder, 'overview.md')).toContain(
      'Open questions about this section: [OQ-001](cards/OQ/OQ-001.md)',
    );
  });

  it('RF-264 opens spec.md, before the first area and before any open question card', async () => {
    const { folder } = await fullRun();

    const spec = await read(folder, 'spec.md');

    expect(spec.indexOf('## Overview')).toBeGreaterThan(-1);
    expect(spec.indexOf('## Overview')).toBeLessThan(spec.indexOf('## Area:'));
    expect(spec.indexOf('## Overview')).toBeLessThan(spec.indexOf('OQ-001 '));
    expect(spec).toContain('The home page lists every catalog item.');
  });
});

describe('the overview and hostile text', UNDERSTAND_TIMEOUT, () => {
  it('RF-507 hostile text in a statement is written as text in every file', async () => {
    const { folder } = await fullRun();

    for (const name of ['overview.md', 'spec.md']) {
      const text = await read(folder, name);
      expect(text).not.toContain('<script>');
      expect(text).not.toContain('<img');
      expect(text).not.toContain('](javascript:');
      expect(text).toContain('&lt;script&gt;');
    }
  });

  it('RF-264 RF-420 the call is a summariser call with the overview prompt, recorded and costed', async () => {
    const { h, run, folder } = await fullRun();

    const asked = h.providers
      .requests()
      .filter((r) => r.context.agentTaskId === 'summariser-overview');
    expect(asked).toHaveLength(1);
    expect(asked[0]?.context.role).toBe('summariser');
    expect(asked[0]?.tools).toEqual([]);
    const manifest = await h.manifestOf(run);
    expect(manifest.promptVersions['summariser/overview.v1.md']).toMatchObject({ version: 'v1' });
    const cost = costFile.parse(JSON.parse(await read(folder, 'cost.json')));
    expect(JSON.stringify(cost)).toContain('summariser');
  });

  it('RF-264 RF-423 a summariser that reached its cap leaves an overview that says so and the run completes', async () => {
    const settings = understandSettings((base) => ({
      ...base,
      budget: { ...base.budget, roles: { summariser: { maxTokens: 1 } } },
    }));
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-overview.json', settings },
      verifierRecording: allSupported,
    });
    await h.scan();

    const run = await h.understand();

    expect(run.endState).toBe('Completed');
    const overview = await overviewOf(h.runFolder(run));
    expect(overview.state).toBe('unavailable');
    expect(overview.notice).toContain('could not be written');
    expect(await read(h.runFolder(run), 'spec.md')).toContain('## Overview');
  });
});

describe('the overview of a thin, stopped or capped run', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 a run with too few cards says it cannot explain the application and asks nothing', async () => {
    const repository = join(temp.path, 'repository');
    await copyFixture('webforms-csharp', repository);
    await mkdir(join(repository, 'Scripts'), { recursive: true });
    await writeFile(
      join(repository, 'Scripts', 'jquery-3.4.1.min.js'),
      '!function(e){}(window);\n',
    );
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-third-party.json', repository },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Scripts'] });

    expect(run.endState).toBe('Completed');
    const overview = await overviewOf(h.runFolder(run));
    expect(overview.state).toBe('thin');
    expect(overview.notice).toContain('cannot explain the application yet');
    expect(overview.notice).toContain('Most areas of this repository hold third-party code');
    expect(overview.notice).toContain('Next step');
    expect(overview.notCovered.some((line) => line.startsWith('Scripts: third-party'))).toBe(true);
    expect(h.providers.requests().some((r) => r.context.role === 'summariser')).toBe(false);
    expect(await read(h.runFolder(run), 'spec.md')).toContain('cannot explain the application yet');
  });

  it('RF-264 a run the user stopped says it stopped before the overview, with no call', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      recording: 'understand-stopped.json',
      beforeCall: async (call, harness) => {
        if (call === 3) await harness.stopRunning();
      },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('Interrupted');
    const overview = await overviewOf(h.runFolder(run));
    expect(overview.state).toBe('unavailable');
    expect(overview.notice).toContain('stopped before the overview was written');
    expect(
      h.providers.requests().some((r) => r.context.agentTaskId === 'summariser-overview'),
    ).toBe(false);
  });
});

describe('the overview of a capped run', UNDERSTAND_TIMEOUT, () => {
  it('RF-264 a run that reached its cap leaves an overview file that says why', async () => {
    const capped = understandSettings((settings) => ({
      ...settings,
      budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 205_000 } },
    }));
    const h = await createUnderstandHarness({
      ...{ dataDir: temp.path, recording: 'understand-cap.json', settings: capped },
    });
    await h.scan();

    const run = await h.understand({ areas: ['Catalog', 'Services'] });

    expect(run.endState).toBe('CapReached');
    const overview = await overviewOf(h.runFolder(run));
    expect(['thin', 'unavailable']).toContain(overview.state);
    expect(overview.notice).toBeDefined();
  });
});
