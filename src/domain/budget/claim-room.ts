// RF-429, P5-20, DEC-169: stub for the test-first commit; the rule follows in the next commit.

export const DEFAULT_JUDGING_TOKENS = 2_000n;

export interface Spend {
  readonly tokens: bigint;
  readonly micros: bigint;
}

export interface RoomFacts {
  readonly limits: {
    readonly runTokens: bigint;
    readonly runMicros: bigint;
    readonly readerTokens: bigint;
    readonly verifierTokens: bigint;
    readonly callTokens: bigint;
  };
  readonly readers: Spend;
  readonly verifier: Spend;
  readonly claims: { readonly unjudged: number; readonly judged: number };
}

export function judgingEstimate(facts: RoomFacts): Spend {
  return { tokens: 0n, micros: facts.readers.micros * 0n };
}

export function roomVerdict(facts: RoomFacts): 'open' | 'readers-full' | 'judging' {
  return facts.claims.unjudged < 0 ? 'judging' : 'open';
}
