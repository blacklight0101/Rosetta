import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import { BootstrapAdmin } from '../application/use-cases/bootstrap-admin.js';
import { ERROR_CODES } from '../domain/errors/codes.js';
import { describeError } from '../domain/errors/descriptions.js';
import { RosettaError } from '../domain/errors/rosetta-error.js';
import type { Environment } from '../infrastructure/config/environment.js';
import { PgAuditLog } from '../infrastructure/db/pg-audit-log.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import {
  commonPasswordsFile,
  loadCommonPasswords,
} from '../infrastructure/security/common-passwords.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';

// Architecture section 2 (composition root), RF-1102: the account adapters and the start-up step
// that creates the bootstrap administrator. A refused bootstrap stops the start-up with the rule's
// RST code; the error names the variable, never its value.

export interface AccountParts {
  readonly environment: Pick<Environment, 'adminUser' | 'adminPassword'>;
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
}

// RF-1102
export async function bootstrapAdministrator(parts: AccountParts): Promise<void> {
  const { environment, pool, logger, clock, masker } = parts;
  const bootstrap = new BootstrapAdmin({
    users: new PgUserRepository(pool),
    hasher: new ScryptPasswordHasher(),
    auditLog: new PgAuditLog(pool, masker),
    logger,
    clock,
    ids: new TimestampIdGenerator(clock),
    commonPasswords: await loadCommonPasswords(commonPasswordsFile),
  });
  const outcome = await bootstrap.execute({
    userName: environment.adminUser,
    password: environment.adminPassword,
  });
  if (!outcome.ok) {
    const variable =
      outcome.error === ERROR_CODES.userNameInvalid
        ? 'ROSETTA_ADMIN_USER'
        : 'ROSETTA_ADMIN_PASSWORD';
    throw new RosettaError(
      outcome.error,
      `${variable} was refused, so no administrator was created: ${describeError(outcome.error).message}`,
    );
  }
}
