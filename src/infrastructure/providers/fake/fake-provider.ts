import type {
  LlmAttemptObserver,
  LlmProvider,
  LlmRequest,
  LlmResponse,
} from '../../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../../domain/errors/codes.js';
import { RosettaError } from '../../../domain/errors/rosetta-error.js';
import { ProviderCallError } from '../provider-call-error.js';
import type { RecordedCall, Recording } from './recording.js';

export interface FakeProviderOptions {
  /** `ROSETTA_TEST=1` (the parsed environment's `test`). */
  readonly testMode: boolean;
  readonly recording: Recording;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: signal.reason });
  }
}

// ADR-008, RF-400: replays a recording call by call, failing where the recording says so, and
// never touches the network. DEC-112, RNF-005: refused unless ROSETTA_TEST=1, so `kind: fake`
// cannot run in a real deployment.
export class FakeProvider implements LlmProvider {
  /** Every request the fake received, as it received it, so a test can see what was sent. */
  readonly requests: LlmRequest[] = [];
  private readonly calls: readonly RecordedCall[];
  private next = 0;

  constructor(options: FakeProviderOptions) {
    if (!options.testMode) throw new RosettaError(ERROR_CODES.fakeProviderRefused);
    this.calls = options.recording.calls;
  }

  async complete(request: LlmRequest, observer?: LlmAttemptObserver): Promise<LlmResponse> {
    throwIfAborted(request.signal);
    this.requests.push(request);
    const call = this.calls[this.next];
    if (call === undefined) throw new RosettaError(ERROR_CODES.recordingExhausted);
    this.next += 1;
    const last = call.attempts.length - 1;
    for (const [index, attempt] of call.attempts.entries()) {
      throwIfAborted(request.signal);
      observer?.attemptStarted();
      if ('response' in attempt) return attempt.response;
      if (index === last) throw new ProviderCallError(attempt.failure);
      await observer?.attemptRetried(attempt.failure);
    }
    throw new RosettaError(ERROR_CODES.recordingInvalid);
  }
}
