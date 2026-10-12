import type { KeyProvider } from '../../domain/accounts/provider-keys.js';
import type { SealedSecret } from './secret-box.js';

// Architecture section 7, RF-1104, data-model.md section 4 (`provider_keys`): one sealed key per
// user and provider. Every read and write takes the owner's id; a malformed id finds nothing. The
// start-up re-encryption lists the rows under other key versions and swaps a row's sealed value
// only while the row still holds the value it read, so a save made meanwhile wins.

export interface ProviderKeyRecord {
  readonly userId: string;
  readonly provider: KeyProvider;
  /** Only for `openai-compatible`; null otherwise. */
  readonly baseUrl: string | null;
  readonly sealed: SealedSecret;
  readonly last4: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProviderKeyRow {
  readonly userId: string;
  readonly provider: KeyProvider;
}

export interface ProviderKeyRepository {
  /**
   * Stores the key, replacing the user's key for that provider (its `createdAt` is kept); true
   * when it replaced one.
   */
  upsert(record: ProviderKeyRecord): Promise<boolean>;
  find(userId: string, provider: KeyProvider): Promise<ProviderKeyRecord | undefined>;
  /** The user's keys, ordered by provider. */
  listForUser(userId: string): Promise<readonly ProviderKeyRecord[]>;
  /** Removes the row; false when there was none. */
  delete(userId: string, provider: KeyProvider): Promise<boolean>;
  /** Every row sealed under another key version, ordered by user id then provider. */
  listOutsideVersion(keyVersion: string): Promise<readonly ProviderKeyRecord[]>;
  /** Replaces the sealed value only while the row holds `from`; false otherwise. */
  reseal(row: ProviderKeyRow, from: SealedSecret, to: SealedSecret): Promise<boolean>;
}
