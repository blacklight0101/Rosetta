import type { CapServices } from '../../src/presentation/web/cap-routes.js';
import type { DefaultRoleServices } from '../../src/presentation/web/default-role-routes.js';
import { GetCaps } from '../../src/application/use-cases/get-caps.js';
import { GetDefaultRoles } from '../../src/application/use-cases/get-default-roles.js';
import { GetOwnDailyCap } from '../../src/application/use-cases/get-own-daily-cap.js';
import { SetCaps } from '../../src/application/use-cases/set-caps.js';
import { SetDefaultRoles } from '../../src/application/use-cases/set-default-roles.js';
import { SetOwnDailyCap } from '../../src/application/use-cases/set-own-daily-cap.js';
import type { Logger } from '../../src/application/ports/logger.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type { AuditLog } from '../../src/application/ports/audit-log.js';
import type { ServerSettings } from '../../src/application/ports/server-settings.js';
import type { UserRepository } from '../../src/application/ports/user-repository.js';

// RF-1106, DEC-107, DEC-106: the cap and default-model use cases over memory adapters, for the
// test servers.

export interface CapParts {
  readonly serverSettings: ServerSettings;
  readonly users: UserRepository;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

export function capServices(parts: CapParts): CapServices & DefaultRoleServices {
  const { serverSettings: settings, users, auditLog, logger, clock } = parts;
  return {
    getCaps: new GetCaps({ settings }),
    setCaps: new SetCaps({ settings, auditLog, logger, clock }),
    getDefaultRoles: new GetDefaultRoles({ settings }),
    setDefaultRoles: new SetDefaultRoles({ settings, auditLog, logger, clock }),
    getOwnDailyCap: new GetOwnDailyCap({ users }),
    setOwnDailyCap: new SetOwnDailyCap({ users, auditLog, logger, clock }),
  };
}
