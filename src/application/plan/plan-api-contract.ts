import {
  apiScope,
  noApiContract,
  servableCards,
  type ApiContract,
  type ApiLeftOut,
} from '../../domain/planning/api-contract.js';
import { assembleApiContract } from '../../domain/planning/api-contract-assembly.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseApiContractAnswer } from './api-contract-answer.js';
import { apiContractMessage } from './api-contract-message.js';

// RF-624, RF-603, ADR-018: the API contract of a plan run. When the brief names a front end and the
// supported cards hold a `FEAT` or `FLOW` card, the planner is asked once more, through the same
// guarded provider, for the operations; its answer is checked against those cards and the target data
// model (the domain), so an operation serves only a verified card. Otherwise no call is made and the
// contract says why none applies. An answer that gives no usable operation is not a failure of the
// run (like an unreadable PRD): no file is written, the README says so, and the caller logs it.

export interface ApiContractInput {
  /** The cards with their `Supported` claims. */
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
  /** The checked target data model the schemas and the operation bodies come from. */
  readonly dataModel: TargetDataModel;
}

export interface PlannedApiContract {
  readonly contract: ApiContract;
  /** False when no call was made. */
  readonly asked: boolean;
  /** False when the planner was asked and its answer gave no usable operation. */
  readonly readable: boolean;
  readonly leftOut: ApiLeftOut;
}

const nothingLeftOut: ApiLeftOut = { operations: 0, serves: 0, security: 0 };

// RF-624
export async function planApiContract(
  call: PlannerCall,
  input: ApiContractInput,
): Promise<PlannedApiContract> {
  const { cards, brief, dataModel } = input;
  const scope = apiScope(cards, brief);
  if (!scope.ask) {
    const contract = noApiContract(scope.reason);
    return { contract, asked: false, readable: true, leftOut: nothingLeftOut };
  }
  const output = await askPlannerWith(call, apiContractMessage({ cards, brief }, call.tags));
  const servable = servableCards(cards).map((card) => card.id);
  const assembly = assembleApiContract(parseApiContractAnswer(output), servable, dataModel);
  return { ...assembly, asked: true };
}

/** RF-624: what to log about a planned contract: an unusable answer, and what the checks refused. */
export function apiContractWarnings(planned: PlannedApiContract): string[] {
  if (!planned.asked) return [];
  const { operations, serves, security } = planned.leftOut;
  const unusable = planned.readable
    ? []
    : ['The planner answer for the API contract had no usable operation; no contract was written.'];
  const refused =
    operations + serves + security === 0
      ? []
      : [
          `The planner API contract had items the checks refused; ${String(operations)} operation(s), ${String(serves)} card id(s) and ${String(security)} public flag(s) on an operation with data were left out.`,
        ];
  return [...unusable, ...refused];
}
