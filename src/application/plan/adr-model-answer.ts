import { z } from 'zod';
import type { AdrModelDraft } from '../../domain/planning/adr-model-check.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-623, P9-15, ADR-013: the answer of the check of the data model against the decision records is
// untrusted text, read as one JSON object (fenced or inside prose, like the other planner answers)
// with every list and text bounded. An answer that lists nothing (`"missing": []`) is an answer; one
// without that list, or with an entry out of shape, is not, and the check could not run. Which
// records were sent and which tables the model has is decided by the domain (adr-model-check.ts).

const MAX_MISSING = 100;

const entry = z.object({
  decision: z.string().trim().min(1).max(40),
  structure: z.string().trim().min(1).max(200),
  reason: z.string().trim().max(600),
});

const answer = z.object({ missing: z.array(entry).max(MAX_MISSING) });

/** The draft of the answer, or undefined when no JSON object of the answer reads as one. */
// RF-623
export function parseAdrModelAnswer(output: string): AdrModelDraft | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
