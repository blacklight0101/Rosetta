import { err, ok, type Result } from '../errors/result.js';
import type { CardType } from './card-vocabulary.js';
import type { Citation } from './citation.js';
import type { PageMarkup } from './page-markup.js';

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
  readonly handler?: string | undefined;
  readonly flow?: string | undefined;
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

/**
 * P5-31: a screen as a draft carries it: with the markup of the page files it cites, read by a
 * language pack. The markup is only input to the claims of the card and is not kept in it.
 */
export interface ScreenInput extends ScreenDetail {
  readonly markup?: readonly PageMarkup[] | undefined;
}

type Detail<T> = Result<T, DetailProblem>;

/** A `FLOW` card needs its trigger and outcome; any other type carries none (RF-260). */
export function flowFields(
  type: CardType,
  flow: FlowDetail | undefined,
): Detail<{ flow?: FlowDetail }> {
  if (type !== 'FLOW') return ok({});
  return flow === undefined ? err('flow-missing') : ok({ flow });
}

function screenProblem(screen: ScreenDetail): DetailProblem | undefined {
  const validations = screen.fields.flatMap((field) => field.validations);
  if (validations.some((validation) => validation.citations.length === 0)) {
    return 'validation-without-citation';
  }
  const named = (action: ScreenAction): boolean =>
    action.handler !== undefined || action.flow !== undefined;
  return screen.actions.every(named) ? undefined : 'action-without-target';
}

/** A `SCRN` card needs its screen; each validation cited, each action naming a target (RF-261). */
export function screenFields(
  type: CardType,
  screen: ScreenDetail | undefined,
): Detail<{ screen?: ScreenDetail }> {
  if (type !== 'SCRN') return ok({});
  if (screen === undefined) return err('screen-missing');
  const problem = screenProblem(screen);
  return problem === undefined ? ok({ screen }) : err(problem);
}

/** What a `FLOW` step adds to its claim: the card it touches and its cited, numbered branches. */
export function stepFields(
  type: CardType,
  step: {
    readonly target?: string | undefined;
    readonly branches?: readonly CitedText[] | undefined;
  },
): Detail<{ target?: string; branches?: readonly Branch[] }> {
  if (type !== 'FLOW') return ok({});
  const { target, branches = [] } = step;
  if (branches.some((branch) => branch.citations.length === 0)) {
    return err('branch-without-citation');
  }
  const numbered = branches.map((branch, index): Branch => ({ ...branch, number: index + 1 }));
  return ok({
    ...(target === undefined ? {} : { target }),
    ...(numbered.length === 0 ? {} : { branches: numbered }),
  });
}
