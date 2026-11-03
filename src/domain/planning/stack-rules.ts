import type { ApiContract } from './api-contract.js';
import type { DefaultedQuestion } from './brief-questions.js';
import { keepLegacyDefault } from './legacy-default.js';
import type { PlanningBrief, StackLayer } from './planning-brief.js';
import { traitsOf } from './stack-catalogue.js';
import { platformMismatches, type PlatformMismatch } from './stack-platform.js';
import type { RuleCondition, StackData, StackRule } from './stack-data.js';

// RF-609, DEC-80, DEC-135: the stack consistency check. The small, versioned rule table of the
// catalogue (`stack-rules.v<n>.yaml`) compares the choices of the planning brief with each other and
// with the API contract decision. A rule matches when every one of its conditions holds; each match
// is a clash with a question and a default that keeps the legacy behaviour. The check reads the
// brief and never changes it: the owner's choice stays as it was made. A choice the technology table
// (`stack-technologies.v<n>.yaml`) does not name has no trait, so it takes part in no rule. To
// retire a rule, remove its entry from the file.
//
// Not seeded: a data access choice the chosen database does not support. The catalogue holds no
// fact about which data access library supports which database, and a guess would flag valid
// pairs (Entity Framework Core reaches many databases), so the rule waits for that data.

export interface StackClash {
  readonly rule: string;
  readonly version: number;
  /** Holds the owner's choices, which are untrusted text: the writer escapes it. */
  readonly text: string;
  readonly question: DefaultedQuestion;
}

const MAX_CHOICE_CHARS = 80;

function choiceOf(brief: PlanningBrief, layer: StackLayer): string {
  const choice = brief.stack.find((entry) => entry.layer === layer)?.choice.trim() ?? '';
  return choice.slice(0, MAX_CHOICE_CHARS);
}

function holds(
  condition: RuleCondition,
  facts: { brief: PlanningBrief; contract: ApiContract; stack: StackData },
): boolean {
  if (condition.on === 'platform') return true;
  if (condition.on === 'contract') {
    return (facts.contract.kind === 'openapi') === condition.present;
  }
  const layer = condition.layer as StackLayer;
  const traits = traitsOf(facts.stack.technologies, layer, choiceOf(facts.brief, layer));
  return traits.has(condition.trait) === condition.present;
}

function clashOf(rule: StackRule, version: number, brief: PlanningBrief): StackClash {
  const text = rule.clash
    .replace('{front-end}', choiceOf(brief, 'front-end'))
    .replace('{backend-framework}', choiceOf(brief, 'backend-framework'));
  return {
    rule: rule.id,
    version,
    text,
    question: { id: `stack-clash.${rule.id}`, question: rule.question, answer: rule.answer },
  };
}

const noRecommendation = `${keepLegacyDefault} The choice stays as the owner made it until the owner answers.`;

/** DEC-208: the clash of one layer whose technology belongs to another platform than the language. */
function platformClash(rule: StackRule, version: number, found: PlatformMismatch): StackClash {
  const fill = (text: string): string =>
    text
      .replaceAll('{technology}', found.technology)
      .replaceAll('{platform}', found.platform)
      .replaceAll('{language}', found.language);
  const answer =
    found.recommended === undefined
      ? noRecommendation
      : fill(rule.answer).replaceAll('{recommended}', found.recommended);
  return {
    rule: rule.id,
    version,
    text: fill(rule.clash),
    question: {
      id: `stack-clash.${rule.id}.${found.layer}`,
      question: fill(rule.question),
      answer,
    },
  };
}

/** The clashes the rules find in the brief's stack and the API contract decision, in rule order. */
// RF-609
export function stackClashes(
  brief: PlanningBrief,
  contract: ApiContract,
  stack: StackData,
): StackClash[] {
  const facts = { brief, contract, stack };
  return stack.rules.flatMap((rule) => {
    if (!rule.matches.every((condition) => holds(condition, facts))) return [];
    if (!rule.matches.some((condition) => condition.on === 'platform')) {
      return [clashOf(rule, stack.rulesVersion, brief)];
    }
    return platformMismatches(brief, stack).map((found) =>
      platformClash(rule, stack.rulesVersion, found),
    );
  });
}
