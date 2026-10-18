import type { CardType } from '../cards/card-vocabulary.js';
import type { DefaultedQuestion } from './brief-questions.js';

// RF-621, RF-602, DEC-80, DEC-134, ADR-018: the product requirements document of the package from
// the planner's draft. The draft is untrusted model output: every card id it names is kept only
// when it is a supported card (a feature only FEAT cards, a business rule only BR cards), and a
// statement left with no such card is dropped, so no statement of the PRD lacks a source card.
// Nothing is invented to fill a section: a section the cards cannot fill, and the success
// measures, which no card can answer, become questions with a default (DEC-80) and the document
// shows a marked placeholder in their place.

/** MoSCoW (RF-621); `Wont` is "won't have this time". */
export const MOSCOW = ['Must', 'Should', 'Could', 'Wont'] as const;
export type Moscow = (typeof MOSCOW)[number];

interface PrdStatement {
  readonly text: string;
  /** Card ids. */
  readonly sources: readonly string[];
}

interface PrdRole {
  readonly name: string;
  readonly description: string;
  readonly sources: readonly string[];
}

interface PrdFeature {
  readonly title: string;
  readonly description: string;
  readonly priority: Moscow;
  /** `FEAT` card ids. */
  readonly sources: readonly string[];
}

/** The PRD as the planner drafts it and as the package holds it once checked. */
export interface PrdContent {
  readonly problem: PrdStatement | undefined;
  readonly goal: PrdStatement | undefined;
  readonly roles: readonly PrdRole[];
  readonly features: readonly PrdFeature[];
  /** The business rules to keep; `BR` card ids. */
  readonly rules: readonly PrdStatement[];
  readonly outOfScope: readonly PrdStatement[];
  readonly nonFunctional: readonly PrdStatement[];
}

export interface PrdAssembly {
  readonly content: PrdContent;
  /** How many statements of the draft the PRD leaves out. */
  readonly dropped: number;
}

/** A PRD with nothing in it: every section is a placeholder. */
export const emptyPrd: PrdContent = {
  problem: undefined,
  goal: undefined,
  roles: [],
  features: [],
  rules: [],
  outOfScope: [],
  nonFunctional: [],
};

type Supported = ReadonlyMap<string, CardType>;

/** The ids that are supported cards (of the given type, when one is given), once each. */
function known(sources: readonly string[], supported: Supported, type?: CardType): string[] {
  const kept = sources.filter((id) => {
    const found = supported.get(id);
    return found !== undefined && (type === undefined || found === type);
  });
  return [...new Set(kept)];
}

/** The items with at least one source card left, each with only those cards. */
function checked<T extends { readonly sources: readonly string[] }>(
  items: readonly T[],
  supported: Supported,
  type?: CardType,
): T[] {
  return items.flatMap((item) => {
    const sources = known(item.sources, supported, type);
    return sources.length === 0 ? [] : [{ ...item, sources }];
  });
}

function statementOf(
  statement: PrdStatement | undefined,
  supported: Supported,
): PrdStatement | undefined {
  return statement === undefined ? undefined : checked([statement], supported)[0];
}

function count(content: PrdContent): number {
  const single = [content.problem, content.goal].filter((each) => each !== undefined).length;
  const lists = [content.roles, content.features, content.rules];
  return [...lists, content.outOfScope, content.nonFunctional].reduce(
    (total, list) => total + list.length,
    single,
  );
}

// RF-621, RF-602
export function assemblePrd(draft: PrdContent, supported: Supported): PrdAssembly {
  const content: PrdContent = {
    problem: statementOf(draft.problem, supported),
    goal: statementOf(draft.goal, supported),
    roles: checked(draft.roles, supported),
    features: checked(draft.features, supported, 'FEAT'),
    rules: checked(draft.rules, supported, 'BR'),
    outOfScope: checked(draft.outOfScope, supported),
    nonFunctional: checked(draft.nonFunctional, supported),
  };
  return { content, dropped: count(draft) - count(content) };
}

interface SectionQuestion extends DefaultedQuestion {
  readonly filled: (content: PrdContent) => boolean;
}

const notStated = 'Not stated; the package assumes nothing about it.';

const sectionQuestions: readonly SectionQuestion[] = [
  {
    ...{ id: 'prd.problem', question: 'What problem does the modernisation solve?' },
    answer: notStated,
    filled: (content) => content.problem !== undefined,
  },
  {
    ...{ id: 'prd.goal', question: 'What is the goal of the modernisation?' },
    answer:
      'Replace the legacy system the way the planning brief chooses; no other goal is assumed.',
    filled: (content) => content.goal !== undefined,
  },
  {
    ...{ id: 'prd.roles', question: 'Which users and roles will the new system have?' },
    answer: 'No role is stated; the package assumes none.',
    filled: (content) => content.roles.length > 0,
  },
  {
    ...{
      id: 'prd.features',
      question: 'Which features does the new system offer, and with which priority?',
    },
    answer: 'No feature is prioritised; the package assumes none.',
    filled: (content) => content.features.length > 0,
  },
  {
    ...{ id: 'prd.rules', question: 'Which business rules must the new system keep?' },
    answer: 'None beyond the cards of the analysis; the package assumes no other rule.',
    filled: (content) => content.rules.length > 0,
  },
  {
    ...{ id: 'prd.out-of-scope', question: 'What is out of scope for the new system?' },
    answer: 'Nothing is declared out of scope.',
    filled: (content) => content.outOfScope.length > 0,
  },
  {
    ...{
      id: 'prd.non-functional',
      question: 'Which non-functional expectations apply (speed, security, availability)?',
    },
    answer: 'None stated; the package sets no target.',
    filled: (content) => content.nonFunctional.length > 0,
  },
  {
    ...{
      id: 'prd.success-measures',
      question: 'Which measures show that the modernisation succeeded?',
    },
    answer: 'None; the package sets no measure of success.',
    filled: () => false,
  },
];

/**
 * The questions for the sections the cards could not fill, and for the success measures, which no
 * code can answer, each with the default the package was written with (DEC-80).
 */
// RF-621
export function prdQuestions(content: PrdContent): DefaultedQuestion[] {
  return sectionQuestions
    .filter((section) => !section.filled(content))
    .map(({ id, question, answer }) => ({ id, question, answer }));
}
