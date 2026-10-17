import { describe, expect, it } from 'vitest';
import {
  parseExperiment,
  parseResults,
} from '../../../../src/application/eval/evaluation-schema.js';
import { RunEvaluation } from '../../../../src/application/eval/run-evaluation.js';
import {
  evalGoldenSet,
  FakeEvaluationTarget,
  MemoryEvaluationOutput,
  threeRuns,
} from '../../../support/eval-target.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RNF-015 (verification: "evaluation output schema test"), RNF-006, RNF-012, data-model.md section
// 3.19: `experiment.json` and `results.json` hold what makes an evaluation an experiment, and a file
// that lost any of it is refused.

async function files(): Promise<{ experiment: unknown; results: unknown }> {
  const output = new MemoryEvaluationOutput();
  await new RunEvaluation({
    target: new FakeEvaluationTarget({ runs: threeRuns() }),
    output,
    clock: new FixedClock('2026-10-17T09:30:00.000Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
    extraPrompts: [],
  }).execute({
    goldenSet: evalGoldenSet,
    goldenSetSha256: 'd'.repeat(64),
    repetitions: 3,
    totalCapMicros: 1_000_000,
    settings: { parallelism: 1 },
  });
  const [written] = output.written;
  if (written === undefined) throw new Error('Nothing was written');
  const experiment: unknown = JSON.parse(JSON.stringify(written.experiment));
  const results: unknown = JSON.parse(JSON.stringify(written.results));
  return { experiment, results };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Not an object');
  }
  return Object.fromEntries(Object.entries(value));
}

describe('the evaluation output schema', () => {
  it('RNF-015 accepts the files an evaluation writes', async () => {
    const { experiment, results } = await files();

    expect(parseExperiment(experiment).ok).toBe(true);
    expect(parseResults(results).ok).toBe(true);
  });

  it.each([
    ['the date', 'at'],
    ['the models', 'roles'],
    ['the prompt hashes', 'promptVersions'],
    ['the settings', 'settings'],
    ['the golden set version', 'goldenSetVersion'],
    ['the repetitions', 'repetitions'],
  ])('RNF-015 refuses an experiment without %s', async (_name, field) => {
    const experiment = record((await files()).experiment);
    Reflect.deleteProperty(experiment, field);

    expect(parseExperiment(experiment).ok).toBe(false);
  });
});

describe('the evaluation output schema: versions and hashes', () => {
  it('RNF-015 refuses a role without its model version and a prompt without its SHA-256', async () => {
    const experiment = record((await files()).experiment);
    const roles = record(experiment['roles']);
    const reader = record(roles['reader']);
    Reflect.deleteProperty(reader, 'modelVersion');
    const lostVersion = { ...experiment, roles: { ...roles, reader } };
    const prompts = { 'reader/area.v2.md': { version: 'v2' } };

    expect(parseExperiment(lostVersion).ok).toBe(false);
    expect(parseExperiment({ ...experiment, promptVersions: prompts }).ok).toBe(false);
    expect(
      parseExperiment({ ...experiment, promptVersions: { x: { version: 'v1', sha256: 'zz' } } }).ok,
    ).toBe(false);
  });
});

describe('the evaluation output schema: models, prompts and results', () => {
  it('RNF-015 refuses an experiment of fewer than three repetitions', async () => {
    const experiment = record((await files()).experiment);

    expect(parseExperiment({ ...experiment, repetitions: 2 }).ok).toBe(false);
  });

  it.each([['summary'], ['targets'], ['repetitions'], ['cases']])(
    'RNF-006 RNF-012 refuses results without %s',
    async (field) => {
      const results = record((await files()).results);
      Reflect.deleteProperty(results, field);

      expect(parseResults(results).ok).toBe(false);
    },
  );

  it('RNF-006 RNF-012 refuses a repetition without its scores or its estimate', async () => {
    const results = record((await files()).results);
    const repetitions = results['repetitions'];
    if (!Array.isArray(repetitions)) throw new Error('No repetitions');
    const rest: unknown[] = repetitions.slice(1);
    const refused = ['overall', 'citationValidity', 'estimate', 'cases'].filter((field) => {
      const first = record(repetitions[0]);
      Reflect.deleteProperty(first, field);
      return !parseResults({ ...results, repetitions: [first, ...rest] }).ok;
    });

    expect(refused).toEqual(['overall', 'citationValidity', 'estimate', 'cases']);
  });

  it('RNF-015 refuses results whose spread is not a spread', async () => {
    const results = record((await files()).results);
    const summary = record(results['summary']);
    const broken = { ...summary, precision: { n: 3, min: 0.5 } };

    expect(parseResults({ ...results, summary: broken }).ok).toBe(false);
  });
});
