import type { ServerSettings } from '../ports/server-settings.js';
import { builtInRolesOf, type DefaultRoles } from '../projects/default-roles.js';
import type { ProjectSettings } from '../projects/project-settings.js';

// DEC-106: the administrator reads the default models per role for new projects; `{}` until they
// are set, and then the template's models apply: `builtIn` names them. The route allows
// administrators only.

export class GetDefaultRoles {
  private readonly settings: ServerSettings;
  private readonly template: ProjectSettings;

  constructor(deps: { readonly settings: ServerSettings; readonly template: ProjectSettings }) {
    this.settings = deps.settings;
    this.template = deps.template;
  }

  // DEC-106
  execute(): Promise<DefaultRoles> {
    return this.settings.defaultRoles();
  }

  /** The models a role has when nothing is set for it. */
  // DEC-106
  builtIn(): DefaultRoles {
    return builtInRolesOf(this.template);
  }
}
