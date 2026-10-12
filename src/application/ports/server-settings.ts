import type { ServerCaps } from '../../domain/budget/budget.js';
import type { DefaultRoles } from '../projects/default-roles.js';

// Architecture section 7, DEC-106, DEC-107, data-model.md section 4 (`server_settings`): the
// settings the administrator keeps for the whole server: the default models of new projects and
// the usage caps on the server keys (RF-1106; caps are server settings, not environment variables).

/** Who changed a setting, and when. */
export interface SettingChange {
  readonly by: string;
  readonly at: Date;
}

export interface ServerSettings {
  /** The provider and model per role for new projects; `{}` until the administrator sets it. */
  defaultRoles(): Promise<DefaultRoles>;
  /** Replaces the default models; a role left out keeps the template's model (DEC-106). */
  saveDefaultRoles(roles: DefaultRoles, change: SettingChange): Promise<void>;
  /** The run, user-day and server-month caps in micro-dollars (defaults of migration 0004). */
  caps(): Promise<ServerCaps>;
  saveCaps(caps: ServerCaps, change: SettingChange): Promise<void>;
}
