import { recordManifestModelVersion } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { PromptFile } from '../agent/prompt-file.js';
import type { RoleProvider } from '../providers/provider-set.js';
import type { ManifestUpdates } from '../runs/manifest-updates.js';
import { callIds, traceIdOf } from '../runs/run-ids.js';
import { planMessage, type PlanMessageInput } from './plan-message.js';

// RF-604, ADR-003, ADR-006, ADR-007: the one model call of a plan run. It goes to the planner's
// guarded provider (budget guard, egress guard, call log) that the provider factory built for the
// run, with the run's abort signal; the system prompt is the versioned prompt file and the input
// sits in data blocks of the user message. The model version the provider reports is recorded in
// the manifest (RNF-004). A failed call rejects with the provider's error.

export interface PlannerCall {
  readonly run: Run;
  readonly planner: RoleProvider;
  readonly prompt: PromptFile;
  readonly updates: ManifestUpdates;
  readonly tags: () => string;
  readonly signal: AbortSignal;
}

// RF-604
export async function askPlanner(call: PlannerCall, input: PlanMessageInput): Promise<string> {
  const { run, planner, signal } = call;
  const traceId = traceIdOf(run);
  const response = await planner.provider.complete({
    context: {
      ...{ runId: run.runKey, agentTaskId: 'planner-package', role: 'planner' },
      ...{ callId: callIds(run)(), traceId, parentSpanId: `${traceId.slice(0, 13)}eee` },
    },
    model: planner.model,
    system: call.prompt.text,
    messages: [{ role: 'user', content: planMessage(input, call.tags) }],
    tools: [],
    maxOutputTokens: planner.maxOutputTokens,
    ...(planner.temperature === undefined ? {} : { temperature: planner.temperature }),
    signal,
  });
  await call.updates.update((manifest) =>
    recordManifestModelVersion(manifest, 'planner', response.modelVersion),
  );
  return response.text;
}
