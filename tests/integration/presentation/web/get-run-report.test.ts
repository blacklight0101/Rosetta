import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { realRunOutputs, seedRecordedRun } from '../../../support/run-output-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1002, RF-504, DEC-131 (P1-130): GET /api/runs/:runId says whether the run's report has been
// built, over a real data folder, so the live run page shows the Report step done on load for a run
// whose report was built earlier.

let current: TestServer | undefined;
const data = useTempRoot('rosetta-get-run-report-');

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer(realRunOutputs(data.path));
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const run = await seedRecordedRun(test, amyUser.account.id, data.path);
  const running = await test.runs.start(actorOf(amyUser.account));
  return { amy: await signedInBrowser(test.server, amyUser), run, running };
}

describe('GET /api/runs/:runId and the report', () => {
  it('RF-1002 says an ended run has no report until one is built, then that it has one', async () => {
    const { amy, run } = await setup();

    const before = await amy.request({ method: 'GET', url: `/api/runs/${run.id}` });
    const built = await amy.request({ method: 'POST', url: `/api/runs/${run.id}/report` });
    const after = await amy.request({ method: 'GET', url: `/api/runs/${run.id}` });

    expect(before.statusCode).toBe(200);
    expect(before.json()).toMatchObject({ id: run.id, queueState: 'Ended', reportBuilt: false });
    expect(built.statusCode).toBe(200);
    expect(after.json()).toMatchObject({ id: run.id, reportBuilt: true });
  });

  it('RF-504 says a running run has no report', async () => {
    const { amy, running } = await setup();

    const response = await amy.request({ method: 'GET', url: `/api/runs/${running.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ queueState: 'Running', reportBuilt: false });
  });
});
