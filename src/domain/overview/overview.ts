import type { CardType } from '../cards/card-vocabulary.js';

// RF-264, DEC-136: the overview of the application, written once an understand run has ended. The
// vocabulary below is the only place the sections, their titles and the states of the overview are
// listed. A statement of the overview always links the cards it comes from; one without a card is
// never kept.

export const OVERVIEW_SECTIONS = [
  'application',
  'users',
  'features',
  'screens',
  'data',
  'integrations',
] as const;
export type OverviewSectionId = (typeof OVERVIEW_SECTIONS)[number];

export const OVERVIEW_TITLES: Readonly<Record<OverviewSectionId, string>> = {
  application: 'What the application is',
  users: 'Who uses it',
  features: 'Main features',
  screens: 'Screens',
  data: 'Data',
  integrations: 'Integrations',
};

/** The title of the closing part: what the run could not cover. */
export const NOT_COVERED_TITLE = 'What was not covered';

/**
 * `full`: the summariser wrote it from the cards. `thin`: too few cards to explain the application,
 * so the overview says so and names the next step. `unavailable`: the run stopped or the call
 * failed, so only what the run could not cover is told.
 */
export const OVERVIEW_STATES = ['full', 'thin', 'unavailable'] as const;
export type OverviewState = (typeof OVERVIEW_STATES)[number];

export interface OverviewCardRef {
  readonly id: string;
  readonly type: CardType;
}

export interface OverviewStatement {
  /** Model text: untrusted. */
  readonly text: string;
  /** At least one: a statement without a card is not kept. */
  readonly cards: readonly OverviewCardRef[];
}

export interface OverviewSection {
  readonly id: OverviewSectionId;
  readonly statements: readonly OverviewStatement[];
}

/** An open question and the section of the overview it concerns (RF-264). */
export interface QuestionLink {
  readonly cardId: string;
  readonly section: OverviewSectionId;
}

export interface Overview {
  readonly state: OverviewState;
  /** Why the overview is `thin` or `unavailable`, and the next step; absent for a full one. */
  readonly notice?: string;
  /** Only the sections that have a statement, in the order of `OVERVIEW_SECTIONS`. */
  readonly sections: readonly OverviewSection[];
  /** Plain sentences about the areas the run could not explain. */
  readonly notCovered: readonly string[];
  readonly questions: readonly QuestionLink[];
}
