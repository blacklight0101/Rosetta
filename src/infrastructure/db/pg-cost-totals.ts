import { z } from 'zod';
import type { CostTotals, LedgerGroup, SummaryGroup } from '../../application/ports/cost-totals.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-428, RF-1010: the ledger sums of the totals pill and the cost
// page, read-only GROUP BY queries over `cost_ledger` (data-model.md 3.13). Sums travel as text, so
// no micro-dollar is lost; a provider test keeps its null run.

const COLUMNS =
  'run_id, stage, role, provider, model, key_source, currency, cost_known, price_table_version';

const GROUPS = (scope: string): string =>
  `SELECT run_id::text AS run_id, stage, role, provider, model, key_source, currency, cost_known, price_table_version, count(*)::int AS calls, sum(input_tokens)::text AS input_tokens, sum(output_tokens)::text AS output_tokens, sum(cached_input_tokens)::text AS cached_input_tokens, sum(cost_micros)::text AS cost_micros, min(at) AS first_at FROM cost_ledger WHERE ${scope} GROUP BY ${COLUMNS} ORDER BY first_at, run_id, stage COLLATE "C", role COLLATE "C", provider COLLATE "C", model COLLATE "C", key_source, currency, cost_known, price_table_version COLLATE "C"`;

const USER_GROUPS = GROUPS('user_id = $1');
const PROJECT_GROUPS = GROUPS('user_id = $1 AND project_id = $2');
/** A provider test is the only row of no project (RF-407, data-model.md 3.13). */
const PROVIDER_TEST_GROUPS = GROUPS('user_id = $1 AND project_id IS NULL');

const integerText = z.string().regex(/^-?\d+$/u);
const count = integerText.transform(Number);

const groupRow = z.object({
  run_id: z.string().nullable(),
  stage: z.enum(['scan', 'understand', 'verify', 'report', 'plan', 'provider-test']),
  role: z.string(),
  provider: z.string(),
  model: z.string(),
  key_source: z.enum(['user', 'server', 'none']),
  currency: z.string(),
  cost_known: z.boolean(),
  price_table_version: z.string(),
  calls: z.number().int(),
  input_tokens: count,
  output_tokens: count,
  cached_input_tokens: count,
  cost_micros: integerText,
  first_at: z.date(),
});

function toGroup(row: unknown): LedgerGroup {
  const parsed = groupRow.parse(row);
  return {
    runId: parsed.run_id,
    stage: parsed.stage,
    role: parsed.role,
    provider: parsed.provider,
    model: parsed.model,
    keySource: parsed.key_source,
    currency: parsed.currency,
    costKnown: parsed.cost_known,
    priceTableVersion: parsed.price_table_version,
    calls: parsed.calls,
    inputTokens: parsed.input_tokens,
    outputTokens: parsed.output_tokens,
    cachedInputTokens: parsed.cached_input_tokens,
    costMicros: BigInt(parsed.cost_micros),
    firstAt: parsed.first_at,
  };
}

export class PgCostTotals implements CostTotals {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  userSummary(_userId: string): Promise<readonly SummaryGroup[]> {
    return Promise.resolve([]);
  }

  // RF-1010
  userGroups(userId: string): Promise<readonly LedgerGroup[]> {
    return this.groups(USER_GROUPS, [userId]);
  }

  // RF-428
  projectGroups(userId: string, projectId: string): Promise<readonly LedgerGroup[]> {
    return this.groups(PROJECT_GROUPS, [userId, projectId]);
  }

  // RF-428
  providerTestGroups(userId: string): Promise<readonly LedgerGroup[]> {
    return this.groups(PROVIDER_TEST_GROUPS, [userId]);
  }

  private async groups(sql: string, params: unknown[]): Promise<readonly LedgerGroup[]> {
    let rows: unknown[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(sql, params)).rows;
    } catch (error) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
    }
    return rows.map(toGroup);
  }
}
