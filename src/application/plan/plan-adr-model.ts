import { RosettaError } from '../../domain/errors/rosetta-error.js';
import {
  adrModelFindings,
  decisionsNeedingData,
  type AdrModelCheck,
} from '../../domain/planning/adr-model-check.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { PlanDecision } from '../../domain/planning/plan-content.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseAdrModelAnswer } from './adr-model-answer.js';
import { adrModelMessage } from './adr-model-message.js';
import type { HandoffPackage } from './handoff-package.js';

// RF-623, P9-15, EV-108, ADR-003, ADR-007: after the gap rounds, the plan's data model is read
// against its decision records in one planner call through the same guarded provider (metered,
// capped and in the ledger like every planner call). Only the records that name an identifier
// strategy or a stored structure are sent; with none, or with no table in the model, no call is
// made. The check never fails the plan: an answer that cannot be read, or a call that is refused or
// fails, gives a check that could not run, with a fixed reason or the error code, never answer text.

export interface AdrModelInput {
  readonly decisions: readonly PlanDecision[];
  readonly dataModel: TargetDataModel;
}

const unreadable = 'the answer could not be read as the JSON the prompt asks for';

// RF-623
export async function planAdrModelCheck(
  call: PlannerCall,
  input: AdrModelInput,
): Promise<AdrModelCheck | undefined> {
  const { tables } = input.dataModel;
  const decisions = decisionsNeedingData(input.decisions);
  if (decisions.length === 0 || tables.length === 0) return undefined;
  let output: string;
  try {
    output = await askPlannerWith(call, adrModelMessage({ decisions, tables }, call.tags));
  } catch (error) {
    if (call.signal.aborted || !(error instanceof RosettaError)) throw error;
    return { kind: 'not-run', reason: `the call failed or was refused (${error.code})` };
  }
  const draft = parseAdrModelAnswer(output);
  if (draft === undefined) return { kind: 'not-run', reason: unreadable };
  return adrModelFindings(draft, decisions, tables);
}

/** The agent task the call is logged and metered under. */
const AGENT_TASK = 'planner-adr-model';

/** What the run hands the check: its warning sink, a refused gap round, and the planner's records. */
interface AdrModelRun {
  readonly warn: (message: string) => Promise<void>;
  readonly refused: unknown;
  /** The decisions of the plan answer; the records Rosetta writes from the brief are not checked. */
  readonly records: readonly Pick<PlanDecision, 'title'>[];
}

/**
 * RF-623: the package with the check of its data model against the planner's decision records,
 * under the ids `decisions/` writes; a check that could not run is also logged as a warning. When
 * a gap round was refused the run ends with the guard's code, so no call is made.
 */
export async function withAdrModelCheck(
  call: Omit<PlannerCall, 'agentTaskId'>,
  handoff: HandoffPackage,
  run: AdrModelRun,
): Promise<HandoffPackage> {
  if (run.refused !== undefined) return handoff;
  const titles = new Set(run.records.map((record) => record.title));
  const decisions = handoff.content.decisions.filter((record) => titles.has(record.title));
  const input = { decisions, dataModel: handoff.dataModel };
  const check = await planAdrModelCheck({ ...call, agentTaskId: AGENT_TASK }, input);
  if (check === undefined) return handoff;
  if (check.kind === 'not-run') {
    await run.warn(`The data model was not checked against the decision records: ${check.reason}.`);
  }
  return { ...handoff, adrModelCheck: check };
}
