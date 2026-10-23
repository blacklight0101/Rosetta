import type { Money } from '../../domain/budget/money.js';
import type { Clock } from '../../application/ports/clock.js';
import type { IdGenerator } from '../../application/ports/id-generator.js';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
  LlmMessage,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../application/ports/llm-provider.js';
import type {
  ProviderCallRecorder,
  TranscriptEntry,
} from '../../application/ports/provider-call-recorder.js';
import type { TextMasker } from '../guards/secret-masker.js';
import { CallAttempts, failureOf, type CallPricer, type ProviderTarget } from './call-attempts.js';
import { boundedErrorText } from './error-text.js';
import { ProviderCallError } from './provider-call-error.js';
import { laterRef } from './provider-call-lines.js';

export interface ObservedProviderOptions {
  readonly inner: LlmProvider;
  readonly recorder: ProviderCallRecorder;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly target: ProviderTarget;
  readonly priceCall: CallPricer;
  /** The project setting `output.transcripts` (DEC-43). */
  readonly transcripts: boolean;
  /** RF-408: masks the provider's error text before a record or a log entry keeps it. */
  readonly masker: TextMasker;
}

const spanIdLength = 16;

interface TranscribedTask {
  readonly messages: number;
  readonly lastRef: string;
}

function entryOf(message: LlmMessage, at: string, callId: string): TranscriptEntry {
  switch (message.role) {
    case 'assistant':
      return {
        at,
        callId,
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls === undefined ? {} : { toolCalls: message.toolCalls }),
      };
    case 'user':
    case 'tool':
      return { at, callId, role: message.role, content: message.content };
  }
}

// RF-408, DEC-50: the innermost decorator of every provider. It writes the call's new messages to
// the masked transcript of its agent task, then one `provider-calls.jsonl` record per attempt,
// linked to that transcript entry; the call itself passes through unchanged (RF-400).
export class ObservedProvider implements LlmProvider {
  private readonly options: ObservedProviderOptions;
  /** Per agent task: how many request messages its transcript holds, and its last line. */
  private readonly transcribed = new Map<string, TranscribedTask>();

  constructor(options: ObservedProviderOptions) {
    this.options = options;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    const { clock, ids, recorder, inner, target } = this.options;
    const transcriptRef = await this.transcribeRequest(request);
    const spanId = ids.uuid().replaceAll('-', '').slice(-spanIdLength);
    const attempts = new CallAttempts({ request, target, clock, spanId, transcriptRef });
    const watcher: LlmAttemptObserver = {
      attemptStarted: () => {
        attempts.started();
        observer?.attemptStarted();
      },
      attemptRetried: async (raw: LlmAttemptFailure) => {
        const failure = this.maskedFailure(raw);
        await recorder.record(attempts.failed('retried', failure, this.costOf(request, failure)));
        await observer?.attemptRetried(failure);
      },
    };
    let response: LlmResponse;
    try {
      response = await inner.complete(request, watcher);
    } catch (error) {
      const failure = this.maskedFailure(failureOf(error));
      if (error instanceof ProviderCallError) error.providerError = failure.providerError;
      await recorder.record(attempts.failed('failed', failure, this.costOf(request, failure)));
      throw error;
    }
    const cost = this.options.priceCall({
      provider: target.provider,
      model: request.model,
      usage: response.usage,
    });
    const record = attempts.succeeded(response, cost);
    await this.transcribeAnswer(request, response);
    await recorder.record(record);
    return response;
  }

  /** RF-408: the failure with its provider error text masked and cut, or without it. */
  private maskedFailure(failure: LlmAttemptFailure): LlmAttemptFailure {
    const { providerError, ...rest } = failure;
    const text =
      providerError === undefined
        ? undefined
        : boundedErrorText(providerError, this.options.masker);
    return text === undefined ? rest : { ...rest, providerError: text };
  }

  /** Q-60: the price of the usage a failed attempt is metered with, when it has one. */
  private costOf(request: LlmRequest, failure: LlmAttemptFailure): Money | undefined {
    const { usage } = failure;
    if (usage === undefined) return undefined;
    const { priceCall, target } = this.options;
    return priceCall({ provider: target.provider, model: request.model, usage });
  }

  /**
   * Appends the system prompt (first call of a task) and the messages the task's transcript does
   * not hold yet, and returns the link to the first of them. A call that adds nothing (the same
   * messages again) links to the transcript's last line. Messages are append-only (LlmRequest).
   */
  private async transcribeRequest(request: LlmRequest): Promise<string | undefined> {
    if (!this.options.transcripts) return undefined;
    const { agentTaskId, callId } = request.context;
    const known = this.transcribed.get(agentTaskId);
    const at = this.options.clock.now().toISOString();
    const system: TranscriptEntry[] =
      known === undefined ? [{ at, callId, role: 'system', content: request.system }] : [];
    const added = request.messages
      .slice(known?.messages ?? 0)
      .map((message) => entryOf(message, at, callId));
    const entries = [...system, ...added];
    if (known !== undefined && entries.length === 0) return known.lastRef;
    const ref = await this.options.recorder.transcript(agentTaskId, entries);
    const lastRef = laterRef(ref, entries.length - 1);
    this.transcribed.set(agentTaskId, { messages: request.messages.length, lastRef });
    return ref;
  }

  private async transcribeAnswer(request: LlmRequest, response: LlmResponse): Promise<void> {
    if (!this.options.transcripts) return;
    const { agentTaskId, callId } = request.context;
    const { text, toolCalls } = response;
    const answer: LlmMessage = {
      role: 'assistant',
      content: text,
      ...(toolCalls.length === 0 ? {} : { toolCalls }),
    };
    const at = this.options.clock.now().toISOString();
    const lastRef = await this.options.recorder.transcript(agentTaskId, [
      entryOf(answer, at, callId),
    ]);
    this.transcribed.set(agentTaskId, { messages: request.messages.length + 1, lastRef });
  }
}
