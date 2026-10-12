import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { RecordedQuestion } from '../../application/ports/answers-file.js';
import type { ListAnswers } from '../../application/use-cases/list-answers.js';
import type { RecordAnswers } from '../../application/use-cases/record-answers.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-1007, RF-240, RF-1105: the open questions of a run on its live page.
// - GET /api/runs/:runId/answers answers `{ questions }`: the questions the run added to the
//   project's answers.md, each with its card id, question, context and the answer recorded so far
//   (empty while it has none).
// - PUT /api/runs/:runId/answers with `{ answers: [{ cardId, answer }] }` writes those answers into
//   answers.md, keeps every other answer, and answers the run's questions as they are now. An
//   answer is one line in the file (line breaks become spaces) and an empty one clears it. A card
//   id the run has no question for answers 404 and writes nothing; a body that breaks the limits
//   below answers 400 (RST-2000).
// Another user's run id answers 404 like an unknown one, and nothing is written.

export interface AnswerServices {
  readonly listAnswers: ListAnswers;
  readonly recordAnswers: RecordAnswers;
}

/** The longest answer, in characters. */
const MAX_ANSWER = 4000;
/** The most answers in one request. */
const MAX_ANSWERS = 50;
const BODY_LIMIT_BYTES = 256 * 1024;

const answersBody = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        cardId: z.string().regex(/^OQ-\d{1,6}$/u),
        answer: z.string().max(MAX_ANSWER),
      }),
    )
    .max(MAX_ANSWERS)
    .refine((list) => new Set(list.map((entry) => entry.cardId)).size === list.length),
});

function questionsView(questions: readonly RecordedQuestion[]): {
  readonly questions: readonly RecordedQuestion[];
} {
  return {
    questions: questions.map(({ cardId, question, context, answer }) => ({
      cardId,
      question,
      context,
      answer,
    })),
  };
}

// RF-1007, RF-1105
export function registerAnswerRoutes(server: FastifyInstance, services: AnswerServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId/answers',
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.listAnswers.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send(questionsView(outcome.value));
    },
  );
  server.put<{ Params: { runId: string } }>(
    '/api/runs/:runId/answers',
    { bodyLimit: BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const body = answersBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.recordAnswers.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        answers: body.data.answers,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send(questionsView(outcome.value));
    },
  );
}
