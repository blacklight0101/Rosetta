// Architecture section 5 (state lists): the canonical vocabulary of cards. Other files repeat
// these lists only through these constants.

export const CARD_TYPES = ['FEAT', 'BR', 'ENT', 'INT', 'OQ', 'FLOW', 'SCRN'] as const;
export type CardType = (typeof CARD_TYPES)[number];

/**
 * RF-209, DEC-158: the types a Deepen may add a claim to. A claim of an `OQ` card is its question's
 * evidence, and the claims of a `FLOW` or `SCRN` card are its steps and validations in order, so a
 * fact found later makes a card of its own for those.
 */
export const EXTENDABLE_TYPES: readonly CardType[] = ['FEAT', 'BR', 'ENT', 'INT'];

/** Set by the agent, never by the verifier. */
export const CONFIDENCES = ['High', 'Medium', 'Low'] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const CLAIM_STATUSES = [
  'Proposed',
  'CitationInvalid',
  'Supported',
  'Rejected',
  'Unverified',
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** `Open` -> `Answered` when an answer is recorded and the area re-run (RF-241). */
export type OpenQuestionState = 'Open' | 'Answered';
