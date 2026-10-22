import type { LlmAttemptObserver, TokenUsage } from '../../application/ports/llm-provider.js';

// RF-406, RF-428, Q-60: what the budget guard learns of a call's attempts from the decorators
// inside it: how many started (the ledger row's attempt number) and the usage of the attempts
// retried before the one that closes the call, which are all metered. The caller's own observer
// still hears of every attempt.

export interface AttemptCount {
  /** The observer the guard hands to the provider it wraps. */
  readonly observer: LlmAttemptObserver;
  /** How many attempts started so far. */
  readonly attempts: () => number;
  /** The usage of the attempts retried so far, in order. */
  readonly earlier: readonly TokenUsage[];
}

export function countAttempts(outer?: LlmAttemptObserver): AttemptCount {
  let attempts = 0;
  const earlier: TokenUsage[] = [];
  const observer: LlmAttemptObserver = {
    attemptStarted: () => {
      attempts += 1;
      outer?.attemptStarted();
    },
    attemptRetried: (failure) => {
      if (failure.usage !== undefined) earlier.push(failure.usage);
      return outer?.attemptRetried(failure) ?? Promise.resolve();
    },
  };
  return { observer, attempts: () => attempts, earlier };
}
