import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { AnthropicProvider } from '../../../../../src/infrastructure/providers/anthropic/anthropic-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { useFakeAnthropic } from '../../../../support/anthropic-harness.js';
import {
  FakeAnthropicServer,
  loadAnthropicRecording,
} from '../../../../support/fake-anthropic-server.js';
import { failureOf } from '../../../../support/failure-of.js';
import { fakeAnthropicKey } from '../../../../support/secret-fixture.js';

// RF-404: what the Anthropic adapter makes of Anthropic's answers (fake server, ADR-008): the
// model version, the request id, the cached-token usage, tool calls and finish reasons.

const start = useFakeAnthropic();

describe('AnthropicProvider answers', () => {
  it('RF-404 reports the model version and the request id', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response.modelVersion).toBe('contract-model-20260807');
    expect(response.requestId).toBe('req_FAKE00000000000000000001');
    expect(response.metrics).toEqual({ httpStatus: 200 });
  });

  it('RF-404 reports the tokens read from the cache as cached input tokens', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 1024,
      usageSource: 'reported',
    });
  });

  it('RF-404 counts the tokens written to the cache as input and as cache-write tokens (P2-16)', async () => {
    const { provider } = await start('cache-write');

    const response = await provider.complete(contractRequest());

    expect(response.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 80,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 1024,
      usageSource: 'reported',
    });
  });

  it('RF-404 reports no cache-write tokens when nothing was written to the cache', async () => {
    const { provider } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect('cacheWriteInputTokens' in response.usage).toBe(false);
  });
});

describe('AnthropicProvider answer shapes', () => {
  it('RF-421 estimates the usage when the API reports none', async () => {
    const { provider } = await start('usage-missing');

    const response = await provider.complete(contractRequest());

    expect(response.usage.usageSource).toBe('estimated');
    expect(response.usage.outputTokens).toBe(8);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
  });

  it('RF-404 reports an answer cut off by max_tokens as length', async () => {
    const { provider } = await start('max-tokens');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({ text: 'The Catalog area lists', finishReason: 'length' });
  });

  it('RF-404 keeps the tool_use ids, the text, and a call whose input is not an object as text', async () => {
    const { provider } = await start('text-and-tool-calls');

    const response = await provider.complete(contractRequest());

    expect(response.toolCalls).toEqual([
      { id: 'toolu_FAKE01', name: 'read_file', arguments: { path: 'src/Catalog.cs' } },
    ]);
    expect(response.text).toContain('Reading the file.');
    expect(response.text).toContain('not an object');
    expect(response.finishReason).toBe('tool_use');
  });

  it('RF-404 returns a refusal as the answer text', async () => {
    const { provider } = await start('refusal');

    const response = await provider.complete(contractRequest());

    expect(response).toMatchObject({ text: 'I cannot help with that.', finishReason: 'stop' });
  });
});

describe('AnthropicProvider answers it cannot use', () => {
  it('RF-404 an answer that is not a message fails with RST-1506 and is not retried', async () => {
    const { provider, server } = await start('invalid-answer');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 200 });
    expect(server.messageBodies()).toHaveLength(1);
  });

  it('RF-404 an answer larger than the size limit fails with RST-1506 and is not retried', async () => {
    const { provider, server } = await start('contract-text', { maxResponseBytes: 256 });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(error instanceof Error ? error.message : '').toContain('256 bytes');
    expect(server.messageBodies()).toHaveLength(1);
  });
});

describe('AnthropicProvider in automated tests', () => {
  const servers: FakeAnthropicServer[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map((server) => server.stop()));
  });

  it('RNF-005 refuses a loopback server that did not register its port', async () => {
    const server = new FakeAnthropicServer(await loadAnthropicRecording('contract-text'), {
      registerPort: false,
    });
    servers.push(server);
    const provider = new AnthropicProvider({
      apiKey: fakeAnthropicKey,
      baseUrl: await server.start(),
      timeoutSeconds: 5,
      maxRetries: 0,
      testMode: true,
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.realProviderRefusedInTests });
    expect(server.received).toEqual([]);
  });
});

describe('AnthropicProvider keys', () => {
  const pieces = [fakeAnthropicKey.slice(0, 12), fakeAnthropicKey.slice(12)];

  it.each([
    ['a newline', pieces.join('\n')],
    ['a carriage return', pieces.join('\r')],
    ['a tab', pieces.join('\t')],
    ['a space inside', pieces.join(' ')],
    ['nothing', ''],
  ])('RNF-003 a key with %s is refused with RST-1518 and appears nowhere', async (_n, apiKey) => {
    const error = await failureOf(start('contract-text', { apiKey }));

    expect(error).toMatchObject({ code: ERROR_CODES.anthropicKeyRejected });
    const shown = JSON.stringify(error, Object.getOwnPropertyNames(error));
    for (const part of pieces) expect(shown).not.toContain(part);
    expect(error instanceof Error ? error.cause : undefined).toBeUndefined();
  });
});

function providerWith(apiKey: string, baseUrl: string): AnthropicProvider {
  return new AnthropicProvider({
    apiKey,
    baseUrl,
    timeoutSeconds: 5,
    maxRetries: 3,
    testMode: true,
  });
}

describe('AnthropicProvider keys beyond Latin-1', () => {
  const pieces = [fakeAnthropicKey.slice(0, 12), fakeAnthropicKey.slice(12)];
  const zeroWidthSpace = String.fromCodePoint(0x200b);
  const emoji = String.fromCodePoint(0x1f511);
  const firstAboveLatin1 = String.fromCodePoint(0x100);
  const lastLatin1 = String.fromCodePoint(0xff);

  it.each([
    ['a zero-width space', pieces.join(zeroWidthSpace)],
    ['an emoji', pieces.join(emoji)],
    ['the first character above U+00FF', pieces.join(firstAboveLatin1)],
  ])(
    'RNF-003 a key with %s is refused at construction with RST-1518, with no call and no retry',
    async (_n, apiKey) => {
      const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
        vi.spyOn(console, method).mockImplementation(() => undefined),
      );
      const server = new FakeAnthropicServer(await loadAnthropicRecording('contract-text'));
      const baseUrl = await server.start();

      try {
        const error = await failureOf(Promise.resolve().then(() => providerWith(apiKey, baseUrl)));

        expect(error).toMatchObject({ code: ERROR_CODES.anthropicKeyRejected });
        const shown = JSON.stringify(error, Object.getOwnPropertyNames(error));
        for (const part of pieces) expect(shown).not.toContain(part);
        expect(error instanceof Error ? error.cause : undefined).toBeUndefined();
        for (const spy of logged) expect(spy).not.toHaveBeenCalled();
        expect(server.received).toEqual([]);
      } finally {
        await server.stop();
      }
    },
  );

  it('RNF-003 a key whose last character is U+00FF is accepted and sent', async () => {
    const apiKey = pieces.join(lastLatin1);
    const { provider, server } = await start('contract-text', { apiKey });

    const response = await provider.complete(contractRequest());

    expect(response.text).not.toBe('');
    expect(server.received).toHaveLength(1);
  });
});
