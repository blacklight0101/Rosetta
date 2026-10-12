import { z } from 'zod';

// RF-1002, RF-1006, data-model.md section 3.9: one run event as the stream delivers it. The data of
// each type is parsed where it is used; here only the envelope is checked. A type this page does not
// know is still an event: new types may be added without a version bump.

export interface RunEvent {
  readonly seq: number;
  readonly at: string;
  readonly runId: string;
  readonly type: string;
  readonly agentTaskId: string | undefined;
  readonly data: Readonly<Record<string, unknown>>;
}

const envelope = z.looseObject({
  seq: z.number().int().positive(),
  at: z.string(),
  runId: z.string(),
  type: z.string().min(1),
  agentTaskId: z.string().optional(),
  data: z.record(z.string(), z.unknown()),
});

/** The event in one `data:` line of the stream, or undefined when it is not a valid event. */
// RF-1006
export function parseRunEvent(text: string): RunEvent | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  const parsed = envelope.safeParse(value);
  if (!parsed.success) return undefined;
  const { seq, at, runId, type, agentTaskId, data } = parsed.data;
  return { seq, at, runId, type, agentTaskId, data };
}
