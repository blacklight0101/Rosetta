// RF-1011, DEC-57: the figures of the "API calls" panel, computed from the attempts of the provider
// call log. Pure functions over plain samples.

export type CallStatus = 'ok' | 'retried' | 'failed' | 'refused-by-cap';

/** The fields of one call attempt the summary needs; a provider call record has all of them. */
export interface CallSample {
  readonly provider: string;
  readonly role: string;
  readonly status: CallStatus;
  readonly latencyMs: number;
  readonly timeToFirstTokenMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
  readonly ollama?: { readonly tokensPerSecond: number } | undefined;
}

export interface ProviderRoleSummary {
  readonly provider: string;
  readonly role: string;
  /** Every attempt, whatever its status. */
  readonly calls: number;
  readonly retried: number;
  readonly failed: number;
  readonly refused: number;
  /** Attempts that ended in a provider error: `retried` plus `failed`. */
  readonly errors: number;
  readonly latencyP50Ms: number | null;
  readonly latencyP95Ms: number | null;
  readonly firstTokenP50Ms: number | null;
  readonly firstTokenP95Ms: number | null;
  /** Ollama only: the mean generation speed of its answered attempts; null for other providers. */
  readonly tokensPerSecond: number | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costMicros: number;
}

// RF-1011
export function percentile(values: readonly number[], percent: number): number | null {
  void values;
  void percent;
  return null;
}

// RF-1011
export function summarizeCalls(samples: readonly CallSample[]): readonly ProviderRoleSummary[] {
  void samples;
  return [];
}
