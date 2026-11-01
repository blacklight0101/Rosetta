import type { Actor } from '../../src/domain/accounts/actor.js';
import { NO_LISTED_MODELS, type ModelList } from '../../src/application/models/model-list.js';
import type { DefaultRoles } from '../../src/application/projects/default-roles.js';
import type { GitHubRefCheck } from '../../src/application/ports/github-ref-check.js';
import { CreateProject } from '../../src/application/use-cases/create-project.js';
import { GetProject } from '../../src/application/use-cases/get-project.js';
import { ListProjects } from '../../src/application/use-cases/list-projects.js';
import { OpenWorkspace } from '../../src/application/use-cases/open-workspace.js';
import { UpdateProjectSettings } from '../../src/application/use-cases/update-project-settings.js';
import { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { fixtureNow } from './account-fixtures.js';
import { FixedClock } from './fixed-clock.js';
import { templateSettings } from './project-fixtures.js';
import { RecordingLogger } from './recording-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-010, RF-002, RF-1105: the project use cases with memory adapters, a fixed clock and
// predictable ids.

export const amy: Actor = { userId: '00000000-0000-4000-9000-0000000000a1', role: 'user' };
export const bob: Actor = { userId: '00000000-0000-4000-9000-0000000000b2', role: 'user' };
export const root: Actor = { userId: '00000000-0000-4000-9000-0000000000c3', role: 'admin' };

export interface ProjectHarness {
  readonly projects: MemoryProjectRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly users: MemoryUserRepository;
  readonly audit: MemoryAuditLog;
  readonly logger: RecordingLogger;
  readonly clock: FixedClock;
  readonly createProject: CreateProject;
  readonly listProjects: ListProjects;
  readonly getProject: GetProject;
  readonly updateProjectSettings: UpdateProjectSettings;
  readonly openWorkspace: OpenWorkspace;
}

export function projectHarness(
  defaultRoles: DefaultRoles = {},
  models: ModelList = NO_LISTED_MODELS,
  refCheck?: GitHubRefCheck,
): ProjectHarness {
  const projects = new MemoryProjectRepository();
  const serverSettings = new MemoryServerSettings(defaultRoles);
  const users = new MemoryUserRepository();
  const audit = new MemoryAuditLog(new SecretMasker());
  const logger = new RecordingLogger();
  const clock = new FixedClock(new Date(fixtureNow).toISOString());
  const ids = new SequenceIdGenerator();
  return {
    projects,
    serverSettings,
    users,
    audit,
    logger,
    clock,
    createProject: new CreateProject({
      projects,
      serverSettings,
      template: templateSettings,
      ids,
      clock,
      ...(refCheck === undefined ? {} : { refCheck }),
    }),
    listProjects: new ListProjects({ projects }),
    getProject: new GetProject({ projects }),
    updateProjectSettings: new UpdateProjectSettings({ projects, clock, models }),
    openWorkspace: new OpenWorkspace({ projects, users, auditLog: audit, logger, clock }),
  };
}
