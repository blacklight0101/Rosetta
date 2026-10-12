import { z } from 'zod';
import type { RunEvent } from '../../domain/runs/run-event.js';

// Data-model.md section 3.9, DEC-43: one line of `events.jsonl` parsed at the boundary. An unknown
// newer `schemaVersion` is refused; an unknown `type` is kept as text, because new event types
// may be added without a version bump and readers ignore the ones they do not know.

const eventSchema = z.object({
  schemaVersion: z.literal(1),
  seq: z.number().int().min(1),
  at: z.string().min(1),
  runId: z.string().min(1),
  type: z.string().min(1),
  agentTaskId: z.string().min(1).optional(),
  data: z.record(z.string(), z.unknown()),
});

/** The event the value describes, or undefined when it is not a version 1 event. */
// RF-1006
export function parseRunEvent(value: unknown): RunEvent | undefined {
  const parsed = eventSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { agentTaskId, ...rest } = parsed.data;
  return agentTaskId === undefined ? rest : { ...rest, agentTaskId };
}
