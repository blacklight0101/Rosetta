import { z } from 'zod';

// RF-241, RF-1007, RF-506: the replay steps of the events about the open questions of a run. Data
// that does not fit its event gives no step.

interface QuestionStep {
  readonly kind: 'question';
  readonly label: string;
  readonly text: string;
}

const answeredData = z.object({ cardId: z.string() });
const skippedData = z.object({ cardId: z.string(), runKey: z.string(), reason: z.string() });

/** The step of `question.answered`. */
export function answeredStep(data: Record<string, unknown>): QuestionStep | undefined {
  const parsed = answeredData.safeParse(data);
  if (!parsed.success) return undefined;
  return { kind: 'question', label: 'Question answered', text: parsed.data.cardId };
}

/** The step of `question.skipped`: the answered question the re-run left out, and why. */
// RF-241
export function skippedStep(data: Record<string, unknown>): QuestionStep | undefined {
  const parsed = skippedData.safeParse(data);
  if (!parsed.success) return undefined;
  const { cardId, runKey, reason } = parsed.data;
  return { kind: 'question', label: 'Question skipped', text: `${cardId} of ${runKey}: ${reason}` };
}
