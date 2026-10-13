import { describe, expect, it } from 'vitest';
import type { LlmRequest } from '../../../src/application/ports/llm-provider.js';
import { AnsweringProvider } from '../../support/answering-provider.js';

// RF-1108, P1-34: the end-to-end model double holds the first reader call of each understand run,
// so a second run of the same user waits in the queue. Runs are told apart by their trace id (one
// per run): the run key has a resolution of one second and is shared by every user of the server.

const holdForever = 3_600_000;

function readerCall(traceId: string, signal: AbortSignal): LlmRequest {
  return {
    context: {
      ...{ runId: '20261013-120000-understand', agentTaskId: 'reader-1', role: 'reader' },
      ...{ callId: `${traceId}#1`, traceId, parentSpanId: '0123456789abcdef' },
    },
    ...{ model: 'answering', system: 'You read code.', messages: [], tools: [], signal },
  };
}

/** Whether the call has answered once every pending callback has run (no clock involved). */
async function answered(call: Promise<unknown>): Promise<boolean> {
  let done = false;
  void call.then(() => {
    done = true;
  });
  await new Promise((resolve) => setImmediate(resolve));
  return done;
}

describe('AnsweringProvider hold', () => {
  it('RF-1108 holds the first reader call of each run, even two runs with the same run key', async () => {
    const provider = new AnsweringProvider([], holdForever);
    const stop = new AbortController();

    const first = provider.complete(readerCall('a'.repeat(32), stop.signal));
    const sameSecond = provider.complete(readerCall('b'.repeat(32), stop.signal));
    const firstAgain = provider.complete(readerCall('a'.repeat(32), stop.signal));

    expect(await answered(first)).toBe(false);
    expect(await answered(sameSecond)).toBe(false);
    expect(await answered(firstAgain)).toBe(true);
    stop.abort();
    await Promise.all([first, sameSecond]);
  });
});
