import { describe, expect, it } from 'vitest';
import type { AgentRole, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { MemoryCostLedger } from '../../../../src/infrastructure/db/memory-cost-ledger.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest } from '../../../support/budget-harness.js';

// RF-423, RF-422, RF-427, ADR-007: a role's cap stops that role's calls only. The refusal is the
// same RST-1600 the run cap gives, but the run's other roles go on and the run is not stopped.

const promptTokens = estimateInputTokens(budgetRequest());
/** Input at 1 micro per token, output at 2 (the harness prices). */
const worstCaseMicros = BigInt(promptTokens) + 512n * 2n;
/** 176 uncached x 1 + 1024 cached x 0.1 + 80 output x 2 = 438.4, rounded up. */
const textCallMicros = 439n;

function requestOf(role: AgentRole, number: number): LlmRequest {
  const base = budgetRequest(number);
  return { ...base, context: { ...base.context, role, callId: `${role}#${String(number)}` } };
}

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('BudgetGuard role caps', () => {
  it('RF-423 refuses a call of the role whose worst case passes its cost cap, without stopping the run', async () => {
    const h = budgetHarness({ caps: [{ kind: 'role-cost', limit: worstCaseMicros - 1n }] });

    expect(await codeOf(h.guard.complete(requestOf('reader', 1)))).toBe(
      ERROR_CODES.budgetCapReached,
    );

    expect(h.fake.requests).toEqual([]);
    expect(h.stops).toEqual([]);
    expect(h.calls.records()).toEqual([expect.objectContaining({ status: 'refused-by-cap' })]);
    expect(h.reported.caps).toEqual([
      expect.objectContaining({ kind: 'role-cost', role: 'reader', limit: worstCaseMicros - 1n }),
    ]);
  });

  it('RF-423 lets a call through whose worst case exactly reaches the role cap', async () => {
    const h = budgetHarness({ caps: [{ kind: 'role-cost', limit: worstCaseMicros }] });

    await h.guard.complete(requestOf('reader', 1));

    expect(h.fake.requests).toHaveLength(1);
    expect(h.reported.caps).toEqual([]);
  });

  it('RF-423 a role cap of zero refuses the first call of that role', async () => {
    const h = budgetHarness({ caps: [{ kind: 'role-tokens', limit: 0n }] });

    expect(await codeOf(h.guard.complete(requestOf('reader', 1)))).toBe(
      ERROR_CODES.budgetCapReached,
    );
    expect(h.fake.requests).toEqual([]);
  });
});

describe('BudgetGuard role caps across roles', () => {
  it('RF-423 a role reaching its cap in the middle of the run stops that role and not the others', async () => {
    const ledger = new MemoryCostLedger();
    const reader = budgetHarness({
      ledger,
      caps: [{ kind: 'role-cost', limit: worstCaseMicros + textCallMicros - 1n }],
    });
    const verifier = budgetHarness({ ledger, caps: [{ kind: 'role-cost', limit: 1_000_000n }] });

    await reader.guard.complete(requestOf('reader', 1));
    const refused = await codeOf(reader.guard.complete(requestOf('reader', 2)));
    await verifier.guard.complete(requestOf('verifier', 3));
    await verifier.guard.complete(requestOf('verifier', 4));

    expect(refused).toBe(ERROR_CODES.budgetCapReached);
    expect(reader.fake.requests).toHaveLength(1);
    expect(verifier.fake.requests).toHaveLength(2);
    expect([reader.stops, verifier.stops]).toEqual([[], []]);
  });

  it('RF-423 the spend of another role does not count against the cap of this one', async () => {
    const ledger = new MemoryCostLedger();
    const verifier = budgetHarness({ ledger });
    const reader = budgetHarness({ ledger, caps: [{ kind: 'role-cost', limit: worstCaseMicros }] });
    await verifier.guard.complete(requestOf('verifier', 1));

    await reader.guard.complete(requestOf('reader', 2));

    expect(reader.fake.requests).toHaveLength(1);
  });
});

describe('BudgetGuard claim-check reserve of the run cap', () => {
  it('RF-429 DEC-193 the reserve line of the run token cap refuses the verifier only and does not stop the run', async () => {
    const reserve = { kind: 'run-tokens', limit: BigInt(promptTokens), source: 'reserve' } as const;
    const h = budgetHarness({ caps: [{ kind: 'run-tokens', limit: 1_000_000n }, reserve] });

    const refused = await codeOf(h.guard.complete(requestOf('verifier', 1)));

    expect(refused).toBe(ERROR_CODES.budgetCapReached);
    expect(h.fake.requests).toEqual([]);
    expect(h.stops).toEqual([]);
    expect(h.reported.caps).toEqual([
      expect.objectContaining({ kind: 'run-tokens', role: 'verifier', source: 'reserve' }),
    ]);
  });

  it('RF-429 DEC-193 the whole run token cap still stops the run', async () => {
    const reserve = { kind: 'run-tokens', limit: 1_000_000n, source: 'reserve' } as const;
    const h = budgetHarness({
      caps: [{ kind: 'run-tokens', limit: BigInt(promptTokens) }, reserve],
    });

    expect(await codeOf(h.guard.complete(requestOf('verifier', 1)))).toBe(
      ERROR_CODES.budgetCapReached,
    );
    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
  });
});

describe('BudgetGuard role caps with other caps', () => {
  it('RF-423 role caps that together exceed the run cap still leave the run cap in force and stop the run', async () => {
    const ledger = new MemoryCostLedger();
    const caps = [
      { kind: 'run-cost', limit: worstCaseMicros + textCallMicros - 1n },
      { kind: 'role-cost', limit: worstCaseMicros * 10n },
    ] as const;
    const reader = budgetHarness({ ledger, caps });
    const verifier = budgetHarness({ ledger, caps });

    await reader.guard.complete(requestOf('reader', 1));
    const refused = await codeOf(verifier.guard.complete(requestOf('verifier', 2)));

    expect(refused).toBe(ERROR_CODES.budgetCapReached);
    expect(verifier.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
    expect(verifier.reported.caps).toEqual([expect.objectContaining({ kind: 'run-cost' })]);
  });

  it('RF-423 RF-427 an unpriced model on one role has an unknown cost: only the role token cap applies', async () => {
    const h = budgetHarness({
      keySource: 'user',
      allowUnpriced: true,
      caps: [
        { kind: 'role-cost', limit: 0n },
        { kind: 'role-tokens', limit: BigInt(promptTokens + 512) },
      ],
    });

    await h.guard.complete(budgetRequest(1, { model: 'unlisted' }));
    const refused = await codeOf(h.guard.complete(budgetRequest(2, { model: 'unlisted' })));

    expect(refused).toBe(ERROR_CODES.budgetCapReached);
    expect(h.reported.caps).toEqual([expect.objectContaining({ kind: 'role-tokens' })]);
  });
});
