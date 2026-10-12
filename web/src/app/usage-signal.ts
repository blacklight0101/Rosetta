import { createContext } from 'preact';

// RF-1010: a page that follows a run tells the signed-in shell when a model call completed, so the
// totals pill in the header reads the ledger again while the run works.

export const UsageSignalContext = createContext<() => void>(() => undefined);

/** Announces a model call each time `progress` grows (the live run page passes its turn count). */
// RF-1010
export function useAnnounceUsage(_progress: number): void {
  // Filled by P1-36.
}
