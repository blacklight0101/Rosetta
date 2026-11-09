import type { EpochMs } from '../../domain/accounts/user.js';
import type { ProjectConsent } from '../../domain/consent/project-consent.js';

// RF-143, RF-1105, DEC-209: the consents given on a project (data-model.md section 4,
// `project_consent`). Every read and write is scoped by the owner, so another user's project has
// none and is never changed.
export interface ProjectConsents {
  /**
   * Stores a consent as given (its `withdrawnAt` is ignored and stored as null). RST-2003 when the
   * project does not exist or belongs to another user.
   */
  give(consent: ProjectConsent): Promise<void>;
  /** Marks every consent of the project that is not withdrawn yet as withdrawn at `at`; how many. */
  withdraw(userId: string, projectId: string, at: EpochMs): Promise<number>;
  /** The project's consents, newest given first; empty for another user's project. */
  list(userId: string, projectId: string): Promise<readonly ProjectConsent[]>;
}
