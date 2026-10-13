import { setTimeout as sleep } from 'node:timers/promises';
import type {
  LlmCallContext,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../src/application/ports/llm-provider.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { preflightAgentTaskId } from '../../src/application/understand/reader-preflight.js';
import { ProviderCallError } from '../../src/infrastructure/providers/provider-call-error.js';

// ADR-008, RF-407: the model of the end-to-end test server. It answers every call with a short text
// and small usage, and fails the calls of the roles in `failing` with RST-1506, so a journey can
// show one role reachable and another with its error. It never touches the network. With
// `holdUnderstandMs` the first reader call of each understand run waits that long, so the run is
// still working when a second run is asked for and that one waits in the queue (P1-34); the later
// calls of the run answer at once, so a run of several areas takes no longer than one hold. A run
// is told apart by its trace id (one per run): the run key has one-second resolution and is shared
// by every user of the server. The start check of an Ollama reader (RF-401) is not a reader's call:
// the hold goes to the first one.

export class AnsweringProvider implements LlmProvider {
  private readonly failing: ReadonlySet<string>;

  private readonly holdUnderstandMs: number;

  /** The trace ids of the understand runs whose first reader call has been held. */
  private readonly held = new Set<string>();

  constructor(failing: readonly string[] = [], holdUnderstandMs = 0) {
    this.failing = new Set(failing);
    this.holdUnderstandMs = holdUnderstandMs;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (this.holdsFirstReaderCall(request.context)) {
      await sleep(this.holdUnderstandMs, undefined, { signal: request.signal }).catch(
        () => undefined,
      );
    }
    if (this.failing.has(request.context.role)) {
      throw new ProviderCallError({ code: ERROR_CODES.providerCallFailed });
    }
    return {
      text: 'OK',
      toolCalls: [],
      usage: { inputTokens: 24, outputTokens: 2, cachedInputTokens: 0, usageSource: 'reported' },
      finishReason: 'stop',
      modelVersion: 'answering-provider-1',
    };
  }

  private holdsFirstReaderCall({ role, runId, traceId, agentTaskId }: LlmCallContext): boolean {
    if (this.holdUnderstandMs <= 0 || role !== 'reader' || !runId.endsWith('-understand')) {
      return false;
    }
    if (agentTaskId === preflightAgentTaskId || this.held.has(traceId)) return false;
    this.held.add(traceId);
    return true;
  }
}
