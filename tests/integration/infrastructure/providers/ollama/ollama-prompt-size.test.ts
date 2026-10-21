import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { textProtocolSystem } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol.js';
import { loadTextToolProtocol } from '../../../../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import {
  estimateInputTokens,
  estimateTokens,
} from '../../../../../src/infrastructure/providers/usage-estimate.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import { asRole, refusal, requestOf } from '../../../../support/ollama-prompt-size.js';

// RF-401, RF-421, DEC-114, DEC-155: a prompt larger than the Ollama context fails with a clear
// error before the call, and a prompt Ollama reports it cut fails after it (ADR-008).

const start = useFakeOllama();

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
    const { provider } = await start('prompt-counted-full', { contextTokens: 2048 });
    const { maxOutputTokens: limit, ...unlimited } = requestOf(2048);

    expect(limit).toBe(512);
    const fits = await provider.complete(unlimited);
    const over = await refusal(
      provider.complete({ ...unlimited, system: `${unlimited.system}xxxx` }),
    );

    expect(fits.text).not.toBe('');
    expect(over.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(over.message).not.toContain('more');
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
    expect(error.message).toContain('project settings, the model of the role, Context size');
    expect(error.message).not.toContain('contextTokens');
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

  it('RF-205 RF-401 in text tool mode the tools are counted once, inside the protocol prompt', async () => {
    const { provider } = await start('contract-text', { contextTokens: 2048, toolMode: 'text' });
    const { text: protocol } = await loadTextToolProtocol(join(process.cwd(), 'prompts'));
    const request = requestOf(1530);
    const [message] = request.messages;
    const system = textProtocolSystem(request.system, protocol, request.tools);

    const error = await refusal(provider.complete(request));

    const expected = estimateTokens(system + (message?.content ?? ''));
    expect(error.message).toContain(`about ${String(expected)} tokens`);
  });
});

describe('OllamaProvider prompt size message', () => {
  it('RF-401 counts the tool calls of earlier messages in the estimate', async () => {
    const { provider, server } = await start('contract-text', { contextTokens: 2048 });
    const toolCalls = [{ id: 'call-1', name: 'read_file', arguments: { path: 'p'.repeat(7000) } }];
    const request: LlmRequest = {
      ...contractRequest(),
      maxOutputTokens: 512,
      messages: [
        { role: 'user', content: 'Describe the Catalog area.' },
        { role: 'assistant', content: '', toolCalls },
        { role: 'tool', toolCallId: 'call-1', content: 'ok' },
      ],
    };

    const error = await refusal(provider.complete(request));

    expect(estimateInputTokens(request)).toBeLessThan(200);
    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(server.chatBodies()).toEqual([]);
  });

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
    const { provider, server } = await start('prompt-counted-full-auto');

    const fits = await provider.complete(requestOf(7680));
    const error = await refusal(provider.complete(requestOf(7681)));

    expect(fits.text).not.toBe('');
    expect(error.code).toBe(ERROR_CODES.ollamaPromptTooLarge);
    expect(error.message).toContain('8192');
    expect(server.chatBodies()).toHaveLength(1);
  });
});
