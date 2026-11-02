import { localModelCeiling, modelTiers, type BuildMethod } from './build-method.js';
import { tierOfRating } from './task-method.js';

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
  /**
   * The Status line of the card. At plan time a card has none; the orchestrator writes
   * `escalationApprovedText` on it at the third FAIL, with the owner's approval in chat.
   */
  readonly status: string | undefined;
}

export type ModelFindingKind =
  | 'tier-unnamed'
  | 'model-not-in-brief'
  | 'tier-below-band'
  | 'risk-tier-below-middle'
  | 'risk-verifier-below-largest'
  | 'verifier-below-builder'
  | 'risk-not-shown'
  | 'local-model'
  | 'escalation-owner-approval';

export interface ModelFinding {
  readonly cardId: string;
  readonly kind: ModelFindingKind;
  readonly severity: 'finding' | 'warning';
}

const rank = (tier: Tier): number => modelTiers.indexOf(tier);

function namedModels(method: BuildMethod): string[] {
  const models = method.models ?? {};
  return [models.smallest, models.middle, models.largest, models.escalation].flatMap((each) =>
    each === undefined ? [] : [each],
  );
}

function kindsOf(method: BuildMethod, card: CardModelFacts): ModelFindingKind[] {
  const kinds: ModelFindingKind[] = [];
  const atRisk = card.riskClass !== 'none';
  if (card.builderModel === undefined) kinds.push('tier-unnamed');
  else if (!namedModels(method).includes(card.builderModel)) kinds.push('model-not-in-brief');
  if (rank(card.builderTier) < rank(tierOfRating(card.rating, method)))
    kinds.push('tier-below-band');
  if (atRisk && rank(card.builderTier) < rank('middle')) kinds.push('risk-tier-below-middle');
  if (atRisk && card.verifierTier !== 'largest') kinds.push('risk-verifier-below-largest');
  if (rank(card.verifierTier) < rank(card.builderTier)) kinds.push('verifier-below-builder');
  if (!card.riskShown) kinds.push('risk-not-shown');
  return kinds;
}

/** The text the orchestrator writes on a card's Status line when the owner approved the escalation model. */
export const escalationApprovedText = 'escalation, owner approved';

/**
 * The owner's decision of 2026-10-29 (supersedes DEC-185 item 7): a card on the escalation model is
 * accepted only when its status carries the approval text; it is never set at plan time.
 */
function needsEscalationApproval(method: BuildMethod, card: CardModelFacts): boolean {
  const escalation = method.models?.escalation;
  if (escalation === undefined || card.builderModel !== escalation) return false;
  return card.status?.includes(escalationApprovedText) !== true;
}

/** The findings for one card, in a fixed order; a clean card gives none. */
// RF-641
export function checkCardModel(method: BuildMethod, card: CardModelFacts): ModelFinding[] {
  const kinds = kindsOf(method, card);
  if (needsEscalationApproval(method, card)) kinds.push('escalation-owner-approval');
  const found = kinds.map((kind) => ({
    cardId: card.cardId,
    kind,
    severity: 'finding' as const,
  }));
  const warning = card.local && card.rating > localModelCeiling;
  return warning
    ? [
        ...found,
        { cardId: card.cardId, kind: 'local-model' as const, severity: 'warning' as const },
      ]
    : found;
}
