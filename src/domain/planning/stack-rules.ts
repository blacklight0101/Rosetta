import type { ApiContract } from './api-contract.js';
import type { DefaultedQuestion } from './brief-questions.js';
import type { PlanningBrief, StackLayer } from './planning-brief.js';

// RF-633: stub, filled in by the next commit.

export const stackRulesVersion = 1;

interface RuleCondition {
  readonly layer: StackLayer | 'api-contract';
}

interface StackRule {
  readonly id: string;
  readonly matches: readonly RuleCondition[];
  readonly clash: string;
  readonly question: string;
  readonly answer: string;
}

export interface StackClash {
  readonly rule: string;
  readonly version: number;
  readonly text: string;
  readonly question: DefaultedQuestion;
}

export const stackRules: readonly StackRule[] = [];

export function stackClashes(
  _brief: PlanningBrief,
  _contract: ApiContract,
  _rules: readonly StackRule[] = stackRules,
): StackClash[] {
  return _rules.flatMap(() => []);
}
