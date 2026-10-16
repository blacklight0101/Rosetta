import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import { CreateProject } from '../application/use-cases/create-project.js';
import { GetAccountTotals } from '../application/use-cases/get-account-totals.js';
import { GetCaps } from '../application/use-cases/get-caps.js';
import { GetProject } from '../application/use-cases/get-project.js';
import { GetProjectCost } from '../application/use-cases/get-project-cost.js';
import { ListProjects } from '../application/use-cases/list-projects.js';
import { OpenWorkspace } from '../application/use-cases/open-workspace.js';
import { GetPlanningBrief } from '../application/use-cases/get-planning-brief.js';
import { SavePlanningBrief } from '../application/use-cases/save-planning-brief.js';
import { UpdateProjectSettings } from '../application/use-cases/update-project-settings.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgAuditLog } from '../infrastructure/db/pg-audit-log.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import { loadProjectTemplate } from '../infrastructure/files/project-template.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { loadCatalogue } from '../infrastructure/prompts/catalogue-files.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { ProjectServices } from './web/project-routes.js';

// Architecture section 2 (composition root), RF-010, RF-002, RF-1105: the project adapters and the
// use cases behind the projects API. The default settings come from `templates/` and are checked
// here, so a broken template stops the start-up instead of the first new project.

export interface ProjectParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly masker: TextMasker;
  /** The folder with `project-settings.json` and `ignore-rules.txt`. */
  readonly templatesFolder: string;
  /** The folder with `catalogue/` (RF-606), checked at start-up. */
  readonly promptsFolder: string;
  readonly dataDir: string;
}

// RF-010
export async function composeProjects(parts: ProjectParts): Promise<ProjectServices> {
  const { pool, logger, clock, masker } = parts;
  const projects = new PgProjectRepository(pool);
  const costs = new PgCostTotals(pool);
  const settings = new PgServerSettings(pool);
  const caps = new GetCaps({ settings, usage: new PgAccountUsage(pool), clock });
  const catalogue = await loadCatalogue(parts.promptsFolder);
  const runs = new PgRunIndex(pool);
  const writer = new NodeOutputWriter({ dataDir: parts.dataDir, logger });
  const briefs = new FilePlanningBriefStore({ writer, masker });
  return {
    createProject: new CreateProject({
      projects,
      serverSettings: settings,
      template: await loadProjectTemplate(parts.templatesFolder),
      ids: new TimestampIdGenerator(clock),
      clock,
    }),
    listProjects: new ListProjects({ projects }),
    getProject: new GetProject({ projects }),
    updateProjectSettings: new UpdateProjectSettings({ projects, clock }),
    openWorkspace: new OpenWorkspace({
      projects,
      users: new PgUserRepository(pool),
      auditLog: new PgAuditLog(pool, masker),
      logger,
      clock,
    }),
    // RF-605: the planning brief of Plan setup.
    getPlanningBrief: new GetPlanningBrief({ projects, runs, briefs, catalogue }),
    savePlanningBrief: new SavePlanningBrief({ projects, runs, briefs, catalogue, clock }),
    // RF-428, RF-1010: the cost page and the totals pill.
    getProjectCost: new GetProjectCost({ projects, costs }),
    getAccountTotals: new GetAccountTotals({ costs, caps }),
  };
}
