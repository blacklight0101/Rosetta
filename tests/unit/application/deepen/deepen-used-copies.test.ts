import { describe, expect, it } from 'vitest';
import { markUsedCopies } from '../../../../src/application/deepen/deepen-outputs.js';
import type { DeepenParts } from '../../../../src/application/deepen/deepen-parts.js';
import type { DeepenRecord } from '../../../../src/domain/deepen/deepen-record.js';

// RF-646, DEC-179: the Deepen holds copies of the cards of the run it improves; a question whose
// answer a round used is Answered in those copies too, so the Deepen's own cards show it and the
// question is not asked again.

const round = (answersUsed: readonly string[]) => ({
  ...{ round: 1, complete: true, judged: [], reread: [], failedAreas: [], filesRead: [] },
  ...{ newClaims: [], answersUsed, tokens: 0, costMicros: 0 },
});

function partsOf(marked: { runKey: string; ids: readonly string[] }[]): DeepenParts {
  const run = { runKey: '20261013-090000-understand', userId: 'u-1', projectId: 'p-1' };
  const fake = {
    execution: { run },
    deps: {
      priorCards: {
        markAnswered: (_project: unknown, runKey: string, ids: readonly string[]) => {
          marked.push({ runKey, ids });
          return Promise.resolve(ids);
        },
      },
    },
  };
  return fake as unknown as DeepenParts;
}

describe('RF-646 the copies of the answered questions in a Deepen', () => {
  it("RF-646 marks the Deepen's own copy of every question a round used, once", async () => {
    const marked: { runKey: string; ids: readonly string[] }[] = [];
    const record = {
      rounds: [
        round(['20261012-090000-understand/OQ-001']),
        round(['20261012-090000-understand/OQ-001', '20261012-090000-understand/OQ-003']),
      ],
    } as unknown as DeepenRecord;

    await markUsedCopies(partsOf(marked), record);

    expect(marked).toEqual([{ runKey: '20261013-090000-understand', ids: ['OQ-001', 'OQ-003'] }]);
  });

  it('RF-646 marks nothing when no round used an answer', async () => {
    const marked: { runKey: string; ids: readonly string[] }[] = [];

    await markUsedCopies(partsOf(marked), { rounds: [round([])] } as unknown as DeepenRecord);

    expect(marked).toEqual([]);
  });
});
