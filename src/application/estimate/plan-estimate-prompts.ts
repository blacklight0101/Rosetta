import { legacyClaimsOf } from '../../domain/planning/data-model.js';
import { supportedCards } from '../../domain/planning/plan-sources.js';
import { flowCardsOf } from '../../domain/planning/target-flows.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { dataModelMessage } from '../plan/data-model-message.js';
import { flowsMessage } from '../plan/flows-message.js';
import type { PlanInputs } from '../plan/plan-inputs.js';
import { planMessage } from '../plan/plan-message.js';
import { assumedComponents } from './flows-estimate.js';

// RF-613, RF-621, RF-623, RF-625, ADR-007: the planner calls a plan run would make, each as its
// versioned system prompt and the user message it would send, so the estimate measures what the
// guard will measure. The order is the run's: the plan, the PRD, the data model (only when a
// supported `ENT` claim exists) and the flows (only when a verified `FLOW` card exists).

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
}

export type PlannedCallKind = 'plan' | 'prd' | 'dataModel' | 'flows';

export interface PlannedCall {
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

// RF-613
export async function plannedPrompts(
  files: PlanPromptFiles,
  inputs: PlanInputs,
): Promise<PlannedPrompts> {
  const { cards, brief, questions } = inputs;
  const [catalogue, plan, prd, dataModel, flows] = await Promise.all([
    files.catalogue(),
    files.prompt(),
    files.prdPrompt(),
    files.dataModelPrompt(),
    files.flowsPrompt(),
  ]);
  const supported = supportedCards(cards);
  const answered = questions.filter((question) => question.answer.trim() !== '');
  // The plan and the PRD send the same data blocks; only the system prompt differs.
  const message = planMessage({ cards: supported, brief, catalogue, answered }, () => TAG);
  const flowCards = flowCardsOf(supported);
  // RF-625: the plan's components are not known yet; the block is sized at the plan answer's limits.
  const components = assumedComponents();
  const calls: PlannedCall[] = [
    { kind: 'plan', file: plan, message },
    { kind: 'prd', file: prd, message },
    ...(legacyClaimsOf(supported).length === 0
      ? []
      : [
          {
            ...{ kind: 'dataModel' as const, file: dataModel },
            message: dataModelMessage({ cards: supported, brief }, () => TAG),
          },
        ]),
    ...(flowCards.length === 0
      ? []
      : [
          {
            ...{ kind: 'flows' as const, file: flows },
            message: flowsMessage({ flowCards, cards: supported, components }, () => TAG),
          },
        ]),
  ];
  return { calls, supportedCards: supported.length, answeredQuestions: answered.length };
}
