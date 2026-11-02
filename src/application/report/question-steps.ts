import { z } from 'zod';
import type { RunEvent } from '../../domain/runs/run-event.js';
import type { ReportMergedQuestion } from './report-model.js';

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
function answeredStep(data: Record<string, unknown>): QuestionStep | undefined {
  const parsed = answeredData.safeParse(data);
  if (!parsed.success) return undefined;
  return { kind: 'question', label: 'Question answered', text: parsed.data.cardId };
}

/** The step of `question.skipped`: the answered question the re-run left out, and why. */
// RF-241
function skippedStep(data: Record<string, unknown>): QuestionStep | undefined {
  const parsed = skippedData.safeParse(data);
  if (!parsed.success) return undefined;
  const { cardId, runKey, reason } = parsed.data;
  return { kind: 'question', label: 'Question skipped', text: `${cardId} of ${runKey}: ${reason}` };
}

const mergedData = z.object({
  keptCardId: z.string(),
  keptQuestion: z.string(),
  keptRunKey: z.string(),
  mergedCardId: z.string(),
  mergedQuestion: z.string(),
  mergedRunKey: z.string(),
});

/** The step of `question.merged`: a question asked again that was merged into an earlier one. */
// RF-243, RF-646, EV-57
function mergedQuestionStep(data: Record<string, unknown>): QuestionStep | undefined {
  const parsed = mergedData.safeParse(data);
  if (!parsed.success) return undefined;
  const { keptCardId, mergedCardId, mergedRunKey } = parsed.data;
  return {
    kind: 'question',
    label: 'Question merged',
    text: `${mergedCardId} of ${mergedRunKey} into ${keptCardId}`,
  };
}

/** The pairs of merged questions the events record; data that does not fit gives no pair. */
// RF-243, RF-646, EV-57
export function mergedQuestionsIn(events: readonly RunEvent[]): readonly ReportMergedQuestion[] {
  return events.flatMap((event) => {
    const parsed = event.type === 'question.merged' ? mergedData.safeParse(event.data) : undefined;
    return parsed?.success === true ? [parsed.data] : [];
  });
}

/** The replay handlers of the question events. */
export const questionHandlers = {
  'question.answered': answeredStep,
  'question.skipped': skippedStep,
  'question.merged': mergedQuestionStep,
};
