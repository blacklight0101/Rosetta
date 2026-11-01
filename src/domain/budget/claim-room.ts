import { SUMMARISER_SHARE_PERCENT } from './budget.js';

// RF-429, P5-20, DEC-170, DEC-193: whether the readers of a run may start another task or take
// another turn. The run's spend (every role) plus the estimated cost of judging every claim written
// and not yet judged has to stay within the run caps less the summariser's part (90%): the verifier's
// room is what is left of the run cap, no fixed share of its own. The readers have no fixed share
// either (DEC-193): their next call has to fit below that line too, and within a reader token cap of
// the project settings when one is set. Tokens are the cap-weighted count of DEC-168.

/**
 * The tokens one judgement is taken to cost before the run has judged a claim. A verifier call
 * sends its prompt (about 4,000 characters, 1,000 tokens), the claim and the cited lines (about 700
 * tokens) and reads back a short verdict (about 150); the Haiku 5.5 battery of 2026-10-23 spent
 * about 1,650 tokens per judged claim (a fifth of a 2,000,000 token cap judged 242 claims).
 */
export const DEFAULT_JUDGING_TOKENS = 2_000n;

/** The part of a run cap the readers and the verifier share; the rest is the summariser's. */
const BELOW_SUMMARY_PERCENT = BigInt(100 - SUMMARISER_SHARE_PERCENT);

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
    /** The reader token cap of the project settings; none when unset (RF-423). */
    readonly readerTokens?: bigint;
    /** The least a reader call needs: its output limit, which every worst case includes. */
    readonly callTokens: bigint;
  };
  /** What every role of the run has spent, the readers and the verifier included. */
  readonly run: Spend;
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

/** Whether judging the waiting claims fits the run caps beside what the run has spent. */
function judgingFits(facts: RoomFacts): boolean {
  const { limits, run, claims } = facts;
  const waiting = BigInt(claims.unjudged);
  const each = judgingEstimate(facts);
  const tokens = within(
    run.tokens + waiting * each.tokens,
    limits.runTokens,
    BELOW_SUMMARY_PERCENT,
  );
  const dear =
    limits.runMicros > 0n &&
    !within(run.micros + waiting * each.micros, limits.runMicros, BELOW_SUMMARY_PERCENT);
  return tokens && !dear;
}

/** Whether one more reader call stays within a reader token cap of the project (RF-423). */
function ownCapFits(facts: RoomFacts): boolean {
  const { limits, readers } = facts;
  return (
    limits.readerTokens === undefined || readers.tokens + limits.callTokens <= limits.readerTokens
  );
}

// RF-429
export function roomVerdict(facts: RoomFacts): RoomVerdict {
  const { limits, run, claims } = facts;
  if (!ownCapFits(facts)) return 'readers-full';
  // DEC-193: no fixed share; the next call has to fit below the summariser's part of the run cap. A
  // run past that line has used its cap up (CapReached), whatever the claims waiting.
  const lineFits = within(run.tokens + limits.callTokens, limits.runTokens, BELOW_SUMMARY_PERCENT);
  if (!lineFits) return 'readers-full';
  return claims.unjudged > 0 && !judgingFits(facts) ? 'judging' : 'open';
}

/** RF-264, P7-26: the part of the run token cap the merges leave for the overview call. */
export const OVERVIEW_SHARE_PERCENT = 4;

/** RF-264, P7-26: whether a merge may still start, or the overview would be left without room. */
export function leavesOverviewRoom(run: Spend, runTokens: bigint): boolean {
  return within(run.tokens, runTokens, BigInt(100 - OVERVIEW_SHARE_PERCENT));
}
