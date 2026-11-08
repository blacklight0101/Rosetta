import type { ProjectConsents } from '../../application/ports/project-consents.js';
import type { ProjectRepository } from '../../application/ports/project-repository.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

// Not built yet (P8-77 red).
export class MemoryProjectConsents implements ProjectConsents {
  readonly projects: Pick<ProjectRepository, 'find'>;

  constructor(projects: Pick<ProjectRepository, 'find'>) {
    this.projects = projects;
  }

  give(): Promise<void> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }

  withdraw(): Promise<number> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }

  list(): Promise<readonly ProjectConsent[]> {
    return Promise.reject(new RosettaError(ERROR_CODES.databaseQueryFailed));
  }
}
