import { EstimatePlan } from '../application/estimate/estimate-plan.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { Clock } from '../application/ports/clock.js';
import type { Logger } from '../application/ports/logger.js';
import type { ServerKeyPresence } from '../application/ports/server-key-presence.js';
import { CreateProject } from '../application/use-cases/create-project.js';
import { GitHubApi } from '../infrastructure/github/github-api.js';
import {
  GitHubHttpClient,
  type FetchFunction,
} from '../infrastructure/github/github-http-client.js';
import { GitHubRefChecker } from '../infrastructure/github/github-ref-checker.js';
import { GetAccountTotals } from '../application/use-cases/get-account-totals.js';
import { GetCaps } from '../application/use-cases/get-caps.js';
import { GetProject } from '../application/use-cases/get-project.js';
import { GetProjectCost } from '../application/use-cases/get-project-cost.js';
import { ListProjects } from '../application/use-cases/list-projects.js';
import { OpenWorkspace } from '../application/use-cases/open-workspace.js';
import { GetPlanSource } from '../application/use-cases/get-plan-source.js';
import {
  GetStackOffer,
  type GetStackOfferDependencies,
} from '../application/use-cases/get-stack-offer.js';
import { GetPlanningBrief } from '../application/use-cases/get-planning-brief.js';
import { SavePlanningBrief } from '../application/use-cases/save-planning-brief.js';
import { StoreUpload } from '../application/use-cases/store-upload.js';
import { WorkbookRendererCheck } from '../application/use-cases/workbook-renderer-check.js';
import { WorkbookBatches } from '../application/use-cases/workbook-batches.js';
import { UpdateProjectSettings } from '../application/use-cases/update-project-settings.js';
import type { ModelList } from '../application/models/model-list.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import { FileAnswersFile } from '../infrastructure/cards/answers-file.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgAuditLog } from '../infrastructure/db/pg-audit-log.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import { NodeOutputWriter } from '../infrastructure/files/node-output-writer.js';
import { loadProjectTemplate } from '../infrastructure/files/project-template.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { loadCatalogue } from '../infrastructure/prompts/catalogue-files.js';
import {
  loadApiContractPrompt,
  loadDataModelPrompt,
  loadFlowsPrompt,
  loadPlannerPrompt,
  loadPlannerWorkbookPrompt,
  loadUxPrompt,
  loadCoveragePrompt,
  loadGapPrompt,
  loadGapRepairPrompt,
  loadPrdPrompt,
} from '../infrastructure/prompts/prompt-files.js';
import { TimestampIdGenerator } from '../infrastructure/system/timestamp-id-generator.js';
import type { WorkbookSettings } from '../infrastructure/config/workbook-settings.js';
import { SpaceReservation } from '../infrastructure/sources/space-reservation.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../infrastructure/sources/workbook/workbook-limits.js';
import { WORKBOOK_RENDERER_VERSION } from '../infrastructure/sources/workbook/workbook-renderer.js';
import { DiskWorkbookStaging } from '../infrastructure/sources/workbook-staging.js';
import type { PlanInputs } from '../application/plan/plan-inputs.js';
import { workbookGuidanceFor } from '../application/plan/plan-workbook.js';
import { FileRunManifestStore } from '../infrastructure/files/file-run-manifest-store.js';
import { composeScanResults } from './compose-understand.js';
import { createUploadStore, uploadLimitBytes } from './compose-uploads.js';
import type { ProjectServices } from './web/project-routes.js';
import { keptRunCards, keptPriorCards } from './kept-card-readers.js';

// Architecture section 2 (composition root), RF-010, RF-002, RF-1105: the project adapters and the
// use cases behind the projects API. The default settings come from `templates/` and are checked
// here, so a broken template stops the start-up instead of the first new project.

/** The planner's four versioned prompt files, read for each plan or plan estimate. */
function plannerPrompts(folder: string) {
  return {
    prompt: () => loadPlannerPrompt(folder),
    prdPrompt: () => loadPrdPrompt(folder),
    dataModelPrompt: () => loadDataModelPrompt(folder),
    flowsPrompt: () => loadFlowsPrompt(folder),
    apiContractPrompt: () => loadApiContractPrompt(folder),
    uxPrompt: () => loadUxPrompt(folder),
    coveragePrompt: () => loadCoveragePrompt(folder),
    gapPrompt: () => loadGapPrompt(folder),
    gapRepairPrompt: () => loadGapRepairPrompt(folder),
  };
}

export interface ProjectParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly clock: Clock;
  /** The clock the workbook batches expire by; `clock` unless a test moves its own. */
  readonly batchClock?: Clock;
  readonly masker: TextMasker;
  /** The folder with `project-settings.json` and `ignore-rules.txt`. */
  readonly templatesFolder: string;
  /** The folder with `catalogue/` (RF-606), checked at start-up. */
  readonly promptsFolder: string;
  readonly dataDir: string;
  /** `ROSETTA_UPLOAD_MAX_MB` (RF-129). */
  readonly uploadMaxMb: number;
  /** `ROSETTA_WORKBOOK_MAX_FILES`, `_MAX_SHEETS` and `_MAX_CELLS` (RF-151). */
  readonly workbook: WorkbookSettings;
  /** Free bytes of the data folder, for a test that needs the space to be short; the file system's by default. */
  readonly freeBytes?: () => Promise<number>;
  /** The shipped price table the plan estimate prices the planner with (RF-613). */
  readonly priceTable: PriceTable;
  /** The shipped model list: the planner's context window and output limit (Q-57). */
  readonly models: ModelList;
  /** Which providers the server holds a key for; the plan estimate says when a call has none. */
  readonly serverKeys: ServerKeyPresence;
  /** `GITHUB_TOKEN`, which the ref check at create sends when set (EV-70). */
  readonly githubToken?: string | undefined;
  /** The fetch the ref check uses; a test gives the fake GitHub's. */
  readonly fetch?: FetchFunction | undefined;
}

/** EV-70: a short wait, because the person is waiting on the Create button. */
const REF_CHECK_TIMEOUT_MS = 5000;

/**
 * The use cases behind PUT /api/projects/:id/source (RF-128, RF-129) and the workbook batch routes
 * (RF-150). They share one reservation of free space and one upload store (DEC-149).
 */
function uploadsOf(
  parts: ProjectParts,
  projects: ProjectRepository,
  runs: RunIndex,
): Pick<ProjectServices, 'storeUpload' | 'workbookBatches' | 'workbookRenderer'> {
  const { pool, logger, clock, masker, dataDir } = parts;
  const reservation = new SpaceReservation({
    dataDir,
    ...(parts.freeBytes === undefined ? {} : { freeBytes: parts.freeBytes }),
  });
  const { workbookMaxFiles, workbookMaxSheets, workbookMaxCells } = parts.workbook;
  const limits = {
    ...DEFAULT_WORKBOOK_LIMITS,
    ...{ maxFiles: workbookMaxFiles, maxSheets: workbookMaxSheets, maxCells: workbookMaxCells },
  };
  const uploads = createUploadStore(dataDir, reservation, limits);
  const limitBytes = uploadLimitBytes(parts.uploadMaxMb);
  const auditLog = new PgAuditLog(pool, masker);
  const batchClock = parts.batchClock ?? clock;
  const workbookBatches = new WorkbookBatches({
    ...{ projects, runs, logger, auditLog, uploads, limitBytes },
    ...{ clock: batchClock, ids: new TimestampIdGenerator(clock) },
    staging: new DiskWorkbookStaging({ dataDir, reservation, limits }),
  });
  return {
    workbookRenderer: new WorkbookRendererCheck({
      uploads,
      currentVersion: WORKBOOK_RENDERER_VERSION,
      logger,
    }),
    storeUpload: new StoreUpload({
      ...{ projects, runs, logger, clock, auditLog },
      ...{ uploads, limitBytes, batches: workbookBatches },
    }),
    workbookBatches,
  };
}

/** RF-155: the plan estimate asks the same question as the plan run, over the same scan results. */
function workbookGuidanceOf(parts: ProjectParts, runs: RunIndex, writer: NodeOutputWriter) {
  const { logger, masker, dataDir } = parts;
  const deps = {
    ...{ runs, logger },
    scans: composeScanResults({
      ...{ dataDir, writer, logger },
      manifests: new FileRunManifestStore({ writer, masker }),
    }),
    workbookPrompt: () => loadPlannerWorkbookPrompt(parts.promptsFolder),
  };
  return (inputs: PlanInputs) => workbookGuidanceFor(deps, inputs);
}

/** P7-29: the catalogue's options of each stack layer, read without sending any code. */
function stackOfferOf(
  parts: ProjectParts,
  deps: Pick<GetStackOfferDependencies, 'projects' | 'runs' | 'stack'> & {
    readonly writer: NodeOutputWriter;
  },
): GetStackOffer {
  const { projects, runs, stack, writer } = deps;
  const { dataDir, logger, masker } = parts;
  const manifests = new FileRunManifestStore({ writer, masker });
  const scans = composeScanResults({ ...{ dataDir, writer, logger }, manifests });
  return new GetStackOffer({ projects, runs, stack, scans });
}

async function createProjectOf(
  parts: ProjectParts,
  projects: PgProjectRepository,
  serverSettings: PgServerSettings,
): Promise<CreateProject> {
  const { clock } = parts;
  return new CreateProject({
    ...{ projects, serverSettings, clock, refCheck: refCheckOf(parts) },
    template: await loadProjectTemplate(parts.templatesFolder),
    ids: new TimestampIdGenerator(clock),
  });
}

function refCheckOf(parts: ProjectParts): GitHubRefChecker {
  const { logger, githubToken, fetch } = parts;
  const client = new GitHubHttpClient({
    ...(fetch === undefined ? {} : { fetch }),
    token: githubToken,
    logger,
  });
  return new GitHubRefChecker(new GitHubApi(client, REF_CHECK_TIMEOUT_MS));
}

// RF-010; `estimatePlan` (RF-613) is the estimate before a plan run, against the caps the budget guard checks.
export async function composeProjects(parts: ProjectParts): Promise<ProjectServices> {
  const { pool, logger, clock, masker } = parts;
  const projects = new PgProjectRepository(pool);
  const [costs, settings] = [new PgCostTotals(pool), new PgServerSettings(pool)];
  const usage = new PgAccountUsage(pool);
  const caps = new GetCaps({ settings, usage, clock });
  const catalogue = await loadCatalogue(parts.promptsFolder);
  const runs = new PgRunIndex(pool);
  const writer = new NodeOutputWriter({ dataDir: parts.dataDir, logger });
  const briefs = new FilePlanningBriefStore({ writer, masker });
  return {
    createProject: await createProjectOf(parts, projects, settings),
    ...uploadsOf(parts, projects, runs),
    listProjects: new ListProjects({ projects }),
    getProject: new GetProject({ projects }),
    updateProjectSettings: new UpdateProjectSettings({ projects, clock, models: parts.models }),
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
    estimatePlan: new EstimatePlan({
      ...{ projects, runs, briefs, clock, usage },
      ...{ priceTable: parts.priceTable, models: parts.models },
      ...{ cards: keptRunCards(writer), priorCards: keptPriorCards(writer) },
      ...{ users: new PgUserRepository(pool), answers: new FileAnswersFile({ writer, masker }) },
      ...{ serverSettings: settings, manifests: new FileRunManifestStore({ writer, masker }) },
      ...{ keys: new PgProviderKeyRepository(pool), serverKeys: parts.serverKeys },
      catalogue: () => Promise.resolve(catalogue),
      ...plannerPrompts(parts.promptsFolder),
      workbookGuidance: workbookGuidanceOf(parts, runs, writer),
    }),
    catalogue,
    getPlanSource: new GetPlanSource({ projects, runs, cards: keptRunCards(writer) }),
    getStackOffer: stackOfferOf(parts, { projects, runs, writer, stack: catalogue.stack }),
    getProjectCost: new GetProjectCost({ projects, costs }),
    getAccountTotals: new GetAccountTotals({ costs, caps }),
  };
}
