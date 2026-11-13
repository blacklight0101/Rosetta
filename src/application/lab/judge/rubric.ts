import type { Result } from '../../../domain/errors/result.js';

// RF-1404: the written rubric of a prompt family (`lab/rubrics/<family>.md`).

export const RUBRIC_FAMILIES = [
  'reader',
  'verifier',
  'summariser',
  'planner',
  'cards',
  'shared',
] as const;

export interface RubricCriterion {
  readonly id: string;
  readonly title: string;
  /** A score of 1 on this criterion makes the overall score 1. */
  readonly veto: boolean;
}

export interface Rubric {
  readonly family: string;
  readonly sha256: string;
  readonly text: string;
  readonly criteria: readonly RubricCriterion[];
}

// RF-1404
export function parseRubric(family: string, text: string, sha256: string): Result<Rubric, string> {
  throw new Error(`not implemented: ${family} ${String(text.length)} ${sha256}`);
}
