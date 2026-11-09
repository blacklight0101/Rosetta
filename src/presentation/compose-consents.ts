import type { Clock } from '../application/ports/clock.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { SuggestPlanOptions } from '../application/use-cases/suggest-plan-options.js';
import {
  ReadProjectConsent,
  WithdrawProjectConsent,
} from '../application/use-cases/project-consent-reads.js';
import { startConsentsOf, type ConsentCases } from '../application/use-cases/consent-use-cases.js';
import { PgProjectConsents } from '../infrastructure/db/pg-project-consents.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { ConsentServices } from './web/consent-routes.js';
import { composePlanOptions, type PlanOptionsParts } from './compose-plan-options.js';

// RF-143, DEC-209: the consents of a project, which the start of a run, a plan run and a Deepen
// share: a consent given on one start holds for the others for 30 days; the consent routes read
// and withdraw it (P8-81).
export function composeConsents(pool: DatabasePool, clock: Clock): ConsentCases {
  const consents = new PgProjectConsents(pool);
  return startConsentsOf({ consents, clock, ids: new TimestampIdGenerator(clock) });
}

/** RF-143, P8-81: what the consent routes read and withdraw, scoped by the project's owner. */
export function composeConsentRoutes(parts: {
  readonly projects: ProjectRepository;
  readonly consents: ConsentCases;
  readonly ollamaHost?: string | undefined;
}): ConsentServices {
  return {
    readProjectConsent: new ReadProjectConsent(parts),
    withdrawProjectConsent: new WithdrawProjectConsent(parts),
  };
}

/** RF-608, RF-143, P8-81: Plan setup's options and the consent routes, over the starts' consents. */
export function composeConsentServices(
  parts: PlanOptionsParts & { readonly consents: ConsentCases },
): ConsentServices & { readonly suggestPlanOptions: SuggestPlanOptions } {
  return { suggestPlanOptions: composePlanOptions(parts), ...composeConsentRoutes(parts) };
}
