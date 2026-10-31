import type { AgentRole } from '../ports/llm-provider.js';
import type { KeySourceLookup } from '../ports/key-source-lookup.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';

// RF-431, RF-1104, DEC-196, EV-44: whether every role a run calls has a usable key, asked before the
// run is queued. It is the budget guard's own choice (`chooseKeySource`, through the lookup), so an
// understand run, a Deepen or a resume that would fail RST-2302 at $0 is refused before any run row
// exists, and the estimate can say which role's key is missing. A local provider needs no key.

export interface RoleKeyDependencies {
  /** Whether the administrator allows the server's keys for the account (RF-1104). */
  readonly users: Pick<UserRepository, 'findById'>;
  readonly keys: KeySourceLookup;
}

// RF-431, RF-1104
export async function rolesWithoutKey(
  deps: RoleKeyDependencies,
  project: Project,
  roles: readonly AgentRole[],
): Promise<readonly AgentRole[]> {
  const account = await deps.users.findById(project.userId);
  const serverKeysAllowed = account?.serverKeysAllowed ?? false;
  const { providers } = project.settings;
  const missing: AgentRole[] = [];
  for (const role of roles) {
    const name = project.settings.roles[role].provider;
    const config = Object.hasOwn(providers, name) ? providers[name] : undefined;
    // A provider the settings do not name is refused by the run itself (RST-0402), not here.
    if (config === undefined) continue;
    const source = await deps.keys.keySourceOf({
      userId: project.userId,
      serverKeysAllowed,
      kind: config.kind,
      keySource: config.keySource,
    });
    if (source === undefined) missing.push(role);
  }
  return missing;
}

/** RF-431: whether a run of these roles would be refused for want of a key; never without the check. */
export async function anyRoleWithoutKey(
  deps: RoleKeyDependencies | undefined,
  project: Project,
  roles: readonly AgentRole[],
): Promise<boolean> {
  if (deps === undefined) return false;
  return (await rolesWithoutKey(deps, project, roles)).length > 0;
}
