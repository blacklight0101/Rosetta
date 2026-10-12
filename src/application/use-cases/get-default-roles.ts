import type { ServerSettings } from '../ports/server-settings.js';
import type { DefaultRoles } from '../projects/default-roles.js';

// DEC-106: the administrator reads the default models per role for new projects; `{}` until they
// are set. The route allows administrators only.

export class GetDefaultRoles {
  private readonly settings: ServerSettings;

  constructor(deps: { readonly settings: ServerSettings }) {
    this.settings = deps.settings;
  }

  // DEC-106
  execute(): Promise<DefaultRoles> {
    return this.settings.defaultRoles();
  }
}
