import { z } from 'zod';
import type {
  AccountUsage,
  CurrencyTotal,
  UserSpend,
  UserUsage,
} from '../../application/ports/account-usage.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1102: the administration page's usage figures, read-only
// sums over `projects` and `cost_ledger` (data-model.md 3.13: the ledger is the source of every
// total; rows are totalled per currency). Sums travel as text, so no micro-dollar is lost.

const PROJECT_COUNTS =
  'SELECT user_id::text AS user_id, count(*)::int AS projects FROM projects GROUP BY user_id';
const SPENT =
  'SELECT user_id::text AS user_id, currency, sum(cost_micros)::text AS cost_micros FROM cost_ledger WHERE at >= $1 GROUP BY user_id, currency ORDER BY currency COLLATE "C"';

const SERVER_SPENT =
  'SELECT currency, sum(cost_micros)::text AS cost_micros FROM cost_ledger WHERE key_source = \'server\' AND at >= $1 GROUP BY currency ORDER BY currency COLLATE "C"';

const USER_SPENT =
  "SELECT key_source, currency, sum(cost_micros)::text AS cost_micros FROM cost_ledger WHERE user_id = $1 AND at >= $2 AND key_source IN ('server', 'user') GROUP BY key_source, currency ORDER BY currency COLLATE \"C\"";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const projectRow = z.object({ user_id: z.string(), projects: z.number().int() });
const serverRow = z.object({ currency: z.string(), cost_micros: z.string().regex(/^-?\d+$/) });
const userSpentRow = z.object({
  key_source: z.enum(['server', 'user']),
  currency: z.string(),
  cost_micros: z.string().regex(/^-?\d+$/),
});
const spentRow = z.object({
  user_id: z.string(),
  currency: z.string(),
  cost_micros: z.string().regex(/^-?\d+$/),
});

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgAccountUsage implements AccountUsage {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async byUser(since: EpochMs): Promise<ReadonlyMap<string, UserUsage>> {
    let counted: unknown[];
    let summed: unknown[];
    try {
      [counted, summed] = await Promise.all([
        this.pool.query<Record<string, unknown>>(PROJECT_COUNTS).then((result) => result.rows),
        this.pool
          .query<Record<string, unknown>>(SPENT, [new Date(since)])
          .then((result) => result.rows),
      ]);
    } catch (error) {
      throw queryFailed(error);
    }
    const projects = new Map<string, number>();
    for (const row of counted.map((value) => projectRow.parse(value))) {
      projects.set(row.user_id, row.projects);
    }
    const spent = new Map<string, CurrencyTotal[]>();
    for (const row of summed.map((value) => spentRow.parse(value))) {
      const totals = spent.get(row.user_id) ?? [];
      totals.push({ currency: row.currency, costMicros: BigInt(row.cost_micros) });
      spent.set(row.user_id, totals);
    }
    const usage = new Map<string, UserUsage>();
    for (const userId of new Set([...projects.keys(), ...spent.keys()])) {
      usage.set(userId, { projects: projects.get(userId) ?? 0, spent: spent.get(userId) ?? [] });
    }
    return usage;
  }

  // RF-1106, DEC-107
  async userDay(userId: string, since: EpochMs): Promise<UserSpend> {
    // Not a UUID cannot name a user; asking PostgreSQL would fail on the uuid cast.
    if (!UUID.test(userId)) return { server: [], own: [] };
    let rows: Record<string, unknown>[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(USER_SPENT, [userId, new Date(since)]))
        .rows;
    } catch (error) {
      throw queryFailed(error);
    }
    const spend = rows.map((row) => userSpentRow.parse(row));
    const totals = (source: 'server' | 'user'): CurrencyTotal[] =>
      spend
        .filter((row) => row.key_source === source)
        .map((row) => ({ currency: row.currency, costMicros: BigInt(row.cost_micros) }));
    return { server: totals('server'), own: totals('user') };
  }

  // RF-1106
  async serverMonth(since: EpochMs): Promise<readonly CurrencyTotal[]> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(SERVER_SPENT, [
        new Date(since),
      ]);
      return result.rows
        .map((row) => serverRow.parse(row))
        .map((row) => ({ currency: row.currency, costMicros: BigInt(row.cost_micros) }));
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
