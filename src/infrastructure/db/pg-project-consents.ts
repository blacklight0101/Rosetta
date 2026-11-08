import { z } from 'zod';
import type { ProjectConsents } from '../../application/ports/project-consents.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// RF-143, RF-142, RF-1105, DEC-209, ADR-016: the consents of a project in PostgreSQL (data-model.md
// section 4, `project_consent`, migration 0025). Plain parameterised SQL. Every statement names the
// owner: a consent is written only for a project the user owns (else RST-2003), a withdrawal and a
// read never reach another user's project. A withdrawal keeps the row and sets its time.

const GIVE =
  'INSERT INTO project_consent (id, project_id, user_id, providers, kinds, given_at, withdrawn_at) SELECT $1, id, user_id, $4::text[], $5::text[], $6, NULL FROM projects WHERE id = $2 AND user_id = $3';
const WITHDRAW =
  'UPDATE project_consent SET withdrawn_at = $3 WHERE user_id = $1 AND project_id = $2 AND withdrawn_at IS NULL';
const LIST =
  'SELECT id, providers, kinds, given_at, withdrawn_at FROM project_consent WHERE user_id = $1 AND project_id = $2 ORDER BY given_at DESC, id DESC';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rowSchema = z.object({
  id: z.string(),
  providers: z.array(z.enum(['anthropic', 'openai', 'openai-compatible', 'ollama'])),
  kinds: z.array(z.enum(['cloud', 'private-code'])),
  given_at: z.date(),
  withdrawn_at: z.date().nullable(),
});

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgProjectConsents implements ProjectConsents {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async give(consent: ProjectConsent): Promise<void> {
    if (!UUID.test(consent.userId) || !UUID.test(consent.projectId)) {
      throw new RosettaError(ERROR_CODES.notFound);
    }
    let written: number | null;
    try {
      const result = await this.pool.query(GIVE, [
        consent.id,
        consent.projectId,
        consent.userId,
        [...consent.providers],
        [...consent.kinds],
        new Date(consent.givenAt),
      ]);
      written = result.rowCount;
    } catch (error) {
      throw queryFailed(error);
    }
    // RF-1105: no project of that owner, so no row; that is not found.
    if (written !== 1) throw new RosettaError(ERROR_CODES.notFound);
  }

  async withdraw(userId: string, projectId: string, at: EpochMs): Promise<number> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return 0;
    try {
      const result = await this.pool.query(WITHDRAW, [userId, projectId, new Date(at)]);
      return result.rowCount ?? 0;
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async list(userId: string, projectId: string): Promise<readonly ProjectConsent[]> {
    if (!UUID.test(userId) || !UUID.test(projectId)) return [];
    try {
      const { rows } = await this.pool.query<Record<string, unknown>>(LIST, [userId, projectId]);
      return rows.map((row) => {
        const parsed = rowSchema.parse(row);
        return {
          id: parsed.id,
          userId,
          projectId,
          providers: parsed.providers,
          kinds: parsed.kinds,
          givenAt: parsed.given_at.getTime(),
          withdrawnAt: parsed.withdrawn_at?.getTime() ?? null,
        };
      });
    } catch (error) {
      throw queryFailed(error);
    }
  }
}
