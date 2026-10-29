import { NO_LISTED_MODELS } from '../../src/application/models/model-list.js';
import { FilePriorCards } from '../../src/infrastructure/cards/prior-cards.js';
import { GetPlanSource } from '../../src/application/use-cases/get-plan-source.js';
import { EstimatePlan } from '../../src/application/estimate/estimate-plan.js';
import type { PlanningBriefStore } from '../../src/application/ports/planning-brief-store.js';
import type { UploadStore } from '../../src/application/ports/upload-store.js';
import type { WorkbookStaging } from '../../src/application/ports/workbook-staging.js';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import { CreateProject } from '../../src/application/use-cases/create-project.js';
import { GetAccountTotals } from '../../src/application/use-cases/get-account-totals.js';
import { GetCaps } from '../../src/application/use-cases/get-caps.js';
import { GetProject } from '../../src/application/use-cases/get-project.js';
import { GetProjectCost } from '../../src/application/use-cases/get-project-cost.js';
import { ListProjects } from '../../src/application/use-cases/list-projects.js';
import { OpenWorkspace } from '../../src/application/use-cases/open-workspace.js';
import { StoreUpload } from '../../src/application/use-cases/store-upload.js';
import { WorkbookRendererCheck } from '../../src/application/use-cases/workbook-renderer-check.js';
import { WORKBOOK_RENDERER_VERSION } from '../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { WorkbookBatches } from '../../src/application/use-cases/workbook-batches.js';
import { UpdateProjectSettings } from '../../src/application/use-cases/update-project-settings.js';
import type { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import type { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import type { MemoryAuditLog } from '../../src/infrastructure/db/memory-audit-log.js';
import type { MemoryCostTotals } from '../../src/infrastructure/db/memory-cost-totals.js';
import type { MemoryProjectRepository } from '../../src/infrastructure/db/memory-project-repository.js';
import type { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import type { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import type { MemoryUserRepository } from '../../src/infrastructure/db/memory-user-repository.js';
import {
  loadApiContractPrompt,
  loadDataModelPrompt,
  loadFlowsPrompt,
  loadPlannerPrompt,
  loadUxPrompt,
  loadCoveragePrompt,
  loadGapPrompt,
  loadGapRepairPrompt,
  loadPrdPrompt,
} from '../../src/infrastructure/prompts/prompt-files.js';
import type { ServerOptions } from '../../src/presentation/web/server.js';
import { estimatePrices } from './estimate-harness.js';
import type { FixedClock } from './fixed-clock.js';
import type { MemoryLogger } from './memory-logger.js';
import type { MemoryOutputWriter } from './memory-output-writer.js';
import { shippedCatalogue, briefServices } from './planning-brief-harness.js';
import { templateSettings } from './project-fixtures.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';

// RF-010, RF-605, RF-613, RF-1105: the project use cases over memory adapters and predictable ids,
// with the planning brief and the plan estimate over the answers file's memory folder.

export interface ProjectParts {
  readonly projects: MemoryProjectRepository;
  readonly serverSettings: MemoryServerSettings;
  readonly users: MemoryUserRepository;
  readonly auditLog: MemoryAuditLog;
  readonly logger: MemoryLogger;
  readonly clock: FixedClock;
  readonly costs: MemoryCostTotals;
  readonly usage: MemoryAccountUsage;
}

/** The files the planning brief and the plan estimate read, and the keys of the user. */
export interface PlanFiles {
  readonly briefs: PlanningBriefStore;
  /** The memory folder of the cards and of `answers.md`. */
  readonly answerFiles: MemoryOutputWriter;
  readonly answers: FileAnswersFile;
  readonly keys: MemoryProviderKeyRepository;
}

/** RF-128, RF-150: the store an upload goes to, the staging area of a workbook batch and the largest upload. */
export interface UploadParts {
  readonly store: UploadStore;
  readonly staging: WorkbookStaging;
  readonly limitBytes: number;
}

/** The planner's prompts for the links of the task cards and for the items no card builds. */
const laterPrompts = {
  coveragePrompt: () => loadCoveragePrompt('prompts'),
  gapPrompt: () => loadGapPrompt('prompts'),
  gapRepairPrompt: () => loadGapRepairPrompt('prompts'),
};

/** The zip upload, the workbook batches and the renderer check (RF-128, RF-150, P3-108). */
function uploadServices(
  parts: ProjectParts,
  runs: RunIndex,
  upload: UploadParts,
): Pick<ServerOptions['projects'], 'storeUpload' | 'workbookBatches' | 'workbookRenderer'> {
  const { projects, auditLog, logger, clock } = parts;
  const workbookBatches = new WorkbookBatches({
    ...{ projects, runs, auditLog, logger, clock },
    uploads: upload.store,
    staging: upload.staging,
    limitBytes: upload.limitBytes,
    ids: new SequenceIdGenerator(),
  });
  return {
    storeUpload: new StoreUpload({
      ...{ projects, runs, auditLog, logger, clock },
      uploads: upload.store,
      limitBytes: upload.limitBytes,
      batches: workbookBatches,
    }),
    workbookBatches,
    workbookRenderer: new WorkbookRendererCheck({
      uploads: upload.store,
      currentVersion: WORKBOOK_RENDERER_VERSION,
      logger,
    }),
  };
}

export function projectServices(
  parts: ProjectParts,
  files: PlanFiles,
  runs: RunIndex,
  upload: UploadParts,
): ServerOptions['projects'] {
  const { projects, serverSettings, users, auditLog, logger, clock, costs, usage } = parts;
  const ids = new SequenceIdGenerator();
  const caps = new GetCaps({ settings: serverSettings, usage, clock });
  const template = templateSettings;
  const { briefs, answers, answerFiles, keys } = files;
  return {
    createProject: new CreateProject({ projects, serverSettings, template, ids, clock }),
    ...uploadServices(parts, runs, upload),
    listProjects: new ListProjects({ projects }),
    getProject: new GetProject({ projects }),
    updateProjectSettings: new UpdateProjectSettings({ projects, clock, models: NO_LISTED_MODELS }),
    openWorkspace: new OpenWorkspace({ projects, users, auditLog, logger, clock }),
    getProjectCost: new GetProjectCost({ projects, costs }),
    getAccountTotals: new GetAccountTotals({ costs, caps }),
    ...briefServices({ projects, runs, briefs, clock }),
    catalogue: shippedCatalogue,
    getPlanSource: new GetPlanSource({ projects, runs, cards: new FileRunCards(answerFiles) }),
    estimatePlan: new EstimatePlan({
      ...{ projects, runs, briefs, answers, users, serverSettings, usage, clock, keys },
      cards: new FileRunCards(answerFiles),
      priorCards: new FilePriorCards(answerFiles),
      serverKeys: { has: () => true },
      priceTable: estimatePrices,
      models: NO_LISTED_MODELS,
      catalogue: () => Promise.resolve(shippedCatalogue),
      prompt: () => loadPlannerPrompt('prompts'),
      prdPrompt: () => loadPrdPrompt('prompts'),
      dataModelPrompt: () => loadDataModelPrompt('prompts'),
      flowsPrompt: () => loadFlowsPrompt('prompts'),
      apiContractPrompt: () => loadApiContractPrompt('prompts'),
      uxPrompt: () => loadUxPrompt('prompts'),
      ...laterPrompts,
    }),
  };
}
