import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import {
  cloudCall,
  localCall,
  seedCallLog,
  seedTranscript,
} from '../../../support/call-fixtures.js';
import {
  setupCalls,
  transcriptUrl,
  type CallsSetup,
} from '../../../support/call-routes-harness.js';
import type { TestServer } from '../../../support/web-server.js';

// RF-1011, RF-408, RF-1105: GET /api/runs/:runId/calls/:seq/transcript through the server with a
// session. The transcript is the real reader over a memory run folder.

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

const messages = (run: Run) =>
  [
    { callId: `${run.runKey}#1`, role: 'system', content: 'You read one area.' },
    { callId: `${run.runKey}#1`, role: 'user', content: 'Read Catalog.' },
    { callId: `${run.runKey}#1`, role: 'assistant', content: 'Reading.' },
    { callId: `${run.runKey}#2`, role: 'tool', content: 'file text' },
  ] as const;

describe('GET /api/runs/:runId/calls/:seq/transcript', () => {
  it('RF-1011 gives the masked messages the call added to its agent task transcript', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [
      localCall(run, { agentTaskId: 'reader-001' }),
      localCall(run, { agentTaskId: 'reader-001', callId: `${run.runKey}#2` }),
    ]);
    await seedTranscript(test.callFiles, run, 'reader-001', messages(run));

    const first = await amy.request({ method: 'GET', url: transcriptUrl(run, 1) });
    const second = await amy.request({ method: 'GET', url: transcriptUrl(run, 2) });

    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    const entries = first.json<{ entries: { role: string }[] }>().entries;
    expect(entries.map((entry) => entry.role)).toEqual(['system', 'user', 'assistant']);
    expect(entries[1]).toMatchObject({ seq: 2, content: 'Read Catalog.' });
    expect(second.json()).toMatchObject({ entries: [{ role: 'tool', content: 'file text' }] });
  });

  it('RF-1011 gives an empty list for a call whose run kept no transcript', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [cloudCall(run, { agentTaskId: 'reader-001' })]);

    const response = await amy.request({ method: 'GET', url: transcriptUrl(run, 1) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ entries: [] });
  });
});

describe('GET /api/runs/:runId/calls/:seq/transcript refusals', () => {
  it('RF-1011 answers 404 with RST-2003 for a call the log does not hold', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run)]);

    const missing = await amy.request({ method: 'GET', url: transcriptUrl(run, 9) });

    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it("RF-1105 answers 404 for another user's run, with nothing of the transcript", async () => {
    const { test, bob, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run, { agentTaskId: 'reader-001' })]);
    await seedTranscript(test.callFiles, run, 'reader-001', messages(run));

    const response = await bob.request({ method: 'GET', url: transcriptUrl(run, 1) });

    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain('You read one area.');
  });
});

// The call number is a plain decimal from 1, written one way only, of at most 9 digits.
describe('GET /api/runs/:runId/calls/:seq/transcript call number', () => {
  it('RF-1011 answers 200 with the transcript for a call number that is a valid number', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run, { agentTaskId: 'reader-001' })]);
    await seedTranscript(test.callFiles, run, 'reader-001', messages(run));

    const response = await amy.request({ method: 'GET', url: transcriptUrl(run, '1') });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('You read one area.');
  });

  it.each([
    ['leading zeros', '01'],
    ['zero', '0'],
    ['a negative number', '-1'],
    ['a number above the safe range', '9007199254740993'],
    ['an exponent', '1e0'],
    ['a fraction', '1.0'],
    ['text', 'one'],
  ] as const)(
    'RF-1011 answers 404 with RST-2003 for a call number given as %s (%s)',
    async (_name, seq) => {
      const { test, amy, run } = await setup();
      await seedCallLog(test.callFiles, run, [localCall(run, { agentTaskId: 'reader-001' })]);
      await seedTranscript(test.callFiles, run, 'reader-001', messages(run));

      const response = await amy.request({ method: 'GET', url: transcriptUrl(run, seq) });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
      expect(response.body).not.toContain('You read one area.');
    },
  );
});
