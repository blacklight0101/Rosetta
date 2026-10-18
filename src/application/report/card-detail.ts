import type {
  CardType,
  Confidence,
  OpenQuestionState,
} from '../../domain/cards/card-vocabulary.js';

// RF-502, RF-125, data-model.md sections 3.7 and 3.17: what the page of a card shows. The text of a
// card, a claim, a reason and a source line is untrusted (repository or model text); the writers of
// the pages show it as text.

/** The cited lines with their context, or why they are not shown. */
export type ReportExcerpt =
  | {
      readonly kind: 'lines';
      /** The number of the first line in `lines` (1-based): the context starts before the citation. */
      readonly firstLine: number;
      /** Source code of the analysed repository: untrusted. */
      readonly lines: readonly string[];
    }
  | { readonly kind: 'unavailable'; readonly reason: string };

export interface ReportCitation {
  /** Repository-relative, forward slashes. */
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly excerpt: ReportExcerpt;
}

export interface ReportClaim {
  /** `<card id>.c<n>`. */
  readonly claimId: string;
  /** Model text: untrusted. */
  readonly text: string;
  /** A `ClaimStatus`. */
  readonly status: string;
  /** The verifier's reason for the status (data-model.md 3.7 `verdict.reason`); model text. */
  readonly reason?: string;
  readonly citations: readonly ReportCitation[];
}

export interface ReportCardDetail {
  readonly id: string;
  readonly type: CardType;
  readonly title: string;
  readonly summary: string;
  readonly area: string;
  readonly confidence: Confidence;
  /** RF-206: why to read the card with care. */
  readonly note?: string;
  /** `OQ` cards only. */
  readonly question?: string;
  readonly whyItMatters?: string;
  readonly questionState?: OpenQuestionState;
  readonly claims: readonly ReportClaim[];
}
