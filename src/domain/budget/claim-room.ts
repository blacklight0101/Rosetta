// RF-429, P5-20, DEC-170 (amends DEC-166): whether the readers of a run may start another task or
// take another turn. The readers' spend plus the estimated cost of judging every claim written and
// not yet judged has to stay within the readers' and the verifier's part of the run caps (90%, the
// rest is the summariser's), and within the verifier's own share; and the readers' own share has to
// have room for one more call. Tokens are the cap-weighted count of DEC-168.

/**
 * The tokens one judgement is taken to cost before the run has judged a claim. A verifier call
 * sends its prompt (about 4,000 characters, 1,000 tokens), the claim and the cited lines (about 700
 * tokens) and reads back a short verdict (about 150); the Haiku 5.5 battery of 2026-10-23 spent
 * about 1,650 tokens per judged claim (a fifth of a 2,000,000 token cap judged 242 claims).
 */
export const DEFAULT_JUDGING_TOKENS = 2_000n;

/** The part of a run cap the readers and the verifier share; the rest is the summariser's. */
const READERS_AND_VERIFIER_PERCENT = 90n;

/** Cap-weighted tokens (DEC-168) and micro-dollars spent. */
export interface Spend {
  readonly tokens: bigint;
  readonly micros: bigint;
}

export interface RoomFacts {
  readonly limits: {
    /** The run caps in force; a cost cap of 0 is not checked. */
    readonly runTokens: bigint;
    readonly runMicros: bigint;
    /** The readers' share of the run token cap, or the reader token cap of the project. */
    readonly readerTokens: bigint;
    /** The verifier's share of the run token cap, or the verifier token cap of the project. */
    readonly verifierTokens: bigint;
    /** The verifier cost cap of the project, when it sets one. */
    readonly verifierMicros?: bigint;
    /** The least a reader call needs: its output limit, which every worst case includes. */
    readonly callTokens: bigint;
  };
  readonly readers: Spend;
  readonly verifier: Spend;
  /** Claims written and not judged, and claims the verifier has judged so far in the run. */
  readonly claims: { readonly unjudged: number; readonly judged: number };
}

type RoomVerdict = 'open' | 'readers-full' | 'judging';

/** The run's own average per judged claim; before the first judgement the stated default. */
// RF-429
export function judgingEstimate(facts: RoomFacts): Spend {
  const { judged } = facts.claims;
  const { verifier, readers } = facts;
  if (judged > 0 && verifier.tokens > 0n) {
    const n = BigInt(judged);
    return { tokens: (verifier.tokens + n - 1n) / n, micros: (verifier.micros + n - 1n) / n };
  }
  const priced =
    readers.tokens > 0n ? (DEFAULT_JUDGING_TOKENS * readers.micros) / readers.tokens : 0n;
  return { tokens: DEFAULT_JUDGING_TOKENS, micros: priced };
}

function within(spent: bigint, cap: bigint, percent: bigint): boolean {
  return spent * 100n <= cap * percent;
}

/** Whether judging the waiting claims fits the caps beside what the readers and verifier spent. */
function judgingFits(facts: RoomFacts): boolean {
  const { limits, readers, verifier, claims } = facts;
  const waiting = BigInt(claims.unjudged);
  const each = judgingEstimate(facts);
  const tokens = waiting * each.tokens;
  const micros = waiting * each.micros;
  const together = within(
    readers.tokens + verifier.tokens + tokens,
    limits.runTokens,
    READERS_AND_VERIFIER_PERCENT,
  );
  const own = verifier.tokens + tokens <= limits.verifierTokens;
  const dear =
    limits.runMicros > 0n &&
    !within(
      readers.micros + verifier.micros + micros,
      limits.runMicros,
      READERS_AND_VERIFIER_PERCENT,
    );
  const ownCost =
    limits.verifierMicros === undefined || verifier.micros + micros <= limits.verifierMicros;
  return together && own && !dear && ownCost;
}

// RF-429
export function roomVerdict(facts: RoomFacts): RoomVerdict {
  const { limits, readers, claims } = facts;
  if (readers.tokens + limits.callTokens > limits.readerTokens) return 'readers-full';
  if (claims.unjudged === 0) return 'open';
  return judgingFits(facts) ? 'open' : 'judging';
}
