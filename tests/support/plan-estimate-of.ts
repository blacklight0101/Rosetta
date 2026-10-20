import { EstimatePlan } from '../../src/application/estimate/estimate-plan.js';
import type { PlanEstimate } from '../../src/application/estimate/plan-estimate-types.js';
import type { Project } from '../../src/application/projects/project.js';
import { FileAnswersFile } from '../../src/infrastructure/cards/answers-file.js';
import { FileRunCards } from '../../src/infrastructure/cards/file-run-cards.js';
import { MemoryAccountUsage } from '../../src/infrastructure/db/memory-account-usage.js';
import { MemoryProviderKeyRepository } from '../../src/infrastructure/db/memory-provider-key-repository.js';
import { MemoryServerSettings } from '../../src/infrastructure/db/memory-server-settings.js';
import { FilePlanningBriefStore } from '../../src/infrastructure/files/file-planning-brief-store.js';
import {
  loadApiContractPrompt,
  loadCoveragePrompt,
  loadGapPrompt,
  loadDataModelPrompt,
  loadFlowsPrompt,
  loadPlannerPrompt,
  loadPrdPrompt,
  loadUxPrompt,
} from '../../src/infrastructure/prompts/prompt-files.js';
import { budgetTable } from './budget-harness.js';
import { account } from './plan-run-seeds.js';
import { shippedCatalogue } from './planning-brief-harness.js';
import type { Stores } from './understand-run-services.js';

// RF-613: the plan estimate of a project as the plan page shows it before the run starts, built over
// the same stores and shipped prompts as the plan harness.

const actor = { userId: account.id, role: 'user' } as const;

export async function planEstimateOf(
  s: Stores,
  project: Project,
  sourceRunId?: string,
): Promise<PlanEstimate> {
  const { writer, masker, clock, runs, projects, users } = s;
  const estimate = new EstimatePlan({
    ...{ projects, runs, users, clock, priceTable: budgetTable, serverKeys: { has: () => true } },
    briefs: new FilePlanningBriefStore({ writer, masker }),
    cards: new FileRunCards(writer),
    answers: new FileAnswersFile({ writer, masker }),
    usage: new MemoryAccountUsage(),
    serverSettings: new MemoryServerSettings({}),
    keys: new MemoryProviderKeyRepository(),
    ...{ catalogue: () => Promise.resolve(shippedCatalogue) },
    ...{ prompt: () => loadPlannerPrompt('prompts'), prdPrompt: () => loadPrdPrompt('prompts') },
    dataModelPrompt: () => loadDataModelPrompt('prompts'),
    flowsPrompt: () => loadFlowsPrompt('prompts'),
    apiContractPrompt: () => loadApiContractPrompt('prompts'),
    uxPrompt: () => loadUxPrompt('prompts'),
    coveragePrompt: () => loadCoveragePrompt('prompts'),
    gapPrompt: () => loadGapPrompt('prompts'),
  });
  const request = { actor, projectId: project.id };
  const outcome = await estimate.execute(
    sourceRunId === undefined ? request : { ...request, sourceRunId },
  );
  if (!outcome.ok) throw new Error(`The plan estimate was refused: ${outcome.error}`);
  return outcome.value;
}
