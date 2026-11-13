import { describe, expect, it } from 'vitest';
import {
  compareLab,
  type LabCaseResult,
  type LabResults,
} from '../../../../src/application/lab/lab-results.js';
import { compareLines } from '../../../../src/presentation/lab/lab-report.js';

// RF-1403, RF-1405, ADR-029: the comparison of two runs warns when their case set has no held-back
// case, because a version can be kept only on held-back cases (DEC-231).

function caseOf(caseId: string, split: LabCaseResult['split']): LabCaseResult {
  return {
    ...{ caseId, repetition: 1, split, expected: null, detail: 'Tasks', answer: '{}' },
    ...{ usable: true, validFirstTry: true, repaired: false, refused: false, rstCode: null },
    ...{ agreed: null, calls: 1, inputTokens: 10, outputTokens: 5, latencyMs: 1, costMicros: 1 },
  };
}

function run(version: string, splits: readonly LabCaseResult['split'][]): LabResults {
  return {
    ...{ schemaVersion: 1, id: `run-${version}`, at: '2026-11-13T10:00:00.000Z' },
    rosettaVersion: 'test',
    prompt: {
      id: 'planner/prd',
      name: `planner/prd.${version}.md`,
      version,
      sha256: '0'.repeat(64),
    },
    model: { provider: 'fake', model: 'model-a', modelVersion: null },
    caseSet: { version: 'planner-prd-1', sha256: 'a'.repeat(64) },
    ...{ repetitions: 1, planned: splits.length, endState: 'Completed', refusal: null },
    cases: splits.map((split, index) => caseOf(`c${String(index)}`, split)),
  };
}

const WARNING =
  'Warning: the case set has no held-back case, so this comparison cannot decide whether to keep a version (DEC-231).';

describe('the comparison of two runs', () => {
  it('RF-1405 warns when the case set has no held-back case', () => {
    const compared = compareLab(run('v1', ['tune', 'tune']), run('v2', ['tune', 'tune']));

    if (!compared.ok) throw new Error(compared.error);
    expect(compareLines(compared.value)).toContain(WARNING);
  });

  it('RF-1405 does not warn when a held-back case was run', () => {
    const compared = compareLab(run('v1', ['tune', 'held-back']), run('v2', ['tune', 'held-back']));

    if (!compared.ok) throw new Error(compared.error);
    expect(compareLines(compared.value)).not.toContain(WARNING);
  });
});
