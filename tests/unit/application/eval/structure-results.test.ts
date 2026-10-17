import { describe, expect, it } from 'vitest';
import { parseResults } from '../../../../src/application/eval/evaluation-schema.js';
import {
  RunEvaluation,
  type RunEvaluationRequest,
} from '../../../../src/application/eval/run-evaluation.js';
import type { GoldenSet } from '../../../../src/domain/eval/golden-set.js';
import { claim, finding, goldenCase } from '../../../support/eval-fixtures.js';
import {
  evalGoldenSet,
  evalRun,
  FakeEvaluationTarget,
  MemoryEvaluationOutput,
} from '../../../support/eval-target.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// RF-260, RF-261, RF-262, RNF-006, RNF-015: the step recall, the screen field recall and the
// relation precision are written to `results.json` for every repetition and case, with their
// spread across repetitions, next to the measures of the rules.

const step = (id: string, lines: string, word: string) =>
  finding({
    id,
    kind: 'step',
    of: 'Home',
    cardTypes: ['FLOW'],
    evidence: [lines],
    keywords: [word],
  });

const golden: GoldenSet = {
  ...evalGoldenSet,
  cases: [
    goldenCase({
      id: 'home-page',
      paths: ['Default.aspx.cs'],
      findings: [
        step('step-bind', 'Default.aspx.cs:9-12', 'binds'),
        step('step-search', 'Default.aspx.cs:14-17', 'search'),
        finding({
          id: 'field-grid',
          kind: 'field',
          of: 'Home',
          cardTypes: ['SCRN'],
          evidence: ['Default.aspx.cs:19-22'],
          keywords: ['grid'],
        }),
      ],
      absences: [],
    }),
    goldenCase({
      id: 'catalog-item',
      paths: ['Models/Item.cs'],
      findings: [
        finding({
          id: 'relation-brand',
          kind: 'relation',
          of: 'Item',
          cardTypes: ['ENT'],
          evidence: ['Models/Item.cs:30-32'],
          keywords: ['brand'],
        }),
      ],
    }),
  ],
};

const bound = claim({
  claimId: 'FLOW-001.c1',
  cardType: 'FLOW',
  text: 'The page binds the grid.',
  citations: ['Default.aspx.cs:9-12'],
});
const searched = claim({
  claimId: 'FLOW-001.c2',
  cardType: 'FLOW',
  text: 'Search binds it again.',
  citations: ['Default.aspx.cs:14-17'],
});
const screen = claim({
  claimId: 'SCRN-001.c1',
  cardType: 'SCRN',
  text: 'The page has a grid.',
  citations: ['Default.aspx.cs:19-22'],
});
const brand = claim({
  claimId: 'ENT-001.c1',
  cardType: 'ENT',
  text: 'An item refers to a brand.',
  citations: ['Models/Item.cs:30-32'],
});
const stray = claim({
  claimId: 'ENT-001.c2',
  cardType: 'ENT',
  text: 'An item belongs to a store.',
  citations: ['Models/Item.cs:40-41'],
});

const request: RunEvaluationRequest = {
  goldenSet: golden,
  goldenSetSha256: 'd'.repeat(64),
  repetitions: 3,
  totalCapMicros: 1_000_000,
  settings: { parallelism: 1, runCapMicros: 400_000 },
};

async function evaluate() {
  const runs = [
    evalRun(1, [bound, searched, screen, brand]),
    evalRun(2, [bound, brand, stray]),
    evalRun(3, [bound, searched, screen, brand]),
  ];
  const output = new MemoryEvaluationOutput();
  const use = new RunEvaluation({
    target: new FakeEvaluationTarget({ runs }),
    output,
    clock: new FixedClock('2026-10-17T09:30:00.000Z'),
    ids: new SequenceIdGenerator(),
    rosettaVersion: '1.2.3-test',
    extraPrompts: [],
  });
  const result = await use.execute(request);
  const files = output.written[0];
  if (!result.ok || files === undefined) throw new Error('The evaluation failed');
  return files.results;
}

describe('an evaluation: the measures of flows, screens and the data model', () => {
  it('RF-260 RF-262 scores each repetition, with the measure of each case', async () => {
    const { repetitions } = await evaluate();

    expect(repetitions.map((r) => r.overall.stepRecall)).toEqual([1, 0.5, 1]);
    expect(repetitions.map((r) => r.overall.relationPrecision)).toEqual([1, 0.5, 1]);
    expect(repetitions.map((r) => r.overall.screenFieldRecall)).toEqual([1, 0, 1]);
    const second = repetitions[1]?.cases.map((c) => [
      ...[c.caseId, c.stepRecall, c.screenFieldRecall, c.relationPrecision],
    ]);
    expect(second).toEqual([
      ['home-page', 0.5, 0, null],
      ['catalog-item', null, null, 0.5],
    ]);
  });

  it('RF-260 RF-262 RNF-015 gives the spread of each measure across the repetitions', async () => {
    const results = await evaluate();

    expect(results.summary.stepRecall).toMatchObject({ n: 3, min: 0.5, max: 1, mean: 0.833333 });
    expect(results.summary.relationPrecision).toMatchObject({ n: 3, min: 0.5, max: 1 });
    expect(results.summary.screenFieldRecall).toMatchObject({
      n: 3,
      min: 0,
      max: 1,
      mean: 0.666667,
    });
    const means = results.cases.map((c) => [
      ...[c.caseId, c.stepRecall?.mean ?? null, c.screenFieldRecall?.mean ?? null],
    ]);
    expect(means).toEqual([
      ['home-page', 0.833333, 0.666667],
      ['catalog-item', null, null],
    ]);
  });

  it('RNF-015 writes results the output schema reads back unchanged', async () => {
    const results = await evaluate();
    const parsed = parseResults(JSON.parse(JSON.stringify(results)));

    expect(parsed.ok).toBe(true);
    expect(parsed.ok ? parsed.value : null).toEqual(results);
  });
});
