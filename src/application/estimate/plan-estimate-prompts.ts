import { apiScope } from '../../domain/planning/api-contract.js';
import { legacyClaimsOf } from '../../domain/planning/data-model.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { flowCardsOf } from '../../domain/planning/target-flows.js';
import { screenCardsOf } from '../../domain/planning/target-ux.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { apiContractMessage } from '../plan/api-contract-message.js';
import { dataModelMessage } from '../plan/data-model-message.js';
import { flowsMessage } from '../plan/flows-message.js';
import type { PlanInputs } from '../plan/plan-inputs.js';
import { planMessage } from '../plan/plan-message.js';
import { uxMessage } from '../plan/ux-message.js';
import { assumedComponents } from './flows-estimate.js';

// RF-613, RF-621, RF-623, RF-624, RF-625, RF-626, ADR-007: the planner calls a plan run would make, each as its
// versioned system prompt and the user message it would send, so the estimate measures what the
// guard will measure. The order is the run's: the plan, the PRD, the data model (only when a
// supported `ENT` claim exists), the flows (only when a verified `FLOW` card exists) and the API
// contract (only when the brief names a front end and a verified `FEAT` or `FLOW` card exists, RF-624)
// and the user-interface material (only when a verified `SCRN` card exists, RF-626).

export interface PlanPromptFiles {
  /** The principle catalogue the run plans with (RF-606). */
  readonly catalogue: () => Promise<Catalogue>;
  /** The planner's versioned prompt file (RNF-004). */
  readonly prompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the product requirements document (RF-621). */
  readonly prdPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the target data model (RF-623). */
  readonly dataModelPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the target flows (RF-625). */
  readonly flowsPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the API contract (RF-624). */
  readonly apiContractPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the user-interface material (RF-626). */
  readonly uxPrompt: () => Promise<PromptFile>;
}

export type PlannedCallKind = 'plan' | 'prd' | 'dataModel' | 'flows' | 'apiContract' | 'ux';

interface PlannedCall {
  readonly kind: PlannedCallKind;
  readonly file: PromptFile;
  readonly message: string;
}

/** The tag of a data block is 24 characters; the run draws its own. */
const TAG = 'a'.repeat(24);

export interface PlannedPrompts {
  readonly calls: readonly PlannedCall[];
  readonly supportedCards: number;
  readonly answeredQuestions: number;
}

interface DocumentFiles {
  readonly dataModel: PromptFile;
  readonly flows: PromptFile;
  readonly apiContract: PromptFile;
  readonly ux: PromptFile;
}

/** The calls after the plan and the PRD, each only when the run would make it. */
function documentCalls(
  supported: ReturnType<typeof supportedCards>,
  brief: PlanInputs['brief'],
  files: DocumentFiles,
): PlannedCall[] {
  const flowCards = flowCardsOf(supported);
  const screenCards = screenCardsOf(supported);
  // RF-625: the plan's components are not known yet; the block is sized at the plan answer's limits.
  const components = assumedComponents();
  const calls: (PlannedCall | undefined)[] = [
    legacyClaimsOf(supported).length === 0
      ? undefined
      : {
          ...{ kind: 'dataModel', file: files.dataModel },
          message: dataModelMessage({ cards: supported, brief }, () => TAG),
        },
    flowCards.length === 0
      ? undefined
      : {
          ...{ kind: 'flows', file: files.flows },
          message: flowsMessage({ flowCards, cards: supported, components }, () => TAG),
        },
    apiScope(supported, brief).ask
      ? {
          ...{ kind: 'apiContract', file: files.apiContract },
          message: apiContractMessage({ cards: supported, brief }, () => TAG),
        }
      : undefined,
    screenCards.length === 0
      ? undefined
      : {
          ...{ kind: 'ux', file: files.ux },
          message: uxMessage({ screenCards, brief }, () => TAG),
        },
  ];
  return calls.flatMap((call) => (call === undefined ? [] : [call]));
}

// RF-613
export async function plannedPrompts(
  files: PlanPromptFiles,
  inputs: PlanInputs,
): Promise<PlannedPrompts> {
  const { cards, brief, questions } = inputs;
  const [catalogue, plan, prd, dataModel, flows, apiContract, ux] = await Promise.all([
    files.catalogue(),
    files.prompt(),
    files.prdPrompt(),
    files.dataModelPrompt(),
    files.flowsPrompt(),
    files.apiContractPrompt(),
    files.uxPrompt(),
  ]);
  const supported = supportedCards(cards);
  const answered = questions.filter((question) => question.answer.trim() !== '');
  // The plan and the PRD send the same data blocks; only the system prompt differs.
  const message = planMessage({ cards: supported, brief, catalogue, answered }, () => TAG);
  const calls: PlannedCall[] = [
    { kind: 'plan', file: plan, message },
    { kind: 'prd', file: prd, message },
    ...documentCalls(supported, brief, { dataModel, flows, apiContract, ux }),
  ];
  return { calls, supportedCards: supported.length, answeredQuestions: answered.length };
}
