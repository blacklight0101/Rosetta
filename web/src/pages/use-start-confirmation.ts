import { useRef, useState } from 'preact/hooks';
import { needsCapConfirmation, needsConfirmation } from '../lib/start-confirmation.js';

// RF-425, DEC-97: the question the start page asks before an expensive run, and what it remembers
// of the answer: the highest likely cost the user confirmed, so the same figure is not asked about
// twice. A cancelled question remembers nothing. RF-429: it also asks when a run on local models
// has likely tokens above the run token cap, which a cost threshold cannot see.

/** RF-429: the likely tokens of a local estimate and the run token cap they are compared with. */
export interface TokenCap {
  readonly likelyTokens: number | undefined;
  readonly capTokens: number;
}

export interface StartConfirmation {
  /** The question is open. */
  readonly asking: boolean;
  /** True when the likely cost needs a confirmation first; the question is then opened. */
  readonly ask: (thresholdMicros: number) => boolean;
  /** The user confirmed the figure the page shows: it is not asked about again. */
  readonly accept: () => void;
  readonly decline: () => void;
}

// RF-425
export function useStartConfirmation(
  likelyMicros: bigint | undefined,
  tokens: TokenCap,
): StartConfirmation {
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(0n);
  const confirmedTokens = useRef(0);
  return {
    asking,
    ask: (thresholdMicros) => {
      const input = { likelyMicros, thresholdMicros: BigInt(thresholdMicros) };
      const cost = needsConfirmation({ ...input, confirmedMicros: confirmed.current });
      const cap = needsCapConfirmation({ ...tokens, confirmedTokens: confirmedTokens.current });
      if (!cost && !cap) return false;
      setAsking(true);
      return true;
    },
    accept: () => {
      confirmed.current = likelyMicros ?? confirmed.current;
      confirmedTokens.current = tokens.likelyTokens ?? confirmedTokens.current;
      setAsking(false);
    },
    decline: () => {
      setAsking(false);
    },
  };
}
