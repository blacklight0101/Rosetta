import { z } from 'zod';
import type { ApiClient, ApiResult } from './client.js';

// RF-1007, answer-routes.ts: the open questions of a run and the answers recorded in the project's
// answers.md. Another user's run answers 404 like an unknown one (RF-1105).

const questionSchema = z.looseObject({
  cardId: z.string(),
  question: z.string(),
  context: z.string(),
  answer: z.string(),
});

const questionsSchema = z
  .looseObject({ questions: z.array(questionSchema) })
  .transform((body) => body.questions);

export type OpenQuestionRow = z.output<typeof questionSchema>;

const pathOf = (runId: string): string => `/api/runs/${encodeURIComponent(runId)}/answers`;

// RF-1007
export function getAnswers(
  client: ApiClient,
  runId: string,
  signal: AbortSignal,
): Promise<ApiResult<readonly OpenQuestionRow[]>> {
  return client.request({ method: 'GET', path: pathOf(runId), schema: questionsSchema, signal });
}

/** Records one answer; the answer lists the run's questions as they are now. */
// RF-1007
export function saveAnswer(
  client: ApiClient,
  runId: string,
  answer: { readonly cardId: string; readonly answer: string },
): Promise<ApiResult<readonly OpenQuestionRow[]>> {
  return client.request({
    method: 'PUT',
    path: pathOf(runId),
    body: { answers: [answer] },
    schema: questionsSchema,
  });
}
