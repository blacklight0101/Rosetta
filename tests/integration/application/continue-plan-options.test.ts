import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../src/application/runs/run-scope.js';
import { ContinueRun } from '../../../src/application/use-cases/continue-run.js';
import { ERROR_CODES } from '../../../src/domain/errors/codes.js';
import { ok } from '../../../src/domain/errors/result.js';
import { MemoryRunManifestStore } from '../../../src/infrastructure/files/memory-run-manifest-store.js';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { FixedClock } from '../../support/fixed-clock.js';
import { sampleManifest, sampleRun } from '../../support/run-fixtures.js';
import {
  createSuggestOptionsHarness,
  type SuggestOptionsHarness,
} from '../../support/suggest-options-harness.js';

// RF-435, RF-432, P9-01, EV-100: after Continue (+N) on a paused step whose journey was used up,
// Plan setup's options call runs under the raised journey: it answers the options; before it, RST-2311 (P9-02).

const recorded = await loadRecording(
  fileURLToPath(new URL('../../recordings/fake/plan-options.json', import.meta.url)),
);

const line = { tokens: 2_000_000, costMicros: 4_000_000 };

function ask(h: SuggestOptionsHarness) {
  return h.suggest.execute({ actor: h.actor, projectId: h.project.id, cloudConsent: false });
}

/** A Deepen of the journey that spent its whole line and waits for its owner's answer. */
async function pausedDeepen(h: SuggestOptionsHarness, manifests: MemoryRunManifestStore) {
  const run = sampleRun({
    ...{ projectId: h.project.id, userId: h.account.id, stage: 'understand' },
    queueState: 'AwaitingApproval',
    totals: {
      costMicros: line.costMicros,
      inputTokens: line.tokens,
      outputTokens: 0,
      cachedInputTokens: 0,
    },
  });
  await h.runs.insert(run);
  const options = { cloudConsent: false, approvedAmount: line };
  await manifests.write(scopeOf(run), sampleManifest({ runId: run.runKey, options }));
  await h.journeys.save({
    ...{ userId: h.account.id, projectId: h.project.id, createdAt: run.queuedAt },
    approved: line,
  });
  return run;
}

describe('RF-435 Plan setup after a Continue on a used-up journey', () => {
  it('RF-435 P9-01 P9-02 the options call is refused with RST-2311, then answers its options', async () => {
    const h = await createSuggestOptionsHarness({ recording: recorded });
    const manifests = new MemoryRunManifestStore();
    const clock = new FixedClock('2026-11-10T10:00:00.000Z');
    const paused = await pausedDeepen(h, manifests);
    const queue = {
      exclusive: async <T>(_runId: string, work: () => Promise<T>) => ok(await work()),
      positionOf: () => Promise.resolve(undefined),
    };
    const continueRun = new ContinueRun({
      runs: h.runs,
      manifests,
      queue,
      clock,
      journeys: h.journeys,
    });
    const refused = await ask(h);

    const continued = await continueRun.execute({ actor: h.actor, runId: paused.id });
    const answered = await ask(h);

    expect(refused).toEqual({ ok: false, error: ERROR_CODES.journeyAmountUsed });
    expect(continued).toMatchObject({ ok: true });
    expect(answered).toMatchObject({ ok: true });
  });
});
