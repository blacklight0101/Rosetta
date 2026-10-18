import type { Citation } from '../cards/citation.js';
import type { PlanTask } from './plan-content.js';
import type { SourceCard } from './plan-sources.js';

// RF-631, DEC-135, ADR-018: skeleton.

export const coveredTypes = ['FEAT', 'BR', 'FLOW', 'SCRN'] as const;

export interface KeptBehaviour {
  readonly cardId: string;
  readonly claimId: string;
  readonly text: string;
  readonly citations: readonly Citation[];
}

export function behavioursToKeep(
  task: PlanTask,
  requirements: readonly { readonly id: string; readonly sources: readonly string[] }[],
  sources: readonly SourceCard[],
): KeptBehaviour[] {
  return [task, requirements, sources].length < 0 ? [] : [];
}
