import { describe, expect, it } from 'vitest';
import type { LabCaseResult, LabResults } from '../../../../src/application/lab/lab-results.js';
import type { ToolTurn } from '../../../../src/application/lab/lab-turns.js';
import { compareLines, summaryLines } from '../../../../src/presentation/lab/lab-report.js';
import { compareLab } from '../../../../src/application/lab/lab-results.js';

// RF-1410: the report prints the counts per tool turn and the count of each label, in the single
// report and in the comparison.

const turn = (over: Partial<ToolTurn>): ToolTurn => ({
  ...{ calls: 2, areaReads: 1, searches: 1, unlisted: 0, repeats: 0, relists: 0, stale: 0 },
  ...{ newLines: 40, generatedLines: 10, shareBefore: 0.2, shareGain: 0.4, aimed: 1, seen: [] },
  ...over,
});

function caseOf(id: string, detail: string, toolTurn?: ToolTurn): LabCaseResult {
  return {
    ...{ caseId: id, repetition: 1, split: 'tune', expected: null, detail, answer: '' },
    ...{ usable: true, validFirstTry: null, repaired: false, refused: false, rstCode: null },
    ...{ agreed: null, calls: 1, inputTokens: 10, outputTokens: 5, latencyMs: 7, costMicros: 3 },
    ...(toolTurn === undefined ? {} : { turn: toolTurn }),
  };
}

function resultsOf(cases: LabCaseResult[]): LabResults {
  return {
    ...{ schemaVersion: 1, id: 'r1', at: '2026-11-14T00:00:00Z', rosettaVersion: 'test' },
    prompt: {
      id: 'reader/read-more',
      name: 'reader/read-more.v2.md',
      version: 'v2',
      sha256: '0'.repeat(64),
    },
    model: { provider: 'fake', model: 'm', modelVersion: null },
    caseSet: { version: 's', sha256: '1'.repeat(64) },
    ...{ repetitions: 1, planned: cases.length, endState: 'Completed', refusal: null, cases },
  };
}

describe('the report of a run with tool turns', () => {
  it('RF-1410 prints the counts per tool turn and the labels', () => {
    const results = resultsOf([
      caseOf('a', 'ReadsFiles', turn({})),
      caseOf(
        'b',
        'NoAreaRead',
        turn({ areaReads: 0, newLines: 0, generatedLines: 0, shareGain: 0.25 }),
      ),
    ]);

    const lines = summaryLines(results, 'folder');

    expect(lines).toContain('Labels: NoAreaRead 1, ReadsFiles 1');
    expect(lines).toContain(
      'Per tool turn (2 turns): 2.00 calls, 0.50 area reads, 1.00 searches, 0.00 stale, 0.00 unlisted, 0.00 repeats, 0.00 relists; 20.0 new lines, share gain 32.5 points, generated 25% of new lines, aimed 1.00, 1 of 2 reach half',
    );
  });

  it('RF-1410 prints no tool turn line for a run without one, and the labels on both sides of a comparison', () => {
    const plain = resultsOf([caseOf('a', 'Valid')]);
    const other = resultsOf([caseOf('a', 'NoCards')]);
    const compared = compareLab(plain, other);

    expect(summaryLines(plain, 'folder').some((line) => line.startsWith('Per tool turn'))).toBe(
      false,
    );
    expect(compared.ok && compareLines(compared.value)).toEqual(
      expect.arrayContaining(['  Labels: Valid 1', '  Labels: NoCards 1']),
    );
  });
});
