import { z } from 'zod';
import { MOSCOW, type PrdContent } from '../../domain/planning/prd-content.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-621, ADR-013: the planner's PRD answer is untrusted text. It is read as one JSON object
// (fenced or inside prose, like the other roles' answers) with every list and text bounded; which
// card ids it may cite is decided by the domain (prd-content.ts), not here. A part the answer
// leaves out is empty, and a priority outside MoSCoW makes the answer unusable.

const MAX_LIST = 50;
const TITLE = 200;
const TEXT = 2000;

const title = z.string().trim().min(1).max(TITLE);
const text = z.string().trim().min(1).max(TEXT);
const ids = z.array(z.string().max(40)).max(MAX_LIST).default([]);
const statement = z.object({ text, sources: ids });
const statements = z.array(statement).max(MAX_LIST).default([]);

const answer = z.object({
  problem: statement.optional(),
  goal: statement.optional(),
  roles: z
    .array(z.object({ name: title, description: text, sources: ids }))
    .max(MAX_LIST)
    .default([]),
  features: z
    .array(z.object({ title, description: text, priority: z.enum(MOSCOW), sources: ids }))
    .max(MAX_LIST)
    .default([]),
  rules: statements,
  outOfScope: statements,
  nonFunctional: statements,
});

/** The draft of the answer, or undefined when no JSON object of the answer reads as a PRD. */
// RF-621
export function parsePrdAnswer(output: string): PrdContent | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) {
      const { problem, goal, ...lists } = parsed.data;
      return { problem, goal, ...lists };
    }
  }
  return undefined;
}
