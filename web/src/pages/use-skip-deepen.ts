import { useEffect, useState } from 'preact/hooks';
import { chooseSkipDeepen, onSkipDeepenChange, skippedDeepen } from '../lib/deepen-choice.js';

// RF-646, DEC-179: whether the user chose not to Deepen a run, shared by the "Your turn" panel and the
// journey strip of the same page.

export interface SkipDeepen {
  readonly skipped: boolean;
  readonly choose: (skip: boolean) => void;
}

// RF-646
export function useSkipDeepen(runId: string | undefined): SkipDeepen {
  const [skipped, setSkipped] = useState(() => runId !== undefined && skippedDeepen(runId));
  useEffect(() => {
    setSkipped(runId !== undefined && skippedDeepen(runId));
    return onSkipDeepenChange(() => {
      setSkipped(runId !== undefined && skippedDeepen(runId));
    });
  }, [runId]);
  return {
    skipped,
    choose: (skip) => {
      if (runId !== undefined) chooseSkipDeepen(runId, skip);
    },
  };
}
