import type { ApiContract } from './api-contract.js';
import type { DefaultedQuestion } from './brief-questions.js';
import { keepLegacyDefault } from './legacy-default.js';
import type { PlanningBrief, StackLayer } from './planning-brief.js';
import { traitsOf, type StackTrait } from './stack-catalogue.js';

// RF-609, DEC-80, DEC-135: the stack consistency check. A small, versioned rule table compares the
// choices of the planning brief with each other and with the API contract decision. A rule matches
// when every one of its conditions holds; each match is a clash with a question and a default that
// keeps the legacy behaviour. The check reads the brief and never changes it: the owner's choice
// stays as it was made. A choice the technology table (stack-catalogue.ts) does not name has no
// trait, so it takes part in no rule. To retire a rule, remove its entry.
//
// Not seeded: a data access choice the chosen database does not support. The catalogue holds no
// fact about which data access library supports which database, and a guess would flag valid
// pairs (Entity Framework Core reaches many databases), so the rule waits for that data.

/** Bump when a rule is added, removed or changes what it matches. */
export const stackRulesVersion = 1;

type RuleCondition =
  | {
      readonly on: 'trait';
      readonly layer: StackLayer;
      readonly trait: StackTrait;
      readonly present: boolean;
    }
  | { readonly on: 'contract'; readonly present: boolean };

export interface StackRule {
  readonly id: string;
  /** Every condition must hold for the rule to match. */
  readonly matches: readonly RuleCondition[];
  /** The clash in words; `{front-end}` and `{backend-framework}` stand for the owner's choices. */
  readonly clash: string;
  readonly question: string;
  /** The default of the question; it starts with the legacy-keeping default. */
  readonly answer: string;
}

export interface StackClash {
  readonly rule: string;
  readonly version: number;
  /** Holds the owner's choices, which are untrusted text: the writer escapes it. */
  readonly text: string;
  readonly question: DefaultedQuestion;
}

const unchanged = 'The choices stay recorded as the owner made them until the owner answers.';

export const stackRules: readonly StackRule[] = [
  {
    id: 'server-rendered-front-end-with-api-back-end',
    matches: [
      { on: 'trait', layer: 'front-end', trait: 'server-rendered', present: true },
      { on: 'trait', layer: 'backend-framework', trait: 'api-only', present: true },
    ],
    clash:
      'The front end {front-end} is rendered by the server, so it needs no separate API, yet the back end {backend-framework} only serves an API.',
    question:
      'Should the front end be rendered by the server, with no separate API back end, or should the back end serve an API to a front end that runs in the browser?',
    answer: `${keepLegacyDefault} ${unchanged}`,
  },
  {
    id: 'api-back-end-without-contract',
    matches: [
      { on: 'trait', layer: 'backend-framework', trait: 'api-only', present: true },
      { on: 'trait', layer: 'front-end', trait: 'server-rendered', present: false },
      { on: 'contract', present: false },
    ],
    clash:
      'The back end {backend-framework} only serves an API, yet the package has no API contract, so no operation is described for it.',
    question:
      'Which operations does the API of the back end serve, so that the package can hold a contract for them?',
    answer: `${keepLegacyDefault} ${unchanged}`,
  },
];

const MAX_CHOICE_CHARS = 80;

function choiceOf(brief: PlanningBrief, layer: StackLayer): string {
  const choice = brief.stack.find((entry) => entry.layer === layer)?.choice.trim() ?? '';
  return choice.slice(0, MAX_CHOICE_CHARS);
}

function holds(condition: RuleCondition, brief: PlanningBrief, contract: ApiContract): boolean {
  if (condition.on === 'contract') return (contract.kind === 'openapi') === condition.present;
  const traits = traitsOf(condition.layer, choiceOf(brief, condition.layer));
  return traits.has(condition.trait) === condition.present;
}

function clashOf(rule: StackRule, brief: PlanningBrief): StackClash {
  const text = rule.clash
    .replace('{front-end}', choiceOf(brief, 'front-end'))
    .replace('{backend-framework}', choiceOf(brief, 'backend-framework'));
  return {
    rule: rule.id,
    version: stackRulesVersion,
    text,
    question: {
      id: `stack-clash.${rule.id}`,
      question: rule.question,
      answer: rule.answer,
    },
  };
}

/** The clashes the rules find in the brief's stack and the API contract decision, in rule order. */
// RF-609
export function stackClashes(
  brief: PlanningBrief,
  contract: ApiContract,
  rules: readonly StackRule[] = stackRules,
): StackClash[] {
  return rules
    .filter((rule) => rule.matches.every((condition) => holds(condition, brief, contract)))
    .map((rule) => clashOf(rule, brief));
}
