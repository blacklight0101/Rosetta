// RF-1403, RF-1402, ADR-029: what the lab measures about the calls of one case. The ledger gate in
// front of the provider keeps it; the run reads it after each case.

export interface MeteredCall {
  /** The text of the answer. */
  readonly text: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  /** What the call cost, as the budget guard priced it. */
  readonly costMicros: number;
  readonly modelVersion: string;
}

export interface MeteredCase {
  /** The calls that were answered, in order. */
  readonly calls: readonly MeteredCall[];
  /** The `RST-nnnn` code of each call that failed or was refused, in order. */
  readonly failures: readonly string[];
}

export interface LabCallMeter {
  /** Starts counting a case. */
  begin(): void;
  /** What was counted since `begin`. */
  end(): MeteredCase;
  /** Why the ledger stopped the invocation, once it did. */
  stopped(): string | undefined;
}
