import type { ProjectConsents } from '../../application/ports/project-consents.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { DatabasePool } from './pool.js';

// Not built yet (P8-77 red).
export class PgProjectConsents implements ProjectConsents {
  readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  give(): Promise<void> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }

  withdraw(): Promise<number> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }

  list(): Promise<readonly ProjectConsent[]> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }
}
