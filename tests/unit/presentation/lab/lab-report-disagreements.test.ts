import { describe, expect, it } from 'vitest';
import {
  summariseLab,
  type LabCaseResult,
  type LabResults,
} from '../../../../src/application/lab/lab-results.js';
import { summaryLines } from '../../../../src/presentation/lab/lab-report.js';

// RF-1411: the summary names the disagreements by pair next to the agreement rate.

function result(id: string, expected: string, detail: string): LabCaseResult {
  return {
    ...{ caseId: id, repetition: 1, split: 'held-back', expected, detail, answer: '' },
    ...{ usable: true, validFirstTry: true, repaired: false, refused: false, rstCode: null },
    ...{ agreed: expected === detail, calls: 1, inputTokens: 1, outputTokens: 1 },
    ...{ latencyMs: 1, costMicros: 1 },
  };
}

function run(cases: LabCaseResult[]): LabResults {
  return {
    ...{ schemaVersion: 1, id: 'x-lab', at: '2026-11-14T10:00:00.000Z', rosettaVersion: '1' },
    prompt: {
      ...{ id: 'verifier/claim', name: 'verifier/claim.v5.md', version: 'v5' },
      sha256: 'a'.repeat(64),
    },
    model: { provider: 'fake', model: 'm', modelVersion: null },
    caseSet: { version: 's', sha256: 'b'.repeat(64) },
    ...{ repetitions: 1, planned: cases.length, endState: 'Completed', refusal: null, cases },
  };
}

describe('the lab report of disagreements', () => {
  it('RF-1411 counts the pairs in the summary', () => {
    const summary = summariseLab(
      run([result('a', 'Rejected', 'Supported'), result('b', 'Supported', 'Supported')]),
    );

    expect(summary.disagreements).toEqual({ 'Rejected -> Supported': 1 });
  });

  it('RF-1411 prints the pairs, or none, after the agreement', () => {
    const lines = summaryLines(run([result('a', 'Rejected', 'Supported')]), 'lab-out/x');
    const clean = summaryLines(run([result('a', 'Supported', 'Supported')]), 'lab-out/x');

    expect(lines).toContain('Disagreements (expected -> got): Rejected -> Supported x1');
    expect(clean).toContain('Disagreements (expected -> got): none');
  });
});
