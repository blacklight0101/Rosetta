import { describe, expect, it } from 'vitest';
import { PgProviderKeyRepository } from '../../../../src/infrastructure/db/pg-provider-key-repository.js';
import { PgUserRepository } from '../../../../src/infrastructure/db/pg-user-repository.js';
import { AesGcmSecretBox } from '../../../../src/infrastructure/security/aes-gcm-secret-box.js';
import { keyAdditionalData } from '../../../../src/domain/accounts/provider-keys.js';
import { sampleAccount } from '../../../support/account-fixtures.js';
import {
  fixtureKey,
  fixtureSecret,
  sampleKeyRecord,
} from '../../../support/provider-key-fixtures.js';
import { hasTestDatabase, useTestDatabase } from '../../../support/postgres.js';
import { providerKeyRepositoryContract } from '../../../contracts/provider-key-repository.contract.js';

// Architecture section 7, ADR-016, RF-1104: PgProviderKeyRepository passes the contract on the
// disposable PostgreSQL, one migrated schema per test. A stored row holds only the ciphertext, the
// IV, the tag and the last four characters: no column holds the key in clear.
describe.skipIf(!hasTestDatabase)('PgProviderKeyRepository', () => {
  const database = useTestDatabase();

  async function migrated() {
    const { pool } = await database.createSchema({ migrate: true });
    const users = new PgUserRepository(pool);
    const first = sampleAccount();
    const second = sampleAccount();
    await users.insert(first);
    await users.insert(second);
    return { pool, userIds: [first.id, second.id] as const };
  }

  providerKeyRepositoryContract('PgProviderKeyRepository', async () => {
    const { pool, userIds } = await migrated();
    return { repository: new PgProviderKeyRepository(pool), userIds };
  });

  it('RF-1104 the stored row holds no column with the key in clear', async () => {
    const { pool, userIds } = await migrated();
    const box = new AesGcmSecretBox({ current: fixtureSecret(21) });
    const key = fixtureKey('StoredRow1');
    const sealed = box.seal(key, keyAdditionalData(userIds[0], 'anthropic'));
    await new PgProviderKeyRepository(pool).upsert(
      sampleKeyRecord(userIds[0], 'anthropic', { sealed, last4: key.slice(-4) }),
    );

    const rows = await pool.query<Record<string, unknown>>('SELECT * FROM provider_keys');
    const dump = JSON.stringify(rows.rows, (_name, value: unknown) =>
      Buffer.isBuffer(value) ? value.toString('latin1') : value,
    );

    expect(rows.rows).toHaveLength(1);
    expect(dump).not.toContain(key);
    expect(dump).not.toContain(key.slice(0, 12));
    expect(rows.rows[0]).toMatchObject({ last4: 'Row1', key_version: box.keyVersion });
  });
});
