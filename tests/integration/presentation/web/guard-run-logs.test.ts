import { afterEach, describe, expect, it } from 'vitest';
import type { RoleProvider } from '../../../../src/application/providers/provider-set.js';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { failureOf } from '../../../support/failure-of.js';
import {
  callFor,
  factoryAccount,
  factoryHarness,
  serverKeyText,
  settingsFor,
} from '../../../support/provider-factory-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1011, RF-009, RF-1105: the run's own egress and budget guards write security events and cap
// refusals under the run key. They reach the run owner's Logs panel and security-event count, and
// nobody else's, even when another user's run has the same key.

const openAiSettings = settingsFor({ reader: { provider: 'openai', model: 'contract-model' } });

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface LogsBody {
  readonly entries: { readonly message: string; readonly logger: string }[];
  readonly securityEvents: number;
}

interface Setup {
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly amyRun: Run;
  readonly bobRun: Run;
  readonly reader: (caps?: Caps) => Promise<RoleProvider>;
}

interface Caps {
  runMicros: bigint;
}

/** The reader of the run, built by a real factory that logs into the server's application log. */
async function readerOf(test: TestServer, run: Run, caps?: Caps): Promise<RoleProvider> {
  const harness = factoryHarness({
    logger: test.logger,
    serverKeys: { openai: serverKeyText },
    ...(caps === undefined
      ? {}
      : { caps: { ...caps, userDayMicros: 1_000_000n, serverMonthMicros: 10_000_000n } }),
  });
  const owned = {
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    stage: 'understand',
  } as const;
  const built = await harness.factory.build(
    harness.request({
      roles: ['reader'],
      settings: openAiSettings,
      run: owned,
      account: { ...factoryAccount, id: run.userId },
      cloudConsent: caps !== undefined,
    }),
  );
  const found = built.ok ? built.value.get('reader') : undefined;
  if (found === undefined) throw new Error('The reader was not built.');
  return found;
}

/** Amy's run and Bob's run with the same key, and a factory that logs into the server's log. */
async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const amyRun = await test.runs.start(actorOf(amyUser.account), 'understand');
  const inserted = await test.runs.runs.insert(
    sampleRun({
      userId: bobUser.account.id,
      projectId: '00000000-0000-4000-a000-0000000000b1',
      runKey: amyRun.runKey,
      queuedAt: amyRun.queuedAt,
      stage: 'understand',
    }),
  );
  if (!inserted.ok) throw new Error('The run of Bob was not stored');
  const reader = (caps?: Caps): Promise<RoleProvider> => readerOf(test, amyRun, caps);
  return {
    amyRun,
    bobRun: inserted.value,
    reader,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

async function fetchLogs(browser: TestBrowser, run: Run): Promise<LogsBody> {
  const response = await browser.request({ method: 'GET', url: `/api/runs/${run.id}/logs` });
  expect(response.statusCode).toBe(200);
  return response.json<LogsBody>();
}

/** A call of the run: its context names the run key, as a reader task does. */
function callOf(run: Run): ReturnType<typeof callFor> {
  const base = callFor('reader', 'contract-model');
  return { ...base, context: { ...base.context, runId: run.runKey } };
}

describe('the guards of a run log through the run owner', () => {
  it('RF-1011 shows the owner an egress security event of the run and counts it', async () => {
    const { amy, amyRun, reader } = await setup();
    const provider = await reader();

    const failure = await failureOf(provider.provider.complete(callOf(amyRun)));

    expect(failure).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    const body = await fetchLogs(amy, amyRun);
    expect(body.entries.filter((entry) => entry.logger === 'security')).toHaveLength(1);
    expect(body.securityEvents).toBe(1);
  });

  it('RF-1011 shows the owner a budget-cap refusal of the run', async () => {
    const { amy, amyRun, reader } = await setup();
    const provider = await reader({ runMicros: 1n });

    const failure = await failureOf(provider.provider.complete(callOf(amyRun)));

    expect(failure).toMatchObject({ code: ERROR_CODES.budgetCapReached });
    const body = await fetchLogs(amy, amyRun);
    expect(body.entries.filter((entry) => entry.logger === 'budget')).toHaveLength(1);
  });

  it('RF-1105 shows another user with the same run key none of them', async () => {
    const { bob, bobRun, reader, amyRun } = await setup();
    await failureOf((await reader()).provider.complete(callOf(amyRun)));
    await failureOf((await reader({ runMicros: 1n })).provider.complete(callOf(amyRun)));

    const body = await fetchLogs(bob, bobRun);

    expect(body.entries).toEqual([]);
    expect(body.securityEvents).toBe(0);
  });
});
