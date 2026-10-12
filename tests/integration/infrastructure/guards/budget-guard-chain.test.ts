import { describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import { ManifestSecurityRecorder } from '../../../../src/application/runs/run-security-record.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { pricerFor } from '../../../../src/infrastructure/guards/budget-pricing.js';
import { EgressGuard } from '../../../../src/infrastructure/guards/egress-guard.js';
import { JsonlEgressLog } from '../../../../src/infrastructure/guards/jsonl-egress-log.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { FakeProvider } from '../../../../src/infrastructure/providers/fake/fake-provider.js';
import { MemoryProviderCallLog } from '../../../../src/infrastructure/providers/memory-provider-call-log.js';
import { ObservedProvider } from '../../../../src/infrastructure/providers/observed-provider.js';
import { contractScenarios } from '../../../contracts/llm-provider.contract.js';
import {
  budgetHarness,
  budgetRequest,
  budgetRun,
  budgetTable,
} from '../../../support/budget-harness.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';
import { sampleManifest } from '../../../support/run-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';

// ADR-006, ADR-007, architecture section 7: the decorator order of every provider is
// BudgetGuard(EgressGuard(ObservedProvider(adapter))). The budget guard is outermost, so a call is
// priced and capped before anything else runs and no inner refusal can skip its accounting; the call
// log prices each attempt with the same table as the ledger.

const target = { provider: 'main', kind: 'openai', endpointHost: 'api.openai.com' } as const;
const scope = scopeFor('20261011-090503-understand');

async function chain(cloudConsent: boolean): Promise<{
  readonly inner: LlmProvider;
  readonly fake: FakeProvider;
  readonly calls: MemoryProviderCallLog;
}> {
  const clock = new FixedClock('2026-10-12T10:00:00.000Z');
  const masker = new SecretMasker();
  const fake = new FakeProvider({ testMode: true, recording: recordingOf(contractScenarios.text) });
  const calls = new MemoryProviderCallLog(masker);
  const manifests = new MemoryRunManifestStore();
  await manifests.write(scope, sampleManifest({ runId: scope.runKey }));
  const observed = new ObservedProvider({
    inner: fake,
    recorder: calls,
    clock,
    ids: new SequenceIdGenerator(),
    target,
    priceCall: pricerFor(
      { table: budgetTable, overrides: [], allowUnpriced: false },
      { kind: 'openai', keySource: 'server' },
    ),
    transcripts: false,
  });
  const egress = new EgressGuard({
    inner: observed,
    target,
    cloudConsent,
    masker,
    egressLog: new JsonlEgressLog({ writer: new MemoryOutputWriter(), masker, scope }),
    security: new ManifestSecurityRecorder({ manifests, scope }),
    logger: new MemoryLogger(clock, masker),
    clock,
  });
  return { inner: egress, fake, calls };
}

describe('BudgetGuard(EgressGuard(ObservedProvider(adapter)))', () => {
  it('RF-421 the call log and the ledger give a call the same cost', async () => {
    const parts = await chain(true);
    const h = budgetHarness({ inner: parts.inner });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(parts.calls.records()).toEqual([
      expect.objectContaining({ status: 'ok', costMicros: Number(entry?.costMicros) }),
    ]);
    expect(entry?.costMicros).toBeGreaterThan(0n);
  });

  it('RF-143 RF-428 a call the egress guard blocks is never sent and leaves no ledger row', async () => {
    const parts = await chain(false);
    const h = budgetHarness({ inner: parts.inner });

    await expect(h.guard.complete(budgetRequest())).rejects.toMatchObject({
      code: ERROR_CODES.cloudConsentMissing,
    });

    expect(parts.fake.requests).toEqual([]);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
  });

  it('RF-422 a call refused for a cap never reaches the egress guard or the provider', async () => {
    const parts = await chain(true);
    const h = budgetHarness({ inner: parts.inner, caps: [{ kind: 'run-cost', limit: 1n }] });

    const refusal = await h.guard.complete(budgetRequest()).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(RosettaError);
    expect(parts.fake.requests).toEqual([]);
    expect(parts.calls.records()).toEqual([]);
    expect(h.calls.records()).toEqual([expect.objectContaining({ status: 'refused-by-cap' })]);
  });
});
