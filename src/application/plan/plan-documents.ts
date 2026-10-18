import type { ApiContract } from '../../domain/planning/api-contract.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { DraftComponent } from '../../domain/planning/plan-draft.js';
import { assemblePrd, emptyPrd, type PrdContent } from '../../domain/planning/prd-content.js';
import type { TargetFlows } from '../../domain/planning/target-flows.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { askPlanner, type PlannerCall } from './ask-planner.js';
import { apiContractWarnings, planApiContract } from './plan-api-contract.js';
import { dataModelWarnings, planDataModel } from './plan-data-model.js';
import { flowsWarnings, planFlows } from './plan-flows.js';
import type { PlanMessageInput } from './plan-message.js';
import { parsePrdAnswer } from './prd-answer.js';

// RF-621, RF-623, RF-625, RF-624, ADR-003: the documents of the package the planner writes after the plan,
// each from its own call through the same guarded provider, in this order: the product
// requirements document, the target data model and the target flows (which map each journey onto
// the components of the plan) and the API contract (only when the front end is separate, RF-624). An answer that cannot be read leaves its document empty and is
// logged; the call itself failing rejects, so the run fails or stops at its cap.

export interface DocumentPrompts {
  readonly prd: PromptFile;
  readonly dataModel: PromptFile;
  readonly flows: PromptFile;
  readonly apiContract: PromptFile;
}

export interface PlannedDocuments {
  readonly prd: PrdContent;
  readonly dataModel: TargetDataModel;
  readonly flows: TargetFlows;
  readonly apiContract: ApiContract;
}

// RF-621
async function planPrd(
  call: PlannerCall,
  input: PlanMessageInput,
  warn: (message: string) => Promise<void>,
): Promise<PrdContent> {
  const draft = parsePrdAnswer(await askPlanner(call, input));
  if (draft === undefined) {
    await warn('The planner answer for the PRD could not be read; every section is a placeholder.');
    return emptyPrd;
  }
  const types = new Map(input.cards.map((card) => [card.id, card.type]));
  const { content, dropped } = assemblePrd(draft, types);
  if (dropped > 0) {
    await warn(
      `The PRD answer had ${String(dropped)} statement(s) without a supported card; they were left out.`,
    );
  }
  return content;
}

// RF-621, RF-623, RF-625, RF-624
export async function planDocuments(
  base: PlannerCall,
  prompts: DocumentPrompts,
  input: PlanMessageInput & { readonly components: readonly DraftComponent[] },
  warn: (message: string) => Promise<void>,
): Promise<PlannedDocuments> {
  const prd = await planPrd(
    { ...base, prompt: prompts.prd, agentTaskId: 'planner-prd' },
    input,
    warn,
  );
  const modelCall = { ...base, prompt: prompts.dataModel, agentTaskId: 'planner-data-model' };
  const model = await planDataModel(modelCall, { cards: input.cards, brief: input.brief });
  for (const message of dataModelWarnings(model)) await warn(message);
  const flowsCall = { ...base, prompt: prompts.flows, agentTaskId: 'planner-flows' };
  const flows = await planFlows(flowsCall, input);
  for (const message of flowsWarnings(flows)) await warn(message);
  const apiCall = { ...base, prompt: prompts.apiContract, agentTaskId: 'planner-api-contract' };
  const dataModel = model.assembly.model;
  const api = await planApiContract(apiCall, { cards: input.cards, brief: input.brief, dataModel });
  for (const message of apiContractWarnings(api)) await warn(message);
  return { prd, dataModel, flows: flows.flows, apiContract: api.contract };
}
