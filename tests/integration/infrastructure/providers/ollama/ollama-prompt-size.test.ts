import { describe, expect, it } from 'vitest';
import type { AgentRole, LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { ProviderCallError } from '../../../../../src/infrastructure/providers/provider-call-error.js';
import { estimateInputTokens } from '../../../../../src/infrastructure/providers/usage-estimate.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';

// RF-401, RF-421, DEC-114, DEC-155: a prompt larger than the Ollama context fails with a clear
// error before the call, and a prompt Ollama reports it cut fails after it (ADR-008).

const start = useFakeOllama();

/** The contract request with its user message padded so the estimate is exactly `tokens`. */
function requestOf(tokens: number, overrides: Partial<LlmRequest> = {}): LlmRequest {
  const base = { ...contractRequest(), maxOutputTokens: 512, ...overrides };
  const empty = estimateInputTokens({ ...base, messages: [{ role: 'user', content: '' }] });
  const chars = (tokens - empty) * 4;
  const request = { ...base, messages: [{ role: 'user' as const, content: 'x'.repeat(chars) }] };
  expect(estimateInputTokens(request)).toBe(tokens);
  return request;
}

/** A request with 100 tokens of output reserved, as the cut-prompt cases need room below the context. */
function smallOutput(tokens: number, role: AgentRole = 'reader'): LlmRequest {
  const request = requestOf(tokens, { maxOutputTokens: 100 });
  return { ...request, context: { ...request.context, role } };
}

function asRole(request: LlmRequest, role: AgentRole): LlmRequest {
  return { ...request, context: { ...request.context, role } };
}

async function refusal(promise: Promise<unknown>): Promise<ProviderCallError> {
  const error = await failureOf(promise);
  if (!(error instanceof ProviderCallError)) throw new Error('expected a ProviderCallError');
  return error;
}

describe('OllamaProvider with a prompt near the context (fixed contextTokens)', () => {
  it('RF-401 sends a prompt whose estimate plus the output reserve exactly fills the context', async () => {
    const { provider, server } = await start('contract-text', { contextTokens: 2048 });

    const response = await provider.complete(requestOf(1536));

    expect(response.text).not.toBe('');
    expect(server.chatBodies()).toHaveLength(1);
  });

  it('RF-401 refuses a prompt one token over the context, and sends nothing', async () => {
    const { provider, server } = await start('contract-text', { contextTokens: 2048 });

    const error = await refusal(provider.complete(requestOf(1537)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.notSent).toBe(true);
    expect(server.chatBodies()).toEqual([]);
  });
});

describe('OllamaProvider with a prompt near the context (output reserve and roles)', () => {
  it('RF-401 counts a call without an output limit as no output reserve', async () => {
    const { provider } = await start('contract-text', { contextTokens: 2048 });
    const { maxOutputTokens: limit, ...unlimited } = requestOf(2048);

    expect(limit).toBe(512);
    const fits = await provider.complete(unlimited);
    const over = await refusal(
      provider.complete({ ...unlimited, system: `${unlimited.system}xxxx` }),
    );

    expect(fits.text).not.toBe('');
    expect(over.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });

  it('RF-401 the message names the estimate, the output, the context, the role and the remedies', async () => {
    const { provider } = await start('contract-text', { contextTokens: 2048 });

    const error = await refusal(provider.complete(asRole(requestOf(1700), 'planner')));

    expect(error.message).toContain('1700');
    expect(error.message).toContain('512');
    expect(error.message).toContain('2048');
    expect(error.message).toContain('planner');
    expect(error.message).toMatch(/larger context/);
    expect(error.message).toMatch(/cloud model/);
    expect(error.message).toContain('contextTokens');
  });

  it.each(['reader', 'verifier', 'planner'] as const)(
    'RF-401 refuses a too large prompt of the %s role',
    async (role) => {
      const { provider, server } = await start('contract-text', { contextTokens: 2048 });

      const error = await refusal(provider.complete(asRole(requestOf(1800), role)));

      expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
      expect(error.message).toContain(role);
      expect(server.chatBodies()).toEqual([]);
    },
  );
});

describe('OllamaProvider with tool definitions and the text protocol', () => {
  it('RF-401 counts the tool definitions in the estimate', async () => {
    const { provider, server } = await start('contract-text', { contextTokens: 2048 });
    const [tool] = contractRequest().tools;
    if (tool === undefined) throw new Error('the contract request has a tool');
    const heavy = { ...tool, description: 'd'.repeat(6000) };
    const small = { ...contractRequest(), maxOutputTokens: 512, tools: [heavy] };

    const error = await refusal(provider.complete(small));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(server.chatBodies()).toEqual([]);
  });

  it('RF-205 RF-401 counts the text protocol prompt in text tool mode', async () => {
    const native = await start('contract-text', { contextTokens: 2048 });
    const text = await start('contract-text', { contextTokens: 2048, toolMode: 'text' });

    const sent = await native.provider.complete(requestOf(1530));
    const error = await refusal(text.provider.complete(requestOf(1530)));

    expect(sent.text).not.toBe('');
    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });
});

describe('OllamaProvider prompt size message', () => {
  it('RF-401 the message never holds the prompt text or a secret', async () => {
    const { provider } = await start('contract-text', { contextTokens: 2048 });
    const secret = ['sk', 'test', 'A1b2C3d4E5f6G7h8'].join('-');
    const marker = 'CATALOG-PRIVATE-MARKER';
    const leaky: LlmRequest = {
      ...requestOf(1800),
      system: `${marker} ${secret}`,
      messages: [{ role: 'user', content: `${marker} ${secret} ${'x'.repeat(7000)}` }],
    };

    const error = await refusal(provider.complete(leaky));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).not.toContain(marker);
    expect(error.message).not.toContain(secret);
    expect(String(error.cause)).not.toContain(marker);
  });
});

describe('OllamaProvider with a prompt near the context (contextTokens auto)', () => {
  it('RF-401 DEC-114 refuses against the context the resolver chose', async () => {
    const { provider, server } = await start('context-model-limit');

    const fits = await provider.complete(requestOf(7680));
    const error = await refusal(provider.complete(requestOf(7681)));

    expect(fits.text).not.toBe('');
    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).toContain('8192');
    expect(server.chatBodies()).toHaveLength(1);
  });
});

describe('OllamaProvider when Ollama cut the prompt', () => {
  it('RF-401 fails a call whose reported prompt tokens are far below a large estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1900, 'planner')));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.notSent).toBe(false);
    expect(error.message).toContain('900');
    expect(error.message).toContain('1900');
    expect(error.message).toContain('2048');
    expect(error.message).toContain('planner');
    expect(error.message).toMatch(/cloud model/);
  });

  it('RF-401 RF-428 the failure carries the reported tokens, and the answer is dropped', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1900)));

    expect(error.usage).toEqual({
      inputTokens: 900,
      outputTokens: 80,
      cachedInputTokens: 0,
      usageSource: 'reported',
    });
    expect(error.message).not.toContain('Catalog area lists');
  });
});

describe('OllamaProvider when Ollama cut the prompt (auto context and roles)', () => {
  it('RF-401 fails the same way against an auto context', async () => {
    const { provider } = await start('prompt-cut-auto');

    const error = await refusal(provider.complete(smallOutput(7000)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).toContain('8192');
  });

  it.each(['reader', 'verifier', 'planner'] as const)(
    'RF-401 fails a cut prompt of the %s role',
    async (role) => {
      const { provider } = await start('prompt-cut', { contextTokens: 2048 });

      const error = await refusal(provider.complete(smallOutput(1900, role)));

      expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
      expect(error.message).toContain(role);
    },
  );
});

describe('OllamaProvider cut-prompt rule boundaries', () => {
  it('RF-401 does not call a prompt cut when its estimate is below four fifths of the context', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1638));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 calls a prompt cut from four fifths of the context up', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 2048 });

    const error = await refusal(provider.complete(smallOutput(1639)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });

  it('RF-401 does not call a prompt cut when the reported count is 70 percent of the estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 1536 });

    const response = await provider.complete(smallOutput(1285));

    expect(response.usage.inputTokens).toBe(900);
  });

  it('RF-401 calls a prompt cut when the reported count is below 70 percent of the estimate', async () => {
    const { provider } = await start('prompt-cut', { contextTokens: 1536 });

    const error = await refusal(provider.complete(smallOutput(1286)));

    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
  });

  it('RF-401 answers a large prompt whose reported count agrees with the estimate', async () => {
    const { provider } = await start('prompt-counted-full', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.inputTokens).toBe(1900);
  });

  it('RF-401 RF-421 answers a large prompt when Ollama reports no counts', async () => {
    const { provider } = await start('usage-missing', { contextTokens: 2048 });

    const response = await provider.complete(smallOutput(1900));

    expect(response.usage.usageSource).toBe('estimated');
  });
});
