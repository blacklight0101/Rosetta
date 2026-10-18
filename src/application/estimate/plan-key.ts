import type { ServerKeyPresence } from '../ports/server-key-presence.js';
import type { UserRepository } from '../ports/user-repository.js';
import type { Project } from '../projects/project.js';
import { chooseKeySource, keyProviderOf } from '../providers/key-choice.js';
import type { RoleEstimate } from './estimate-types.js';

// RF-613, RF-1104, RST-2302: whether the planner's call would find a key. This is the budget
// guard's own choice (`chooseKeySource`) made before the run, so the estimate cannot say a call
// fits when the run would be refused for want of a key. The user's key counts when the estimate
// found one (`keySource` is `user`); a local model needs none.

export interface PlanKeyDependencies {
  readonly users: Pick<UserRepository, 'findById'>;
  readonly serverKeys: ServerKeyPresence;
}

// RF-613, RF-1104
export async function plannerKeyAvailable(
  deps: PlanKeyDependencies,
  project: Project,
  planner: Pick<RoleEstimate, 'provider' | 'kind' | 'keySource'>,
): Promise<boolean> {
  const config = Object.hasOwn(project.settings.providers, planner.provider)
    ? project.settings.providers[planner.provider]
    : undefined;
  if (config === undefined) return false;
  const account = await deps.users.findById(project.userId);
  const provider = keyProviderOf(planner.kind);
  return chooseKeySource({
    kind: planner.kind,
    keySource: config.keySource,
    hasUserKey: planner.keySource === 'user',
    serverKeysAllowed: account?.serverKeysAllowed ?? false,
    hasServerKey: provider !== undefined && deps.serverKeys.has(provider),
  }).ok;
}
