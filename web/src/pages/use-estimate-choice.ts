import { useRef, useState } from 'preact/hooks';
import type { AreaChoice } from './StageAreasSection.js';
import { useEstimate, type EstimateLoad } from './use-estimate.js';

// RF-425, RF-200: the estimate together with the choice of areas. The names come from the first
// estimate, which covers every area; choosing fewer asks for the estimate of those alone, and
// choosing all again asks for the plain one.

interface KnownArea {
  readonly name: string;
  readonly estimatedTokens: number;
}

export interface EstimateChoice {
  readonly estimate: EstimateLoad;
  readonly areas: readonly AreaChoice[];
  readonly chosen: readonly string[];
  readonly toggle: (name: string) => void;
  readonly reestimate: () => void;
}

// RF-425
export function useEstimateChoice(projectId: string): EstimateChoice {
  const [picked, setPicked] = useState<readonly string[] | undefined>();
  const [version, setVersion] = useState(0);
  const known = useRef<readonly KnownArea[]>([]);
  const everyArea = picked === undefined || picked.length === known.current.length;
  const estimate = useEstimate({ projectId, areas: everyArea ? undefined : picked, version });
  if (picked === undefined && estimate.status === 'ready') known.current = estimate.estimate.areas;
  const names = known.current.map((area) => area.name);
  const chosen = picked ?? names;
  return {
    estimate,
    chosen,
    areas: known.current.map((area) => ({ ...area, checked: chosen.includes(area.name) })),
    toggle: (name) => {
      const next = names.filter((each) => (each === name) !== chosen.includes(each));
      setPicked(next.length === names.length ? undefined : next);
    },
    reestimate: () => {
      setVersion((current) => current + 1);
    },
  };
}
