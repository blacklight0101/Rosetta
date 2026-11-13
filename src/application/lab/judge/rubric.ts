import { err, ok, type Result } from '../../../domain/errors/result.js';

// RF-1407: the written rubric of a prompt family (`lab/rubrics/<family>.md`). A criterion is a
// heading `## <id> - <title>` (with ` [veto]` at the end when a score of 1 on it makes the overall
// score 1) and the text under it, which says what scores 1 to 5 look like. The whole text is what
// the judge reads; the headings are what its reply must score.

export const RUBRIC_FAMILIES = [
  'reader',
  'verifier',
  'summariser',
  'planner',
  'cards',
  'shared',
] as const;

interface RubricCriterion {
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

const MIN_CRITERIA = 3;
const heading = /^## ([a-z][a-z0-9-]{0,39}) - (.+?)( \[veto\])?\s*$/u;

// RF-1407
export function parseRubric(family: string, text: string, sha256: string): Result<Rubric, string> {
  const criteria: RubricCriterion[] = [];
  for (const line of text.split(/\r?\n/u)) {
    const found = heading.exec(line);
    if (found?.[1] === undefined || found[2] === undefined) continue;
    if (criteria.some((each) => each.id === found[1])) {
      return err(`The rubric ${family} names the criterion ${found[1]} twice.`);
    }
    criteria.push({ id: found[1], title: found[2], veto: found[3] !== undefined });
  }
  if (criteria.length < MIN_CRITERIA) {
    return err(`The rubric ${family} needs at least ${String(MIN_CRITERIA)} criteria.`);
  }
  if (!criteria.some((each) => each.id === 'grounding')) {
    return err(`The rubric ${family} has no criterion "grounding".`);
  }
  return ok({ family, sha256, text, criteria });
}
