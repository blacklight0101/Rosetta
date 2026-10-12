// Architecture section 5 (state lists): the canonical vocabulary of cards. Other files repeat
// these lists only through these constants.

export const CARD_TYPES = ['FEAT', 'BR', 'ENT', 'INT', 'OQ'] as const;
export type CardType = (typeof CARD_TYPES)[number];

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
