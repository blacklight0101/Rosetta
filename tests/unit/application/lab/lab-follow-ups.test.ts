import { describe, expect, it } from 'vitest';
import {
  compareLab,
  parseLabResults,
  summariseLab,
  type LabCaseResult,
  type LabResults,
} from '../../../../src/application/lab/lab-results.js';
import { compareLines, summaryLines } from '../../../../src/presentation/lab/lab-report.js';

// RF-1403 (P10-07): the summary and the compare totals count each detail label and the rate of each
// follow-up a run would make after the answer, counted apart from the label.

function caseResult(id: string, over: Partial<LabCaseResult> = {}): LabCaseResult {
  return {
    ...{ caseId: id, repetition: 1, split: 'tune', expected: null, detail: 'Covered' },
    ...{ answer: '{}', usable: true, validFirstTry: true, repaired: false, refused: false },
    ...{ rstCode: null, agreed: null, calls: 1, inputTokens: 400, outputTokens: 30 },
    ...{ latencyMs: 200, costMicros: 460 },
    ...over,
  };
}

function run(version: string, cases: readonly LabCaseResult[]): LabResults {
  return {
    ...{ schemaVersion: 1, id: `20261114-100000-lab-${version}`, at: '2026-11-14T10:00:00.000Z' },
    rosettaVersion: '1.2.3-test',
    prompt: {
      id: 'planner/gap',
      name: `planner/gap.${version}.md`,
      version,
      sha256: 'a'.repeat(64),
    },
    model: { provider: 'fake', model: 'model-a', modelVersion: null },
    caseSet: { version: 'planner-gap-1', sha256: 'b'.repeat(64) },
    ...{ repetitions: 1, planned: cases.length, endState: 'Completed', refusal: null },
    cases: [...cases],
  };
}

const gapCases = [
  caseResult('a', { followUps: { 'repair call': false, 'second round': false } }),
  caseResult('b', {
    detail: 'LeftOut',
    followUps: { 'repair call': true, 'second round': true },
  }),
  caseResult('c', { detail: 'Open', followUps: { 'repair call': false, 'second round': true } }),
  caseResult('d', { followUps: { 'repair call': false, 'second round': false } }),
];

describe('the label counts and follow-ups of a lab run', () => {
  it('RF-1403 counts each label and each follow-up apart from the label', () => {
    const summary = summariseLab(run('v6', gapCases));

    expect(summary.detailCounts).toEqual({ Covered: 2, LeftOut: 1, Open: 1 });
    expect(summary.followUpRates).toEqual({ 'repair call': 0.25, 'second round': 0.5 });
  });

  it('RF-1403 names no follow-up for a target that records none, and keeps the schema', () => {
    const plain = run('v1', [caseResult('a', { detail: 'Supported' })]);

    expect(summariseLab(plain).followUpRates).toEqual({});
    expect(parseLabResults(run('v6', gapCases)).ok).toBe(true);
    expect(parseLabResults(plain).ok).toBe(true);
  });

  it('RF-1403 prints the counts and the rates in the summary and in both compare totals', () => {
    const lines = summaryLines(run('v6', gapCases), 'lab-out/x');
    const empty = run('v7', [
      caseResult('a', {
        detail: 'Open',
        followUps: { 'repair call': false, 'second round': true },
      }),
    ]);
    const compared = compareLab(run('v6', gapCases), empty);
    if (!compared.ok) throw new Error(compared.error);
    const both = compareLines(compared.value).join('\n');

    expect(lines).toContain('Results by label: Covered 2, LeftOut 1, Open 1');
    expect(lines).toContain('Follow-ups a run would make: repair call 25%, second round 50%');
    expect(both).toContain('  Results by label: Open 1');
    expect(both).toContain('  Follow-ups a run would make: repair call 0%, second round 100%');
  });
});

describe('the counts a target records per case', () => {
  it('RF-1403 keeps the counts of a case in the results, and never averages them', () => {
    const counted = run('v3', [caseResult('a', { detail: 'Fixed', ...{ counts: { tasks: 4 } } })]);
    const parsed = parseLabResults(counted);

    expect(parsed.ok && parsed.value.cases[0]).toMatchObject({ counts: { tasks: 4 } });
    expect(summaryLines(counted, 'lab-out/x').join(' ')).not.toContain('tasks 4');
  });
});
