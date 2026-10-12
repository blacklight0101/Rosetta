import type { ServerSettings } from '../../application/ports/server-settings.js';
import type { DefaultRoles } from '../../application/projects/default-roles.js';

// Architecture section 7, DEC-106: the server settings in memory, for unit tests. Passes the same
// contract suite as PgServerSettings.

export class MemoryServerSettings implements ServerSettings {
  private readonly roles: DefaultRoles;

  constructor(defaultRoles: DefaultRoles) {
    this.roles = defaultRoles;
  }

  defaultRoles(): Promise<DefaultRoles> {
    return Promise.resolve(this.roles);
  }
}
