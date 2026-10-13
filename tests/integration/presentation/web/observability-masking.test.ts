import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { localCall, seedCallLog, seedTranscript } from '../../../support/call-fixtures.js';
import { transcriptUrl } from '../../../support/call-routes-harness.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RNF-003, RF-1011, RF-408: nothing unmasked leaves the server through the transcript and logs
// routes. The routes are the composition root's, over a run folder and a daily log file whose lines
// hold a secret as written by a writer that did not mask it; each line is masked again as it is
// read, so the body shows the mask and never the secret.

const temp = useTempRoot('rosetta-observability-masking-');
let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface MaskingSetup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly run: Run;
}

async function setup(): Promise<MaskingSetup> {
  const test = createTestServer({ logDir: temp.path });
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const run = await test.runs.start(actorOf(amyUser.account), 'understand');
  return { test, run, amy: await signedInBrowser(test.server, amyUser) };
}

/** Writes one unmasked line to today's log file, as a writer that skipped the masking would. */
async function seedRawLogLine(test: TestServer, entry: Record<string, string>): Promise<void> {
  const at = test.clock.now().toISOString();
  const folder = join(temp.path, 'logs');
  await mkdir(folder, { recursive: true });
  const line = JSON.stringify({
    schemaVersion: 1,
    at,
    level: 'error',
    logger: 'provider',
    ...entry,
  });
  await writeFile(join(folder, `rosetta-${at.slice(0, 10)}.jsonl`), `${line}\n`);
}

describe('the transcript and logs routes mask what they read', () => {
  it('RNF-003 masks a secret held in a call transcript before the transcript route sends it', async () => {
    const { test, amy, run } = await setup();
    await seedCallLog(test.callFiles, run, [localCall(run, { agentTaskId: 'reader-001' })]);
    await seedTranscript(test.callFiles, run, 'reader-001', [
      { callId: `${run.runKey}#1`, role: 'tool', content: `config: apiKey=${fakeOpenAiKey}` },
    ]);

    const response = await amy.request({ method: 'GET', url: transcriptUrl(run, 1) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ entries: [{ role: 'tool' }] });
    expect(response.body).toContain('[MASKED:');
    expect(response.body).not.toContain(fakeOpenAiKey);
  });

  it('RNF-003 masks a secret held in a log entry of the run before the logs route sends it', async () => {
    const { test, amy, run } = await setup();
    await seedRawLogLine(test, {
      message: `The provider refused the key ${fakeOpenAiKey}.`,
      runId: run.id,
    });

    const response = await amy.request({ method: 'GET', url: `/api/runs/${run.id}/logs` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1 });
    expect(response.body).toContain('[MASKED:');
    expect(response.body).not.toContain(fakeOpenAiKey);
  });
});
