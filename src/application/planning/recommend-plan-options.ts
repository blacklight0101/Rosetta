import type { CodeMap } from '../../domain/code-map/code-map.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Catalogue } from '../../domain/planning/catalogue.js';
import { buildPlanOptions, type PlanOptions } from '../../domain/planning/plan-options.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import { verifiedCards } from '../../domain/planning/verified-cards.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { IdGenerator } from '../ports/id-generator.js';
import type { LlmProvider, LlmResponse } from '../ports/llm-provider.js';
import type { Logger } from '../ports/logger.js';
import type { RoleProvider } from '../providers/provider-set.js';
import { parsePlanOptionsAnswer } from './plan-options-answer.js';
import { planOptionsMessage, plannerSystem } from './plan-options-request.js';

// RF-608, RF-609, ADR-007, ADR-013, ADR-018, DEC-76..DEC-78: Plan setup's options. From the code map
// and the verified cards the `planner` role proposes the two best-fitting architecture styles (their
// trade-offs, the cards that are the evidence, one recommended) and two options for each stack
// layer, pre-filled from the legacy stack the scan found. The call is one call of the planner role
// through the provider set's guards (egress and budget), with a versioned prompt. The answer is
// checked by the domain; a call that fails or an answer that cannot be used is a typed problem, not
// an exception, so the page can say so and offer to ask again.

export interface PlanOptionsParts {
  readonly provider: LlmProvider;
  readonly role: Pick<RoleProvider, 'model' | 'maxOutputTokens' | 'temperature'>;
  /** `planner/options.v<n>.md`, the system prompt with the placeholder for the styles. */
  readonly prompt: PromptFile;
  readonly logger: Logger;
  readonly ids: Pick<IdGenerator, 'dataBlockTag'>;
  readonly runId: string;
  /** One per run, 32 hexadecimal characters. */
  readonly traceId: string;
  readonly nextCallId: () => string;
  readonly signal: AbortSignal;
  /** Called with the planner's answer (manifest records). */
  readonly onAnswer: (response: LlmResponse) => Promise<void>;
}

export interface PlanOptionsInput {
  readonly codeMap: CodeMap;
  /** Every card of the project; only the verified claims are sent. */
  readonly cards: readonly SourceCard[];
  readonly catalogue: Catalogue;
}

export interface PlanOptionsProblem {
  readonly code: ErrorCode;
  readonly message: string;
}

const PLANNER = 'planner';
const NO_CARDS = 'The project has no verified card to recommend from; run understand first.';
const NO_ANSWER = 'The planner did not answer.';
const UNUSABLE = 'The planner answer held no architecture and stack options.';

async function warn(parts: PlanOptionsParts, message: string, code: ErrorCode): Promise<void> {
  const { runId } = parts;
  await parts.logger.log({ level: 'warn', logger: 'plan', message, runId, code });
}

function problem(code: ErrorCode, message: string): Result<never, PlanOptionsProblem> {
  return err({ code, message });
}

/** The planner's answer, or the problem when the call failed or the run was stopped. */
async function ask(
  parts: PlanOptionsParts,
  input: PlanOptionsInput,
  cards: readonly SourceCard[],
): Promise<Result<string, PlanOptionsProblem>> {
  const { role, signal, ids } = parts;
  const tags = { cards: ids.dataBlockTag(), scan: ids.dataBlockTag() };
  let answered: LlmResponse;
  try {
    answered = await parts.provider.complete({
      context: {
        ...{ runId: parts.runId, agentTaskId: `${PLANNER}-options`, role: PLANNER },
        ...{ callId: parts.nextCallId(), traceId: parts.traceId },
        parentSpanId: `${parts.traceId.slice(0, 13)}fff`,
      },
      model: role.model,
      system: plannerSystem(parts.prompt.text, input.catalogue),
      messages: [{ role: 'user', content: planOptionsMessage({ ...input, cards }, tags) }],
      tools: [],
      maxOutputTokens: role.maxOutputTokens,
      ...(role.temperature === undefined ? {} : { temperature: role.temperature }),
      signal,
    });
  } catch (error) {
    const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
    if (!signal.aborted) await warn(parts, 'The planner could not give the options.', code);
    return problem(code, NO_ANSWER);
  }
  // A failure to record a billed answer is a fault of the run, not an unanswered call.
  await parts.onAnswer(answered);
  return ok(answered.text);
}

/** The options for Plan setup, or why there are none. */
// RF-608, RF-609
export async function recommendPlanOptions(
  parts: PlanOptionsParts,
  input: PlanOptionsInput,
): Promise<Result<PlanOptions, PlanOptionsProblem>> {
  const cards = verifiedCards(input.cards);
  if (cards.length === 0) return problem(ERROR_CODES.planOptionsInvalid, NO_CARDS);
  const output = await ask(parts, input, cards);
  if (!output.ok) return output;
  const draft = parsePlanOptionsAnswer(output.value);
  if (draft === undefined) {
    await warn(parts, UNUSABLE, ERROR_CODES.planOptionsInvalid);
    return problem(ERROR_CODES.planOptionsInvalid, UNUSABLE);
  }
  const built = buildPlanOptions(draft, new Set(cards.map((card) => card.id)));
  if (built.ok) return built;
  const message = `${UNUSABLE} ${built.error.join(' ')}`;
  await warn(parts, message, ERROR_CODES.planOptionsInvalid);
  return problem(ERROR_CODES.planOptionsInvalid, message);
}
