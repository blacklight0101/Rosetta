import type { Actor } from '../../domain/accounts/actor.js';
import type { ConsentNeed, ProjectConsent } from '../../domain/consent/project-consent.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProjectConsents } from '../ports/project-consents.js';

export interface ConsentDependencies {
  readonly consents: ProjectConsents;
  readonly clock: Clock;
  readonly ids: Pick<IdGenerator, 'uuid'>;
}

interface ProjectOwner {
  readonly actor: Actor;
  readonly projectId: string;
}

export class GiveConsent {
  private readonly deps: ConsentDependencies;

  constructor(deps: ConsentDependencies) {
    this.deps = deps;
  }

  execute(request: ProjectOwner & { readonly need: ConsentNeed }): Promise<ProjectConsent> {
    return Promise.reject(new Error(`Not built: ${request.projectId} ${typeof this.deps}`));
  }
}

export class HeldConsent {
  private readonly deps: ConsentDependencies;

  constructor(deps: ConsentDependencies) {
    this.deps = deps;
  }

  execute(
    request: ProjectOwner & { readonly need: ConsentNeed },
  ): Promise<ProjectConsent | undefined> {
    return Promise.reject(new Error(`Not built: ${request.projectId} ${typeof this.deps}`));
  }
}

export class WithdrawConsent {
  private readonly deps: ConsentDependencies;

  constructor(deps: ConsentDependencies) {
    this.deps = deps;
  }

  execute(request: ProjectOwner): Promise<number> {
    return Promise.reject(new Error(`Not built: ${request.projectId} ${typeof this.deps}`));
  }
}

export interface StartConsents {
  readonly held: Pick<HeldConsent, 'execute'>;
  readonly give: Pick<GiveConsent, 'execute'>;
}

export function startConsentsOf(deps: ConsentDependencies): StartConsents {
  return { held: new HeldConsent(deps), give: new GiveConsent(deps) };
}
