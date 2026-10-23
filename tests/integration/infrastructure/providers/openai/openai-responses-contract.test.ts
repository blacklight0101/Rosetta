import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import {
  contractRequest,
  llmProviderContract,
} from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { useFakeOpenAi } from '../../../../support/openai-harness.js';

// P3-131, RF-400, RF-402, ADR-008: the OpenAI adapter on the Responses route passes the same
// LlmProvider contract against a fake server replaying tests/recordings/openai/
// responses-<scenario>.json. The fake answers HTTP 400 to a body that is not a Responses body (no
// `input`, or `messages`), so sending the Chat Completions body there fails these tests.

const start = useFakeOpenAi();
const viaResponses = { usesResponses: () => true };

llmProviderContract(
  'OpenAiProvider on the Responses API against a fake OpenAI server',
  async (scenario) => (await start(`responses-contract-${scenario}`, viaResponses)).provider,
);

describe('OpenAiProvider on the Responses API', () => {
  it('P3-131 posts to /v1/responses with the Responses body, never to Chat Completions', async () => {
    const { provider, server } = await start('responses-contract-text', viaResponses);

    await provider.complete({ ...contractRequest(), reasoningEffort: 'low' });

    expect(server.received.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'POST', path: '/v1/responses' },
    ]);
    expect(server.responseBodies()[0]).toMatchObject({
      model: 'contract-model',
      store: false,
      stream: false,
      reasoning: { effort: 'low' },
      max_output_tokens: 512,
    });
  });

  it('P3-131 usage and cost inputs match the recorded counts, cached input tokens included', async () => {
    const { provider } = await start('responses-contract-text', viaResponses);

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 1024,
      usageSource: 'reported',
    });
    expect(response).toMatchObject({
      requestId: 'req_FAKE0000000000000000000001',
      modelVersion: 'contract-model-2026-08-07',
      metrics: { httpStatus: 200 },
    });
  });
});

describe('OpenAiProvider on the Responses API: a tool round trip', () => {
  it('P3-131 a tool call and its output round-trip: the second request answers the call by call_id', async () => {
    const { provider, server } = await start('responses-round-trip', viaResponses);
    const request = contractRequest();

    const first = await provider.complete(request);
    const second = await provider.complete({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', content: first.text, toolCalls: first.toolCalls },
        { role: 'tool', toolCallId: 'call_FAKE01', content: 'line 1' },
      ],
    });

    expect(first).toMatchObject({ finishReason: 'tool_use', usage: { reasoningTokens: 20 } });
    expect(second).toMatchObject({
      finishReason: 'stop',
      usage: { inputTokens: 1100, cachedInputTokens: 1024 },
    });
    const sent = server.responseBodies()[1] as { input: unknown[] };
    expect(sent.input.slice(-2)).toEqual([
      {
        type: 'function_call',
        call_id: 'call_FAKE01',
        name: 'read_file',
        arguments: '{"path":"src/Catalog.cs","startLine":1,"endLine":40}',
      },
      { type: 'function_call_output', call_id: 'call_FAKE01', output: 'line 1' },
    ]);
  });
});

describe('OpenAiProvider on the Responses API: limits and routing', () => {
  it('P5-03 an answer cut by the output limit is reported as length, like Chat Completions', async () => {
    const { provider } = await start('responses-length', viaResponses);

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({ text: 'The Catalog area lists', finishReason: 'length' });
    expect(response.usage).toMatchObject({ outputTokens: 80, reasoningTokens: 60 });
  });

  it('P3-131 returns a refusal as text and fails a 200 body that is no response without a retry', async () => {
    const refusal = await start('responses-refusal', viaResponses);
    expect(await refusal.provider.complete(contractRequest())).toMatchObject({
      text: 'I cannot help with that.',
    });

    const bad = await start('responses-invalid-answer', viaResponses);
    const error = await failureOf(bad.provider.complete(contractRequest()));
    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(bad.server.received).toHaveLength(1);
  });

  it('P3-131 a model the route does not name keeps Chat Completions', async () => {
    const { provider, server } = await start('contract-text', { usesResponses: () => false });

    await provider.complete(contractRequest());

    expect(server.received.map(({ path }) => path)).toEqual(['/v1/chat/completions']);
  });

  it('P3-131 a call without tools stays on Chat Completions even for a Responses model', async () => {
    const { provider, server } = await start('contract-text', viaResponses);

    await provider.complete({ ...contractRequest(), tools: [] });

    expect(server.received.map(({ path }) => path)).toEqual(['/v1/chat/completions']);
  });
});
