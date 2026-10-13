import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { localCall, seedCallLog, seedTranscript } from '../../../support/call-fixtures.js';
import { callsUrl, transcriptUrl } from '../../../support/call-routes-harness.js';
import { createHistoryHarness, type HistoryHarness } from '../../../support/history-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-1011, RF-1105, RF-1012, RF-009: a deleted run leaves its entries in the application log. When
// another user's live run has the same run key (a key is unique per project only), that user sees
// none of the deleted run's calls, transcript or log entries, whether an entry names the owner or
// the key alone.

let harness: HistoryHarness | undefined;

afterEach(async () => {
  await harness?.test.server.close();
  harness = undefined;
});

const amyModel = 'amy-private-model';
const amyText = 'Amy read the Catalog area.';

/** Amy's ended run with a call, its transcript and log entries; then Amy deletes it. */
async function amyDeletesHerRun(h: HistoryHarness): Promise<void> {
  const { test, amy, done } = h;
  await seedCallLog(test.callFiles, done, [
    localCall(done, { agentTaskId: 'reader-001', model: amyModel }),
  ]);
  await seedTranscript(test.callFiles, done, 'reader-001', [
    { callId: `${done.runKey}#1`, role: 'assistant', content: amyText },
  ]);
  const at = { logger: 'runs', runId: done.runKey } as const;
  await test.logger.log({ ...at, level: 'error', message: 'Amy key only.' });
  await test.logger.log({ ...at, level: 'warn', message: 'Amy with her id.', userId: h.userId });
  await test.logger.securityEvent(ERROR_CODES.secretMaskingFailed, {
    message: 'Amy security event.',
    ...at,
  });
  const deleted = await amy.request({ method: 'DELETE', url: `/api/runs/${done.id}` });
  expect(deleted.statusCode).toBe(200);
}

/** Bob's live run in his own project, with the key of Amy's deleted run, and one entry of his. */
async function bobRunWithTheSameKey(h: HistoryHarness): Promise<Run> {
  const { test, done } = h;
  const bob = await test.users.findByUserName('bob');
  if (bob === undefined) throw new Error('Bob was not stored');
  const inserted = await test.runs.runs.insert(
    sampleRun({
      userId: bob.id,
      projectId: '00000000-0000-4000-a000-0000000000b1',
      runKey: done.runKey,
      queuedAt: done.queuedAt,
      stage: done.stage,
    }),
  );
  if (!inserted.ok) throw new Error('The run of Bob was not stored');
  const own = { runId: done.runKey, userId: bob.id };
  await test.logger.log({ level: 'info', logger: 'runs', message: 'Bob with his id.', ...own });
  return inserted.value;
}

describe("a deleted run's entries and another user's live run with the same key", () => {
  it('RF-1105 shows the second user none of the first user entries in the calls, the transcript and the logs', async () => {
    harness = await createHistoryHarness();
    await amyDeletesHerRun(harness);
    const bobRun = await bobRunWithTheSameKey(harness);
    const { bob } = harness;

    const calls = await bob.request({ method: 'GET', url: callsUrl(bobRun) });
    const transcript = await bob.request({ method: 'GET', url: transcriptUrl(bobRun, 1) });
    const logs = await bob.request({ method: 'GET', url: `/api/runs/${bobRun.id}/logs` });

    expect(calls.statusCode).toBe(200);
    expect(calls.json()).toMatchObject({ total: 0, calls: [] });
    expect(calls.body).not.toContain(amyModel);
    expect(transcript.statusCode).toBe(404);
    expect(transcript.body).not.toContain(amyText);
    expect(logs.statusCode).toBe(200);
    const body = logs.json<{ entries: { message: string }[]; securityEvents: number }>();
    expect(body.entries.map((entry) => entry.message)).toEqual(['Bob with his id.']);
    expect(body.securityEvents).toBe(0);
    expect(logs.body).not.toContain('Amy');
  });
});
