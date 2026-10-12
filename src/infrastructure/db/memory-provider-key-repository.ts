import type {
  ProviderKeyRecord,
  ProviderKeyRepository,
  ProviderKeyRow,
} from '../../application/ports/provider-key-repository.js';
import type { SealedSecret } from '../../application/ports/secret-box.js';
import type { KeyProvider } from '../../domain/accounts/provider-keys.js';

// Architecture section 7, RF-1104: provider keys in memory, for tests. Like the PostgreSQL adapter
// it keeps one row per user and provider, copies every byte array in and out, and passes the same
// contract suite.

function copy(sealed: SealedSecret): SealedSecret {
  return {
    ciphertext: Buffer.from(sealed.ciphertext),
    iv: Buffer.from(sealed.iv),
    authTag: Buffer.from(sealed.authTag),
    keyVersion: sealed.keyVersion,
  };
}

function copied(record: ProviderKeyRecord): ProviderKeyRecord {
  return {
    ...record,
    sealed: copy(record.sealed),
    createdAt: new Date(record.createdAt.getTime()),
    updatedAt: new Date(record.updatedAt.getTime()),
  };
}

function rowKey(userId: string, provider: KeyProvider): string {
  return `${userId.toLowerCase()} ${provider}`;
}

function sameSealed(left: SealedSecret, right: SealedSecret): boolean {
  return left.keyVersion === right.keyVersion && Buffer.from(left.iv).equals(Buffer.from(right.iv));
}

/** Code-unit order, as the PostgreSQL adapter sorts with the "C" collation. */
function compareText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function byUserThenProvider(left: ProviderKeyRecord, right: ProviderKeyRecord): number {
  return compareText(left.userId, right.userId) || compareText(left.provider, right.provider);
}

export class MemoryProviderKeyRepository implements ProviderKeyRepository {
  private readonly rows = new Map<string, ProviderKeyRecord>();

  upsert(record: ProviderKeyRecord): Promise<boolean> {
    const key = rowKey(record.userId, record.provider);
    const existing = this.rows.get(key);
    const createdAt = existing?.createdAt ?? record.createdAt;
    this.rows.set(key, copied({ ...record, createdAt }));
    return Promise.resolve(existing !== undefined);
  }

  find(userId: string, provider: KeyProvider): Promise<ProviderKeyRecord | undefined> {
    const found = this.rows.get(rowKey(userId, provider));
    return Promise.resolve(found === undefined ? undefined : copied(found));
  }

  listForUser(userId: string): Promise<readonly ProviderKeyRecord[]> {
    return Promise.resolve(
      this.matching((record) => record.userId.toLowerCase() === userId.toLowerCase()),
    );
  }

  delete(userId: string, provider: KeyProvider): Promise<boolean> {
    return Promise.resolve(this.rows.delete(rowKey(userId, provider)));
  }

  listOutsideVersion(keyVersion: string): Promise<readonly ProviderKeyRecord[]> {
    return Promise.resolve(this.matching((record) => record.sealed.keyVersion !== keyVersion));
  }

  reseal(row: ProviderKeyRow, from: SealedSecret, to: SealedSecret): Promise<boolean> {
    const key = rowKey(row.userId, row.provider);
    const stored = this.rows.get(key);
    if (stored === undefined || !sameSealed(stored.sealed, from)) return Promise.resolve(false);
    this.rows.set(key, { ...stored, sealed: copy(to) });
    return Promise.resolve(true);
  }

  private matching(keep: (record: ProviderKeyRecord) => boolean): ProviderKeyRecord[] {
    return [...this.rows.values()].filter(keep).sort(byUserThenProvider).map(copied);
  }
}
