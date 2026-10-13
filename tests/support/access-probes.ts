import type { InjectOptions } from 'fastify';
import { active, adminOnly, ownerOnly, type Column } from './access-columns.js';
import type { TestUser } from './test-browser.js';

// RF-1105, RF-1009: the shape of a row of the access matrix (tests/integration/access-matrix.test.ts)
// and the rows of the budget routes (RF-1106, DEC-107), of the zip downloads (RF-008) and of the
// answers of a run (RF-1007), kept here so the matrix file stays inside the size limit.

type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';

/** What the rows need to name: the project and runs of the user column and a user id to open. */
export interface Context {
  readonly projectId: string;
  readonly userId: string;
  /** A disabled account, for the enable route. */
  readonly disabledUserId: string;
  /** A run of that user that has ended, so its event stream closes by itself. */
  readonly endedRunId: string;
  /** A run of that user that is running. */
  readonly runningRunId: string;
}

export interface Probe {
  readonly method: Method;
  readonly url: string | ((context: Context) => string);
  /** The body, given the column's own credentials (undefined for anonymous). */
  readonly payload?: (user: TestUser | undefined) => InjectOptions['payload'];
  readonly expected: Readonly<Record<Column, number>>;
}

const capsUrl = '/api/admin/caps';
const rolesUrl = '/api/admin/default-roles';
const roles = { reader: { provider: 'ollama', model: 'gemma4:e4b' } };
const ownCapUrl = '/api/account/daily-cap';
const caps = { runMicros: '500000', userDayMicros: '1000000', serverMonthMicros: '10000000' };
const totalsUrl = '/api/account/totals';
const costUrl = (context: Context): string => `/api/projects/${context.projectId}/cost`;

/**
 * RF-1106, DEC-107: the server caps (administrator) and the user's own daily cap; RF-1010, RF-428:
 * the totals pill and a project's cost page.
 */
export const budgetRoutes: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/account/totals': [{ method: 'GET', url: totalsUrl, expected: active(401, 200) }],
  'HEAD /api/account/totals': [{ method: 'HEAD', url: totalsUrl, expected: active(401, 200) }],
  'GET /api/projects/:id/cost': [
    { method: 'GET', url: costUrl, expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/projects/not-a-uuid/cost', expected: active(401, 404) },
  ],
  'HEAD /api/projects/:id/cost': [{ method: 'HEAD', url: costUrl, expected: ownerOnly(200) }],
  'GET /api/account/daily-cap': [{ method: 'GET', url: ownCapUrl, expected: active(401, 200) }],
  'HEAD /api/account/daily-cap': [{ method: 'HEAD', url: ownCapUrl, expected: active(401, 200) }],
  'PUT /api/account/daily-cap': [
    {
      method: 'PUT',
      url: ownCapUrl,
      payload: () => ({ ownDailyCapMicros: '250000' }),
      expected: active(401, 200),
    },
  ],
  'GET /api/admin/caps': [{ method: 'GET', url: capsUrl, expected: adminOnly(200) }],
  'HEAD /api/admin/caps': [{ method: 'HEAD', url: capsUrl, expected: adminOnly(200) }],
  'PUT /api/admin/caps': [
    { method: 'PUT', url: capsUrl, payload: () => caps, expected: adminOnly(200) },
  ],
  'GET /api/admin/default-roles': [{ method: 'GET', url: rolesUrl, expected: adminOnly(200) }],
  'HEAD /api/admin/default-roles': [{ method: 'HEAD', url: rolesUrl, expected: adminOnly(200) }],
  'PUT /api/admin/default-roles': [
    { method: 'PUT', url: rolesUrl, payload: () => ({ roles }), expected: adminOnly(200) },
  ],
};

const runUrl = (suffix: string, pick: (context: Context) => string) => (context: Context) =>
  `/api/runs/${pick(context)}${suffix}`;

/** RF-008, RF-1105: the zip downloads answer the owner of a finished run, 409 while it runs. */
const exportRoutes: Readonly<Record<string, readonly Probe[]>> = Object.fromEntries(
  ['zip', 'handoff.zip'].map((name) => [
    `GET /api/runs/:runId/${name}`,
    [
      { method: 'GET', url: runUrl(`/${name}`, (c) => c.endedRunId), expected: ownerOnly(200) },
      { method: 'GET', url: runUrl(`/${name}`, (c) => c.runningRunId), expected: ownerOnly(409) },
      { method: 'GET', url: () => `/api/runs/not-a-uuid/${name}`, expected: active(401, 404) },
    ],
  ]),
);

/** A page request: a visitor without a session is sent to sign in (302), not answered 401. */
const pageOwnerOnly = (status: number) => ({
  ...ownerOnly(status),
  anonymous: 302,
  mustChange: 302,
});

/**
 * RF-504, RF-506, RF-1105: the report is built by the owner of a finished run (409 while it runs)
 * and the files of a run folder are read by its owner only.
 */
const reportRoutes: Readonly<Record<string, readonly Probe[]>> = {
  'POST /api/runs/:runId/report': [
    {
      method: 'POST',
      url: runUrl('/report', (c) => c.endedRunId),
      expected: ownerOnly(200),
    },
    {
      method: 'POST',
      url: runUrl('/report', (c) => c.runningRunId),
      expected: ownerOnly(409),
    },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/report', expected: active(401, 404) },
  ],
  'GET /runs/:runId/files/*': [
    {
      method: 'GET',
      url: (c) => `/runs/${c.endedRunId}/files/manifest.json`,
      expected: pageOwnerOnly(200),
    },
    {
      method: 'GET',
      url: (c) => `/runs/${c.endedRunId}/files/missing.json`,
      expected: pageOwnerOnly(404),
    },
    {
      method: 'GET',
      url: () => '/runs/not-a-uuid/files/manifest.json',
      expected: active(302, 404),
    },
  ],
};

const noAnswers = () => ({ answers: [] });

/** RF-1007, RF-1105: the answers of a run answer only its owner. */
const answerRoutes: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/runs/:runId/answers': [
    { method: 'GET', url: runUrl('/answers', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/runs/not-a-uuid/answers', expected: active(401, 404) },
  ],
  'PUT /api/runs/:runId/answers': [
    {
      method: 'PUT',
      url: runUrl('/answers', (c) => c.endedRunId),
      payload: noAnswers,
      expected: ownerOnly(200),
    },
    {
      method: 'PUT',
      url: () => '/api/runs/not-a-uuid/answers',
      payload: noAnswers,
      expected: active(401, 404),
    },
  ],
};

const historyUrl = (context: Context): string => `/api/projects/${context.projectId}/history`;
const snapshotsUrl = '/api/admin/snapshots';

/**
 * RF-1008, RF-1012, RF-1105: the history of a project, the deletion of a run and of a project (409
 * for a run in progress; the project of the matrix has none) and the administrator's snapshot list
 * and deletion.
 */
const historyRoutes: Readonly<Record<string, readonly Probe[]>> = {
  'GET /api/projects/:id/history': [
    { method: 'GET', url: historyUrl, expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/projects/not-a-uuid/history', expected: active(401, 404) },
  ],
  'HEAD /api/projects/:id/history': [{ method: 'HEAD', url: historyUrl, expected: ownerOnly(200) }],
  'DELETE /api/runs/:runId': [
    { method: 'DELETE', url: runUrl('', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'DELETE', url: runUrl('', (c) => c.runningRunId), expected: ownerOnly(409) },
    { method: 'DELETE', url: () => '/api/runs/not-a-uuid', expected: active(401, 404) },
  ],
  'DELETE /api/projects/:id': [
    { method: 'DELETE', url: (c) => `/api/projects/${c.projectId}`, expected: ownerOnly(200) },
    { method: 'DELETE', url: () => '/api/projects/not-a-uuid', expected: active(401, 404) },
  ],
  'GET /api/admin/snapshots': [{ method: 'GET', url: snapshotsUrl, expected: adminOnly(200) }],
  'HEAD /api/admin/snapshots': [{ method: 'HEAD', url: snapshotsUrl, expected: adminOnly(200) }],
  'DELETE /api/admin/snapshots/:key': [
    { method: 'DELETE', url: `${snapshotsUrl}/octo__none@x`, expected: adminOnly(404) },
  ],
};

/** RF-008, RF-504, RF-506, RF-1007, RF-1008, RF-1012, RF-1105: every route that reads or builds the output of a run. */
export const outputRoutes: Readonly<Record<string, readonly Probe[]>> = {
  ...exportRoutes,
  ...reportRoutes,
  ...answerRoutes,
  ...historyRoutes,
};
