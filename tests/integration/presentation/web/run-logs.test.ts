import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1011, RF-009, RF-1105: GET /api/runs/:runId/logs through the server with a session. A user sees
// only the log entries of their own runs; two users' runs may share a run key, so an entry that
// names the key and no user is shown to nobody while the key is shared.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface LogsBody {
  readonly runState: string;
  readonly total: number;
  readonly entries: { readonly message: string; readonly level: string; readonly logger: string }[];
  readonly counts: Record<string, number>;
  readonly securityEvents: number;
}

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly amyRun: Run;
  readonly bobRun: Run;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const amyRun = await test.runs.start(actorOf(amyUser.account), 'understand');
  // A run key is unique per project only: Bob's run has the same key as Amy's.
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
  const bobRun = inserted.value;
  return {
    test,
    amyRun,
    bobRun,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

const logsUrl = (run: Run): string => `/api/runs/${run.id}/logs`;

async function fetchLogs(browser: TestBrowser, run: Run): Promise<LogsBody> {
  const response = await browser.request({ method: 'GET', url: logsUrl(run) });
  expect(response.statusCode).toBe(200);
  return response.json<LogsBody>();
}

const messagesOf = (body: LogsBody): string[] => body.entries.map((entry) => entry.message);

describe('GET /api/runs/:runId/logs', () => {
  it('RF-1011 lists the log entries of the run oldest first, with their levels, loggers and counts', async () => {
    const { test, amy, amyRun } = await setup();
    const own = { runId: amyRun.runKey, userId: amyRun.userId };
    await test.logger.log({ level: 'info', logger: 'runs', message: 'Run started.', ...own });
    await test.logger.log({ level: 'debug', logger: 'agent', message: 'Turn 1.', ...own });
    await test.logger.log({ level: 'warn', logger: 'provider', message: 'Rate limited.', ...own });
    await test.logger.log({ level: 'error', logger: 'provider', message: 'Timed out.', ...own });

    const response = await amy.request({ method: 'GET', url: logsUrl(amyRun) });

    expect(response.headers['cache-control']).toBe('no-store');
    const body = response.json<LogsBody>();
    expect(body.runState).toBe('Running');
    expect(body.total).toBe(4);
    expect(messagesOf(body)).toEqual(['Run started.', 'Turn 1.', 'Rate limited.', 'Timed out.']);
    expect(body.entries.map((entry) => [entry.level, entry.logger])).toEqual([
      ['info', 'runs'],
      ['debug', 'agent'],
      ['warn', 'provider'],
      ['error', 'provider'],
    ]);
    expect(body.counts).toEqual({ debug: 1, info: 1, warn: 1, error: 1 });
    expect(body.securityEvents).toBe(0);
  });

  it('RF-1011 counts the security events of the run', async () => {
    const { test, amy, amyRun } = await setup();
    const own = { runId: amyRun.runKey, userId: amyRun.userId };
    await test.logger.securityEvent(ERROR_CODES.secretMaskingFailed, {
      message: 'Masked a secret.',
      ...own,
    });
    await test.logger.securityEvent(ERROR_CODES.secretMaskingFailed, {
      message: 'Masked another secret.',
      ...own,
    });
    await test.logger.log({ level: 'info', logger: 'runs', message: 'Fine.', ...own });

    const body = await fetchLogs(amy, amyRun);

    expect(body.securityEvents).toBe(2);
    expect(body.entries.filter((entry) => entry.logger === 'security')).toHaveLength(2);
  });
});

describe('GET /api/runs/:runId/logs scoping', () => {
  it('RF-1105 shows a user only the entries of their own runs, even when both runs have the same run key', async () => {
    const { test, amy, bob, amyRun, bobRun } = await setup();
    expect(bobRun.runKey).toBe(amyRun.runKey);
    await test.logger.log({
      level: 'info',
      logger: 'runs',
      message: 'Amy with her id.',
      runId: amyRun.runKey,
      userId: amyRun.userId,
    });
    await test.logger.log({
      level: 'info',
      logger: 'runs',
      message: 'Bob with his id.',
      runId: bobRun.runKey,
      userId: bobRun.userId,
    });
    await test.logger.log({
      level: 'info',
      logger: 'runs',
      message: 'Amy by UUID.',
      runId: amyRun.id,
    });
    await test.logger.log({
      level: 'info',
      logger: 'runs',
      message: 'Bob by UUID.',
      runId: bobRun.id,
    });
    await test.logger.log({
      level: 'error',
      logger: 'runs',
      message: 'Key only, no user.',
      runId: amyRun.runKey,
    });
    await test.logger.log({ level: 'info', logger: 'http', message: 'No run at all.' });

    expect(messagesOf(await fetchLogs(amy, amyRun))).toEqual(['Amy with her id.', 'Amy by UUID.']);
    expect(messagesOf(await fetchLogs(bob, bobRun))).toEqual(['Bob with his id.', 'Bob by UUID.']);
  });
});

describe('GET /api/runs/:runId/logs run key of one user', () => {
  it('RF-1011 shows an entry that names only the run key while no other user has a run with that key', async () => {
    const test = createTestServer();
    current = test;
    const amyUser = await addUser(test, { userName: 'amy' });
    const run = await test.runs.start(actorOf(amyUser.account), 'understand');
    const amy = await signedInBrowser(test.server, amyUser);
    await test.logger.log({
      level: 'warn',
      logger: 'understand',
      message: 'The reader of area "Catalog" ended with no card.',
      runId: run.runKey,
      agentTaskId: 'reader-001',
    });

    const body = await fetchLogs(amy, run);

    expect(messagesOf(body)).toEqual(['The reader of area "Catalog" ended with no card.']);
  });
});

describe('GET /api/runs/:runId/logs size and refusals', () => {
  it('RF-1011 lists the newest 500 entries and counts all of them', async () => {
    const { test, amy, amyRun } = await setup();
    const own = { runId: amyRun.runKey, userId: amyRun.userId };
    for (let index = 1; index <= 502; index += 1) {
      await test.logger.log({
        level: index % 2 === 0 ? 'info' : 'warn',
        logger: 'agent',
        message: `Entry ${String(index)}.`,
        ...own,
      });
    }

    const body = await fetchLogs(amy, amyRun);

    expect(body.total).toBe(502);
    expect(body.entries).toHaveLength(500);
    expect(body.entries[0]?.message).toBe('Entry 3.');
    expect(body.entries.at(-1)?.message).toBe('Entry 502.');
    expect(body.counts).toMatchObject({ info: 251, warn: 251 });
  });
});

describe('GET /api/runs/:runId/logs empty and refused', () => {
  it('RF-1011 answers an empty log for a run that has logged nothing yet', async () => {
    const { amy, amyRun } = await setup();

    const body = await fetchLogs(amy, amyRun);

    expect(body).toMatchObject({ total: 0, entries: [], securityEvents: 0 });
  });

  it("RF-1105 answers another user's run, an unknown run and a malformed id the same way", async () => {
    const { test, bob, amyRun } = await setup();
    await test.logger.log({
      level: 'info',
      logger: 'runs',
      message: 'Secret of Amy.',
      runId: amyRun.runKey,
      userId: amyRun.userId,
    });

    const foreign = await bob.request({ method: 'GET', url: logsUrl(amyRun) });
    const unknown = await bob.request({
      method: 'GET',
      url: '/api/runs/00000000-0000-4000-b000-00000000ffff/logs',
    });
    const malformed = await bob.request({ method: 'GET', url: '/api/runs/not-a-uuid/logs' });

    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(unknown.json());
    expect(foreign.json()).toEqual(malformed.json());
    expect(foreign.body).not.toContain('Secret of Amy.');
  });
});
