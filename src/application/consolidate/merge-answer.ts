import { z } from 'zod';
import type { CardMerge } from '../../domain/cards/card-merge.js';
import { cardLimits } from '../cards/card-limits.js';
import { searchJson } from '../cards/extract-json.js';

// RF-250, ADR-013: the summariser's answer is untrusted text. It is read as `{ "merges": [...] }`
// (fenced or inside prose, like the readers' answers); whether the ids may be merged is decided by
// the domain, not here.

const text = (max: number) => z.string().trim().min(1).max(max);

const merge = z.object({
  ids: z.array(text(cardLimits.maxPathChars)).max(cardLimits.maxCards),
  title: text(cardLimits.maxTitleChars),
  summary: text(cardLimits.maxSummaryChars),
});

const answer = z.object({ merges: z.array(merge).max(cardLimits.maxCards) });

/** The merges the answer asks for (none is a valid answer), or undefined when it holds no list. */
export function parseMergeAnswer(output: string): readonly CardMerge[] | undefined {
  for (const value of searchJson(output.slice(0, cardLimits.maxOutputChars)).values) {
    const parsed = answer.safeParse(value);
    if (parsed.success) return parsed.data.merges;
  }
  return undefined;
}
