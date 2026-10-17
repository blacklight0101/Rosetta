import { describe, expect, it } from 'vitest';
import type { EvaluationOutput } from '../../../../src/application/eval/evaluation-ports.js';
import {
  RunEvaluation,
  type RunEvaluationRequest,
} from '../../../../src/application/eval/run-evaluation.js';
import { claim } from '../../../support/eval-fixtures.js';
import {
  evalGoldenSet,
  evalRun,
  FailingEvaluationOutput,
  FakeEvaluationTarget,
  MemoryEvaluationOutput,
  threeRuns,
} from '../../../support/eval-target.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RNF-006, RNF-015: what the evaluation reports beside the headline precision, and what happens to
// results that were paid for when their folder cannot be written.

function evaluation(target: FakeEvaluationTarget, output: EvaluationOutput) {
  return new RunEvaluation({
    target,
    output,
    clock: new FixedClock('2026-10-17T09:30:00.000Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
    extraPrompts: [],
  });
}

const request: RunEvaluationRequest = {
  goldenSet: evalGoldenSet,
  goldenSetSha256: 'd'.repeat(64),
  repetitions: 3,
  totalCapMicros: 1_000_000,
  settings: { parallelism: 1, runCapMicros: 400_000 },
};

describe('an evaluation: the precision target', () => {
  it('RNF-006 shows the strict precision and the share of unchecked claims beside the headline', async () => {
    const right = claim({ claimId: 'BR-001.c1' });
    const stray = claim({
      claimId: 'FEAT-009.c1',
      text: 'The stock is kept.',
      citations: ['Models/Item.cs:50-51'],
    });
    const runs = [1, 2, 3].map((n) => evalRun(n, [right, stray]));
    const output = new MemoryEvaluationOutput();
    const result = await evaluation(new FakeEvaluationTarget({ runs }), output).execute(request);

    expect(result.ok).toBe(true);
    expect(output.written[0]?.results.targets.precision).toEqual({
      target: 0.9,
      mean: 1,
      met: true,
      strictMean: 0.5,
      unmatchedShare: 0.5,
    });
  });
});

describe('an evaluation: a folder that cannot be written', () => {
  it('RNF-015 writes the results to a new folder when the first cannot be written', async () => {
    const output = new FailingEvaluationOutput(1);
    const target = new FakeEvaluationTarget({ runs: threeRuns() });
    const result = await evaluation(target, output).execute(request);

    const [files] = output.written;
    expect(result.ok).toBe(true);
    expect(output.refused).toHaveLength(1);
    expect(files?.folder).not.toBe(output.refused[0]);
    expect(files?.experiment.id).toBe(files?.folder);
    expect(files?.results.experimentId).toBe(files?.folder);
  });

  it('RNF-015 hands the results back with RST-1701 when no folder can be written', async () => {
    const output = new FailingEvaluationOutput(2);
    const target = new FakeEvaluationTarget({ runs: threeRuns() });
    const result = await evaluation(target, output).execute(request);

    expect(result).toMatchObject({ ok: false, error: { code: 'RST-1701' } });
    if (result.ok) throw new Error('The evaluation was written');
    expect(result.error.files?.results.repetitions).toHaveLength(3);
    expect(result.error.message).toContain('EEXIST');
  });
});
