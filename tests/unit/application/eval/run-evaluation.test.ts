import { describe, expect, it } from 'vitest';
import {
  parseExperiment,
  parseResults,
} from '../../../../src/application/eval/evaluation-schema.js';
import {
  RunEvaluation,
  type RunEvaluationRequest,
} from '../../../../src/application/eval/run-evaluation.js';
import { claim } from '../../../support/eval-fixtures.js';
import {
  evalGoldenSet,
  evalRun,
  FakeEvaluationTarget,
  MemoryEvaluationOutput,
  threeRuns,
} from '../../../support/eval-target.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RNF-006, RNF-012, RNF-015, DEC-57, ADR-008: the evaluation as a recorded experiment: each golden
// case runs at least three times, every result is saved with its date, models, model versions,
// prompt hashes and settings, and the report gives precision, recall, citation validity, the
// spread and the estimate accuracy. The target answers from a script, so no model is called.

function evaluation(target: FakeEvaluationTarget, output = new MemoryEvaluationOutput()) {
  return new RunEvaluation({
    target,
    output,
    clock: new FixedClock('2026-10-17T09:30:00.000Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
    extraPrompts: [{ name: 'verifier/claim.v1.md', version: 'v1', sha256: 'c'.repeat(64) }],
  });
}

function request(overrides: Partial<RunEvaluationRequest> = {}): RunEvaluationRequest {
  return {
    goldenSet: evalGoldenSet,
    goldenSetSha256: 'd'.repeat(64),
    repetitions: 3,
    totalCapMicros: 1_000_000,
    settings: { parallelism: 1, runCapMicros: 400_000 },
    ...overrides,
  };
}

async function evaluated(target = new FakeEvaluationTarget({ runs: threeRuns() })) {
  const output = new MemoryEvaluationOutput();
  const result = await evaluation(target, output).execute(request());
  const [files] = output.written;
  if (!result.ok || files === undefined) throw new Error('The evaluation did not end');
  return { target, files };
}

describe('an evaluation', () => {
  it('RNF-015 runs every case three times over the areas of the golden paths only', async () => {
    const { target } = await evaluated();

    expect(target.calls).toEqual([
      'scan',
      'estimate (root),Models',
      'understand (root),Models',
      'understand (root),Models',
      'understand (root),Models',
    ]);
  });

  it('RNF-015 refuses fewer than three repetitions before anything runs', async () => {
    const target = new FakeEvaluationTarget({ runs: threeRuns() });
    const result = await evaluation(target).execute(request({ repetitions: 2 }));

    expect(result).toMatchObject({ ok: false, error: { code: 'RST-1000' } });
    expect(target.calls).toEqual([]);
  });
});

describe('an evaluation: the experiment', () => {
  it('RNF-015 saves the date, models, model versions, prompt hashes and settings', async () => {
    const { files } = await evaluated();

    expect(files.folder).toBe('20260101-000001-eval');
    expect(files.experiment).toMatchObject({
      schemaVersion: 1,
      id: '20260101-000001-eval',
      at: '2026-10-17T09:30:00.000Z',
      rosettaVersion: '1.2.3-test',
      goldenSetVersion: '2026-10-17.1',
      goldenSetSha256: 'd'.repeat(64),
      repetitions: 3,
      areas: ['(root)', 'Models'],
      source: { url: 'https://github.com/octo/demo', commit: 'c'.repeat(40), subpath: '' },
      settings: { parallelism: 1, runCapMicros: 400_000, totalCapMicros: 1_000_000 },
    });
    expect(files.experiment.roles['reader']).toMatchObject({
      model: 'reader-model',
      modelVersion: 'reader-model-0001',
      modelDigest: null,
    });
    expect(files.experiment.roles['verifier']).toMatchObject({
      modelVersion: 'judge-model-2026-01-01',
    });
    expect(Object.keys(files.experiment.promptVersions)).toEqual([
      'cards/card-format.v1.md',
      'reader/area.v2.md',
      'verifier/claim.v1.md',
    ]);
    expect(files.results.repetitions.map((r) => r.modelVersions['reader'])).toEqual([
      'reader-model-0001',
      'reader-model-0001',
      'reader-model-0002',
    ]);
  });
});

describe('an evaluation: the scores', () => {
  it('RNF-006 reports precision, recall and citation validity per repetition and their spread', async () => {
    const { files } = await evaluated();
    const { results } = files;

    expect(results.repetitions.map((r) => [r.overall.precision, r.overall.recall])).toEqual([
      [1, 0.5],
      [0.5, 0.5],
      [1, 1],
    ]);
    expect(results.repetitions.map((r) => r.citationValidity.rate)).toEqual([1, 1, 1]);
    expect(results.summary.precision).toEqual({
      n: 3,
      min: 0.5,
      max: 1,
      mean: 0.833333,
      stdDev: 0.235702,
    });
    expect(results.summary.recall).toMatchObject({ mean: 0.666667, stdDev: 0.235702 });
    expect(results.targets).toMatchObject({
      precision: { target: 0.9, mean: 0.833333, met: false },
      recall: { target: 0.7, mean: 0.666667, met: false },
      citationValidity: { target: 1, mean: 1, met: true },
    });
  });

  it('RNF-006 scores each case on each repetition with its own claims', async () => {
    const { files } = await evaluated();

    const home = files.results.repetitions.map(
      (r) => r.cases.find((c) => c.caseId === 'home-page')?.recall,
    );
    expect(home).toEqual([0, 0, 1]);
    expect(files.results.cases.map((c) => c.caseId)).toEqual(['catalog-item', 'home-page']);
    expect(files.results.cases[1]?.recall).toMatchObject({ n: 3, min: 0, max: 1 });
  });
});

describe('an evaluation: the estimate', () => {
  it('RNF-012 compares the likely estimate with the cost report of every repetition', async () => {
    const { files } = await evaluated();

    expect(files.results.repetitions.map((r) => r.estimate)).toEqual([
      {
        status: 'measured',
        likelyMicros: 100_000,
        actualMicros: 110_000,
        error: 0.1,
        withinTarget: true,
      },
      {
        status: 'measured',
        likelyMicros: 100_000,
        actualMicros: 110_000,
        error: 0.1,
        withinTarget: true,
      },
      {
        status: 'measured',
        likelyMicros: 100_000,
        actualMicros: 90_000,
        error: -0.1,
        withinTarget: true,
      },
    ]);
    expect(files.results.targets.estimate).toEqual({ target: 0.3, measured: 3, within: 3 });
    expect(files.results.repetitions.map((r) => r.costPerSupportedClaimMicros)).toEqual([
      110_000, 55_000, 45_000,
    ]);
  });
});

describe('an evaluation: refusals', () => {
  it('RNF-006 refuses a golden path the code map does not hold, before any model call', async () => {
    const target = new FakeEvaluationTarget({
      runs: threeRuns(),
      codeMap: { files: [{ path: 'Models/Item.cs', lines: 62 }], areas: [] },
    });
    const result = await evaluation(target).execute(request());

    expect(result).toMatchObject({ ok: false, error: { code: 'RST-1000' } });
    expect(result.ok ? '' : result.error.message).toContain('Default.aspx.cs');
    expect(target.calls).toEqual(['scan']);
  });

  it('ADR-007 refuses when the high estimate of all repetitions would pass the total cap', async () => {
    const target = new FakeEvaluationTarget({ runs: threeRuns() });
    const result = await evaluation(target).execute(request({ totalCapMicros: 599_999 }));

    expect(result).toMatchObject({ ok: false, error: { code: 'RST-1600' } });
    expect(target.calls).toEqual(['scan', 'estimate (root),Models']);
  });
});

describe('an evaluation: ended runs and files', () => {
  it('RNF-006 records a repetition that did not complete, with its end state and code', async () => {
    const failed = { ...evalRun(2, []), endState: 'CapReached' as const, errorCode: 'RST-1600' };
    const target = new FakeEvaluationTarget({
      runs: [evalRun(1, [claim()]), failed, evalRun(3, [claim()])],
    });
    const { files } = await evaluated(target);

    expect(files.results.repetitions[1]).toMatchObject({
      endState: 'CapReached',
      errorCode: 'RST-1600',
      supportedClaims: 0,
      costPerSupportedClaimMicros: null,
    });
    expect(files.results.summary.precision).toMatchObject({ n: 2 });
  });

  it('RNF-015 writes files the output schema accepts, the same files for the same runs', async () => {
    const first = await evaluated();
    const second = await evaluated();

    expect(parseExperiment(first.files.experiment).ok).toBe(true);
    expect(parseResults(first.files.results).ok).toBe(true);
    expect(JSON.stringify(second.files)).toBe(JSON.stringify(first.files));
  });
});
