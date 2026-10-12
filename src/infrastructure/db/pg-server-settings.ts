import { z } from 'zod';
import type { ServerSettings } from '../../application/ports/server-settings.js';
import { defaultRolesSchema, type DefaultRoles } from '../../application/projects/default-roles.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, DEC-106: the server settings in `server_settings`. A value of a
// shape the application does not know is refused (RST-1000 with the cause) rather than guessed, so
// a wrong default model never reaches a new project.

const SELECT_DEFAULT_ROLES = "SELECT value FROM server_settings WHERE key = 'defaultRoles'";
const valueRow = z.object({ value: z.unknown() });

export class PgServerSettings implements ServerSettings {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async defaultRoles(): Promise<DefaultRoles> {
    let rows: unknown[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(SELECT_DEFAULT_ROLES)).rows;
    } catch (error) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
    }
    const [row] = rows;
    if (row === undefined) return {};
    const parsed = defaultRolesSchema.safeParse(valueRow.parse(row).value);
    if (!parsed.success) {
      throw new RosettaError(
        ERROR_CODES.configurationInvalid,
        'The server setting defaultRoles is not valid.',
        { cause: parsed.error },
      );
    }
    return parsed.data;
  }
}
