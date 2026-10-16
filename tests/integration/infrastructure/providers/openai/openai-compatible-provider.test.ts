import { describe, expect, it } from 'vitest';
import type { LlmAttemptObserver } from '../../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { OpenAiCompatibleProvider } from '../../../../../src/infrastructure/providers/openai/openai-compatible-provider.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { FakeOpenAiServer, loadOpenAiRecording } from '../../../../support/fake-openai-server.js';
import { fakeValue } from '../../../../support/fake-value.js';
import {
  fakeCompatibleKey,
  loopbackTransport,
  useFakeCompatible,
} from '../../../../support/openai-compatible-harness.js';

// RF-403, RF-406, RF-1104, RNF-003, ADR-013: what the OpenAI-compatible adapter refuses before a
// call, how its failures map to RST codes, and that neither the key nor the service's own text
// reaches an error. Fake servers on loopback only (ADR-008).

const { replay, serve } = useFakeCompatible();

/** Everything an error shows: message, own fields, stack and its cause chain. */
function everythingIn(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current !== undefined; depth += 1) {
    if (current instanceof Error) parts.push(current.message, current.stack ?? '');
    parts.push(JSON.stringify(current));
    current = current instanceof Error ? current.cause : undefined;
  }
  return parts.join('\n');
}

function counting(): LlmAttemptObserver & { started: number; retried: number } {
  const observer = {
    started: 0,
    retried: 0,
    attemptStarted: () => {
      observer.started += 1;
    },
    attemptRetried: () => {
      observer.retried += 1;
      return Promise.resolve();
    },
  };
  return observer;
}

function build(change: { apiKey?: string; baseUrl?: string }): () => OpenAiCompatibleProvider {
  return () =>
    new OpenAiCompatibleProvider({
      apiKey: fakeCompatibleKey,
      baseUrl: 'https://llm.example.com/v1',
      timeoutSeconds: 5,
      maxRetries: 0,
      testMode: true,
      transport: loopbackTransport(),
      ...change,
    });
}

describe('OpenAiCompatibleProvider refuses before any call', () => {
  const tooShort = fakeValue(10);
  it.each([
    ['empty', ''],
    ['shorter than 16 characters', tooShort],
    ['holding a space', `${fakeValue(10)} ${fakeValue(10)}`],
    ['holding a line break', `${fakeValue(10)}\n${fakeValue(10)}`],
    ['holding a character above U+00FF', `${fakeValue(20)}Ā`],
    ['longer than 512 characters', fakeValue(513)],
  ])('RF-1104 a key %s with RST-1511 and no part of it', (_name, apiKey) => {
    const error = thrownBy(build({ apiKey }));

    expect(error).toMatchObject({ code: ERROR_CODES.openAiKeyRejected });
    expect(everythingIn(error)).not.toContain('FAKE0');
  });

  it.each([
    ['a query string', 'https://llm.example.com/v1?api-version=2024-01-01'],
    ['a bare query marker', 'https://llm.example.com/v1?'],
    ['a fragment', 'https://llm.example.com/v1#x'],
    ['a user name and password', 'https://user:secret@llm.example.com/v1'],
    ['a user name only', 'https://user@llm.example.com/v1'],
    ['no URL at all', 'not a url'],
    ['another scheme', 'ftp://llm.example.com/v1'],
  ])('RF-1104 a base URL with %s with RST-2304', (_name, baseUrl) => {
    const error = thrownBy(build({ baseUrl }));

    expect(error).toMatchObject({ code: ERROR_CODES.baseUrlRejected });
    expect(everythingIn(error)).not.toContain('secret');
  });
});

function thrownBy(create: () => unknown): unknown {
  try {
    create();
  } catch (error) {
    return error;
  }
  return new Error('the constructor was expected to throw');
}

describe('OpenAiCompatibleProvider failures', () => {
  it('RF-406 a rejected key stops at once with RST-1511 naming the compatible service', async () => {
    const { provider, server } = await replay('contract-permanent-failure');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.openAiKeyRejected, httpStatus: 401 });
    expect(error instanceof Error ? error.message : '').toContain('OpenAI-compatible');
    expect(error instanceof Error ? error.message : '').not.toContain('OPENAI_API_KEY');
    expect(server.received).toHaveLength(1);
  });

  it('RF-406 an unknown model stops with RST-1512 naming the model', async () => {
    const { provider } = await replay('model-unknown');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.openAiModelUnknown, httpStatus: 404 });
    expect(error instanceof Error ? error.message : '').toContain('"contract-model"');
    expect(error instanceof Error ? error.message : '').toContain('OpenAI-compatible');
  });

  it('RF-406 an account without credit stops with RST-1513', async () => {
    const { provider } = await replay('quota-exhausted');

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.openAiQuotaExhausted, httpStatus: 429 });
    expect(error instanceof Error ? error.message : '').toContain('OpenAI-compatible');
  });
});

describe('OpenAiCompatibleProvider keeps the service text out', () => {
  it.each([401, 500])(
    'RNF-003 a %s answer that echoes the key leaves the key and the service text out of the error',
    async (status) => {
      const echo = `Incorrect API key provided: ${fakeCompatibleKey}`;
      const { provider } = await serve(() => ({ status, body: { error: { message: echo } } }), {
        maxRetries: 1,
      });

      const error = await failureOf(provider.complete(contractRequest()));

      const shown = everythingIn(error);
      expect(error).toMatchObject({ httpStatus: status });
      expect(shown).not.toContain(fakeCompatibleKey);
      expect(shown).not.toContain(fakeCompatibleKey.slice(-8));
      expect(shown).not.toContain('Incorrect API key provided');
    },
  );

  it('RF-403 an answer larger than the limit fails with RST-1506 and is not retried', async () => {
    const { provider, server } = await replay('contract-text', { maxBytes: 64, maxRetries: 2 });
    const observer = counting();

    const error = await failureOf(provider.complete(contractRequest(), observer));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(observer.started).toBe(1);
    expect(server.received).toHaveLength(1);
  });

  it('RF-403 a body that is not a chat completion fails with RST-1506', async () => {
    const { provider } = await serve(() => ({ status: 200, body: { hello: 'world' } }));

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 200 });
  });
});

describe('OpenAiCompatibleProvider redirects', () => {
  it('RF-1104 a 302 to an internal address is an error and the address is never called', async () => {
    const target = new FakeOpenAiServer(
      await loadOpenAiRecording('contract-text', 'openai-compatible'),
    );
    const targetUrl = await target.start();
    const { provider } = await serve(
      (_method, path) => ({ status: 302, headers: { location: `${targetUrl}${path}` }, body: {} }),
      { maxRetries: 2 },
    );
    const observer = counting();

    const error = await failureOf(provider.complete(contractRequest(), observer));
    await target.stop();

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed, httpStatus: 302 });
    expect(observer.started).toBe(1);
    expect(target.received).toEqual([]);
  });
});
