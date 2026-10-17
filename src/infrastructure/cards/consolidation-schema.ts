import { z } from 'zod';
import type { ConsolidationRecord } from '../../application/ports/task-results.js';
import { CARD_TYPES } from '../../domain/cards/card-vocabulary.js';

// RF-006, RF-250, data-model.md section 3.7b, P2-35: `consolidation.json` parsed at the boundary.
// Anything that is not a version 1 file of well-formed entries is refused, never guessed.

const text = z.string();

const fileSchema = z.object({
  schemaVersion: z.literal(1),
  types: z.array(z.object({ type: z.enum(CARD_TYPES), cardIds: z.array(text) })),
  merges: z.array(z.object({ ids: z.array(text), title: text, summary: text })),
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
