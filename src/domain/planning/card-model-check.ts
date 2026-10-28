import { modelTiers, type BuildMethod } from './build-method.js';
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
  readonly severity: 'finding' | 'warning' | 'note';
}

/** A local model builds only scripted cards of difficulty 1 and 2 (Q-F). */
const localModelCeiling = 2;

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
  if (rank(card.builderTier) < rank(tierOfRating(card.rating))) kinds.push('tier-below-band');
  if (atRisk && rank(card.builderTier) < rank('middle')) kinds.push('risk-tier-below-middle');
  if (atRisk && card.verifierTier !== 'largest') kinds.push('risk-verifier-below-largest');
  if (rank(card.verifierTier) < rank(card.builderTier)) kinds.push('verifier-below-builder');
  if (!card.riskShown) kinds.push('risk-not-shown');
  return kinds;
}

/** DEC-185: the card builds on the escalation model, which is used only with the owner's approval. */
export function usesEscalationModel(method: BuildMethod, model: string | undefined): boolean {
  return model !== undefined && method.models?.escalation === model;
}

/** The findings for one card, in a fixed order; a clean card gives none. */
// RF-641
export function checkCardModel(method: BuildMethod, card: CardModelFacts): ModelFinding[] {
  const found = kindsOf(method, card).map((kind) => ({
    cardId: card.cardId,
    kind,
    severity: 'finding' as const,
  }));
  const warning = card.local && card.rating > localModelCeiling;
  const extra: ModelFinding[] = [];
  if (warning) extra.push({ cardId: card.cardId, kind: 'local-model', severity: 'warning' });
  if (usesEscalationModel(method, card.builderModel))
    extra.push({ cardId: card.cardId, kind: 'escalation-owner-approval', severity: 'note' });
  return [...found, ...extra];
}
