import { describe, expect, it } from 'vitest';
import { buildCostReport } from '../../../../src/application/budget/cost-report.js';
import type {
  CostLedger,
  LedgerEntry,
  Reservation,
  ReservationKey,
  ReservationRequest,
} from '../../../../src/application/ports/cost-ledger.js';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { CapBreach } from '../../../../src/domain/budget/usage-cap.js';
import type { Result } from '../../../../src/domain/errors/result.js';
import { FileCostReportWriter } from '../../../../src/infrastructure/budget/cost-report-files.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { runPath } from '../../../../src/infrastructure/files/workspace-paths.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { useFakeAnthropic } from '../../../support/anthropic-harness.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { MemoryOutputWriter } from '../../../support/memory-output-writer.js';
import { scopeFor } from '../../../support/run-event-fixtures.js';

// RF-404, RF-420, RF-422, RF-426, RF-428, ADR-007, ADR-008, P2-16: a recorded Anthropic call that
// wrote its prompt prefix to the cache (`tests/recordings/anthropic/cache-write.json`: 176 input,
// 1,024 written, 80 output tokens), through the real adapter against the fake Anthropic server and
// the budget guard. It settles at the cache-write price, its reservation covers that price, and the
// run's cost report lists the written tokens and their cost.

const claude: Price = {
  provider: 'anthropic',
  model: 'contract-model',
  inputPerMillionMicros: 3_000_000n,
  cachedInputPerMillionMicros: 300_000n,
  cacheWriteInputPerMillionMicros: 3_750_000n,
  outputPerMillionMicros: 15_000_000n,
  currency: 'USD',
};

/** 176 uncached x 3 + 1,024 written x 3.75 + 80 output x 15 (cache writes as input: 4,800). */
const settledMicros = 528n + 3840n + 1200n;

/** The memory ledger, keeping every reservation the guard made. */
class WatchedLedger implements CostLedger {
  readonly reservations: Reservation[] = [];
  private readonly inner = new MemoryCostLedger();

  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>> {
    this.reservations.push(request.reservation);
    return this.inner.reserve(request);
  }

  settle(entry: LedgerEntry): Promise<void> {
    return this.inner.settle(entry);
  }

  release(key: ReservationKey): Promise<void> {
    return this.inner.release(key);
  }

  renew(key: ReservationKey, expiresAt: Date): Promise<void> {
    return this.inner.renew(key, expiresAt);
  }

  runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]> {
    return this.inner.runEntries(userId, runId);
  }

  purgeExpired(at: Date): Promise<number> {
    return this.inner.purgeExpired(at);
  }
}

const start = useFakeAnthropic();

/** A prompt long enough that its estimate covers the 1,200 input tokens the recording reports. */
const request = budgetRequest(1, {
  system: 'Describe one area of a legacy codebase. '.repeat(120),
});

async function recordedCall(): Promise<{ ledger: WatchedLedger; entries: readonly LedgerEntry[] }> {
  const { provider } = await start('cache-write');
  const ledger = new WatchedLedger();
  const h = budgetHarness({
    inner: provider,
    kind: 'anthropic',
    table: { version: '2026-10-11', currency: 'USD', prices: [claude] },
    ledger,
  });
  await h.guard.complete(request);
  return { ledger, entries: await ledger.runEntries(budgetRun.userId, budgetRun.id) };
}

describe('a recorded Anthropic call that writes to the cache', () => {
  it('RF-420 RF-428 settles at the cache-write price', async () => {
    const { entries } = await recordedCall();

    expect(entries).toEqual([
      expect.objectContaining({
        inputTokens: 1200,
        cachedInputTokens: 0,
        cacheWriteInputTokens: 1024,
        outputTokens: 80,
        costMicros: settledMicros,
        cacheWriteCostMicros: 3840n,
      }),
    ]);
  });

  it('RF-422 reserves a worst case that covers the cache-write price', async () => {
    const { ledger, entries } = await recordedCall();

    const promptTokens = BigInt(estimateInputTokens(request));
    const worst = (promptTokens * 3_750_000n + 512n * 15_000_000n + 999_999n) / 1_000_000n;
    expect(promptTokens).toBeGreaterThanOrEqual(1200n);
    expect(ledger.reservations.map((held) => held.worstCase.micros)).toEqual([worst]);
    expect(worst).toBeGreaterThanOrEqual(entries[0]?.costMicros ?? worst + 1n);
  });

  it('RF-426 the cost report lists the cache-write tokens and their cost', async () => {
    const { entries } = await recordedCall();
    const scope = scopeFor('20261012-100000-understand');
    const writer = new MemoryOutputWriter();

    const report = buildCostReport(scope.runKey, entries);
    await new FileCostReportWriter({ writer, masker: new SecretMasker() }).write(scope, report);

    expect(report.totals).toMatchObject({
      cacheWriteInputTokens: 1024,
      cacheWriteCostMicros: 3840,
      costMicros: 5568,
    });
    const path = `${runPath(scope.projectId, scope.runKey)}/cost.md`;
    const read = await writer.readText({ userId: scope.userId, path });
    expect(read.ok ? read.value : '').toContain(
      '| reader | 1 | 1,200 | 80 | 0 | 1,024 | $0.0038 | $0.0056 |',
    );
  });
});
