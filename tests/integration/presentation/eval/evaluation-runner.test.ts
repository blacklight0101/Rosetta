import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseExperiment,
  parseResults,
} from '../../../../src/application/eval/evaluation-schema.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { runEvaluation } from '../../../../src/presentation/eval/compose-evaluation.js';
import { evalFixtures, evalParts } from '../../../support/eval-runner-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { understandSettings } from '../../../support/understand-run-harness.js';

// RNF-006, RNF-012, RNF-015, ADR-008 ("the runner uses the fake provider in its own tests"): the
// evaluation runner scans the golden set's pinned source once, runs `understand` three times over
// the areas of the golden paths through the real provider factory, guards, card writers and run
// queue, and writes `experiment.json` and `results.json`. The fake provider replays recordings, so
// no network and no real model is used.

const temp = useTempRoot('rosetta-eval-');
const TIMEOUT = 300_000;

/** One evaluation shared by the tests that only read its files. */
const shared = { folder: '', ok: false };

beforeAll(async () => {
  shared.folder = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-eval-shared-')));
  shared.ok = (await evaluate(shared.folder)).ok;
}, TIMEOUT);

afterAll(async () => {
  await rm(shared.folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function evaluate(folder: string) {
  const golden = await loadGoldenSet(evalFixtures, 'golden-csharp.json');
  if (!golden.ok) throw new Error(golden.error);
  const parts = await evalParts({ dataDir: join(folder, 'data'), outputDir: join(folder, 'out') });
  return runEvaluation(parts, golden.value, 3);
}

async function written(folder: string): Promise<{ experiment: unknown; results: unknown }> {
  const [id] = await readdir(join(folder, 'out'));
  if (id === undefined) throw new Error('No evaluation folder');
  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(join(folder, 'out', id, name), 'utf8'));
  return { experiment: await read('experiment.json'), results: await read('results.json') };
}

describe('the evaluation runner with the fake provider', () => {
  it(
    'RNF-006 RNF-015 runs each case three times and writes files the output schema accepts',
    async () => {
      expect(shared.ok).toBe(true);
      const files = await written(shared.folder);
      const experiment = parseExperiment(files.experiment);
      const results = parseResults(files.results);
      if (!experiment.ok || !results.ok) throw new Error('The files do not parse');
      expect(experiment.value).toMatchObject({
        id: '20260101-000005-eval',
        at: '2026-10-17T09:30:00.000Z',
        goldenSetVersion: '2026-10-17.test',
        repetitions: 3,
        areas: ['(root)', 'Catalog', 'Controllers', 'Database', 'Services'],
        source: { url: 'https://github.com/octo/demo', commit: 'c'.repeat(40) },
      });
      expect(experiment.value.goldenSetSha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(experiment.value.roles['reader']).toMatchObject({
        provider: 'fake',
        model: 'fake-model',
      });
      expect(experiment.value.roles['verifier']).toMatchObject({ model: 'judge-model' });
      expect(Object.keys(experiment.value.promptVersions)).toEqual(
        expect.arrayContaining([
          'reader/task.v2.md',
          'verifier/claim.v3.md',
          'verifier/retry.v1.md',
        ]),
      );
      expect(results.value.repetitions.map((r) => r.endState)).toEqual([
        'Completed',
        'Completed',
        'Completed',
      ]);
    },
    TIMEOUT,
  );
});

describe('the evaluation runner: scores', () => {
  it(
    'RNF-006 scores the recorded claims against the golden set, with the spread across runs',
    async () => {
      const parsed = parseResults((await written(shared.folder)).results);
      if (!parsed.ok) throw new Error('The results do not parse');
      const { repetitions, summary } = parsed.value;

      expect(repetitions.map((r) => [r.overall.supported, r.overall.correct])).toEqual([
        [4, 3],
        [4, 3],
        [5, 4],
      ]);
      expect(repetitions.map((r) => r.overall.recall)).toEqual([0.5, 0.5, 1]);
      expect(repetitions.map((r) => r.overall.unmatchedClaims)).toEqual([
        ['OQ-001.c1'],
        ['OQ-001.c1'],
        ['OQ-001.c1'],
      ]);
      expect(repetitions.map((r) => r.citationValidity.rate)).toEqual([1, 1, 1]);
      expect(summary.recall).toMatchObject({ n: 3, min: 0.5, max: 1 });
      expect(summary.precision).toMatchObject({ n: 3, mean: 1, stdDev: 0 });
    },
    TIMEOUT,
  );
});

describe('the evaluation runner: estimate and repeatability', () => {
  it(
    'RNF-012 records the estimate of a free local model as not measured, never as a match',
    async () => {
      const parsed = parseResults((await written(shared.folder)).results);
      if (!parsed.ok) throw new Error('The results do not parse');

      expect(parsed.value.repetitions.map((r) => r.estimate.status)).toEqual([
        'not-measured',
        'not-measured',
        'not-measured',
      ]);
      expect(parsed.value.targets.estimate).toEqual({ target: 0.3, measured: 0, within: 0 });
    },
    TIMEOUT,
  );

  it(
    'RNF-015 gives the same files for the same recordings, clock and ids',
    async () => {
      await evaluate(temp.path);

      expect(await written(temp.path)).toEqual(await written(shared.folder));
    },
    TIMEOUT,
  );
});

describe('the evaluation runner: caps', () => {
  it(
    'ADR-007 stops a repetition at its run cap and records it as CapReached',
    async () => {
      const golden = await loadGoldenSet(evalFixtures, 'golden-csharp.json');
      if (!golden.ok) throw new Error(golden.error);
      const capped = understandSettings((s) => ({
        ...s,
        budget: { ...s.budget, run: { ...s.budget.run, maxTokens: 1 } },
      }));
      const parts = await evalParts({
        dataDir: join(temp.path, 'data'),
        outputDir: join(temp.path, 'out'),
        settings: capped,
      });
      const result = await runEvaluation(parts, golden.value, 3);

      expect(result.ok).toBe(true);
      const parsed = parseResults((await written(temp.path)).results);
      if (!parsed.ok) throw new Error('The results do not parse');
      expect(parsed.value.repetitions.map((r) => r.endState)).toEqual([
        'CapReached',
        'CapReached',
        'CapReached',
      ]);
      expect(parsed.value.repetitions.map((r) => r.overall.supported)).toEqual([0, 0, 0]);
    },
    TIMEOUT,
  );
});
