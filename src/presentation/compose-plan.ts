import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AnswersFile } from '../application/ports/answers-file.js';
import type { IdGenerator } from '../application/ports/id-generator.js';
import type { Logger } from '../application/ports/logger.js';
import type { OutputWriter } from '../application/ports/output-writer.js';
import type { ProjectRepository } from '../application/ports/project-repository.js';
import type { ProviderSetFactory } from '../application/ports/provider-set-factory.js';
import type { RunIndex } from '../application/ports/run-index.js';
import type { RunManifestStore } from '../application/ports/run-manifest-store.js';
import { BuildPlan } from '../application/use-cases/build-plan.js';
import { FileCostReportWriter } from '../infrastructure/budget/cost-report-files.js';
import { composeScanResults } from './compose-understand.js';
import { PgCostLedger } from '../infrastructure/db/pg-cost-ledger.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';
import { FilePlanningBriefStore } from '../infrastructure/files/file-planning-brief-store.js';
import { runPath } from '../infrastructure/files/workspace-paths.js';
import { JsonlEgressLog } from '../infrastructure/guards/jsonl-egress-log.js';
import { MaskedLineFinder } from '../infrastructure/guards/masked-line-finder.js';
import type { TextMasker } from '../infrastructure/guards/secret-masker.js';
import { FileHandoffWriter } from '../infrastructure/handoff/file-handoff-writer.js';
import { loadCatalogue } from '../infrastructure/prompts/catalogue-files.js';
import {
  loadApiContractPrompt,
  loadPlannerContinuePrompt,
  loadDataModelPrompt,
  loadFlowsPrompt,
  loadPlannerPrompt,
  loadPlannerWorkbookPrompt,
  loadUxPrompt,
  loadCoveragePrompt,
  loadGapPrompt,
  loadGapRepairPrompt,
  loadPlanRepairPrompt,
  loadPlannerSecretRiskPrompt,
  loadPlannerPromptTexts,
  loadPrdPrompt,
} from '../infrastructure/prompts/prompt-files.js';
import { JsonlProviderCallLog } from '../infrastructure/providers/jsonl-provider-call-log.js';
import { keptRunCards, keptPriorCards } from './kept-card-readers.js';

// Architecture section 2 (composition root), RF-604, ADR-003, ADR-018: the executor of the `plan`
// stage. The planner's provider comes only from the provider factory; the brief, the cards of the
// understand run and `answers.md` are read from the user's workspace and `handoff/` is written
// there. The catalogue and the planner prompt are read from `prompts/` for each run, so the
// manifest records the files the run used. This file is at the same depth in `src/` and in the
// built `dist/`, so `../../` is the repository root.
const promptsFolder = fileURLToPath(new URL('../../prompts/', import.meta.url));

export interface PlanParts {
  readonly pool: DatabasePool;
  readonly logger: Logger;
  readonly masker: TextMasker;
  readonly dataDir: string;
  readonly providers: ProviderSetFactory;
  readonly writer: OutputWriter;
  readonly manifests: RunManifestStore;
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly ids: IdGenerator;
  readonly answers: AnswersFile;
}

// RF-604
export function composePlan(parts: PlanParts): BuildPlan {
  const { pool, logger, masker, dataDir, writer } = parts;
  return new BuildPlan({
    ...{ projects: parts.projects, runs: parts.runs, manifests: parts.manifests, logger },
    users: new PgUserRepository(pool),
    scans: composeScanResults(parts),
    briefs: new FilePlanningBriefStore({ writer, masker }),
    cards: keptRunCards(writer),
    priorCards: keptPriorCards(writer),
    answers: parts.answers,
    providers: parts.providers,
    runSinks: (scope) => ({
      recorder: new JsonlProviderCallLog({
        runDir: join(dataDir, 'users', scope.userId, runPath(scope.projectId, scope.runKey)),
        masker,
      }),
      egressLog: new JsonlEgressLog({ writer, masker, scope }),
    }),
    ledger: new PgCostLedger(pool),
    costTotals: new PgCostTotals(pool),
    costReports: new FileCostReportWriter({ writer, masker }),
    handoff: new FileHandoffWriter({ writer, masker }),
    catalogue: () => loadCatalogue(promptsFolder),
    prompt: () => loadPlannerPrompt(promptsFolder),
    prdPrompt: () => loadPrdPrompt(promptsFolder),
    dataModelPrompt: () => loadDataModelPrompt(promptsFolder),
    flowsPrompt: () => loadFlowsPrompt(promptsFolder),
    apiContractPrompt: () => loadApiContractPrompt(promptsFolder),
    continuePrompt: () => loadPlannerContinuePrompt(promptsFolder),
    workbookPrompt: () => loadPlannerWorkbookPrompt(promptsFolder),
    promptTexts: () => loadPlannerPromptTexts(promptsFolder),
    uxPrompt: () => loadUxPrompt(promptsFolder),
    coveragePrompt: () => loadCoveragePrompt(promptsFolder),
    gapPrompt: () => loadGapPrompt(promptsFolder),
    gapRepairPrompt: () => loadGapRepairPrompt(promptsFolder),
    planRepairPrompt: () => loadPlanRepairPrompt(promptsFolder),
    secretRiskPrompt: () => loadPlannerSecretRiskPrompt(promptsFolder),
    secretLines: new MaskedLineFinder(masker),
    ids: parts.ids,
  });
}
