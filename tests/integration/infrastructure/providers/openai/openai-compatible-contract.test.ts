import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  contractRequest,
  llmProviderContract,
} from '../../../../contracts/llm-provider.contract.js';
import {
  fakeCompatibleKey,
  useFakeCompatible,
} from '../../../../support/openai-compatible-harness.js';

// RF-403, RF-400, ADR-003, ADR-008: the OpenAI-compatible adapter passes the LlmProvider contract
// against a fake compatible service replaying tests/recordings/openai-compatible/contract-<scenario>.json,
// and calls the base URL stored with the user's key with that key only.

const { replay } = useFakeCompatible();

afterEach(() => {
  vi.unstubAllEnvs();
});

llmProviderContract(
  'OpenAiCompatibleProvider against a fake OpenAI-compatible service',
  async (scenario) => (await replay(`contract-${scenario}`)).provider,
);

describe('OpenAiCompatibleProvider calls', () => {
  it('RF-403 a provider of kind openai-compatible with a base URL and key answers through the same contract', async () => {
    const { provider, server } = await replay('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({
      text: 'The Catalog area lists products from the database.',
      finishReason: 'stop',
      modelVersion: 'contract-vendor/contract-model',
      requestId: 'req-FAKE-compatible-0001',
      usage: { inputTokens: 1200, outputTokens: 80, cachedInputTokens: 1024 },
      metrics: { httpStatus: 200 },
    });
    expect(server.received.map(({ method, path }) => ({ method, path }))).toEqual([
      { method: 'POST', path: '/v1/chat/completions' },
    ]);
    expect(server.received[0]?.body).toMatchObject({ model: 'contract-model', stream: false });
  });

  it('RF-403 a usage without cached-token details counts no cached tokens', async () => {
    const { provider } = await replay('contract-tool-call');

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 900,
      outputTokens: 30,
      cachedInputTokens: 0,
      usageSource: 'reported',
    });
  });

  it('RF-1104 sends the key it was given and no header or key from the environment', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'env-key-must-not-be-sent');
    vi.stubEnv('OPENAI_CUSTOM_HEADERS', 'x-env-header: must-not-be-sent');
    vi.stubEnv('OPENAI_BASE_URL', 'https://elsewhere.example.com/v1');
    const { provider, server } = await replay('contract-text');

    await provider.complete(contractRequest());

    const [request] = server.received;
    expect(request?.headers['authorization']).toBe(`Bearer ${fakeCompatibleKey}`);
    expect(request?.headers).not.toHaveProperty('x-env-header');
    expect(request?.headers).not.toHaveProperty('openai-organization');
  });
});
