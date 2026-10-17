import type { DefaultedQuestion } from '../../domain/planning/brief-questions.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import type { ExcludedClaim, SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-601..RF-604, data-model.md section 3.17: everything the hand-off package is written from. The
// planner's content, checked; the cards it may cite with their supported claims and citations;
// the claims left out; the brief's questions that took their default; and the open questions of
// the analysis nobody answered.

export interface PackagePrinciple {
  readonly id: string;
  readonly title: string;
  readonly rule: string;
}

/** An open question of the analysis that has no answer yet. */
interface UnansweredQuestion {
  readonly cardId: string;
  readonly question: string;
}

export interface HandoffPackage {
  /** The legacy repository and the commit the cards were read at. */
  readonly repository: { readonly url: string; readonly commitSha: string | null };
  /** The folder name of the understand run the package was planned from. */
  readonly sourceRun: string;
  readonly brief: PlanningBrief;
  /** The chosen architecture style as the catalogue states it. */
  readonly style: PackagePrinciple;
  /** The chosen principles and practices, in the brief's order. */
  readonly principles: readonly PackagePrinciple[];
  readonly content: PlanContent;
  /** The cards with their `Supported` claims, in card order. */
  readonly sources: readonly SourceCard[];
  readonly excluded: readonly ExcludedClaim[];
  readonly briefQuestions: readonly DefaultedQuestion[];
  readonly openQuestions: readonly UnansweredQuestion[];
}
