import { describe, expect, it } from 'vitest';
import type { LlmCallMetrics } from '../../../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { contractRequest, contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  observedHarness,
  observedInstant,
  slowProvider,
  textAnswer,
} from '../../../support/observed-harness.js';

/** The record of the contract's text answer, taking 1.5 s. */
const expectedRecord = {
  schemaVersion: 1,
  seq: 1,
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '8000000000000001',
  parentSpanId: '0123456789abcdef',
  callId: '20261011-090503-understand#1',
  attempt: 1,
  runId: '20261011-090503-understand',
  agentTaskId: 'task-1',
  role: 'reader',
  provider: 'local',
  kind: 'ollama',
  model: 'contract-model',
  modelVersion: 'fake-model-2026-10-01',
  endpointHost: 'host.docker.internal',
  requestId: 'fake-request-1',
  startedAt: observedInstant,
  timeToFirstTokenMs: 1500,
  latencyMs: 1500,
  inputTokens: 1200,
  outputTokens: 80,
  cachedInputTokens: 1024,
  usageSource: 'reported',
  costMicros: 1234,
  currency: 'USD',
  finishReason: 'stop',
  status: 'ok',
  transcriptRef: 'transcripts/task-1.jsonl#1',
};

describe('ObservedProvider records a call that answers', () => {
  it('RF-408 appends one record with every field when a call ends', async () => {
    const { provider, log } = observedHarness({
      inner: (clock) => slowProvider(clock, 1500, textAnswer),
    });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([expectedRecord]);
  });

  it('RF-408 keeps the time to first token, HTTP status and Ollama timings of the adapter', async () => {
    const ollama = {
      loadDurationMs: 12,
      promptEvalDurationMs: 340,
      evalDurationMs: 910,
      tokensPerSecond: 38.5,
    };
    const metrics: LlmCallMetrics = { timeToFirstTokenMs: 420, httpStatus: 200, ollama };
    const { provider, log } = observedHarness({
      inner: (clock) => slowProvider(clock, 1500, { ...textAnswer, metrics }),
    });

    await provider.complete(contractRequest());

    expect(log.records()).toEqual([
      expect.objectContaining({
        timeToFirstTokenMs: 420,
        latencyMs: 1500,
        httpStatus: 200,
        ollama,
      }),
    ]);
  });
});

describe('ObservedProvider records retried and failed attempts', () => {
  it('RF-408 records each retried attempt, linked to the first by the call id', async () => {
    const { provider, log } = observedHarness({
      recording: recordingOf(contractScenarios['retry-then-text']),
    });

    await provider.complete(contractRequest());

    const shared = {
      callId: '20261011-090503-understand#1',
      spanId: '8000000000000001',
      transcriptRef: 'transcripts/task-1.jsonl#1',
    };
    expect(log.records()).toEqual([
      expect.objectContaining({
        ...shared,
        seq: 1,
        attempt: 1,
        status: 'retried',
        errorCode: 'RST-1504',
        httpStatus: 429,
        finishReason: 'error',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
      }),
      expect.objectContaining({ ...shared, seq: 2, attempt: 2, status: 'ok' }),
    ]);
  });
});

describe('ObservedProvider records failed calls', () => {
  it('RF-408 records a call that fails for good with its RST code and rethrows it', async () => {
    const { provider, log } = observedHarness({
      recording: recordingOf(contractScenarios['permanent-failure']),
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toMatchObject({ code: ERROR_CODES.providerCallFailed });
    expect(log.records()).toEqual([
      expect.objectContaining({
        attempt: 1,
        status: 'failed',
        errorCode: 'RST-1506',
        httpStatus: 401,
        finishReason: 'error',
      }),
    ]);
  });

  it('RF-408 records an error without a code as RST-1506 and rethrows it unchanged', async () => {
    const failure = new Error('socket hang up');
    const { provider, log } = observedHarness({
      inner: () => ({ complete: () => Promise.reject(failure) }),
    });

    const error = await failureOf(provider.complete(contractRequest()));

    expect(error).toBe(failure);
    expect(log.records()).toEqual([
      expect.objectContaining({ status: 'failed', errorCode: 'RST-1506' }),
    ]);
  });
});
