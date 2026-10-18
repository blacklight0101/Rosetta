import { noDesignBrief, type UxDraft } from '../../domain/planning/target-ux.js';

// RF-626, ADR-013: the planner's screens answer (stub of the red step).

// RF-626
export function parseUxAnswer(output: string): UxDraft | undefined {
  const none: UxDraft | undefined =
    output === 'stub' ? { screens: [], dropped: [], designBrief: noDesignBrief } : undefined;
  return none;
}
