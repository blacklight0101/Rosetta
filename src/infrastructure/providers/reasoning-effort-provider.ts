import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
  ReasoningEffort,
} from '../../application/ports/llm-provider.js';

// RF-402, RF-404, Q-58: the outermost wrapper of a role's provider. It puts the role's reasoning
// effort on every call that does not carry one. The provider factory wraps only a role whose model
// the shipped list marks as a reasoning model, so no other model is ever sent an effort; the guards
// inside see the request as it reaches the adapter.
export class ReasoningEffortProvider implements LlmProvider {
  private readonly inner: LlmProvider;
  private readonly effort: ReasoningEffort;

  constructor(inner: LlmProvider, effort: ReasoningEffort) {
    this.inner = inner;
    this.effort = effort;
  }

  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const given = request.reasoningEffort ?? this.effort;
    return this.inner.complete({ ...request, reasoningEffort: given }, observer);
  }
}
