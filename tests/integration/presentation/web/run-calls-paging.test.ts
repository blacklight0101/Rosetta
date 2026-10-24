import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import {
  cloudCall,
  seedCallLog,
  seedTranscript,
  localCall,
} from '../../../support/call-fixtures.js';
import {
  callsUrl,
  setupCalls,
  transcriptUrl,
  type CallsSetup,
} from '../../../support/call-routes-harness.js';
import type { TestServer } from '../../../support/web-server.js';

// RF-1011, RF-408, RF-1105 (P5-22): GET /api/runs/:runId/calls answers in pages with the summary of
// the whole log, and a transcript of a large run answers fast once the log has been read.

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

const BIG = 900;

function bigRun(run: Run, count = BIG) {
  return Array.from({ length: count }, (_item, index) =>
    localCall(run, {
      callId: `${run.runKey}#${String(index + 1)}`,
      agentTaskId: 'reader-001',
      latencyMs: 1000 + index,
    }),
  );
}

interface Page {
  total: number;
  nextCursor?: string;
  calls: { seq: number }[];
  summary: { calls: number }[];
}

describe('GET /api/runs/:runId/calls pages', () => {
  it('RF-1011 gives the first 50 calls of a 900-call run with a cursor and the summary of all of them', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, bigRun(run));

    const response = await amy.request({ method: 'GET', url: `${callsUrl(run)}?limit=50` });

    expect(response.statusCode).toBe(200);
    const page = response.json<Page>();
    expect(page.total).toBe(BIG);
    expect(page.calls).toHaveLength(50);
    expect(page.calls[0]?.seq).toBe(1);
    expect(page.nextCursor).toBe('50');
    expect(page.summary[0]?.calls).toBe(BIG);
  });

  it('RF-1011 walks the whole log page by page and ends without a cursor', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, bigRun(run, 130));
    const seen: number[] = [];
    let cursor: string | undefined;

    do {
      const query = cursor === undefined ? 'limit=50' : `limit=50&cursor=${cursor}`;
      const response = await amy.request({ method: 'GET', url: `${callsUrl(run)}?${query}` });
      const page = response.json<Page>();
      seen.push(...page.calls.map((call) => call.seq));
      cursor = page.nextCursor;
    } while (cursor !== undefined);

    expect(seen).toEqual(Array.from({ length: 130 }, (_item, index) => index + 1));
  });

  it('RF-1011 shows the calls a run still writing adds after the page that was read', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, bigRun(run, 5));
    const first = await amy.request({ method: 'GET', url: `${callsUrl(run)}?limit=50` });
    expect(first.json<Page>().total).toBe(5);

    await seedCallLog(test.callFiles, run, bigRun(run, 8).slice(5), 6);
    const later = await amy.request({ method: 'GET', url: `${callsUrl(run)}?limit=50&cursor=5` });

    const page = later.json<Page>();
    expect(page.total).toBe(8);
    expect(page.calls.map((call) => call.seq)).toEqual([6, 7, 8]);
    expect(page.summary[0]?.calls).toBe(8);
  });
});

describe('GET /api/runs/:runId/calls page refusals', () => {
  it('RF-1011 refuses a limit or a cursor that is not a plain number', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [cloudCall(run)]);

    for (const query of [
      'limit=0',
      'limit=-1',
      'limit=abc',
      'cursor=x',
      'cursor=-3',
      'limit=1.5',
    ]) {
      const response = await amy.request({ method: 'GET', url: `${callsUrl(run)}?${query}` });
      expect(`${query}: ${String(response.statusCode)}`).toBe(`${query}: 400`);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    }
  });

  it("RF-1105 answers 404 for another user's run, paged or not", async () => {
    const { test, bob, run } = await setup();
    await seedCallLog(test.callFiles, run, bigRun(run, 3));

    const response = await bob.request({ method: 'GET', url: `${callsUrl(run)}?limit=50` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });
});

describe('GET /api/runs/:runId/calls/:seq/transcript on a large run', () => {
  it('RF-1011 answers a transcript quickly once the call log has been read', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, bigRun(run));
    await seedTranscript(test.callFiles, run, 'reader-001', [
      { callId: `${run.runKey}#450`, role: 'user', content: 'Read it.' },
    ]);
    await amy.request({ method: 'GET', url: transcriptUrl(run, 1) });

    const started = performance.now();
    const response = await amy.request({ method: 'GET', url: transcriptUrl(run, 450) });
    const elapsed = performance.now() - started;

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ entries: [{ content: 'Read it.' }] });
    // The card asks for under 300 ms; the bound is generous because a full parse takes seconds.
    expect(elapsed).toBeLessThan(300);
  }, 60_000);
});
