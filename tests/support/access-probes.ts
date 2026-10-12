import type { InjectOptions } from 'fastify';
import { active, adminOnly, type Column } from './access-columns.js';
import type { TestUser } from './test-browser.js';

// RF-1105, RF-1009: the shape of a row of the access matrix (tests/integration/access-matrix.test.ts)
// and the rows of the budget routes (RF-1106, DEC-107), kept here so the matrix file stays inside
// the size limit.

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
const ownCapUrl = '/api/account/daily-cap';
const caps = { runMicros: '500000', userDayMicros: '1000000', serverMonthMicros: '10000000' };

/** RF-1106, DEC-107: the server caps (administrator) and the user's own daily cap. */
export const budgetRoutes: Readonly<Record<string, readonly Probe[]>> = {
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
};
