import { z } from 'zod';
import type {
  LedgerEntry,
  Reservation,
  ReservationKey,
} from '../../application/ports/cost-ledger.js';
import type { CapSpent } from '../../domain/budget/usage-cap.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';

// ADR-016, RF-428, RF-1106, data-model.md section 4: the SQL of PgCostLedger and the mapping of its
// rows. Money and token sums travel as text, so no micro-dollar is lost to a float.

/** Serialises the cap checks of one user (and so of each of their runs) until commit. */
export const LOCK_USER =
  "SELECT pg_advisory_xact_lock(hashtext('rosetta.budget.user'), hashtext($1::text))";
/** Serialises the checks of every call that counts against the server's month (server keys). */
export const LOCK_SERVER = "SELECT pg_advisory_xact_lock(hashtext('rosetta.budget.server'))";

/**
 * What is spent and reserved against each kind of cap, in one statement so the sums read one
 * snapshot: $1 run, $2 user, $3 now (unexpired reservations), $4..$5 the UTC day, $6..$7 the month, $8 the
 * call's role (RF-423).
 * A reservation counts until it expires, whatever day it was made.
 */
export const SPENT = `WITH held AS (
  SELECT user_id, run_id, role, key_source, worst_case_micros, worst_case_tokens
  FROM cost_reservations WHERE expires_at > $3
)
SELECT
  ((SELECT coalesce(sum(cost_micros), 0) FROM cost_ledger WHERE run_id = $1)
    + (SELECT coalesce(sum(worst_case_micros), 0) FROM held WHERE run_id = $1))::text AS run_cost,
  ((SELECT coalesce(sum(input_tokens + output_tokens), 0) FROM cost_ledger WHERE run_id = $1)
    + (SELECT coalesce(sum(worst_case_tokens), 0) FROM held WHERE run_id = $1))::text AS run_tokens,
  ((SELECT coalesce(sum(cost_micros), 0) FROM cost_ledger WHERE run_id = $1 AND role = $8)
    + (SELECT coalesce(sum(worst_case_micros), 0) FROM held
      WHERE run_id = $1 AND role = $8))::text AS role_cost,
  ((SELECT coalesce(sum(input_tokens + output_tokens), 0) FROM cost_ledger
      WHERE run_id = $1 AND role = $8)
    + (SELECT coalesce(sum(worst_case_tokens), 0) FROM held
      WHERE run_id = $1 AND role = $8))::text AS role_tokens,
  ((SELECT coalesce(sum(cost_micros), 0) FROM cost_ledger
      WHERE user_id = $2 AND key_source = 'server' AND at >= $4 AND at < $5)
    + (SELECT coalesce(sum(worst_case_micros), 0) FROM held
      WHERE user_id = $2 AND key_source = 'server'))::text AS user_day,
  ((SELECT coalesce(sum(cost_micros), 0) FROM cost_ledger
      WHERE user_id = $2 AND key_source = 'user' AND at >= $4 AND at < $5)
    + (SELECT coalesce(sum(worst_case_micros), 0) FROM held
      WHERE user_id = $2 AND key_source = 'user'))::text AS own_day,
  ((SELECT coalesce(sum(cost_micros), 0) FROM cost_ledger
      WHERE key_source = 'server' AND at >= $6 AND at < $7)
    + (SELECT coalesce(sum(worst_case_micros), 0) FROM held
      WHERE key_source = 'server'))::text AS server_month`;

export const INSERT_RESERVATION =
  'INSERT INTO cost_reservations (call_id, user_id, run_id, key_source, worst_case_micros, worst_case_tokens, expires_at, role) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';

export const INSERT_ENTRY =
  'INSERT INTO cost_ledger (at, user_id, project_id, run_id, agent_task_id, stage, role, provider, model, call_id, attempt, key_source, input_tokens, output_tokens, cached_input_tokens, usage_source, cost_micros, cost_known, currency, price_table_version, cache_write_input_tokens, cache_write_cost_micros) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)';

/** The reservation of one call of one user's run: $1 call, $2 user, $3 run (null for a provider test). */
export const DELETE_RESERVATION =
  'DELETE FROM cost_reservations WHERE call_id = $1 AND user_id = $2 AND run_id IS NOT DISTINCT FROM $3';

/** P3-99: moves the expiry of one live reservation ($1..$3 as above, $4 the new expiry). */
export const RENEW_RESERVATION =
  'UPDATE cost_reservations SET expires_at = $4 WHERE call_id = $1 AND user_id = $2 AND run_id IS NOT DISTINCT FROM $3';

/** The parameters of DELETE_RESERVATION and the first three of RENEW_RESERVATION. */
export function reservationKeyValues(key: ReservationKey): unknown[] {
  return [key.callId, key.userId, key.runId];
}

export const DELETE_EXPIRED = 'DELETE FROM cost_reservations WHERE expires_at <= $1';

export const RUN_ENTRIES =
  'SELECT at, user_id::text AS user_id, project_id::text AS project_id, run_id::text AS run_id, agent_task_id, stage, role, provider, model, call_id, attempt, key_source, input_tokens::text AS input_tokens, output_tokens::text AS output_tokens, cached_input_tokens::text AS cached_input_tokens, usage_source, cost_micros::text AS cost_micros, cost_known, currency, price_table_version, cache_write_input_tokens::text AS cache_write_input_tokens, cache_write_cost_micros::text AS cache_write_cost_micros FROM cost_ledger WHERE user_id = $1 AND run_id = $2 ORDER BY id';

const integerText = z.string().regex(/^-?\d+$/u);
const count = integerText.transform(Number);

const spentRow = z.object({
  run_cost: integerText,
  run_tokens: integerText,
  role_cost: integerText,
  role_tokens: integerText,
  user_day: integerText,
  own_day: integerText,
  server_month: integerText,
});

const entryRow = z.object({
  at: z.date(),
  user_id: z.string(),
  project_id: z.string().nullable(),
  run_id: z.string().nullable(),
  agent_task_id: z.string().nullable(),
  stage: z.enum(['scan', 'understand', 'verify', 'report', 'plan', 'provider-test']),
  role: z.string(),
  provider: z.string(),
  model: z.string(),
  call_id: z.string(),
  attempt: z.number().int(),
  key_source: z.enum(['user', 'server', 'none']),
  input_tokens: count,
  output_tokens: count,
  cached_input_tokens: count,
  usage_source: z.enum(['reported', 'estimated']),
  cost_micros: integerText,
  cost_known: z.boolean(),
  currency: z.string(),
  price_table_version: z.string(),
  cache_write_input_tokens: count,
  cache_write_cost_micros: integerText,
});

/** The parameters of SPENT for a call of `reservation` at `at`. */
export function spentValues(reservation: Reservation, at: Date): unknown[] {
  const { dayStart, dayEnd, monthStart, monthEnd } = utcPeriodsOf(at);
  const instants = [at.getTime(), dayStart, dayEnd, monthStart, monthEnd];
  return [
    reservation.runId,
    reservation.userId,
    ...instants.map((ms) => new Date(ms)),
    reservation.role,
  ];
}

export function toSpent(row: unknown): CapSpent {
  const parsed = spentRow.parse(row);
  return {
    'run-cost': BigInt(parsed.run_cost),
    'run-tokens': BigInt(parsed.run_tokens),
    'role-cost': BigInt(parsed.role_cost),
    'role-tokens': BigInt(parsed.role_tokens),
    'user-day': BigInt(parsed.user_day),
    'own-day': BigInt(parsed.own_day),
    'server-month': BigInt(parsed.server_month),
  };
}

export function reservationValues(reservation: Reservation): unknown[] {
  const { callId, userId, runId, keySource, worstCase, expiresAt, role } = reservation;
  const { micros, tokens } = worstCase;
  return [callId, userId, runId, keySource, micros.toString(), tokens.toString(), expiresAt, role];
}

export function entryValues(entry: LedgerEntry): unknown[] {
  return [
    ...[entry.at, entry.userId, entry.projectId, entry.runId, entry.agentTaskId, entry.stage],
    ...[entry.role, entry.provider, entry.model, entry.callId, entry.attempt, entry.keySource],
    ...[entry.inputTokens, entry.outputTokens, entry.cachedInputTokens, entry.usageSource],
    ...[entry.costMicros.toString(), entry.costKnown, entry.currency, entry.priceTableVersion],
    ...[entry.cacheWriteInputTokens, entry.cacheWriteCostMicros.toString()],
  ];
}

export function toLedgerEntry(row: unknown): LedgerEntry {
  const parsed = entryRow.parse(row);
  return {
    at: parsed.at,
    userId: parsed.user_id,
    projectId: parsed.project_id,
    runId: parsed.run_id,
    agentTaskId: parsed.agent_task_id,
    stage: parsed.stage,
    role: parsed.role,
    provider: parsed.provider,
    model: parsed.model,
    callId: parsed.call_id,
    attempt: parsed.attempt,
    keySource: parsed.key_source,
    inputTokens: parsed.input_tokens,
    outputTokens: parsed.output_tokens,
    cachedInputTokens: parsed.cached_input_tokens,
    cacheWriteInputTokens: parsed.cache_write_input_tokens,
    usageSource: parsed.usage_source,
    costMicros: BigInt(parsed.cost_micros),
    cacheWriteCostMicros: BigInt(parsed.cache_write_cost_micros),
    costKnown: parsed.cost_known,
    currency: parsed.currency,
    priceTableVersion: parsed.price_table_version,
  };
}
