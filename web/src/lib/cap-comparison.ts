import type { RunEstimate } from '../api/estimate-schemas.js';
import {
  dollars,
  isLocalEstimate,
  percentOf,
  pricedTotal,
  tokensText,
  totalTokens,
  unpricedRoles,
} from './estimate-math.js';

// RF-425, Q-51, Q-44: what the cap meter of the start page compares and says. The likely estimate is
// compared with the run cap in the unit of the cap: dollars when any role is priced, tokens (against
// the run token cap) when every role runs on a local model, which costs nothing. The sentence never
// writes a dollar figure for a local estimate.

export interface CapComparison {
  /** The accessible name of the meter. */
  readonly label: string;
  /** Whole percent of the cap the likely estimate uses; may be over 100. */
  readonly used: number;
  /** Whole percent of the cap the high estimate reaches; may be over 100. */
  readonly mark: number;
  readonly sentence: string;
}

export interface RunCaps {
  readonly micros: bigint;
  readonly tokens: number;
  /** RF-434, P9-12: the figure is the journey's approved amount, the one limit the start page names. */
  readonly approved?: boolean;
}

function tokenComparison(estimate: RunEstimate, caps: RunCaps): CapComparison {
  const likely = totalTokens(estimate.total, 'likely');
  const high = totalTokens(estimate.total, 'high');
  const cap = BigInt(caps.tokens);
  const used = percentOf(BigInt(likely), cap);
  const noun = caps.approved === true ? 'the approved amount' : 'the run token cap';
  return {
    label: 'Likely tokens against the cap',
    used,
    mark: percentOf(BigInt(high), cap),
    sentence:
      `Likely ${tokensText(likely)} is ${String(used)}% of ${noun} of ` +
      `${tokensText(caps.tokens)}; the marker shows the high estimate, ${tokensText(high)}.`,
  };
}

function costComparison(estimate: RunEstimate, caps: RunCaps): CapComparison {
  const cap = caps.micros;
  const noun = caps.approved === true ? 'the approved amount' : 'the cap';
  const likely = pricedTotal(estimate, 'likely');
  const high = pricedTotal(estimate, 'high');
  const used = percentOf(likely, cap);
  const unpriced = unpricedRoles(estimate).map((role) => `${role.provider} / ${role.model}`);
  const leftOut =
    unpriced.length === 0
      ? ''
      : ` Each leaves out ${unpriced.join(', ')}, which has no price, so the cost may be higher.`;
  return {
    label: 'Likely cost against the cap',
    used,
    mark: percentOf(high, cap),
    sentence:
      `Likely ${dollars(likely)} is ${String(used)}% of ${noun}; the marker shows the high ` +
      `estimate, ${dollars(high)}.${leftOut}`,
  };
}

// RF-425
export function capComparison(estimate: RunEstimate, caps: RunCaps): CapComparison {
  return isLocalEstimate(estimate)
    ? tokenComparison(estimate, caps)
    : costComparison(estimate, caps);
}
