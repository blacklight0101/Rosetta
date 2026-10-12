import { keyAdditionalData } from '../../domain/accounts/provider-keys.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { Logger } from '../ports/logger.js';
import type { ProviderKeyRecord, ProviderKeyRepository } from '../ports/provider-key-repository.js';
import type { SecretBox } from '../ports/secret-box.js';

// RF-1104, DEC-112: the start-up step of a key rotation. Every row sealed under another key version
// is opened (with ROSETTA_SECRET_KEY_PREVIOUS) and sealed again under the current key, one
// conditional write per row, so a save made meanwhile wins and a second start changes nothing. A
// row under a version the server does not hold, or one that does not open, is kept as it is and
// reported as a `warn` entry with RST-2300 (user, provider and version only, never a value).

export interface ReEncryptionOutcome {
  readonly reEncrypted: number;
  readonly unreadable: number;
}

export interface ReEncryptProviderKeysDependencies {
  readonly keys: ProviderKeyRepository;
  readonly box: SecretBox;
  readonly logger: Logger;
}

type RowOutcome = 'reEncrypted' | 'unreadable' | 'changedMeanwhile';

export class ReEncryptProviderKeys {
  private readonly deps: ReEncryptProviderKeysDependencies;

  constructor(deps: ReEncryptProviderKeysDependencies) {
    this.deps = deps;
  }

  // RF-1104
  async execute(): Promise<ReEncryptionOutcome> {
    const { keys, box, logger } = this.deps;
    const rows = await keys.listOutsideVersion(box.keyVersion);
    let reEncrypted = 0;
    let unreadable = 0;
    for (const row of rows) {
      const outcome = await this.reEncrypt(row);
      if (outcome === 'reEncrypted') reEncrypted += 1;
      if (outcome === 'unreadable') unreadable += 1;
    }
    if (rows.length > 0) {
      await logger.log({
        level: unreadable > 0 ? 'warn' : 'info',
        logger: 'keys',
        message: `Re-encrypted ${String(reEncrypted)} provider key(s) under the current secret; ${String(unreadable)} could not be read.`,
        data: { reEncrypted, unreadable, keyVersion: box.keyVersion },
      });
    }
    return { reEncrypted, unreadable };
  }

  private async reEncrypt(row: ProviderKeyRecord): Promise<RowOutcome> {
    const { keys, box } = this.deps;
    const additionalData = keyAdditionalData(row.userId, row.provider);
    const opened = box.open(row.sealed, additionalData);
    if (!opened.ok) {
      await this.report(row);
      return 'unreadable';
    }
    const resealed = box.seal(opened.value, additionalData);
    const swapped = await keys.reseal(row, row.sealed, resealed);
    return swapped ? 'reEncrypted' : 'changedMeanwhile';
  }

  private async report(row: ProviderKeyRecord): Promise<void> {
    const known = this.deps.box.knows(row.sealed.keyVersion);
    await this.deps.logger.log({
      level: 'warn',
      logger: 'keys',
      code: ERROR_CODES.providerKeyUnreadable,
      message:
        'A stored provider key could not be re-encrypted; it is kept as it is and its owner must save it again.',
      userId: row.userId,
      data: {
        provider: row.provider,
        keyVersion: row.sealed.keyVersion,
        reason: known ? 'does not open' : 'unknown key version',
      },
    });
  }
}
