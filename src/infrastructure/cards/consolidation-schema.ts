import { z } from 'zod';
import type { ConsolidationRecord } from '../../application/ports/task-results.js';
import { cardLimits } from '../../application/cards/card-limits.js';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';

// RF-006, RF-250, data-model.md section 3.7b, P2-35: `consolidation.json` parsed at the boundary.
// Anything that is not a version 1 file of well-formed entries is refused, never guessed.

const text = z.string();

// Bounds: a run holds at most a few thousand cards; the merge answer is bounded the same way when
// it is parsed (merge-answer.ts), so a stored merge never exceeds what the summariser could give.
const fileSchema = z.object({
  schemaVersion: z.literal(1),
  types: z
    .array(z.object({ type: z.enum(CARD_TYPES), cardIds: z.array(text.max(64)).max(100_000) }))
    .max(CARD_TYPES.length),
  merges: z
    .array(
      z.object({
        ids: z.array(text.max(64)).max(cardLimits.maxCards),
        title: text.max(cardLimits.maxTitleChars),
        summary: text.max(cardLimits.maxSummaryChars),
      }),
    )
    .max(10_000),
});

/** The record the value describes, or undefined when it is not a version 1 record. */
// RF-006
export function parseConsolidation(value: unknown): ConsolidationRecord | undefined {
  const parsed = fileSchema.safeParse(value);
  return parsed.success ? { types: parsed.data.types, merges: parsed.data.merges } : undefined;
}

/** The file's data for a record; keys are in a fixed order so the same record gives the same bytes. */
export function consolidationFile(record: ConsolidationRecord): unknown {
  return { schemaVersion: 1, types: record.types, merges: record.merges };
}
