import type { ApiContract } from '../../domain/planning/api-contract.js';
import type { BriefChoices } from '../../domain/planning/brief-decisions.js';
import type { RestatedDecision } from '../../domain/planning/brief-restated.js';
import type { CatalogueGroup } from '../../domain/planning/catalogue.js';
import type { StyleCheck } from '../../domain/planning/style-rules.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { TargetFlows } from '../../domain/planning/target-flows.js';
import type { TargetUx } from '../../domain/planning/target-ux.js';
import type { DefaultedQuestion } from '../../domain/planning/brief-questions.js';
import type { PlanContent } from '../../domain/planning/plan-content.js';
import type { PrdContent } from '../../domain/planning/prd-content.js';
import type { ExcludedClaim, SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { UploadFacts } from '../../domain/sources/upload-facts.js';
import type { WorkbookFormulas } from '../../domain/planning/workbook-formulas.js';

// RF-601..RF-604, data-model.md section 3.17: everything the hand-off package is written from. The
// planner's content, checked; the cards it may cite with their supported claims and citations;
// the claims left out; the brief's questions that took their default; and the open questions of
// the analysis nobody answered.

export interface PackagePrinciple {
  readonly id: string;
  readonly title: string;
  readonly rule: string;
  readonly why: string;
  /** How a reviewer checks the rule. */
  readonly check: string;
  /** The catalogue group; undefined for an id the catalogue does not know. */
  readonly group: CatalogueGroup | undefined;
}

/** A document of the package the planner's answer stayed cut off for, after its continuations (RF-604). */
export interface IncompleteDocument {
  readonly document: 'prd' | 'dataModel' | 'flows' | 'apiContract' | 'ux';
  /** The output-token limit the answer hit: the planner's `maxOutputTokens`. */
  readonly outputTokens: number;
}

/** An open question of the analysis that has no answer yet. */
interface UnansweredQuestion {
  /** The area of the question's card; the cards built from sources in it wait on it (RF-637). */
  readonly area: string;
  readonly cardId: string;
  readonly question: string;
}

export interface HandoffPackage {
  /** The legacy repository and the commit the cards were read at. */
  readonly repository: { readonly url: string; readonly commitSha: string | null };
  /** RF-131: set for an uploaded zip, which has no repository address or commit to name. */
  readonly upload?: UploadFacts | undefined;
  /** The folder name of the understand run the package was planned from. */
  readonly sourceRun: string;
  readonly brief: PlanningBrief;
  /** The chosen architecture style as the catalogue states it. */
  readonly style: PackagePrinciple;
  /** The chosen principles and practices, in the brief's order. */
  readonly principles: readonly PackagePrinciple[];
  /** The planner's content and the decision records of the brief's choices (RF-608..RF-610). */
  readonly content: PlanContent;
  /** The decision record of the style, of each chosen stack layer and of the migration. */
  readonly choices: BriefChoices;
  /** RF-608: the planner decisions left out because the record of the brief already decides them. */
  readonly restated: readonly RestatedDecision[];
  /** RF-608: the components that break the rule of the chosen style, and those with no role of it. */
  readonly styleCheck: StyleCheck;
  /** The target tables, with the legacy source of each column and the dropped legacy fields (RF-623). */
  readonly dataModel: TargetDataModel;
  /** The main journeys mapped to target components, and those out of scope (RF-625). */
  readonly flows: TargetFlows;
  /** The API contract: the operations of a separate front end, or why none applies (RF-624). */
  readonly apiContract: ApiContract;
  /** The target screens, how each legacy screen was kept, merged or dropped, and the design brief (RF-626). */
  readonly ux: TargetUx;
  /** The cards with their `Supported` claims, in card order. */
  readonly sources: readonly SourceCard[];
  readonly excluded: readonly ExcludedClaim[];
  readonly briefQuestions: readonly DefaultedQuestion[];
  readonly openQuestions: readonly UnansweredQuestion[];
  /** The product requirements document (RF-621), checked against the supported cards. */
  readonly prd: PrdContent;
  /** The PRD sections the cards could not fill, each with its default (RF-621, DEC-80). */
  readonly prdQuestions: readonly DefaultedQuestion[];
  /** RF-632: the shapes measured from the scan; undefined when the scan could not be read. */
  readonly shapes: ScanShapes | undefined;
  /** P3-94: the formulas of the rendered workbooks; undefined for a project with none (no file is written). */
  readonly workbookFormulas?: WorkbookFormulas | undefined;
  /** RF-604: the documents that stayed cut off, in the order they were written; empty when none did. */
  readonly incomplete: readonly IncompleteDocument[];
}
