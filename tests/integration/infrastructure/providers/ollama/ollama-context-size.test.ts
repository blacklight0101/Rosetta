import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { FALLBACK_BACKOFF_MS } from '../../../../../src/infrastructure/providers/ollama/ollama-context.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { observedHarness } from '../../../../support/observed-harness.js';
import { numCtx, useFakeOllama } from '../../../../support/ollama-harness.js';
import type { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, Q-23: the Ollama context size against a fake Ollama server (ADR-008).

const start = useFakeOllama();

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('OllamaProvider with contextTokens auto', () => {
  it('RF-401 sends 16384 when the model spills at 32768 and fits at 16384, and records it', async () => {
    const { provider: ollama, server, logger } = await start('context-spill-then-fit');
    const { provider, log } = observedHarness({ inner: () => ollama });

    await provider.complete(contractRequest());

    expect(numCtx(server.bodiesOf('/api/generate'))).toEqual([32_768, 16_384]);
    expect(numCtx(server.chatBodies())).toEqual([16_384]);
    expect(log.records()).toHaveLength(1);
    expect(log.records()[0]).toMatchObject({
      status: 'ok',
      ollama: { contextTokens: 16_384, contextSource: 'auto-fit' },
    });
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
});

describe('OllamaProvider with contextTokens auto at the limits', () => {
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
});

describe('OllamaProvider with contextTokens auto across calls', () => {
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

  it('RF-401 without a context cache option, providers in one process share the process-wide cache', async () => {
    const { provider, server, another } = await start('context-spill-then-fit', {
      contextCache: undefined,
    });

    await provider.complete(contractRequest());
    await another().complete(contractRequest());

    expect(server.bodiesOf('/api/show')).toHaveLength(1);
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

  it('RF-401 does not keep a fallback: a call after the back-off probes again', async () => {
    const clock = { ms: 1_000_000 };
    const { provider, server } = await start('context-ps-unavailable', { now: () => clock.ms });

    await provider.complete(contractRequest());
    clock.ms += FALLBACK_BACKOFF_MS;
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

describe('OllamaProvider while the context size is being measured', () => {
  it('RF-401 a call stopped during the measurement ends at once as cancelled', async () => {
    const { provider, server } = await start('context-show-hangs');
    const controller = new AbortController();

    const call = failureOf(provider.complete(contractRequest(controller.signal)));
    await vi.waitFor(() => {
      expect(server.bodiesOf('/api/show')).toHaveLength(1);
    });
    controller.abort();

    expect(await call).toMatchObject({ code: ERROR_CODES.providerCallCancelled });
    expect(server.chatBodies()).toEqual([]);
  });
});
