import { apiScope, servableCards } from '../../domain/planning/api-contract.js';
import { legacyClaimsOf } from '../../domain/planning/data-model.js';
import { supportedCards, type SourceCard } from '../../domain/planning/plan-sources.js';
import { flowCardsOf } from '../../domain/planning/target-flows.js';
import { screenCardsOf } from '../../domain/planning/target-ux.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { PromptFile } from '../agent/prompt-file.js';
import { apiContractMessage } from '../plan/api-contract-message.js';
import { dataModelMessage } from '../plan/data-model-message.js';
import { flowsMessage } from '../plan/flows-message.js';
import type { PlanInputs } from '../plan/plan-inputs.js';
import { withWorkbookGuidance } from '../plan/plan-workbook.js';
import { planMessage } from '../plan/plan-message.js';
import { uxMessage } from '../plan/ux-message.js';
import { coverageMessage } from '../plan/coverage-message.js';
import { gapMessage } from '../plan/gap-message.js';
import { gapRepairMessage } from '../plan/gap-repair-message.js';
import { assumedCoverageInput, assumedGapInput, assumedGapProblems } from './coverage-estimate.js';
import { assumedComponents } from './flows-estimate.js';
import { MEASURING_TAG } from '../plan/plan-call-packing.js';
import { packCards, type PlanWindow } from '../plan/plan-packing.js';

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
  /** The planner's versioned prompt file for the links of the task cards to the items (RF-627). */
  readonly coveragePrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the task cards of the items no card builds (Q-45). */
  readonly gapPrompt: () => Promise<PromptFile>;
  /** The planner's versioned prompt file for the one repair attempt of the gap call (Q-54). */
  readonly gapRepairPrompt: () => Promise<PromptFile>;
  /** RF-155: the package prompt with the workbook guidance after it, when this run would add it. */
  readonly workbookGuidance?: (inputs: PlanInputs) => Promise<PromptFile | undefined>;
}

export type PlannedCallKind =
  'plan' | 'prd' | 'dataModel' | 'flows' | 'apiContract' | 'ux' | 'coverage' | 'gap' | 'gapRepair';

interface PlannedCall {
  readonly kind: PlannedCallKind;
  readonly file: PromptFile;
  readonly message: string;
  /** P3-113: the cards the message names by title only, to fit the window. */
  readonly omitted: number;
}

const TAG = MEASURING_TAG;

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

/** A call with no card left out. */
const whole = (kind: PlannedCallKind, file: PromptFile, message: string): PlannedCall => ({
  ...{ kind, file, message, omitted: 0 },
});

/**
 * P5-22: a render that remembers its answers by the set of omitted cards. Packing renders the message
 * with no card omitted, with all omitted and with the chosen ones, and the call renders the chosen
 * ones again; the plan and the PRD render the same message. Turning a large message into a block is
 * the costly step, so each distinct message is rendered once.
 */
function remembered(
  render: (omitted: ReadonlySet<string>) => string,
): (omitted: ReadonlySet<string>) => string {
  const answers = new Map<string, string>();
  return (omitted) => {
    const key = [...omitted].join(',');
    const known = answers.get(key);
    if (known !== undefined) return known;
    const message = render(omitted);
    answers.set(key, message);
    return message;
  };
}

/** A call whose cards are packed to the window as the run packs them (P3-113). */
function packed(
  window: PlanWindow | undefined,
  call: { readonly kind: PlannedCallKind; readonly file: PromptFile },
  cards: readonly SourceCard[],
  render: (omitted: ReadonlySet<string>) => string,
): PlannedCall {
  const once = remembered(render);
  const { omitted } = packCards({ window, system: call.file.text, cards, render: once });
  return { ...call, message: once(omitted), omitted: omitted.size };
}

/** The calls after the plan and the PRD, each only when the run would make it. */
function documentCalls(
  supported: ReturnType<typeof supportedCards>,
  brief: PlanInputs['brief'],
  files: DocumentFiles,
  window: PlanWindow | undefined,
): PlannedCall[] {
  const flowCards = flowCardsOf(supported);
  const screenCards = screenCardsOf(supported);
  // RF-625: the plan's components are not known yet; the block is sized at the plan answer's limits.
  const components = assumedComponents();
  const calls: (PlannedCall | undefined)[] = [
    legacyClaimsOf(supported).length === 0
      ? undefined
      : packed(
          window,
          { kind: 'dataModel', file: files.dataModel },
          supported.filter((card) => card.type === 'ENT'),
          (omitted) => dataModelMessage({ cards: supported, brief, omitted }, () => TAG),
        ),
    flowCards.length === 0
      ? undefined
      : whole(
          'flows',
          files.flows,
          flowsMessage({ flowCards, cards: supported, components }, () => TAG),
        ),
    apiScope(supported, brief).ask
      ? packed(
          window,
          { kind: 'apiContract', file: files.apiContract },
          servableCards(supported),
          (omitted) => apiContractMessage({ cards: supported, brief, omitted }, () => TAG),
        )
      : undefined,
    screenCards.length === 0
      ? undefined
      : whole(
          'ux',
          files.ux,
          uxMessage({ screenCards, brief }, () => TAG),
        ),
  ];
  return calls.flatMap((call) => (call === undefined ? [] : [call]));
}

/**
 * RF-627, Q-45, Q-54: the calls after the documents are always counted, since whether an item is
 * left without a card is not known yet; the repair is the gap call again, with the repair prompt
 * and a problem for every card.
 */
function closingCalls(files: {
  readonly coverage: PromptFile;
  readonly gap: PromptFile;
  readonly repair: PromptFile;
}): PlannedCall[] {
  const { coverage, gap, repair } = files;
  const problems = assumedGapProblems();
  const repairing = gapRepairMessage(assumedGapInput(), { prompt: repair, problems }, () => TAG);
  return [
    whole(
      'coverage',
      coverage,
      coverageMessage(assumedCoverageInput(), () => TAG),
    ),
    whole(
      'gap',
      gap,
      gapMessage(assumedGapInput(), () => TAG),
    ),
    whole('gapRepair', gap, repairing),
  ];
}

// RF-613, P3-113
export async function plannedPrompts(
  files: PlanPromptFiles,
  inputs: PlanInputs,
  window?: PlanWindow,
): Promise<PlannedPrompts> {
  const { cards, brief, questions } = inputs;
  const [catalogue, plan, prd, dataModel, flows, apiContract, ux, coverage, gap, repair] =
    await Promise.all([
      files.catalogue(),
      files.prompt(),
      files.prdPrompt(),
      files.dataModelPrompt(),
      files.flowsPrompt(),
      files.apiContractPrompt(),
      files.uxPrompt(),
      files.coveragePrompt(),
      files.gapPrompt(),
      files.gapRepairPrompt(),
    ]);
  const guidance = await files.workbookGuidance?.(inputs);
  const supported = supportedCards(cards);
  const answered = questions.filter((question) => question.answer.trim() !== '');
  // The plan and the PRD send the same data blocks; each packs to the window with its own system prompt.
  const planRender = remembered((omitted: ReadonlySet<string>) =>
    planMessage({ cards: supported, brief, catalogue, answered, omitted }, () => TAG),
  );
  const planned = (kind: 'plan' | 'prd', file: PromptFile): PlannedCall =>
    packed(window, { kind, file }, supported, planRender);
  const calls: PlannedCall[] = [
    planned('plan', withWorkbookGuidance(plan, guidance)),
    planned('prd', prd),
    ...documentCalls(supported, brief, { dataModel, flows, apiContract, ux }, window),
    ...closingCalls({ coverage, gap, repair }),
  ];
  return { calls, supportedCards: supported.length, answeredQuestions: answered.length };
}
