import { z } from 'zod';
import type { GapDraft } from '../../domain/planning/plan-gap.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';
import { taskSchema } from './plan-answer.js';

// Q-45, RF-627, RF-630, ADR-013: the planner's task cards for the items no card builds are untrusted
// text. They are read as one JSON object (fenced or inside prose, like the other planner answers)
// with every list and text bounded, a card being a card of the plan's own answer plus the ids it
// builds. A card that cannot be read is left out and the others stay; which ids are gaps, and
// whether a card is a card an agent can build, is decided by the domain (plan-gap.ts), not here.
// An answer with no card (`"tasks": []`) is an answer; one without a `tasks` list is not.

const MAX_CARDS = 50;
const MAX_BUILDS = 500;
const ID = 300;

const gapTask = taskSchema
  .omit({ needs: true })
  .extend({ builds: z.array(z.string().max(ID)).max(MAX_BUILDS) });

const answer = z.object({ tasks: z.array(z.unknown()).max(MAX_CARDS) });

/** The cards of the answer that read as cards, or undefined when no JSON object reads as a list of them. */
// Q-45
export function parseGapAnswer(output: string): GapDraft[] | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (!parsed.success) continue;
    return parsed.data.tasks.flatMap((each) => {
      const card = gapTask.safeParse(each);
      return card.success ? [card.data] : [];
    });
  }
  return undefined;
}
