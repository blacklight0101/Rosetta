import { describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { contractRequest } from '../../../../contracts/llm-provider.contract.js';
import { failureOf } from '../../../../support/failure-of.js';
import { numCtx, useFakeOllama } from '../../../../support/ollama-harness.js';
import type { RecordingLogger } from '../../../../support/recording-logger.js';

// RF-401, DEC-114, Q-23, P1-69: the Ollama context size when a probe fails, hangs or is shared by
// a caller that stops, against a fake Ollama server (ADR-008).

const start = useFakeOllama();

const warnings = (logger: RecordingLogger) => logger.records.filter((r) => r.level === 'warn');

describe('OllamaProvider when a context probe fails part-way', () => {
  it('RF-401 a probe failure after 32768 spilled sends the floor, never 32768', async () => {
    const { provider, server, logger } = await start('context-ps-fails-after-spill');

    const response = await provider.complete(contractRequest());

    expect(numCtx(server.bodiesOf('/api/generate'))).toEqual([32_768, 16_384]);
    expect(numCtx(server.chatBodies())).toEqual([4_096]);
    expect(response.metrics?.ollama).toMatchObject({
      contextTokens: 4_096,
      contextSource: 'auto-fallback',
    });
    expect(warnings(logger)).toHaveLength(1);
  });

  it('RF-401 a malformed /api/show answer falls back to the ceiling with a warning', async () => {
    const { provider, server, logger } = await start('context-show-malformed');

    const response = await provider.complete(contractRequest());

    expect(server.bodiesOf('/api/generate')).toEqual([]);
    expect(numCtx(server.chatBodies())).toEqual([32_768]);
    expect(response.metrics?.ollama).toMatchObject({ contextSource: 'auto-fallback' });
    expect(warnings(logger)).toHaveLength(1);
  });
});

describe('OllamaProvider context size on retried attempts', () => {
  it('RF-401 a retried attempt sends the same measured num_ctx without measuring again', async () => {
    const { provider, server } = await start('context-fit-then-retry');

    await provider.complete(contractRequest());

    expect(numCtx(server.chatBodies())).toEqual([16_384, 16_384]);
    expect(server.bodiesOf('/api/show')).toHaveLength(1);
  });

  it('RF-401 a retried attempt within the back-off reuses the fallback without probing again', async () => {
    const { provider, server } = await start('context-fallback-then-retry');

    await provider.complete(contractRequest());

    expect(numCtx(server.chatBodies())).toEqual([32_768, 32_768]);
    expect(server.bodiesOf('/api/show')).toHaveLength(1);
  });
});

describe('OllamaProvider context probe timeouts', () => {
  it('RF-401 a hanging /api/show costs at most the probe timeout', async () => {
    const { provider, server } = await start('context-show-hangs', {
      timeoutSeconds: 3,
      probeTimeoutSeconds: 0.2,
    });
    const startedAt = performance.now();

    const response = await provider.complete(contractRequest());

    expect(performance.now() - startedAt).toBeLessThan(1_500);
    expect(numCtx(server.chatBodies())).toEqual([32_768]);
    expect(response.metrics?.ollama).toMatchObject({ contextSource: 'auto-fallback' });
  }, 30_000);

  it('RF-401 stopping one of two callers sharing a measurement leaves the other to finish', async () => {
    const { provider, server, another } = await start('context-show-hangs', {
      timeoutSeconds: 3,
      probeTimeoutSeconds: 0.2,
    });
    const controller = new AbortController();

    const stopped = failureOf(provider.complete(contractRequest(controller.signal)));
    const kept = another().complete(contractRequest());
    await vi.waitFor(() => {
      expect(server.bodiesOf('/api/show')).toHaveLength(1);
    });
    controller.abort();

    expect(await stopped).toMatchObject({ code: ERROR_CODES.providerCallCancelled });
    expect((await kept).text).toBe('The Catalog area lists products from the database.');
    expect(server.bodiesOf('/api/show')).toHaveLength(1);
    expect(numCtx(server.chatBodies())).toEqual([32_768]);
  }, 30_000);
});

describe('OllamaProvider fixed-size spill check', () => {
  it('RF-401 a caller that stops during the spill check ends at once as cancelled', async () => {
    const { provider, server } = await start('context-fixed-ps-hangs', { contextTokens: 8_192 });
    const controller = new AbortController();

    const call = failureOf(provider.complete(contractRequest(controller.signal)));
    await vi.waitFor(() => {
      expect(server.bodiesOf('/api/ps')).toHaveLength(1);
    });
    const stoppedAt = performance.now();
    controller.abort();

    expect(await call).toMatchObject({ code: ERROR_CODES.providerCallCancelled });
    expect(performance.now() - stoppedAt).toBeLessThan(1_000);
  }, 30_000);
});
