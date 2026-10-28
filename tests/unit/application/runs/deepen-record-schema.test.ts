import { describe, expect, it } from 'vitest';
import { deepenRecordSchema } from '../../../../src/application/runs/deepen-record-schema.js';

// RF-209, DEC-179, data-model.md section 3.6: a Deepen record written before a round kept the
// answers it used is still read, as a round that used none.

const olderRound = {
  round: 1,
  complete: true,
  judged: ['BR-001.c2'],
  reread: [],
  failedAreas: [],
  filesRead: ['Catalog/Details.aspx.cs'],
  newClaims: [{ claimId: 'BR-001.c2', status: 'Supported', replaces: 'BR-001.c1' }],
  tokens: 120,
  costMicros: 30,
};

const olderRecord = {
  parentRunId: 'run-1',
  parentRunKey: '20261012-100000-understand',
  maxRounds: 1,
  coveragePass: false,
  roundsDone: 1,
  stopReason: 'roundLimit',
  outOfScope: [],
  rounds: [olderRound],
  before: null,
  after: null,
};

describe('RF-209 DEC-179 a Deepen record from before the answers of a round', () => {
  it('RF-209 reads a round stored without answersUsed as a round that used no answer', () => {
    const parsed = deepenRecordSchema.safeParse(olderRecord);

    expect(parsed.success).toBe(true);
    expect(parsed.data?.rounds[0]?.answersUsed).toEqual([]);
  });

  it('RF-209 keeps the answers a newer round used', () => {
    const used = ['20261012-100000-understand/OQ-001'];
    const parsed = deepenRecordSchema.parse({
      ...olderRecord,
      rounds: [{ ...olderRound, answersUsed: used }],
    });

    expect(parsed.rounds[0]?.answersUsed).toEqual(used);
  });
});
