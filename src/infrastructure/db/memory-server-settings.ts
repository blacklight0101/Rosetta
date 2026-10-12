import type { ServerSettings } from '../../application/ports/server-settings.js';
import type { DefaultRoles } from '../../application/projects/default-roles.js';
import type { ServerCaps } from '../../domain/budget/budget.js';

// Architecture section 7, DEC-106, RF-1106: the server settings in memory, for unit tests. Passes
// the same contract suite as PgServerSettings; the caps start at the defaults of migration 0004.

export class MemoryServerSettings implements ServerSettings {
  private readonly roles: DefaultRoles;
  private stored: ServerCaps = {
    runMicros: 500_000n,
    userDayMicros: 1_000_000n,
    serverMonthMicros: 10_000_000n,
  };

  constructor(defaultRoles: DefaultRoles) {
    this.roles = defaultRoles;
  }

  defaultRoles(): Promise<DefaultRoles> {
    return Promise.resolve(this.roles);
  }

  caps(): Promise<ServerCaps> {
    return Promise.resolve(this.stored);
  }

  saveCaps(caps: ServerCaps): Promise<void> {
    this.stored = caps;
    return Promise.resolve();
  }
}
