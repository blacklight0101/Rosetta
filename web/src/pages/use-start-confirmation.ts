import { useRef, useState } from 'preact/hooks';
import { needsConfirmation } from '../lib/start-confirmation.js';

// RF-425, DEC-97: the question the start page asks before an expensive run, and what it remembers
// of the answer: the highest likely cost the user confirmed, so the same figure is not asked about
// twice. A cancelled question remembers nothing.

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
export function useStartConfirmation(likelyMicros: bigint | undefined): StartConfirmation {
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(0n);
  return {
    asking,
    ask: (thresholdMicros) => {
      const input = { likelyMicros, thresholdMicros: BigInt(thresholdMicros) };
      if (!needsConfirmation({ ...input, confirmedMicros: confirmed.current })) return false;
      setAsking(true);
      return true;
    },
    accept: () => {
      confirmed.current = likelyMicros ?? confirmed.current;
      setAsking(false);
    },
    decline: () => {
      setAsking(false);
    },
  };
}
