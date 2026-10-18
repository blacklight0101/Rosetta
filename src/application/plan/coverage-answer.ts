import { z } from 'zod';
import type { CoverageDraft } from '../../domain/planning/plan-coverage.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-627, ADR-013: the planner's links are untrusted text. They are read as one JSON object (fenced
// or inside prose, like the other planner answers) with every list and text bounded; which ids are
// items, and which tasks exist, is decided by the domain (plan-coverage.ts), not here. An answer
// that links nothing (`"links": []`) is an answer; one without a `links` list is not.

const MAX_LINKS = 200;
const MAX_BUILDS = 500;
const ID = 300;

const link = z.object({
  task: z.number().int().min(1).max(MAX_LINKS),
  builds: z.array(z.string().max(ID)).max(MAX_BUILDS),
});

const answer = z.object({ links: z.array(link).max(MAX_LINKS) });

/** The draft of the answer, or undefined when no JSON object of the answer reads as links. */
// RF-627
export function parseCoverageAnswer(output: string): CoverageDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
