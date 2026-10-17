import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { EvaluationTarget } from '../../../../src/application/eval/evaluation-ports.js';
import { RunEvaluation } from '../../../../src/application/eval/run-evaluation.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { Price } from '../../../../src/domain/budget/price.js';
import { loadGoldenSet } from '../../../../src/infrastructure/eval/golden-set-file.js';
import { composeEvaluation } from '../../../../src/presentation/eval/compose-evaluation.js';
import { budgetTable } from '../../../support/budget-harness.js';
import { evalFixtures, evalParts } from '../../../support/eval-runner-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { serverKeyText, settingsFor } from '../../../support/provider-factory-harness.js';

// ADR-007, RNF-006: the caps that hold while the evaluation runs. The pre-check before any model
// call uses the estimate; when the estimate is too low, the budget guard must still stop the runs
// at the total cap, through the evaluation account's daily cap and the server caps. Here the
// estimate is made to pass the pre-check, every recorded call costs its whole reservation, and the
// roles use a cloud provider on the server key (the caps of a local model are the run caps only),
// with the fake in place of its adapter.

const temp = useTempRoot('rosetta-eval-caps-');
const TIMEOUT = 300_000;
const TOTAL_CAP = 250_000;

/** The models at a price on the cloud provider, so their calls cost money. */
function priced(model: string): Price {
  return {
    ...{ provider: 'openai', model, currency: 'USD' },
    ...{ inputPerMillionMicros: 1_000_000n, cachedInputPerMillionMicros: 100_000n },
    outputPerMillionMicros: 2_000_000n,
  };
}

/** The pipeline's target with an estimate far too low, so the pre-check lets every run start. */
function lowEstimate(target: EvaluationTarget): EvaluationTarget {
  return {
    scan: () => target.scan(),
    understand: (areas) => target.understand(areas),
    estimate: async (areas) => ({
      ...(await target.estimate(areas)),
      likelyMicros: 1,
      highMicros: 1,
    }),
  };
}

describe('the evaluation runner: the caps during the runs', () => {
  it(
    'ADR-007 stops the runs at the total cap when the estimate was too low',
    async () => {
      const golden = await loadGoldenSet(evalFixtures, 'golden-csharp.json');
      if (!golden.ok) throw new Error(golden.error);
      const cloud = settingsFor({
        reader: { provider: 'openai', model: 'fake-model' },
        summariser: { provider: 'openai', model: 'fake-model' },
        verifier: { provider: 'openai', model: 'judge-model' },
      });
      const settings: ProjectSettings = {
        ...cloud,
        agents: { parallelism: 1 },
        budget: { ...cloud.budget, run: { ...cloud.budget.run, maxCostMicros: 10_000_000 } },
      };
      const parts = await evalParts({
        ...{ dataDir: join(temp.path, 'data'), outputDir: join(temp.path, 'out') },
        ...{ settings, totalCapMicros: TOTAL_CAP, worstCase: true },
        serverKeys: { openai: serverKeyText },
        priceTable: { ...budgetTable, prices: [priced('fake-model'), priced('judge-model')] },
      });
      const composed = await composeEvaluation(parts, golden.value.set);
      const evaluation = new RunEvaluation({
        ...composed.dependencies,
        target: lowEstimate(composed.target),
      });
      const result = await evaluation
        .execute({
          ...{ goldenSet: golden.value.set, goldenSetSha256: golden.value.sha256, repetitions: 3 },
          ...{ totalCapMicros: TOTAL_CAP, settings: { runCapMicros: 10_000_000 } },
        })
        .finally(() => composed.shutDown());

      if (!result.ok) throw new Error(result.error.message);
      const runs = result.value.files.results.repetitions;
      expect(runs[0]?.endState).toBe('Completed');
      expect(runs.slice(1).map((r) => [r.endState, r.errorCode])).toEqual([
        ['CapReached', 'RST-1600'],
        ['CapReached', 'RST-1600'],
      ]);
      const spent = runs.reduce((sum, r) => sum + (r.costMicros ?? 0), 0);
      expect(spent).toBeGreaterThan(0);
      expect(spent).toBeLessThanOrEqual(TOTAL_CAP);
    },
    TIMEOUT,
  );
});
