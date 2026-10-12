import { createContext } from 'preact';
import { useContext, useEffect, useRef } from 'preact/hooks';

// RF-1010: a page that follows a run tells the signed-in shell when a model call completed, so the
// totals pill in the header reads the ledger again while the run works, with no reload.

export const UsageSignalContext = createContext<() => void>(() => undefined);

/** Announces a model call each time `progress` grows (the live run page passes its turn count). */
// RF-1010
export function useAnnounceUsage(progress: number): void {
  const announce = useContext(UsageSignalContext);
  const seen = useRef(progress);
  useEffect(() => {
    if (progress > seen.current) announce();
    seen.current = progress;
  }, [progress, announce]);
}
