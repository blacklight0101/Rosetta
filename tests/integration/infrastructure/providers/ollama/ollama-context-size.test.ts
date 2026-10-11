import { describe, expect, it } from 'vitest';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { useFakeOllama } from '../../../../support/ollama-harness.js';
import type { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, Q-23: the Ollama context size against a fake Ollama server (ADR-008).

const start = useFakeOllama();

function numCtx(bodies: unknown[]): unknown[] {
  return bodies.map((body) => {
    const options: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'options') : undefined;
    return typeof options === 'object' && options !== null
      ? Reflect.get(options, 'num_ctx')
      : undefined;
  });
}

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('OllamaProvider with contextTokens auto', () => {
  it('RF-401 sends 16384 when the model spills at 32768 and fits at 16384, and records it', async () => {
    const { provider: ollama, server, logger } = await start('context-spill-then-fit');
    const { provider, log } = observedHarness({ inner: () => ollama });

    await provider.complete(contractRequest());

    expect(numCtx(server.bodiesOf('/api/generate'))).toEqual([32_768, 16_384]);
    expect(numCtx(server.chatBodies())).toEqual([16_384]);
    expect(log.records()).toEqual([
      expect.objectContaining({
        status: 'ok',
        ollama: expect.objectContaining({ contextTokens: 16_384, contextSource: 'auto-fit' }),
      }),
    ]);
    expect(warnings(logger)).toEqual([]);
  });

  it('RF-401 loads the model without a prompt to measure it', async () => {
    const { provider, server } = await start('context-spill-then-fit');

    await provider.complete(contractRequest());

    expect(server.bodiesOf('/api/show')).toEqual([{ model: 'contract-model' }]);
    expect(server.bodiesOf('/api/generate')[0]).toEqual({
      model: 'contract-model',
      stream: false,
      options: { num_ctx: 32_768 },
    });
  });

  it('RF-401 a model whose trained context is 8192 never gets more', async () => {
    const { provider, server } = await start('context-model-limit');

    const response = await provider.complete(contractRequest());

    expect(numCtx(server.bodiesOf('/api/generate'))).toEqual([8_192]);
    expect(numCtx(server.chatBodies())).toEqual([8_192]);
    expect(response.metrics?.ollama).toMatchObject({
      contextTokens: 8_192,
      contextSource: 'auto-model-limit',
    });
  });

  it('RF-401 uses the floor with one warning when the model spills even there', async () => {
    const { provider, server, logger } = await start('context-floor-spill');

    const response = await provider.complete(contractRequest());

    expect(numCtx(server.bodiesOf('/api/generate'))).toEqual([32_768, 16_384, 8_192, 4_096]);
    expect(numCtx(server.chatBodies())).toEqual([4_096]);
    expect(response.metrics?.ollama).toMatchObject({ contextSource: 'auto-floor' });
    expect(warnings(logger)).toHaveLength(1);
  });

  it('RF-401 the resolver runs once per model, for concurrent calls and for a second provider', async () => {
    const { provider, server, another } = await start('context-spill-then-fit');

    await Promise.all([
      provider.complete(contractRequest()),
      another().complete(contractRequest()),
    ]);

    expect(server.bodiesOf('/api/show')).toHaveLength(1);
    expect(server.bodiesOf('/api/ps')).toHaveLength(2);
    expect(numCtx(server.chatBodies())).toEqual([16_384, 16_384]);
  });
});

describe('OllamaProvider with contextTokens auto when Ollama cannot be probed', () => {
  it('RF-401 sends the ceiling with a warning when /api/show is not available', async () => {
    const { provider, server, logger } = await start('contract-text');

    const response = await provider.complete(contractRequest());

    expect(numCtx(server.chatBodies())).toEqual([32_768]);
    expect(response.metrics?.ollama).toMatchObject({ contextSource: 'auto-fallback' });
    expect(warnings(logger)).toHaveLength(1);
  });

  it('RF-401 does not keep a fallback: the next call probes again', async () => {
    const { provider, server } = await start('context-ps-unavailable');

    await provider.complete(contractRequest());
    await provider.complete(contractRequest());

    expect(server.bodiesOf('/api/show')).toHaveLength(2);
    expect(numCtx(server.chatBodies())).toEqual([32_768, 32_768]);
  });
});

describe('OllamaProvider with a fixed contextTokens', () => {
  it('RF-401 sends a fixed size unchanged and warns once when part of the model is on the CPU', async () => {
    const { provider, server, logger } = await start('context-fixed-spill', {
      contextTokens: 32_768,
    });

    const first = await provider.complete(contractRequest());
    await provider.complete(contractRequest());

    expect(numCtx(server.chatBodies())).toEqual([32_768, 32_768]);
    expect(server.bodiesOf('/api/generate')).toEqual([]);
    expect(server.bodiesOf('/api/ps')).toHaveLength(1);
    expect(warnings(logger)).toHaveLength(1);
    expect(first.metrics?.ollama).toMatchObject({ contextTokens: 32_768, contextSource: 'fixed' });
  });
});
