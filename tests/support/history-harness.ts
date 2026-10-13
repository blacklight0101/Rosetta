import { vi } from 'vitest';
import { actorOf } from '../../src/domain/accounts/actor.js';
import type { Run } from '../../src/domain/runs/run.js';
import { addUser, signedInBrowser, type TestBrowser } from './test-browser.js';
import { createTestServer, type TestServer } from './web-server.js';

// RF-1008, RF-1012, RF-1105: a server with amy's project (octo/webforms) holding one scan that
// completed, with a commit and a folder, and one run that goes on after it; bob and an
// administrator are signed in beside her.

export const completedCommit = 'a'.repeat(40);
export const completedSnapshot = `octo__webforms@${completedCommit}`;

export interface HistoryHarness {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly root: TestBrowser;
  readonly projectId: string;
  readonly userId: string;
  /** Amy's scan that completed with a commit; its folder holds 5 bytes, the project folder 2. */
  readonly done: Run;
  /** Amy's next run: it has started and goes on until a test settles it. */
  readonly live: Run;
}

// RF-1012
export async function createHistoryHarness(): Promise<HistoryHarness> {
  const test = createTestServer();
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const rootUser = await addUser(test, { userName: 'root', role: 'admin' });
  const amy = await signedInBrowser(test.server, amyUser);
  const created = await amy.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://github.com/octo/webforms' },
  });
  const projectId = created.json<{ id: string }>().id;
  const userId = amyUser.account.id;
  const project = await test.projects.find(userId, projectId);
  if (project === undefined) throw new Error('The project was not stored');
  const submit = async (): Promise<Run> => {
    const actor = actorOf(amyUser.account);
    const outcome = await test.runs.submit.execute({ actor, project, stage: 'scan', options: {} });
    if (!outcome.ok) throw new Error('The run was not accepted');
    return outcome.value.run;
  };
  const first = await submit();
  await test.runs.runs.recordSource(first.id, {
    commitSha: completedCommit,
    snapshotKey: completedSnapshot,
  });
  await test.runs.runs.recordTotals(first.id, {
    ...{ costMicros: 1_310_000, inputTokens: 400_000, outputTokens: 12_606 },
    cachedInputTokens: 0,
  });
  test.runs.executor.settle(first.id, { endState: 'Completed' });
  const done = await test.runs.ended(first);
  test.clock.advance(60_000);
  const live = await submit();
  await vi.waitFor(() => {
    if (test.runs.executor.started.length < 2) throw new Error('The second run has not started');
  });
  const folder = { userId, projectId };
  test.folders.seed({ ...folder, runKey: done.runKey }, { 'manifest.json': '12345' });
  test.folders.seed(folder, { 'codemap.json': '12' });
  return {
    ...{ test, amy, projectId, userId, done, live },
    bob: await signedInBrowser(test.server, bobUser),
    root: await signedInBrowser(test.server, rootUser),
  };
}
