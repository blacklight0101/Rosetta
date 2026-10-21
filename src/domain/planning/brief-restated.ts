import type { Catalogue } from './catalogue.js';
import { briefDecisions, type BriefChoices } from './brief-decisions.js';
import type { PlanContent } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';

// RF-608, RF-609, RF-610: a decision the brief records is not written twice.

/** A planner decision the package left out because the brief's record already decides it. */
export interface RestatedDecision {
  readonly title: string;
  /** The id of the brief's record that decides it. */
  readonly record: string;
}

export interface DecidedOnce {
  readonly content: PlanContent;
  readonly choices: BriefChoices;
  readonly restated: readonly RestatedDecision[];
}

export function decideOnce(
  content: PlanContent,
  brief: PlanningBrief,
  catalogue: Catalogue,
  supported: ReadonlySet<string>,
): DecidedOnce {
  const fromBrief = briefDecisions(brief, catalogue, supported, content.decisions.length);
  return {
    content: { ...content, decisions: [...content.decisions, ...fromBrief.decisions] },
    choices: fromBrief.choices,
    restated: [],
  };
}
