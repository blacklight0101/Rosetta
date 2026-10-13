import { actorOf } from '../../src/domain/accounts/actor.js';
import type { Run } from '../../src/domain/runs/run.js';
import { sampleManifest } from './run-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from './test-browser.js';
import { createTestServer, type TestServer } from './web-server.js';

// RF-1011, RF-1105: Amy has an understand run whose manifest names the Catalog area for its agent
// task; Bob has none. For the tests of the calls and transcript routes.

export interface CallsSetup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly run: Run;
}

export async function setupCalls(): Promise<CallsSetup> {
  const test = createTestServer();
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const run = await test.runs.start(actorOf(amyUser.account), 'understand');
  await test.runs.manifests.write(
    test.runs.scopeOf(run),
    sampleManifest({
      runId: run.runKey,
      stage: 'understand',
      agentTasks: [
        {
          agentTaskId: 'reader-001',
          area: 'Catalog',
          role: 'reader',
          state: 'Done',
          turns: 2,
          cards: 1,
        },
      ],
    }),
  );
  return {
    test,
    run,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

export const callsUrl = (run: Run): string => `/api/runs/${run.id}/calls`;
export const transcriptUrl = (run: Run, seq: number | string): string =>
  `/api/runs/${run.id}/calls/${String(seq)}/transcript`;
