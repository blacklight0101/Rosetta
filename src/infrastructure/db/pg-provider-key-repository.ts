import { z } from 'zod';
import type {
  ProviderKeyRecord,
  ProviderKeyRepository,
  ProviderKeyRow,
} from '../../application/ports/provider-key-repository.js';
import type { SealedSecret } from '../../application/ports/secret-box.js';
import { KEY_PROVIDERS, type KeyProvider } from '../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1104: provider keys in PostgreSQL (`provider_keys`, migration
// 0001). A save is one upsert on (user_id, provider) that keeps `created_at`; `xmax` tells a
// replaced row from a new one. The re-encryption swap is one conditional UPDATE on the key version
// and IV it read. Every row is parsed with its schema; a database failure is RST-2404 with the
// cause.

const COLUMNS =
  'user_id::text AS user_id, provider, base_url, ciphertext, iv, auth_tag, key_version, last4, created_at, updated_at';
const UPSERT =
  'INSERT INTO provider_keys (user_id, provider, base_url, ciphertext, iv, auth_tag, key_version, last4, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ' +
  'ON CONFLICT (user_id, provider) DO UPDATE SET base_url = EXCLUDED.base_url, ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv, auth_tag = EXCLUDED.auth_tag, key_version = EXCLUDED.key_version, last4 = EXCLUDED.last4, updated_at = EXCLUDED.updated_at ' +
  "RETURNING (xmax::text <> '0') AS replaced";
const FIND = `SELECT ${COLUMNS} FROM provider_keys WHERE user_id = $1 AND provider = $2`;
const LIST_FOR_USER = `SELECT ${COLUMNS} FROM provider_keys WHERE user_id = $1 ORDER BY provider COLLATE "C"`;
const DELETE = 'DELETE FROM provider_keys WHERE user_id = $1 AND provider = $2';
const LIST_OUTSIDE = `SELECT ${COLUMNS} FROM provider_keys WHERE key_version <> $1 ORDER BY user_id::text COLLATE "C", provider COLLATE "C"`;
const RESEAL =
  'UPDATE provider_keys SET ciphertext = $3, iv = $4, auth_tag = $5, key_version = $6 WHERE user_id = $1 AND provider = $2 AND key_version = $7 AND iv = $8';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const keyRow = z.object({
  user_id: z.string(),
  provider: z.enum(KEY_PROVIDERS),
  base_url: z.string().nullable(),
  ciphertext: z.instanceof(Uint8Array),
  iv: z.instanceof(Uint8Array),
  auth_tag: z.instanceof(Uint8Array),
  key_version: z.string(),
  last4: z.string(),
  created_at: z.date(),
  updated_at: z.date(),
});

const upsertRow = z.object({ replaced: z.boolean() });

function toRecord(row: unknown): ProviderKeyRecord {
  const parsed = keyRow.parse(row);
  return {
    userId: parsed.user_id,
    provider: parsed.provider,
    baseUrl: parsed.base_url,
    sealed: {
      ciphertext: parsed.ciphertext,
      iv: parsed.iv,
      authTag: parsed.auth_tag,
      keyVersion: parsed.key_version,
    },
    last4: parsed.last4,
    createdAt: parsed.created_at,
    updatedAt: parsed.updated_at,
  };
}

function sealedValues(sealed: SealedSecret): unknown[] {
  return [
    Buffer.from(sealed.ciphertext),
    Buffer.from(sealed.iv),
    Buffer.from(sealed.authTag),
    sealed.keyVersion,
  ];
}

export class PgProviderKeyRepository implements ProviderKeyRepository {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async upsert(record: ProviderKeyRecord): Promise<boolean> {
    const { userId, provider, baseUrl, sealed, last4, createdAt, updatedAt } = record;
    const values = [
      userId,
      provider,
      baseUrl,
      ...sealedValues(sealed),
      last4,
      createdAt,
      updatedAt,
    ];
    const result = await this.run(UPSERT, values);
    return upsertRow.parse(result.rows[0]).replaced;
  }

  async find(userId: string, provider: KeyProvider): Promise<ProviderKeyRecord | undefined> {
    if (!UUID.test(userId)) return undefined;
    const [row] = (await this.run(FIND, [userId, provider])).rows;
    return row === undefined ? undefined : toRecord(row);
  }

  async listForUser(userId: string): Promise<readonly ProviderKeyRecord[]> {
    if (!UUID.test(userId)) return [];
    return (await this.run(LIST_FOR_USER, [userId])).rows.map(toRecord);
  }

  async delete(userId: string, provider: KeyProvider): Promise<boolean> {
    if (!UUID.test(userId)) return false;
    return (await this.run(DELETE, [userId, provider])).count === 1;
  }

  async listOutsideVersion(keyVersion: string): Promise<readonly ProviderKeyRecord[]> {
    return (await this.run(LIST_OUTSIDE, [keyVersion])).rows.map(toRecord);
  }

  async reseal(row: ProviderKeyRow, from: SealedSecret, to: SealedSecret): Promise<boolean> {
    const values = [row.userId, row.provider, ...sealedValues(to), from.keyVersion];
    const result = await this.run(RESEAL, [...values, Buffer.from(from.iv)]);
    return result.count === 1;
  }

  private async run(sql: string, values: unknown[]): Promise<{ rows: unknown[]; count: number }> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(sql, values);
      return { rows: result.rows, count: result.rowCount ?? 0 };
    } catch (error) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
    }
  }
}
