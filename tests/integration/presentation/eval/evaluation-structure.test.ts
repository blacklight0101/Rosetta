import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseResults } from '../../../../src/application/eval/evaluation-schema.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { reportLines } from '../../../../src/presentation/eval/eval-report-lines.js';
import { runEvaluation } from '../../../../src/presentation/eval/compose-evaluation.js';
import { evalFixtures, evalParts, shopScenario } from '../../../support/eval-runner-harness.js';

// RF-260, RF-261, RF-262, RNF-006, RNF-015, ADR-008: the evaluation of a recorded run over the
// webforms-shop fixture reports the recall of the steps of its flows, the recall of the fields of
// its screens and the precision of the relations its entity cards state, next to the measures of
// the rules. The fake provider replays the reader's and the verifier's recordings: no network and
// no real model. In the first repetition the verifier rejects one step and one screen claim.

const TIMEOUT = 300_000;
const shared = { folder: '', printed: '' };

beforeAll(async () => {
  shared.folder = await realpath(await mkdtemp(join(tmpdir(), 'rosetta-eval-shop-')));
  const golden = await loadGoldenSet(evalFixtures, 'golden-shop.json');
  if (!golden.ok) throw new Error(golden.error);
  const dataDir = join(shared.folder, 'data');
  const parts = await evalParts({
    dataDir,
    outputDir: join(shared.folder, 'out'),
    scenario: shopScenario,
  });
  const result = await runEvaluation(parts, golden.value, 3);
  if (!result.ok) throw new Error(result.error.message);
  shared.printed = reportLines(result.value).join('\n');
}, TIMEOUT);

afterAll(async () => {
  await rm(shared.folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

async function results() {
  const [id] = await readdir(join(shared.folder, 'out'));
  if (id === undefined) throw new Error('No evaluation folder');
  const text = await readFile(join(shared.folder, 'out', id, 'results.json'), 'utf8');
  const parsed = parseResults(JSON.parse(text));
  if (!parsed.ok) throw new Error('The results do not parse');
  return parsed.value;
}

describe('the report of a recorded run over flows, screens and entities', () => {
  it('RF-260 RF-261 RF-262 prints the three measures beside the existing ones', () => {
    expect(shared.printed).toContain('Recall of golden rules: 1.000 (target 0.7)');
    expect(shared.printed).toContain('Step recall of the golden flows: 0.967');
    expect(shared.printed).toContain('Field recall of the golden screens: 0.917');
    expect(shared.printed).toContain('Precision of the relations of the entity cards: 0.500');
  });
});

describe('the results of a recorded run over flows, screens and entities', () => {
  it(
    'RF-260 RF-261 RF-262 scores the three measures for every repetition',
    async () => {
      const { repetitions } = await results();

      expect(repetitions.map((r) => r.overall.stepRecall)).toEqual([0.9, 1, 1]);
      expect(repetitions.map((r) => r.overall.screenFieldRecall)).toEqual([0.75, 1, 1]);
      expect(repetitions.map((r) => r.overall.relationPrecision)).toEqual([0.5, 0.5, 0.5]);
      expect(repetitions[0]?.overall.missedFindings).toEqual(
        expect.arrayContaining(['step-browse-search', 'field-home-grid', 'field-home-search-box']),
      );
    },
    TIMEOUT,
  );

  it(
    'RF-262 counts a relation the code does not show as stated and wrong',
    async () => {
      const [first] = (await results()).repetitions;

      expect(first?.overall).toMatchObject({ relationsStated: 2, relationsCorrect: 1 });
      expect(first?.overall.relationClaims).toHaveLength(2);
    },
    TIMEOUT,
  );

  it(
    'RNF-006 RNF-015 gives the spread of the measures and of each case',
    async () => {
      const { summary, cases } = await results();

      expect(summary.stepRecall).toMatchObject({ n: 3, min: 0.9, max: 1 });
      expect(summary.screenFieldRecall).toMatchObject({ n: 3, min: 0.75, max: 1 });
      expect(summary.relationPrecision).toMatchObject({ n: 3, mean: 0.5, stdDev: 0 });
      expect(cases.map((c) => [c.caseId, c.stepRecall?.mean ?? null])).toEqual([
        ['home-page', 0.888889],
        ['details-page', 1],
        ['checkout-page', 1],
        ['confirm-page', null],
        ['services', null],
      ]);
    },
    TIMEOUT,
  );
});
