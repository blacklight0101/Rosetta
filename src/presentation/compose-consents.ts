import type { StartConsents } from '../application/consent/start-consent.js';
import type { Clock } from '../application/ports/clock.js';
import { startConsentsOf } from '../application/use-cases/consent-use-cases.js';
import { PgProjectConsents } from '../infrastructure/db/pg-project-consents.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';

// RF-143, DEC-209: the consents of a project, which the start of a run, a plan run and a Deepen
// share: a consent given on one start holds for the others for 30 days.
export function composeConsents(pool: DatabasePool, clock: Clock): StartConsents {
  const consents = new PgProjectConsents(pool);
  return startConsentsOf({ consents, clock, ids: new TimestampIdGenerator(clock) });
}
