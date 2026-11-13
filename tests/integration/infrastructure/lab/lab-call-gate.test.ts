import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SpendLedger } from '../../../../src/application/lab/spend-ledger.js';
import type { LlmProvider, LlmResponse } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { FileSpendLedger } from '../../../../src/infrastructure/lab/file-spend-ledger.js';
import { LabCallGate, type CostTap } from '../../../../src/infrastructure/lab/lab-call-gate.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { fakeResponse } from '../../../support/fake-recordings.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { labLimits } from '../../../support/lab-harness.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-1402, DEC-231, ADR-007: what the gate books for a call that fails, and what it does when the
// ledger cannot be written. Real money follows from this: a call that was sent may be billed.

const temp = useTempRoot('rosetta-lab-gate-');
const WORST = 5_000;

const answer: LlmResponse = fakeResponse({
  text: 'ok',
  toolCalls: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
});

function setup(
  inner: (tap: CostTap) => Promise<LlmResponse>,
  wrap?: (l: SpendLedger) => SpendLedger,
) {
  const clock = new FixedClock('2026-11-13T09:00:00Z');
  const real = new FileSpendLedger({
    file: join(temp.path, 'ledger.jsonl'),
    ...{ limits: labLimits, invocation: 'inv', clock, ids: new SequenceIdGenerator() },
  });
  const tap: CostTap = { lastCostMicros: 0 };
  const provider: LlmProvider = { complete: () => inner(tap) };
  const gate = new LabCallGate({
    ...{ inner: provider, ledger: wrap?.(real) ?? real, tap, clock },
    worstCaseMicros: () => WORST,
  });
  return { gate, ledger: real };
}

describe('a call that failed after it was sent', () => {
  it('RF-1402 settles at the held worst case when the guard knows no cost', async () => {
    const { gate, ledger } = setup(() =>
      Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed)),
    );

    await expect(gate.complete(contractRequest())).rejects.toThrow();

    expect(await ledger.totals()).toEqual({ spentMicros: WORST, heldMicros: 0 });
    expect(gate.end().failures).toEqual([ERROR_CODES.providerCallFailed]);
  });

  it('RF-1402 settles at the cost the budget guard priced when it knows one', async () => {
    const { gate, ledger } = setup((tap) => {
      tap.lastCostMicros = 123;
      return Promise.reject(new RosettaError(ERROR_CODES.providerCallFailed));
    });

    await expect(gate.complete(contractRequest())).rejects.toThrow();

    expect(await ledger.totals()).toEqual({ spentMicros: 123, heldMicros: 0 });
  });

  it('RF-1402 releases the hold of a call a guard refused before it was sent', async () => {
    const { gate, ledger } = setup(() =>
      Promise.reject(new RosettaError(ERROR_CODES.budgetCapReached)),
    );

    await expect(gate.complete(contractRequest())).rejects.toThrow();

    expect(await ledger.totals()).toEqual({ spentMicros: 0, heldMicros: 0 });
  });
});

describe('a ledger that cannot be written after a paid call', () => {
  it('RF-1402 stops the invocation with a plain message and sends no more calls', async () => {
    let sent = 0;
    const { gate } = setup(
      () => {
        sent += 1;
        return Promise.resolve(answer);
      },
      (ledger) => ({
        hold: (micros) => ledger.hold(micros),
        release: (ticket) => ledger.release(ticket),
        totals: () => ledger.totals(),
        settle: () => Promise.reject(new Error('disk full')),
      }),
    );

    const first = await gate.complete(contractRequest());
    await expect(gate.complete(contractRequest())).rejects.toThrow();

    expect(first.text).toBe('ok');
    expect(sent).toBe(1);
    expect(gate.stopped()).toContain('ledger');
  });
});
