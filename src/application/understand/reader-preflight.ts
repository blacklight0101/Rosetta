import { describeError } from '../../domain/errors/descriptions.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AgentRole, LlmRequest } from '../ports/llm-provider.js';
import type { ProviderSet, RoleProvider } from '../providers/provider-set.js';

// RF-401 (scenario 2), RF-205: the start check of an understand run. Before any agent task starts,
// one tiny call goes through the guards to each Ollama provider the run uses (once per provider
// name and model), so a stopped server or a model that is not pulled ends the run with its error
// code and the fix, instead of failing its first task. The prompt holds no repository content.

const preflightSystem =
  'You are a connectivity check for a software tool. Answer in as few words as possible.';
const preflightPrompt = 'Reply with the single word OK.';
/** Small, but enough for a model that spends some of its output on reasoning. */
const preflightMaxOutputTokens = 64;
const spanIdLength = 16;

/** The agent task id of the check's call: a test double must not take it for a reader's call. */
export const preflightAgentTaskId = 'ollama-preflight';

export interface PreflightProblem {
  readonly role: AgentRole;
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly model: string;
  readonly code: ErrorCode;
  /** The fix the error names (RST-1507 and RST-1508 say what to start or pull). */
  readonly nextStep: string;
}

export interface PreflightCall {
  readonly runId: string;
  readonly traceId: string;
  readonly nextCallId: () => string;
  /** The run's own signal: a stop of the run cancels the check. */
  readonly signal: AbortSignal;
}

/** One entry per Ollama provider name and model of the set, in the set's order. */
function ollamaTargets(set: ProviderSet): readonly (readonly [AgentRole, RoleProvider])[] {
  const seen = new Set<string>();
  const targets: (readonly [AgentRole, RoleProvider])[] = [];
  for (const [role, provider] of set) {
    const key = `${provider.name}\n${provider.model}`;
    if (provider.kind !== 'ollama' || seen.has(key)) continue;
    seen.add(key);
    targets.push([role, provider]);
  }
  return targets;
}

function requestFor(role: AgentRole, provider: RoleProvider, call: PreflightCall): LlmRequest {
  return {
    context: {
      runId: call.runId,
      agentTaskId: preflightAgentTaskId,
      role,
      callId: call.nextCallId(),
      traceId: call.traceId,
      parentSpanId: call.traceId.slice(-spanIdLength),
    },
    model: provider.model,
    system: preflightSystem,
    messages: [{ role: 'user', content: preflightPrompt }],
    tools: [],
    maxOutputTokens: Math.min(provider.maxOutputTokens, preflightMaxOutputTokens),
    signal: call.signal,
  };
}

/** The problem of a failed call: the error's code, and its fix when it names one. */
function problemOf(role: AgentRole, provider: RoleProvider, error: unknown): PreflightProblem {
  const failure =
    error instanceof RosettaError
      ? { code: error.code, nextStep: error.nextStep }
      : {
          code: ERROR_CODES.providerCallFailed,
          nextStep: describeError(ERROR_CODES.providerCallFailed).nextStep,
        };
  return { role, provider: provider.name, model: provider.model, ...failure };
}

/** RF-401: the Ollama providers of the run answer a tiny call, or the first problem is returned. */
export async function preflightOllama(
  set: ProviderSet,
  call: PreflightCall,
): Promise<Result<void, PreflightProblem>> {
  for (const [role, provider] of ollamaTargets(set)) {
    try {
      await provider.provider.complete(requestFor(role, provider, call));
    } catch (error) {
      return err(problemOf(role, provider, error));
    }
  }
  return ok(undefined);
}
