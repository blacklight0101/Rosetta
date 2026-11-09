import type { Actor } from '../../domain/accounts/actor.js';
import type { ConsentNeed, ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { consentNeedOf } from '../consent/consent-need.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import { UNDERSTAND_ROLES } from '../understand/understand-options.js';

// RF-143, RF-1105, DEC-209 (P8-81): the consent a page shows as one line instead of the boxes. Read
// answers the newest consent of the project that holds for the roles of the start the page makes
// (`understand`: the roles of an understand run and a Deepen; `plan`: the planner), the rule the
// start use cases apply; none when none holds or the roles are all local. Withdraw marks every
// consent of the project as withdrawn. Both read the project as the signed-in user first, so another
// user's project is not found and nothing of it is read or changed.

/** The start a page makes, which decides the roles the consent must cover. */
export const CONSENT_STARTS = ['understand', 'plan'] as const;
export type ConsentStart = (typeof CONSENT_STARTS)[number];

const ROLES_OF: Readonly<Record<ConsentStart, readonly AgentRole[]>> = {
  understand: UNDERSTAND_ROLES,
  plan: ['planner'],
};

interface Owner {
  readonly actor: Actor;
  readonly projectId: string;
}

export interface ProjectConsentDependencies {
  readonly projects: Pick<ProjectRepository, 'find'>;
  readonly consents: {
    readonly held: {
      execute(request: Owner & { readonly need: ConsentNeed }): Promise<ProjectConsent | undefined>;
    };
    readonly withdraw: { execute(request: Owner): Promise<number> };
  };
  /** The host of the server's Ollama; an Ollama elsewhere needs the consent (DEC-118). */
  readonly ollamaHost?: string | undefined;
}

type NotFound = typeof ERROR_CODES.notFound;

export class ReadProjectConsent {
  private readonly deps: ProjectConsentDependencies;

  constructor(deps: ProjectConsentDependencies) {
    this.deps = deps;
  }

  // RF-143, RF-1105
  async execute(
    request: Owner & { readonly start: ConsentStart },
  ): Promise<Result<ProjectConsent | undefined, NotFound>> {
    const { actor, projectId } = request;
    const project = await this.deps.projects.find(actor.userId, projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    const need = consentNeedOf(project, this.deps.ollamaHost, ROLES_OF[request.start]);
    if (need === undefined) return ok(undefined);
    return ok(await this.deps.consents.held.execute({ actor, projectId, need }));
  }
}

export class WithdrawProjectConsent {
  private readonly deps: Pick<ProjectConsentDependencies, 'projects' | 'consents'>;

  constructor(deps: Pick<ProjectConsentDependencies, 'projects' | 'consents'>) {
    this.deps = deps;
  }

  /** RF-143, RF-1105: how many consents were withdrawn; their rows are kept (RF-142). */
  async execute(request: Owner): Promise<Result<number, NotFound>> {
    const project = await this.deps.projects.find(request.actor.userId, request.projectId);
    if (project === undefined) return err(ERROR_CODES.notFound);
    return ok(await this.deps.consents.withdraw.execute(request));
  }
}
