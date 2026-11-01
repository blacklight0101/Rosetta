import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { recordManifestModelVersion } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { LlmMessage, LlmResponse } from '../ports/llm-provider.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { traceIdOf } from '../runs/run-ids.js';
import {
  cutOffMessage,
  replacedMessage,
  endsCutOff,
  isCutOff,
  joinNoting,
  maxPlannerContinuations,
} from './plan-continuation.js';
import { resumePoint } from './json-tail.js';
import { packedInput } from './plan-call-packing.js';
import { planMessage, type PlanMessageInput } from './plan-message.js';
import type { PlanWindow } from './plan-packing.js';

// RF-604, RF-621, ADR-003, ADR-006, ADR-007: a model call of a plan run (the plan, then the PRD).
// It goes to the planner's guarded provider (budget guard, egress guard, call log) that the provider factory built for the
// run, with the run's abort signal; the system prompt is the versioned prompt file and the input
// sits in data blocks of the user message. The model version the provider reports is recorded in
// the manifest (RNF-004). A failed call rejects with the provider's error. An answer cut off at the
// output limit is continued, at most twice (plan-continuation.ts); one that stays cut off rejects
// with RST-1805, or is returned after `onCutOff` names the cause.

export interface PlannerCall {
  readonly run: Run;
  readonly planner: RoleProvider;
  readonly prompt: PromptFile;
  /** RF-604: the versioned prompt that asks a cut-off answer to go on. */
  readonly continuePrompt: PromptFile;
  /** RF-604: told when the answer is still cut off; without it the call fails with RST-1805. */
  readonly onCutOff?: (message: string) => Promise<void>;
  /** P5-38, P3-126: told when a continuation began the next list item and the unfinished one was left out. */
  readonly onReplaced?: (message: string) => Promise<void>;
  /** The agent task the call is logged under: one per document the planner writes. */
  readonly agentTaskId: string;
  readonly updates: ManifestUpdates;
  /** RF-1015: told before each provider call, with the agent task of the document being written. */
  readonly onCallStarted?: (agentTaskId: string) => Promise<void>;
  readonly tags: () => string;
  /** One numbering for every call of the run (RF-408): both calls share one counter. */
  readonly callId: () => string;
  readonly signal: AbortSignal;
  /** P3-113: the planner's window and output limit; the cards are packed to it. Unknown: nothing is packed. */
  readonly window?: PlanWindow | undefined;
}

// RF-604
export function askPlanner(call: PlannerCall, input: PlanMessageInput): Promise<string> {
  // P3-113: the cards that do not fit the planner's window are named by title only.
  return askPlannerWith(call, planMessage(packedInput(call, input), call.tags));
}

/** RF-623: a call with a user message the caller built (the data model has its own input). */
// RF-623, RF-604
export async function askPlannerWith(call: PlannerCall, message: string): Promise<string> {
  const limit = call.planner.maxOutputTokens;
  const messages: LlmMessage[] = [{ role: 'user', content: message }];
  let response = await send(call, messages);
  let text = response.text;
  let continued = 0;
  for (; continued < maxPlannerContinuations; continued += 1) {
    if (!isCutOff(text, { ...response.usage, finishReason: response.finishReason }, limit)) break;
    // The model is shown the answer up to its last complete JSON boundary and writes the rest.
    text = resumePoint(text);
    messages.splice(
      1,
      messages.length,
      { role: 'assistant', content: text },
      { role: 'user', content: call.continuePrompt.text.trimEnd() },
    );
    response = await send(call, messages);
    const joined = joinNoting(text, response.text);
    text = joined.text;
    if (joined.replaced) await call.onReplaced?.(replacedMessage);
  }
  const end = { ...response.usage, finishReason: response.finishReason };
  if (!endsCutOff(text, end, limit, continued)) return text;
  const problem = cutOffMessage(limit);
  if (call.onCutOff === undefined) {
    throw new RosettaError(ERROR_CODES.plannerAnswerCutOff, problem);
  }
  await call.onCutOff(problem);
  return text;
}

async function send(call: PlannerCall, messages: readonly LlmMessage[]): Promise<LlmResponse> {
  const { run, planner, signal } = call;
  await call.onCallStarted?.(call.agentTaskId);
  const traceId = traceIdOf(run);
  const response = await planner.provider.complete({
    context: {
      ...{ runId: run.runKey, agentTaskId: call.agentTaskId, role: 'planner' },
      ...{ callId: call.callId(), traceId, parentSpanId: `${traceId.slice(0, 13)}eee` },
    },
    model: planner.model,
    system: call.prompt.text,
    messages: [...messages],
    tools: [],
    maxOutputTokens: planner.maxOutputTokens,
    ...(planner.temperature === undefined ? {} : { temperature: planner.temperature }),
    signal,
  });
  await call.updates.update((manifest) =>
    recordManifestModelVersion(manifest, 'planner', response.modelVersion),
  );
  return response;
}
