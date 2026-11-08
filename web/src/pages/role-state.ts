import type { ProjectSettings } from '../api/project-schemas.js';
import type { KeyAccess } from '../api/schemas.js';
import type { ModelListState } from './model-lists.js';
import type { RoleName } from './project-settings-form.js';

// RF-436, P8-135: the State column of the Roles table (not built yet).

export type RoleState = 'key-ready' | 'no-key' | 'reachable' | 'not-reachable';

type RoleStates = (
  settings: ProjectSettings,
  roles: Readonly<Record<RoleName, { readonly provider: string }>>,
  access: readonly KeyAccess[] | undefined,
  ollama: ModelListState | undefined,
) => Readonly<Record<RoleName, RoleState | undefined>>;

// RF-436
export const roleStates: RoleStates = () => ({
  reader: undefined,
  verifier: undefined,
  planner: undefined,
  summariser: undefined,
});
