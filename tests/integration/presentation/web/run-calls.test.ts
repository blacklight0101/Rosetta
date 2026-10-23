import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { cloudCall, localCall, seedCallLog } from '../../../support/call-fixtures.js';
import { callsUrl, setupCalls, type CallsSetup } from '../../../support/call-routes-harness.js';
import type { TestServer } from '../../../support/web-server.js';

// RF-1011, RF-408, RF-1105: GET /api/runs/:runId/calls through the server with a session. The call
// log is the real reader over a memory run folder, so what the route answers is what the recorder
// wrote.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup(): Promise<CallsSetup> {
  const made = await setupCalls();
  current = made.test;
  return made;
}

describe('GET /api/runs/:runId/calls', () => {
  it('RF-1011 lists each attempt from the call log with provider, model, agent, latency, tokens, cost and status', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [
      localCall(run, { agentTaskId: 'reader-001' }),
      cloudCall(run, { callId: `${run.runKey}#2`, agentTaskId: 'reader-001' }),
    ]);

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<{ runState: string; total: number; calls: unknown[] }>();
    expect(body).toMatchObject({ runState: 'Running', total: 2 });
    expect(body.calls).toHaveLength(2);
    expect(body.calls[0]).toMatchObject({
      seq: 1,
      callId: `${run.runKey}#1`,
      attempt: 1,
      agentTaskId: 'reader-001',
      agent: 'Catalog',
      role: 'reader',
      provider: 'local',
      kind: 'ollama',
      model: 'qwen2.5-coder:7b',
      timeToFirstTokenMs: 420,
      latencyMs: 1500,
      inputTokens: 1200,
      outputTokens: 80,
      costMicros: 0,
      status: 'ok',
      finishReason: 'stop',
      ollama: { tokensPerSecond: 42 },
      hasTranscript: true,
    });
    expect(body.calls[1]).toMatchObject({
      seq: 2,
      provider: 'cloud',
      model: 'gpt-test',
      timeToFirstTokenMs: 800,
      latencyMs: 1700,
      inputTokens: 2000,
      outputTokens: 180,
      costMicros: 6100,
      hasTranscript: false,
    });
  });
});

describe('GET /api/runs/:runId/calls agents and retries', () => {
  it('RF-1011 names an agent task the manifest does not know by its id', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run, { agentTaskId: 'reader-007' })]);

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    expect(response.json<{ calls: unknown[] }>().calls[0]).toMatchObject({
      agentTaskId: 'reader-007',
      agent: 'reader-007',
    });
  });

  it('RF-1011 keeps retried and failed attempts as records of their own with their error code and HTTP status', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [
      cloudCall(run, {
        attempt: 1,
        status: 'retried',
        errorCode: ERROR_CODES.providerRateLimited,
        errorMessage: 'rate_limit_error: slow down',
        httpStatus: 429,
        finishReason: 'error',
        latencyMs: 300,
        timeToFirstTokenMs: 0,
      }),
      cloudCall(run, { attempt: 2 }),
    ]);

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    const { calls } = response.json<{
      calls: { attempt: number; status: string; callId: string }[];
    }>();
    expect(calls.map((call) => [call.attempt, call.status])).toEqual([
      [1, 'retried'],
      [2, 'ok'],
    ]);
    expect(calls[0]).toMatchObject({
      callId: calls[1]?.callId,
      errorCode: ERROR_CODES.providerRateLimited,
      errorMessage: 'rate_limit_error: slow down',
      httpStatus: 429,
    });
    expect(calls[1]).not.toHaveProperty('errorMessage');
  });
});

describe('GET /api/runs/:runId/calls summary', () => {
  it('RF-1011 gives P50 and P95 latency and time to first token per provider and role, and Ollama tokens per second', async () => {
    const { test, amy, run } = await setup();
    const twenty = Array.from({ length: 20 }, (_item, index) =>
      localCall(run, {
        callId: `${run.runKey}#${String(index + 1)}`,
        latencyMs: (index + 1) * 100,
        timeToFirstTokenMs: (index + 1) * 10,
        ollama: {
          loadDurationMs: 1,
          promptEvalDurationMs: 1,
          evalDurationMs: 1,
          tokensPerSecond: 30,
        },
      }),
    );
    await seedCallLog(test.callFiles, run, [
      ...twenty,
      cloudCall(run, { latencyMs: 900 }),
      cloudCall(run, { status: 'failed', finishReason: 'error', latencyMs: 30_000 }),
    ]);

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    expect(response.json<{ summary: unknown[] }>().summary).toMatchObject([
      {
        provider: 'cloud',
        role: 'verifier',
        calls: 2,
        failed: 1,
        errors: 1,
        latencyP50Ms: 900,
        latencyP95Ms: 900,
        tokensPerSecond: null,
      },
      {
        provider: 'local',
        role: 'reader',
        calls: 20,
        errors: 0,
        latencyP50Ms: 1000,
        latencyP95Ms: 1900,
        firstTokenP50Ms: 100,
        firstTokenP95Ms: 190,
        tokensPerSecond: 30,
      },
    ]);
  });
});

describe('GET /api/runs/:runId/calls while the run goes on', () => {
  it('RF-1011 shows the attempts recorded since the last request, and the run state, while the run goes on', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run)]);
    const first = await amy.request({ method: 'GET', url: callsUrl(run) });

    await seedCallLog(test.callFiles, run, [localCall(run, { callId: `${run.runKey}#2` })], 2);
    test.runs.executor.settle(run.id, { endState: 'Completed' });
    await test.runs.ended(run);
    const second = await amy.request({ method: 'GET', url: callsUrl(run) });

    expect(first.json()).toMatchObject({ runState: 'Running', total: 1 });
    expect(second.json()).toMatchObject({ runState: 'Ended', total: 2 });
  });

  it('RF-1011 answers an empty panel for a run that has made no call', async () => {
    const { amy, run } = await setup();

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 0, calls: [], summary: [] });
  });

  it("RF-1105 answers another user's run, an unknown run and a malformed id the same way", async () => {
    const { test, bob, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run)]);

    const foreign = await bob.request({ method: 'GET', url: callsUrl(run) });
    const unknown = await bob.request({
      method: 'GET',
      url: '/api/runs/00000000-0000-4000-b000-00000000ffff/calls',
    });
    const malformed = await bob.request({ method: 'GET', url: '/api/runs/not-a-uuid/calls' });

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());
    expect(foreign.json()).toEqual(malformed.json());
    expect(foreign.body).not.toContain(run.runKey);
  });
});
