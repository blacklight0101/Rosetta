import { describe, expect, it } from 'vitest';
import type { LlmProvider, LlmRequest } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import {
  contractScenarios,
  type ScenarioOutcome,
} from '../../../contracts/llm-provider.contract.js';
import {
  budgetHarness,
  budgetInstant,
  budgetRequest,
  budgetRun,
  contractPrice,
} from '../../../support/budget-harness.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { settleFails } from '../../../support/ledger-fixtures.js';

// RF-420, RF-421, RF-422, RF-428, RF-1106, ADR-007: the budget guard prices every call, reserves
// its worst case against the caps before it is made, writes one ledger row after it and stops the
// run cleanly when a cap would be passed.

const promptTokens = estimateInputTokens(budgetRequest());
/** Input at 1 micro per token, output at 2 (the harness prices). */
const worstCaseMicros = BigInt(promptTokens) + 512n * 2n;
/** 176 uncached x 1 + 1024 cached x 0.1 + 80 output x 2 = 438.4, rounded up. */
const textCallMicros = 439n;

async function codeOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
    return undefined;
  } catch (error) {
    return error instanceof RosettaError ? error.code : error;
  }
}

describe('BudgetGuard metering', () => {
  it('RF-421 RF-428 writes one ledger row with every column before the answer returns', async () => {
    const h = budgetHarness();

    const response = await h.guard.complete(budgetRequest());

    expect(response.text).toBe(contractScenarios.text.response?.text);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([
      {
        at: new Date(budgetInstant),
        userId: budgetRun.userId,
        projectId: budgetRun.projectId,
        runId: budgetRun.id,
        agentTaskId: 'task-1',
        stage: 'understand',
        role: 'reader',
        provider: 'main',
        model: 'contract-model',
        callId: '20261012-100000-understand#1',
        attempt: 1,
        keySource: 'server',
        inputTokens: 1200,
        outputTokens: 80,
        cachedInputTokens: 1024,
        cacheWriteInputTokens: 0,
        usageSource: 'reported',
        costMicros: textCallMicros,
        cacheWriteCostMicros: 0n,
        costKnown: true,
        currency: 'USD',
        priceTableVersion: '2026-10-11',
      },
    ]);
    expect(h.costs).toEqual([
      { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024, costMicros: textCallMicros },
    ]);
  });
});

describe('BudgetGuard usage', () => {
  it('RF-421 counts a call whose usage is estimated and marks it estimated', async () => {
    const usage = { inputTokens: 10, outputTokens: 5, cachedInputTokens: 0 };
    const estimated: ScenarioOutcome = {
      retried: [],
      response: {
        text: 'x',
        toolCalls: [],
        usage: { ...usage, usageSource: 'estimated' },
        finishReason: 'stop',
      },
    };
    const h = budgetHarness({ recording: recordingOf(estimated) });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry?.usageSource).toBe('estimated');
    expect(entry?.costMicros).toBe(20n);
  });

  it('RF-428 a retried call is one ledger row with the number of its last attempt', async () => {
    const h = budgetHarness({ recording: recordingOf(contractScenarios['retry-then-text']) });

    await h.guard.complete(budgetRequest());

    const entries = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entries.map((entry) => [entry.attempt, entry.costMicros])).toEqual([
      [2, textCallMicros],
    ]);
  });
});

describe('BudgetGuard failed calls', () => {
  it('RF-428 a call that fails at the provider is one ledger row without usage, and the error goes on', async () => {
    const h = budgetHarness({ recording: recordingOf(contractScenarios['permanent-failure']) });

    expect(await codeOf(h.guard.complete(budgetRequest()))).toBe(ERROR_CODES.providerCallFailed);

    const entries = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      attempt: 1,
      inputTokens: 0,
      outputTokens: 0,
      costMicros: 0n,
      usageSource: 'estimated',
    });
    expect(h.costs).toEqual([]);
  });

  it('RF-428 a call blocked before it was sent writes no ledger row and frees its reservation', async () => {
    const blocking: LlmProvider = {
      complete: () => Promise.reject(new RosettaError(ERROR_CODES.cloudConsentMissing)),
    };
    const h = budgetHarness({
      inner: blocking,
      caps: [{ kind: 'run-cost', limit: worstCaseMicros }],
    });

    expect(await codeOf(h.guard.complete(budgetRequest(1)))).toBe(ERROR_CODES.cloudConsentMissing);

    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
    expect(await codeOf(h.guard.complete(budgetRequest(2)))).toBe(ERROR_CODES.cloudConsentMissing);
  });

  it('RF-421 fails closed when the ledger row cannot be written: the answer does not reach the caller', async () => {
    const h = budgetHarness();
    const failing = budgetHarness({ ledger: settleFails(h.ledger) });

    expect(await codeOf(failing.guard.complete(budgetRequest()))).toBe(
      ERROR_CODES.costRecordFailed,
    );
  });
});

describe('BudgetGuard caps', () => {
  it('RF-422 refuses a call whose worst case would pass the run cap: not made, recorded, run stopped', async () => {
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: worstCaseMicros - 1n }] });

    expect(await codeOf(h.guard.complete(budgetRequest()))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.fake.requests).toEqual([]);
    expect(h.stops.map((stop) => stop.code)).toEqual([ERROR_CODES.budgetCapReached]);
    expect(h.calls.records()).toEqual([
      expect.objectContaining({
        status: 'refused-by-cap',
        errorCode: 'RST-1600',
        callId: '20261012-100000-understand#1',
        attempt: 1,
        costMicros: 0,
        finishReason: 'error',
      }),
    ]);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
  });

  it('RF-422 lets the call through when its worst case exactly reaches the cap', async () => {
    const h = budgetHarness({ caps: [{ kind: 'run-cost', limit: worstCaseMicros }] });

    await h.guard.complete(budgetRequest());

    expect(h.stops).toEqual([]);
  });

  it('RF-422 a run cap stops the next call once the spend leaves too little room', async () => {
    const h = budgetHarness({
      caps: [{ kind: 'run-cost', limit: worstCaseMicros + textCallMicros - 1n }],
    });

    await h.guard.complete(budgetRequest(1));
    expect(await codeOf(h.guard.complete(budgetRequest(2)))).toBe(ERROR_CODES.budgetCapReached);

    expect(h.fake.requests).toHaveLength(1);
  });
});

describe('BudgetGuard parallel and unbounded calls', () => {
  it('RF-1106 parallel calls of one run never reserve past the cap', async () => {
    const h = budgetHarness({
      caps: [{ kind: 'run-cost', limit: worstCaseMicros * 3n }],
      recording: recordingOf(...Array.from({ length: 6 }, () => contractScenarios.text)),
    });

    const outcomes = await Promise.allSettled(
      Array.from({ length: 6 }, (_, index) => h.guard.complete(budgetRequest(index + 1))),
    );

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(3);
    expect(h.fake.requests).toHaveLength(3);
  });

  it('RF-422 refuses a call without an output limit, whose worst case is unknown', async () => {
    const h = budgetHarness();
    const { context, model, system, messages, tools, signal } = budgetRequest();
    const unbounded: LlmRequest = { context, model, system, messages, tools, signal };

    expect(await codeOf(h.guard.complete(unbounded))).toBe(ERROR_CODES.outputLimitMissing);
    expect(h.fake.requests).toEqual([]);
  });
});

const cheap = {
  ...contractPrice,
  inputPerMillionMicros: 0n,
  outputPerMillionMicros: 0n,
  cachedInputPerMillionMicros: 0n,
};

describe('BudgetGuard prices (DEC-107)', () => {
  it('RF-1106 a call with a server key is priced from the shipped table, not the overrides', async () => {
    const h = budgetHarness({ keySource: 'server', overrides: [cheap] });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect([entry?.costMicros, entry?.priceTableVersion]).toEqual([textCallMicros, '2026-10-11']);
  });

  it('RF-1106 a call with the user own key takes the project override', async () => {
    const h = budgetHarness({ keySource: 'user', overrides: [cheap] });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect([entry?.costMicros, entry?.priceTableVersion, entry?.keySource]).toEqual([
      0n,
      '2026-10-11+project',
      'user',
    ]);
  });
});

describe('BudgetGuard local and unpriced models', () => {
  it('RF-420 a local model is priced at zero and its tokens still count', async () => {
    const h = budgetHarness({ kind: 'ollama', keySource: 'none' });

    await h.guard.complete(budgetRequest(1, { model: 'gemma4:e4b' }));

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect([entry?.costMicros, entry?.inputTokens, entry?.keySource]).toEqual([0n, 1200, 'none']);
  });

  it('RF-427 a server key never runs a cloud model missing from the price table', async () => {
    const h = budgetHarness({ keySource: 'server', allowUnpriced: true });

    expect(await codeOf(h.guard.complete(budgetRequest(1, { model: 'unlisted' })))).toBe(
      ERROR_CODES.modelUnpriced,
    );
    expect(h.fake.requests).toEqual([]);
  });

  it('RF-427 the user own key runs an unpriced model only with allowUnpriced, cost unknown, token cap in force', async () => {
    const refused = budgetHarness({ keySource: 'user' });
    expect(await codeOf(refused.guard.complete(budgetRequest(1, { model: 'unlisted' })))).toBe(
      ERROR_CODES.modelUnpriced,
    );

    const allowed = budgetHarness({
      keySource: 'user',
      allowUnpriced: true,
      caps: [
        { kind: 'run-cost', limit: 0n },
        { kind: 'run-tokens', limit: BigInt(promptTokens + 512) },
      ],
    });
    await allowed.guard.complete(budgetRequest(1, { model: 'unlisted' }));
    const [entry] = await allowed.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect([entry?.costMicros, entry?.costKnown]).toEqual([0n, false]);
    expect(await codeOf(allowed.guard.complete(budgetRequest(2, { model: 'unlisted' })))).toBe(
      ERROR_CODES.budgetCapReached,
    );
  });
});
