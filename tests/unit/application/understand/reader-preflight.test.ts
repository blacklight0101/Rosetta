import { describe, expect, it } from 'vitest';
import type {
  AgentRole,
  LlmProvider,
  LlmResponse,
} from '../../../../src/application/ports/llm-provider.js';
import type {
  ProviderSet,
  RoleProvider,
} from '../../../../src/application/providers/provider-set.js';
import { preflightOllama } from '../../../../src/application/understand/reader-preflight.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';

// RF-401 (scenario 1), RF-205: the start check calls each Ollama provider and model of the run once,
// stops at the first failure with its code and fix, and makes no call for a provider that is not Ollama.

const answer: LlmResponse = {
  text: 'OK',
  toolCalls: [],
  usage: { inputTokens: 1, outputTokens: 1, cachedInputTokens: 0, usageSource: 'reported' },
  finishReason: 'stop',
  modelVersion: 'digest',
};

/** A provider that counts its calls and fails with the error it is given, if any. */
class CountingProvider implements LlmProvider {
  calls = 0;
  private readonly failure: Error | undefined;

  constructor(failure?: Error) {
    this.failure = failure;
  }

  complete(): Promise<LlmResponse> {
    this.calls += 1;
    return this.failure === undefined ? Promise.resolve(answer) : Promise.reject(this.failure);
  }
}

function roleOf(
  provider: LlmProvider,
  model: string,
  kind: RoleProvider['kind'] = 'ollama',
): RoleProvider {
  return { provider, name: 'local', kind, model, maxOutputTokens: 512, keySource: 'user' };
}

function setOf(entries: readonly (readonly [AgentRole, RoleProvider])[]): ProviderSet {
  return new Map(entries);
}

let count = 0;
const call = {
  runId: 'run-key',
  traceId: 'a'.repeat(32),
  nextCallId: () => {
    count += 1;
    return `run-key#${String(count)}`;
  },
  signal: new AbortController().signal,
};

describe('the Ollama start check: which calls it makes', () => {
  it('RF-401 two roles on one Ollama model make one check call', async () => {
    const shared = new CountingProvider();
    const set = setOf([
      ['reader', roleOf(shared, 'gemma')],
      ['verifier', roleOf(shared, 'gemma')],
    ]);

    const result = await preflightOllama(set, call);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(shared.calls).toBe(1);
  });

  it('RF-401 two models of one Ollama make a check call each', async () => {
    const shared = new CountingProvider();
    const set = setOf([
      ['reader', roleOf(shared, 'gemma')],
      ['verifier', roleOf(shared, 'qwen')],
    ]);

    await preflightOllama(set, call);

    expect(shared.calls).toBe(2);
  });

  it('RF-401 a provider that is not Ollama is not called by the check', async () => {
    const cloud = new CountingProvider();

    const result = await preflightOllama(setOf([['reader', roleOf(cloud, 'm', 'fake')]]), call);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(cloud.calls).toBe(0);
  });
});

describe('the Ollama start check: what a failing check reports', () => {
  it('RF-401 a failing check gives the code of its error and the fix it names', async () => {
    const down = new CountingProvider(new RosettaError(ERROR_CODES.ollamaUnreachable));

    const result = await preflightOllama(setOf([['reader', roleOf(down, 'gemma')]]), call);

    expect(result).toEqual({
      ok: false,
      error: {
        role: 'reader',
        provider: 'local',
        model: 'gemma',
        code: ERROR_CODES.ollamaUnreachable,
        nextStep: describeError(ERROR_CODES.ollamaUnreachable).nextStep,
      },
    });
  });

  it('RF-401 a check that fails with an error that is not a Rosetta one gives the provider call code', async () => {
    const broken = new CountingProvider(new Error('socket reset'));

    const result = await preflightOllama(setOf([['reader', roleOf(broken, 'gemma')]]), call);

    expect(result).toEqual({
      ok: false,
      error: {
        role: 'reader',
        provider: 'local',
        model: 'gemma',
        code: ERROR_CODES.providerCallFailed,
        nextStep: describeError(ERROR_CODES.providerCallFailed).nextStep,
      },
    });
  });
});
