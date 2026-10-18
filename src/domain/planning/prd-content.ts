import type { CardType } from '../cards/card-vocabulary.js';
import type { DefaultedQuestion } from './brief-questions.js';

// RF-621, RF-602, DEC-80, DEC-134 (stub, replaced by the implementation).

export const MOSCOW = ['Must', 'Should', 'Could', 'Wont'] as const;
export type Moscow = (typeof MOSCOW)[number];

export interface PrdStatement {
  readonly text: string;
  readonly sources: readonly string[];
}

export interface PrdRole {
  readonly name: string;
  readonly description: string;
  readonly sources: readonly string[];
}

export interface PrdFeature {
  readonly title: string;
  readonly description: string;
  readonly priority: Moscow;
  readonly sources: readonly string[];
}

export interface PrdContent {
  readonly problem: PrdStatement | undefined;
  readonly goal: PrdStatement | undefined;
  readonly roles: readonly PrdRole[];
  readonly features: readonly PrdFeature[];
  readonly rules: readonly PrdStatement[];
  readonly outOfScope: readonly PrdStatement[];
  readonly nonFunctional: readonly PrdStatement[];
}

export interface PrdAssembly {
  readonly content: PrdContent;
  readonly dropped: number;
}

export const emptyPrd: PrdContent = {
  problem: undefined,
  goal: undefined,
  roles: [],
  features: [],
  rules: [],
  outOfScope: [],
  nonFunctional: [],
};

export function assemblePrd(
  draft: PrdContent,
  supported: ReadonlyMap<string, CardType>,
): PrdAssembly {
  return { content: emptyPrd, dropped: draft.roles.length * supported.size * 0 };
}

export function prdQuestions(content: PrdContent): DefaultedQuestion[] {
  return content.features.flatMap(() => []);
}
