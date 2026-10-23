import type { Logger } from '../../application/ports/logger.js';
import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  ProviderKind,
  ReasoningEffort,
} from '../../application/ports/llm-provider.js';

// RF-402, RF-404, Q-58, P3-129: the outermost wrapper of a role's provider. It puts the role's
// reasoning effort on every call that does not carry one. The provider factory wraps only a role
// whose model the shipped list marks as a reasoning model, so no other model is ever sent an
// effort; the guards inside see the request as it reaches the adapter. For OpenAI the factory also
// gives `toolEffort`: Chat Completions refuses function tools with any other effort than `none`
// (HTTP 400), so a call that carries tools is sent with `none` and `loweredNote` is told.
interface ToolEffort {
  readonly toolEffort: 'none';
  /** Called before a call whose effort was lowered; the factory writes the run log note once. */
  readonly loweredNote: (request: LlmRequest) => Promise<void>;
}

class ReasoningEffortProvider implements LlmProvider {
  private readonly inner: LlmProvider;
  private readonly effort: ReasoningEffort;
  private readonly forTools: ToolEffort | undefined;

  constructor(inner: LlmProvider, effort: ReasoningEffort, forTools?: ToolEffort) {
    this.inner = inner;
    this.effort = effort;
    this.forTools = forTools;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    if (this.forTools !== undefined && request.tools.length > 0) {
      await this.forTools.loweredNote(request);
      return this.inner.complete(
        { ...request, reasoningEffort: this.forTools.toolEffort },
        observer,
      );
    }
    const given = request.reasoningEffort ?? this.effort;
    return this.inner.complete({ ...request, reasoningEffort: given }, observer);
  }
}

/** Whether the run log already notes the effort lowered for tool calls (one note per run). */
export interface EffortNote {
  noted: boolean;
  /** The run owner's logger. */
  readonly logger: Logger;
}

/** P3-129: the run log note that an effort was lowered because the call carries tools. */
function loweredEffortNote(note: EffortNote): (request: LlmRequest) => Promise<void> {
  return async (request) => {
    if (note.noted) return;
    note.noted = true;
    const { runId, agentTaskId, callId } = request.context;
    await note.logger.log({
      level: 'info',
      logger: 'providers',
      message:
        'OpenAI accepts function tools on Chat Completions only with reasoning effort none, so calls that carry tools were sent with reasoning effort none; calls without tools keep the role effort.',
      runId,
      agentTaskId,
      callId,
    });
  };
}

export interface RoleEffort {
  readonly kind: ProviderKind;
  /** The shipped list marks the role's model as a reasoning model (Q-58). */
  readonly marked: boolean;
  /** P3-131: the list routes the model's calls with tools through the Responses API. */
  readonly responses?: boolean;
  readonly effort: ReasoningEffort;
  readonly note: EffortNote;
}

/**
 * Q-58: a role on a reasoning model sends its reasoning effort (low unless the project sets
 * another); any other model is given none. P3-129: OpenAI gets effort none for calls with tools.
 */
export function withRoleEffort(provider: LlmProvider, role: RoleEffort): LlmProvider {
  if (!role.marked) return provider;
  // P3-131: Responses takes function tools with any effort, so the role effort is kept.
  if (role.kind !== 'openai' || role.responses === true)
    return new ReasoningEffortProvider(provider, role.effort);
  return new ReasoningEffortProvider(provider, role.effort, {
    toolEffort: 'none',
    loweredNote: loweredEffortNote(role.note),
  });
}
