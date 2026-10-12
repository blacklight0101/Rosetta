import { z } from 'zod';
import type { ServerSettings, SettingChange } from '../../application/ports/server-settings.js';
import { defaultRolesSchema, type DefaultRoles } from '../../application/projects/default-roles.js';
import type { ServerCaps } from '../../domain/budget/budget.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, DEC-106, RF-1106: the server settings in `server_settings`. A
// value of a shape the application does not know is refused (RST-1000 with the cause) rather than
// guessed, so a wrong default model never reaches a new project and a broken cap never lets a call
// through. Caps are stored as JSON numbers of micro-dollars (whole numbers within the safe range)
// and read back as bigint.

const SELECT_VALUE = 'SELECT value FROM server_settings WHERE key = $1';
const UPSERT_VALUE =
  'INSERT INTO server_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, $3, $4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by';
const valueRow = z.object({ value: z.unknown() });

const micros = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const capsSchema = z.strictObject({
  runMicros: micros,
  userDayMicros: micros,
  serverMonthMicros: micros,
});

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

function invalidSetting(key: string, cause: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.configurationInvalid,
    `The server setting ${key} is not valid.`,
    {
      cause,
    },
  );
}

export class PgServerSettings implements ServerSettings {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async defaultRoles(): Promise<DefaultRoles> {
    const value = await this.value('defaultRoles');
    if (value === undefined) return {};
    const parsed = defaultRolesSchema.safeParse(value);
    if (!parsed.success) throw invalidSetting('defaultRoles', parsed.error);
    return parsed.data;
  }

  // RF-1106
  async caps(): Promise<ServerCaps> {
    const parsed = capsSchema.safeParse(await this.value('caps'));
    if (!parsed.success) throw invalidSetting('caps', parsed.error);
    const { runMicros, userDayMicros, serverMonthMicros } = parsed.data;
    return {
      runMicros: BigInt(runMicros),
      userDayMicros: BigInt(userDayMicros),
      serverMonthMicros: BigInt(serverMonthMicros),
    };
  }

  // RF-1106
  async saveCaps(caps: ServerCaps, change: SettingChange): Promise<void> {
    const largest = BigInt(Number.MAX_SAFE_INTEGER);
    if (Object.values(caps).some((cap) => cap < 0n || cap > largest)) {
      throw invalidSetting('caps', undefined);
    }
    const value = {
      runMicros: Number(caps.runMicros),
      userDayMicros: Number(caps.userDayMicros),
      serverMonthMicros: Number(caps.serverMonthMicros),
    };
    try {
      await this.pool.query(UPSERT_VALUE, ['caps', JSON.stringify(value), change.at, change.by]);
    } catch (error) {
      throw queryFailed(error);
    }
  }

  private async value(key: string): Promise<unknown> {
    let rows: unknown[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(SELECT_VALUE, [key])).rows;
    } catch (error) {
      throw queryFailed(error);
    }
    const [row] = rows;
    return row === undefined ? undefined : valueRow.parse(row).value;
  }
}
