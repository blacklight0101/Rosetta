import { useState } from 'preact/hooks';
import type { AreaChoice } from './area-selection.js';
import { useEstimate, type EstimateLoad } from './use-estimate.js';

// RF-425, RF-200, RF-1001: the estimate together with the choice of areas. The names come from the
// first estimate, which covers every area. The areas that hold only third-party files start
// unticked, so the estimate is asked again for the others; choosing a different set asks for the
// estimate of those alone, and choosing every area again asks for the plain one, unless the project has library areas: the plain
// estimate then covers the own code only (P3-123), so the names are sent.

interface KnownArea {
  readonly name: string;
  readonly estimatedTokens: number;
  readonly files: number;
  readonly thirdParty: boolean;
}

export interface EstimateChoice {
  readonly estimate: EstimateLoad;
  readonly areas: readonly AreaChoice[];
  readonly chosen: readonly string[];
  readonly toggle: (name: string) => void;
  /** Replaces the choice at once: every name given is ticked, the others are not. */
  readonly choose: (names: readonly string[]) => void;
  readonly reestimate: () => void;
}

// RF-425
export function useEstimateChoice(projectId: string): EstimateChoice {
  const [picked, setPicked] = useState<readonly string[] | undefined>();
  const [version, setVersion] = useState(0);
  const [known, setKnown] = useState<readonly KnownArea[]>([]);
  const names = known.map((area) => area.name);
  const chosen = picked ?? known.filter((area) => !area.thirdParty).map((area) => area.name);
  // P3-123: no list means the default (own code) when library areas exist, so ticking every area sends the names.
  const plain = chosen.length === names.length && !known.some((area) => area.thirdParty);
  const estimate = useEstimate({ projectId, areas: plain ? undefined : chosen, version });
  // The first answer is the estimate of every area; the list of areas never changes after it.
  if (known.length === 0 && estimate.status === 'ready') setKnown(estimate.estimate.areas);
  return {
    estimate,
    chosen,
    areas: known.map((area) => ({ ...area, checked: chosen.includes(area.name) })),
    toggle: (name) => {
      const next = names.filter((each) => (each === name) !== chosen.includes(each));
      setPicked(next);
    },
    choose: (next) => {
      setPicked(next);
    },
    reestimate: () => {
      setVersion((current) => current + 1);
    },
  };
}
