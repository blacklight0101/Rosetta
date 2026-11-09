import type { Actor } from '../../domain/accounts/actor.js';
import {
  consentHolds,
  type ConsentNeed,
  type ProjectConsent,
} from '../../domain/consent/project-consent.js';
import type { StartConsents } from '../consent/start-consent.js';
import type { Clock } from '../ports/clock.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { ProjectConsents } from '../ports/project-consents.js';

// RF-143, RF-142, RF-1105, DEC-209: the consent use cases. Give stores a consent on the user's
// project naming the providers and kinds a start needs, given now; the consent that holds is the
// newest one of the project that is not withdrawn, was given less than 30 days ago and names them
// all; withdraw marks every consent of the project as withdrawn now. Every call is scoped by the
// signed-in user, so another user's project has no consent and is never changed.

export interface ConsentDependencies {
  readonly consents: ProjectConsents;
  readonly clock: Clock;
  readonly ids: Pick<IdGenerator, 'uuid'>;
}

interface ProjectOwner {
  readonly actor: Actor;
  readonly projectId: string;
}

type NeedRequest = ProjectOwner & { readonly need: ConsentNeed };

export class GiveConsent {
  private readonly deps: ConsentDependencies;

  constructor(deps: ConsentDependencies) {
    this.deps = deps;
  }

  // RF-143
  async execute(request: NeedRequest): Promise<ProjectConsent> {
    const { actor, projectId, need } = request;
    const consent: ProjectConsent = {
      ...{ id: this.deps.ids.uuid(), userId: actor.userId, projectId },
      ...{ providers: [...need.providers], kinds: [...need.kinds] },
      ...{ givenAt: this.deps.clock.now().getTime(), withdrawnAt: null },
    };
    await this.deps.consents.give(consent);
    return consent;
  }
}

export class HeldConsent {
  private readonly deps: Pick<ConsentDependencies, 'consents' | 'clock'>;

  constructor(deps: Pick<ConsentDependencies, 'consents' | 'clock'>) {
    this.deps = deps;
  }

  /** DEC-209: the newest consent of the project that holds for the need; none when none does. */
  async execute(request: NeedRequest): Promise<ProjectConsent | undefined> {
    const { actor, projectId, need } = request;
    const now = this.deps.clock.now().getTime();
    const listed = await this.deps.consents.list(actor.userId, projectId);
    return listed.find((consent) => consentHolds(consent, need, now));
  }
}

export class WithdrawConsent {
  private readonly deps: Pick<ConsentDependencies, 'consents' | 'clock'>;

  constructor(deps: Pick<ConsentDependencies, 'consents' | 'clock'>) {
    this.deps = deps;
  }

  /** RF-143: how many consents were withdrawn; their rows are kept (RF-142). */
  execute(request: ProjectOwner): Promise<number> {
    const at = this.deps.clock.now().getTime();
    return this.deps.consents.withdraw(request.actor.userId, request.projectId, at);
  }
}

/** DEC-209, P8-81: the consent use cases of a project: what the starts use, and withdrawing. */
export interface ConsentCases extends StartConsents {
  readonly withdraw: Pick<WithdrawConsent, 'execute'>;
}

/** DEC-209: what the start use cases use (the consent that holds, giving one) and withdraw (P8-81). */
export function startConsentsOf(deps: ConsentDependencies): ConsentCases {
  return {
    held: new HeldConsent(deps),
    give: new GiveConsent(deps),
    withdraw: new WithdrawConsent(deps),
  };
}
