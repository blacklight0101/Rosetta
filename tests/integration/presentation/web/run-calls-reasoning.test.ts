import { afterEach, describe, expect, it } from 'vitest';
import { cloudCall, seedCallLog } from '../../../support/call-fixtures.js';
import { callsUrl, setupCalls, type CallsSetup } from '../../../support/call-routes-harness.js';
import type { TestServer } from '../../../support/web-server.js';

// RF-1011, RF-408, RF-402, Q-58, P3-86: the calls route shows the reasoning tokens of a call apart
// from its output tokens (they are a part of them), and leaves the field out for a call without.

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

describe('GET /api/runs/:runId/calls: reasoning tokens', () => {
  it('RF-1011 answers the reasoning tokens of a call next to its output tokens', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [
      cloudCall(run, { outputTokens: 4096, reasoningTokens: 4096, finishReason: 'length' }),
      cloudCall(run, { callId: `${run.runKey}#2` }),
    ]);

    const response = await amy.request({ method: 'GET', url: callsUrl(run) });

    const body = response.json<{ calls: Record<string, unknown>[] }>();
    expect(body.calls[0]).toMatchObject({
      outputTokens: 4096,
      reasoningTokens: 4096,
      finishReason: 'length',
    });
    expect(body.calls[1]).not.toHaveProperty('reasoningTokens');
  });
});
