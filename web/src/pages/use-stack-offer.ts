import { useEffect, useState } from 'preact/hooks';
import { getStackOffer } from '../api/plan.js';
import type { StackOffer } from '../api/plan-schemas.js';
import { useApp } from '../app/app-context.js';

// P7-29, RF-609, RF-645, DEC-203: the catalogue's options of each stack layer, read once for the
// project; it sends no code, so it needs no consent. While it loads, or when it fails, the stack
// step falls back to the planner's options and the legacy and own-answer choices.

// RF-609
export function useStackOffer(
  projectId: string,
  sourceRunId: string | undefined,
): StackOffer | undefined {
  const { client } = useApp();
  const [offer, setOffer] = useState<StackOffer | undefined>(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void getStackOffer(client, projectId, sourceRunId, controller.signal).then((result) => {
      if (result.ok) setOffer(result.value);
    });
    return () => {
      controller.abort();
    };
  }, [client, projectId, sourceRunId]);
  return offer;
}
