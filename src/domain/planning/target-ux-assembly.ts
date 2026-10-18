import type { SourceCard } from './plan-sources.js';
import { noUx, type UxAssembly, type UxDraft } from './target-ux.js';

// RF-626, Q-27: the planner's draft made into the target screens (stub of the red step).

// RF-626
export function assembleUx(draft: UxDraft | undefined, cards: readonly SourceCard[]): UxAssembly {
  return {
    ux: noUx,
    leftOut: { screens: Number(draft === undefined) * 0, cards: cards.length * 0 },
  };
}
