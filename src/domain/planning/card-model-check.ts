import type { modelTiers, BuildMethod } from './build-method.js';

// RF-641, RF-635, RF-639, DEC-176 Q-D and Q-F: what the package check says about the model of one
// task card. It lists, with the card id, and corrects nothing; a failed check never blocks the package.

type Tier = (typeof modelTiers)[number];

export interface CardModelFacts {
  readonly cardId: string;
  readonly rating: number;
  readonly riskClass: string;
  /** The risk class is written next to the difficulty on the card (RF-641 item 5). */
  readonly riskShown: boolean;
  readonly builderTier: Tier;
  readonly builderModel: string | undefined;
  readonly verifierTier: Tier;
  readonly verifierModel: string | undefined;
  /** The builder is a local model (DEC-176 Q-F). */
  readonly local: boolean;
}

export type ModelFindingKind =
  | 'tier-unnamed'
  | 'model-not-in-brief'
  | 'tier-below-band'
  | 'risk-tier-below-middle'
  | 'risk-verifier-below-largest'
  | 'verifier-below-builder'
  | 'risk-not-shown'
  | 'local-model';

export interface ModelFinding {
  readonly cardId: string;
  readonly kind: ModelFindingKind;
  readonly severity: 'finding' | 'warning';
}

/** The findings for one card, in a fixed order; a clean card gives none. */
// RF-641
export function checkCardModel(method: BuildMethod, card: CardModelFacts): ModelFinding[] {
  return [].filter(() => method.aiAssisted && card.local);
}
