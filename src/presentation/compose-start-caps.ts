import type { KeySourceLookup } from '../application/ports/key-source-lookup.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import { StartCaps } from '../application/runs/run-start-caps.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import { keySourceLookupOf } from '../infrastructure/providers/key-source-lookup.js';
import type { Environment } from '../infrastructure/config/environment.js';
import type { ServerKeys } from '../infrastructure/providers/provider-access.js';

// RF-1106, DEC-107 (P3-91): the start caps of a run, and the key each role would use, read with the
// same server keys as the provider factory (compose-providers.ts).

/** Whether a role would use the user's own key or the server's (RF-1104), for the start caps. */
export function composeKeySources(
  pool: DatabasePool,
  environment: Pick<Environment, 'openaiApiKey' | 'anthropicApiKey'>,
): KeySourceLookup {
  const serverKeys: ServerKeys = {
    openai: environment.openaiApiKey,
    anthropic: environment.anthropicApiKey,
  };
  return keySourceLookupOf({ keys: new PgProviderKeyRepository(pool), serverKeys });
}

/** The caps `run.started` records for each run (RF-1106). */
export function composeStartCaps(
  pool: DatabasePool,
  projects: ProjectRepository,
  keys: KeySourceLookup,
): StartCaps {
  return new StartCaps({
    projects,
    users: new PgUserRepository(pool),
    serverSettings: new PgServerSettings(pool),
    keys,
  });
}
