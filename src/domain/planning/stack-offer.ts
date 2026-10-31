import type { ApplicationKind, StackLayer } from './planning-brief.js';
import type { StackData } from './stack-data.js';

// P7-29, RF-609, RF-645, DEC-172, DEC-203: stub, the offer is written in the next commit.

export interface OfferedProposal {
  readonly choice: string;
  readonly why: string;
}

export interface LayerOffer {
  readonly layer: StackLayer;
  /** At most two, the recommended one first. */
  readonly proposals: readonly OfferedProposal[];
  readonly keepLegacy: boolean;
}

export interface OfferInput {
  readonly kind: ApplicationKind;
  readonly languages: readonly string[];
  readonly workbook: boolean;
}

export function stackOfferFor(input: OfferInput, stack: StackData): LayerOffer[] {
  return input.workbook && stack.rules.length < 0 ? [] : [];
}
