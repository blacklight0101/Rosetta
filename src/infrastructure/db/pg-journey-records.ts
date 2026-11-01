import { z } from 'zod';
import type { JourneyRecords } from '../../application/ports/journey-records.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { JourneyRecord } from '../../domain/journey/journey-record.js';
import type { DatabasePool } from './pool.js';

// RF-011, RF-1105, ADR-016, ADR-027: the journey of a project in PostgreSQL (data-model.md section
// 4, `journeys`). Plain parameterised SQL; a read takes the owner's id, so another user's project
// has none. A save replaces the project's row.

const FIND =
  'SELECT approved_tokens::text AS tokens, approved_cost_micros::text AS cost, created_at FROM journeys WHERE user_id = $1 AND project_id = $2';
const SAVE =
  'INSERT INTO journeys (project_id, user_id, approved_tokens, approved_cost_micros, created_at) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (project_id) DO UPDATE SET approved_tokens = EXCLUDED.approved_tokens, approved_cost_micros = EXCLUDED.approved_cost_micros, created_at = EXCLUDED.created_at WHERE journeys.user_id = EXCLUDED.user_id';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const counter = z.string().regex(/^\d+$/).transform(Number);
const rowSchema = z.object({ tokens: counter, cost: counter, created_at: z.date() });

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgJourneyRecords implements JourneyRecords {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async find(userId: string, projectId: string): Promise<JourneyRecord | undefined> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return undefined;
    try {
      const [row] = (await this.pool.query<Record<string, unknown>>(FIND, [userId, projectId]))
        .rows;
      if (row === undefined) return undefined;
      const parsed = rowSchema.parse(row);
      return {
        userId,
        projectId,
        approved: { tokens: parsed.tokens, costMicros: parsed.cost },
        createdAt: parsed.created_at.getTime(),
      };
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async save(record: JourneyRecord): Promise<void> {
    try {
      await this.pool.query(SAVE, [
        record.projectId,
        record.userId,
        record.approved.tokens,
        record.approved.costMicros,
        new Date(record.createdAt),
      ]);
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
