import type { ProjectConsents } from '../../application/ports/project-consents.js';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { EpochMs } from '../../domain/accounts/user.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// RF-143, RF-142, RF-1105: the consents of a project in memory, for unit tests; same contract as
// PgProjectConsents. A consent is stored only for a project the user owns, as the foreign key does.
export class MemoryProjectConsents implements ProjectConsents {
  private readonly projects: Pick<ProjectRepository, 'find'>;
  private consents: readonly ProjectConsent[] = [];

  constructor(projects: Pick<ProjectRepository, 'find'>) {
    this.projects = projects;
  }

  async give(consent: ProjectConsent): Promise<void> {
    const project = await this.projects.find(consent.userId, consent.projectId);
    if (project === undefined) throw new RosettaError(ERROR_CODES.notFound);
    // The primary key of `project_consent` refuses an id that is stored; PgProjectConsents says RST-2404.
    if (this.consents.some((each) => each.id === consent.id)) {
      throw new RosettaError(ERROR_CODES.databaseQueryFailed);
    }
    this.consents = [...this.consents, { ...consent, withdrawnAt: null }];
  }

  withdraw(userId: string, projectId: string, at: EpochMs): Promise<number> {
    let withdrawn = 0;
    this.consents = this.consents.map((consent) => {
      if (!this.held(consent, userId, projectId) || consent.withdrawnAt !== null) return consent;
      withdrawn += 1;
      return { ...consent, withdrawnAt: at };
    });
    return Promise.resolve(withdrawn);
  }

  list(userId: string, projectId: string): Promise<readonly ProjectConsent[]> {
    const listed = this.consents
      .filter((consent) => this.held(consent, userId, projectId))
      .sort((a, b) => b.givenAt - a.givenAt || (a.id < b.id ? 1 : -1));
    return Promise.resolve(listed);
  }

  private held(consent: ProjectConsent, userId: string, projectId: string): boolean {
    return consent.userId === userId && consent.projectId === projectId;
  }
}
