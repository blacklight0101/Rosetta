import type { ErrorCode } from '../../domain/errors/codes.js';

// RF-400, ADR-003, DEC-09: every model call of every role goes through this one port, and every
// provider answers in this one shape. Provider-specific types never pass an adapter.

/** The provider families of the project settings (data-model.md section 3.1). */
export type ProviderKind = 'ollama' | 'openai' | 'openai-compatible' | 'anthropic' | 'fake';

/** The roles a run assigns a provider and model to (RF-405). */
export type AgentRole = 'reader' | 'verifier' | 'planner' | 'summariser';

/** Normalised finish reasons (data-model.md section 3.10); `error` only marks a failed attempt. */
export type FinishReason = 'stop' | 'length' | 'tool_use' | 'error';

/** `estimated` when the provider reported no usage (RF-421). */
export type UsageSource = 'reported' | 'estimated';

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** The JSON Schema of the arguments. */
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ToolCall {
  readonly id: string;
  readonly name: string;
  /** Untrusted model output: the agent loop parses it with the tool's schema (ADR-013). */
  readonly arguments: unknown;
}

export type LlmMessage =
  | { readonly role: 'user'; readonly content: string }
  | {
      readonly role: 'assistant';
      readonly content: string;
      readonly toolCalls?: readonly ToolCall[];
    }
  | { readonly role: 'tool'; readonly toolCallId: string; readonly content: string };

/**
 * Who makes the call. The caller creates `callId` (`<runId>#<n>`) and the trace ids, so the
 * guards and the call log of one call share them (data-model.md sections 3.10 and 3.11).
 */
export interface LlmCallContext {
  readonly runId: string;
  readonly agentTaskId: string;
  readonly role: AgentRole;
  readonly callId: string;
  /** One per run, 32 hex characters. */
  readonly traceId: string;
  /** The agent task's span, 16 hex characters. */
  readonly parentSpanId: string;
}

export interface LlmRequest {
  readonly context: LlmCallContext;
  readonly model: string;
  readonly system: string;
  /**
   * The agent task's conversation so far. It is append-only: each call repeats the earlier
   * messages unchanged and adds new ones at the end, so the transcript records only the new ones
   * (RF-408).
   */
  readonly messages: readonly LlmMessage[];
  readonly tools: readonly ToolDefinition[];
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Stop, shutdown and caps cancel the call through this signal (RF-422, RNF-002). */
  readonly signal: AbortSignal;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly usageSource: UsageSource;
}

/**
 * How the Ollama context size (`num_ctx`) of a call was chosen (DEC-114): the largest size that
 * fits in GPU memory, the floor although the model spills, the model's trained context, the
 * ceiling because Ollama could not be measured, or the project's fixed number.
 */
export type OllamaContextSource =
  'auto-fit' | 'auto-floor' | 'auto-model-limit' | 'auto-fallback' | 'fixed';

/** Ollama's own timings of a call (RF-408) and the context size it was sent (RF-401). */
export interface OllamaMetrics {
  readonly loadDurationMs: number;
  readonly promptEvalDurationMs: number;
  readonly evalDurationMs: number;
  readonly tokensPerSecond: number;
  readonly contextTokens?: number;
  readonly contextSource?: OllamaContextSource;
}

/** What an adapter measured on the wire, for the call log (RF-408). */
export interface LlmCallMetrics {
  /** Left out when the adapter does not stream; the first token then arrives with the answer. */
  readonly timeToFirstTokenMs?: number;
  readonly httpStatus?: number;
  readonly ollama?: OllamaMetrics;
}

export interface LlmResponse {
  readonly text: string;
  readonly toolCalls: readonly ToolCall[];
  readonly usage: TokenUsage;
  readonly finishReason: Exclude<FinishReason, 'error'>;
  /** The provider's own request id, when it returns one. */
  readonly requestId?: string;
  /** The exact model version the provider reports (dated id; for Ollama the digest, RNF-004). */
  readonly modelVersion: string;
  readonly metrics?: LlmCallMetrics;
}

/** One failed attempt of a call (RF-406). */
export interface LlmAttemptFailure {
  readonly code: ErrorCode;
  readonly httpStatus?: number;
  readonly requestId?: string;
}

/**
 * RF-406, RF-408: adapters retry inside themselves; they tell the observer when each attempt starts
 * and when one fails and will be retried, so the call log holds one record per attempt.
 */
export interface LlmAttemptObserver {
  attemptStarted(): void;
  attemptRetried(failure: LlmAttemptFailure): Promise<void>;
}

export interface LlmProvider {
  /**
   * Sends one call and returns the answer. A call that fails for good rejects with a RosettaError
   * carrying an `RST-15xx` code; a cancelled call rejects with RST-1501.
   */
  complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse>;
}
