import { afterEach, describe, expect, it } from 'vitest';
import type { LlmProvider } from '../../../../src/application/ports/llm-provider.js';
import { AnthropicProvider } from '../../../../src/infrastructure/providers/anthropic/anthropic-provider.js';
import { OllamaProvider } from '../../../../src/infrastructure/providers/ollama/ollama-provider.js';
import { newContextCache } from '../../../../src/infrastructure/providers/ollama/ollama-context-resolver.js';
import { loadTextToolProtocol } from '../../../../src/infrastructure/providers/ollama/text-tool-protocol-file.js';
import { OpenAiProvider } from '../../../../src/infrastructure/providers/openai/openai-provider.js';
import { contractRequest } from '../../../contracts/llm-provider.contract.js';
import { FakeAnthropicServer } from '../../../support/fake-anthropic-server.js';
import {
  closedLoopbackUrl,
  releaseClosedLoopbackUrls,
  type FakeHttpServer,
} from '../../../support/fake-http-server.js';
import { FakeOllamaServer } from '../../../support/fake-ollama-server.js';
import { FakeOpenAiServer } from '../../../support/fake-openai-server.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { observedHarness } from '../../../support/observed-harness.js';
import { fakeAnthropicKey, fakeOpenAiKey } from '../../../support/secret-fixture.js';

// RF-408, RF-141: when a provider answers with an error, the call record keeps the provider's
// error type and message, masked and cut at 500 characters. Fake servers, no real call (ADR-008).

const servers: FakeHttpServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop()));
  releaseClosedLoopbackUrls();
});

const status = 400;
const common = { timeoutSeconds: 5, maxRetries: 0, testMode: true, random: () => 0.5 } as const;
const sleep = (): Promise<void> => Promise.resolve();

async function started(server: FakeHttpServer): Promise<string> {
  servers.push(server);
  return server.start();
}

function openAiAt(baseUrl: string, viaResponses = false): LlmProvider {
  return new OpenAiProvider({
    ...common,
    apiKey: fakeOpenAiKey,
    baseUrl,
    sleep,
    ...(viaResponses ? { usesResponses: () => true } : {}),
  });
}

async function openAi(message: string, viaResponses = false): Promise<LlmProvider> {
  const error = { message, type: 'invalid_request_error', param: null, code: 'bad' };
  const exchange = { status, body: { error }, headers: { 'x-request-id': 'req_FAKE400' } };
  const recording = {
    schemaVersion: 1 as const,
    description: 'FAKE',
    chat: viaResponses ? [] : [exchange],
    responses: viaResponses ? [exchange] : [],
  };
  const url = await started(new FakeOpenAiServer(recording));
  return openAiAt(`${url}/v1`, viaResponses);
}

async function anthropic(message: string): Promise<LlmProvider> {
  const body = { type: 'error', error: { type: 'invalid_request_error', message } };
  const recording = {
    schemaVersion: 1 as const,
    description: 'FAKE',
    messages: [{ status, body, headers: { 'request-id': 'req_FAKE400' } }],
  };
  const url = await started(new FakeAnthropicServer(recording));
  return new AnthropicProvider({ ...common, apiKey: fakeAnthropicKey, baseUrl: url, sleep });
}

async function ollama(message: string): Promise<LlmProvider> {
  const recording = {
    schemaVersion: 1 as const,
    description: 'FAKE',
    models: [{ name: 'contract-model:latest', digest: 'a'.repeat(64) }],
    chat: [{ status, body: { error: message } }],
  };
  const url = await started(new FakeOllamaServer(recording));
  const { text: textProtocolPrompt } = await loadTextToolProtocol(`${process.cwd()}/prompts`);
  return new OllamaProvider({
    ...common,
    baseUrl: url,
    toolMode: 'native',
    contextCache: newContextCache(),
    textProtocolPrompt,
    logger: new RecordingLogger(),
    sleep,
  });
}

async function recordsOf(inner: LlmProvider): Promise<{ errorMessage?: string }[]> {
  const { provider, log } = observedHarness({ inner: () => inner });
  await provider.complete(contractRequest()).catch(() => undefined);
  return log.records() as { errorMessage?: string }[];
}

describe('the provider error text in the call record', () => {
  it('RF-408 an OpenAI 400 keeps the error type and message with the request id', async () => {
    const message = 'Function tools with reasoning_effort are not supported.';

    const records = await recordsOf(await openAi(message));

    expect(records).toEqual([
      expect.objectContaining({
        status: 'failed',
        httpStatus: 400,
        requestId: 'req_FAKE400',
        errorMessage: `invalid_request_error: ${message}`,
      }),
    ]);
  });

  it('RF-408 an OpenAI Responses 400 keeps the error text the same way', async () => {
    const records = await recordsOf(await openAi('Unsupported parameter.', true));

    expect(records).toEqual([
      expect.objectContaining({ errorMessage: 'invalid_request_error: Unsupported parameter.' }),
    ]);
  });

  it('RF-408 an Anthropic error keeps the error type and message', async () => {
    const records = await recordsOf(await anthropic('max_tokens too large.'));

    expect(records).toEqual([
      expect.objectContaining({
        httpStatus: 400,
        requestId: 'req_FAKE400',
        errorMessage: 'invalid_request_error: max_tokens too large.',
      }),
    ]);
  });

  it('RF-408 an Ollama error keeps its message', async () => {
    const records = await recordsOf(await ollama('model requires more memory'));

    expect(records).toEqual([
      expect.objectContaining({ httpStatus: 400, errorMessage: 'model requires more memory' }),
    ]);
  });
});

describe('the provider error text in the call record: masking', () => {
  it('RF-141 masks a secret-shaped value in the provider error text', async () => {
    const records = await recordsOf(await openAi(`Incorrect key provided: ${fakeOpenAiKey}.`));

    const text = JSON.stringify(records);
    expect(text).not.toContain(fakeOpenAiKey);
    expect(text).toContain('[MASKED:');
  });
});

describe('the provider error text in the call record: limits', () => {
  it('RF-408 cuts a 2 kB message to 500 characters with a marker', async () => {
    const records = await recordsOf(await anthropic('z'.repeat(2048)));

    expect(records[0]?.errorMessage).toHaveLength(500);
    expect(records[0]?.errorMessage?.endsWith('[cut]')).toBe(true);
  });

  it('RF-408 keeps no request body besides the error text', async () => {
    const records = await recordsOf(await openAi('Nope.'));

    expect(JSON.stringify(records)).not.toContain('Describe the Catalog area.');
  });

  it('RF-408 a network error keeps its error name', async () => {
    const records = await recordsOf(openAiAt(`${await closedLoopbackUrl()}/v1`));

    expect(records).toEqual([
      expect.objectContaining({ status: 'failed', errorMessage: 'APIConnectionError' }),
    ]);
  });

  it('RF-408 a call that succeeds stores no error field', async () => {
    const { provider, log } = observedHarness();

    await provider.complete(contractRequest());

    expect(log.records()).toHaveLength(1);
    expect(log.records()[0]).not.toHaveProperty('errorMessage');
  });
});
