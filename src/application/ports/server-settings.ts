import type { DefaultRoles } from '../projects/default-roles.js';

// Architecture section 7, DEC-106, data-model.md section 4 (`server_settings`): the settings the
// administrator keeps for the whole server. This card reads one of them.

export interface ServerSettings {
  /** The provider and model per role for new projects; `{}` until the administrator sets it. */
  defaultRoles(): Promise<DefaultRoles>;
}
