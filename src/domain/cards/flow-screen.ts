import type { Citation } from './citation.js';

// RF-260, RF-261, ADR-005 (DEC-134): the extra shape of the two card types that describe behaviour
// and surface. A `FLOW` card's steps are its claims, in order, so each step is cited and checked by
// both verifier steps like any claim; what a step touches and its branches ride on the claim. A
// `SCRN` card holds its screen detail next to its claims.

/** Text with the evidence for it: a branch of a step, or a validation of a field. */
export interface CitedText {
  readonly text: string;
  readonly citations: readonly Citation[];
}

/** An error or alternative path of a step, numbered from 1 in the order written. */
export interface Branch extends CitedText {
  readonly number: number;
}

export type DetailProblem =
  | 'flow-missing'
  | 'screen-missing'
  | 'branch-without-citation'
  | 'validation-without-citation'
  | 'action-without-target';

export interface FlowDetail {
  readonly trigger: string;
  readonly outcome: string;
}

export interface ScreenField {
  readonly name: string;
  /** What the agent saw: `text`, `dropdown`, `checkbox`, ... (not a closed list). */
  readonly inputKind: string;
  readonly required: boolean;
  readonly validations: readonly CitedText[];
}

/** What a button or link starts: a handler by name, or a `FLOW` card id. */
export interface ScreenAction {
  readonly label: string;
  readonly handler?: string;
  readonly flow?: string;
}

export interface ScreenDetail {
  /** The route or page name. */
  readonly route: string;
  readonly roles: readonly string[];
  readonly fields: readonly ScreenField[];
  readonly actions: readonly ScreenAction[];
  /** The screens it leads to: `SCRN` card ids or routes. */
  readonly leadsTo: readonly string[];
}
