import { describe, expect, it } from 'vitest';
import { costOf } from '../../../../src/domain/budget/price.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { contractPrice } from '../../../support/budget-harness.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { serverKeyText, userKeyText } from '../../../support/provider-factory-harness.js';
import { providerTestHarness } from '../../../support/provider-test-harness.js';

// RF-407, RF-405, RF-1104, RF-002: the Test button runs one tiny call per role of a new project
// through the same guards as a run, counts it in the user's ledger and shows each role as reachable
// or with the error.

const roles = {
  reader: { provider: 'openai', model: 'contract-model' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  planner: { provider: 'fake', model: 'planner-model' },
  summariser: { provider: 'ollama', model: 'gemma4:e4b' },
} as const;
const ready = {
  ollamaUrl: 'http://host.docker.internal:11434',
  serverKeys: { openai: serverKeyText },
  defaultRoles: roles,
};

const usage = contractScenarios.text.response?.usage;
if (usage === undefined) throw new Error('The text scenario has no usage.');
const readerCost = costOf(contractPrice, usage).micros;

describe('TestProviders', () => {
  it('RF-407 shows every role reachable, with its provider, model and the cost of its call', async () => {
    const harness = await providerTestHarness(ready);

    const result = await harness.testProviders.execute({ actor: harness.actor });

    expect(result).toEqual({
      ok: true,
      value: [
        {
          role: 'reader',
          provider: 'openai',
          model: 'contract-model',
          status: 'reachable',
          costMicros: readerCost,
        },
        {
          role: 'verifier',
          provider: 'ollama',
          model: 'gemma4:e4b',
          status: 'reachable',
          costMicros: 0n,
        },
        {
          role: 'planner',
          provider: 'fake',
          model: 'planner-model',
          status: 'reachable',
          costMicros: 0n,
        },
        {
          role: 'summariser',
          provider: 'ollama',
          model: 'gemma4:e4b',
          status: 'reachable',
          costMicros: 0n,
        },
      ],
    });
  });
});

describe('TestProviders: the ledger', () => {
  it('RF-407 counts the test calls in the ledger of the user, as rows of no run', async () => {
    const harness = await providerTestHarness(ready);

    await harness.testProviders.execute({ actor: harness.actor });

    expect(
      harness.ledger.entries.map((e) => [e.role, e.stage, e.runId, e.projectId, e.agentTaskId]),
    ).toEqual([
      ['reader', 'provider-test', null, null, null],
      ['verifier', 'provider-test', null, null, null],
      ['planner', 'provider-test', null, null, null],
      ['summariser', 'provider-test', null, null, null],
    ]);
    expect(new Set(harness.ledger.entries.map((e) => e.userId))).toEqual(
      new Set([harness.account.id]),
    );
    expect(harness.ledger.entries[0]?.costMicros).toBe(readerCost);
  });
});

describe('TestProviders: the call', () => {
  it('RF-407 sends each role one tiny call to its own model, with a small output limit', async () => {
    const harness = await providerTestHarness(ready);

    await harness.testProviders.execute({ actor: harness.actor });

    const requests = harness.fakeList.map((fake, index) => [
      harness.built[index]?.name,
      fake.requests.map((request) => [
        request.model,
        request.maxOutputTokens,
        request.tools.length,
      ]),
    ]);
    expect(requests).toEqual([
      ['openai', [['contract-model', 64, 0]]],
      ['ollama', [['gemma4:e4b', 64, 0]]],
      ['fake', [['planner-model', 64, 0]]],
      ['ollama', [['gemma4:e4b', 64, 0]]],
    ]);
  });

  it('RF-407 shows the error of a role whose call failed and the others reachable', async () => {
    const failing = recordingOf(contractScenarios['permanent-failure']);
    const harness = await providerTestHarness({ ...ready, recordings: { fake: failing } });

    const result = await harness.testProviders.execute({ actor: harness.actor });

    expect(result.ok && result.value.map((r) => [r.role, r.status, r.code])).toEqual([
      ['reader', 'reachable', undefined],
      ['verifier', 'reachable', undefined],
      ['planner', 'failed', ERROR_CODES.providerCallFailed],
      ['summariser', 'reachable', undefined],
    ]);
  });
});

describe('TestProviders: keys', () => {
  it('RF-002 shows a role without a usable key as failed, names no value and calls nothing for it', async () => {
    const harness = await providerTestHarness({
      ...ready,
      serverKeys: {},
      user: { serverKeysAllowed: false },
    });

    const result = await harness.testProviders.execute({ actor: harness.actor });

    expect(result.ok && result.value[0]).toEqual({
      role: 'reader',
      provider: 'openai',
      model: 'contract-model',
      status: 'failed',
      code: ERROR_CODES.providerKeyMissing,
      costMicros: 0n,
    });
    expect(harness.fakes.has('openai')).toBe(false);
  });

  it('RF-1104 uses the key of the user, and a user key never reaches the result', async () => {
    const harness = await providerTestHarness({ ...ready, serverKeys: {} });
    await harness.storeKey(harness.account.id, 'openai', userKeyText);

    const result = await harness.testProviders.execute({ actor: harness.actor });

    expect(harness.ledger.entries[0]?.keySource).toBe('user');
    expect(
      JSON.stringify(result, (_key, value: unknown) => (typeof value === 'bigint' ? '0' : value)),
    ).not.toContain(userKeyText);
  });
});

describe('TestProviders: caps and consent', () => {
  it('RF-1106 a test call is held to the same caps: the server month stops it with RST-1600', async () => {
    const caps = { runMicros: 500_000n, userDayMicros: 1_000_000n, serverMonthMicros: 1n };
    const harness = await providerTestHarness({ ...ready, caps });

    const result = await harness.testProviders.execute({ actor: harness.actor });

    expect(result.ok && result.value[0]).toMatchObject({
      role: 'reader',
      status: 'failed',
      code: ERROR_CODES.budgetCapReached,
    });
    expect(harness.fakes.get('openai')?.requests ?? []).toEqual([]);
  });

  it('RF-407 a test call sends no repository content, so it needs no run consent', async () => {
    const harness = await providerTestHarness(ready);

    await harness.testProviders.execute({ actor: harness.actor });

    expect(harness.fakes.get('openai')?.requests).toHaveLength(1);
    expect(harness.ledger.entries).toHaveLength(4);
  });

  it('RF-407 answers not found for an account that no longer exists', async () => {
    const harness = await providerTestHarness(ready);

    const result = await harness.testProviders.execute({
      actor: { userId: '00000000-0000-4000-9000-0000000000ee', role: 'user' },
    });

    expect(result).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});
