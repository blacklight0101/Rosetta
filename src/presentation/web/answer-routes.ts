import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { CountAnsweredQuestions } from '../../application/use-cases/count-answered-questions.js';
import type { StatedQuestion } from '../../application/use-cases/question-states.js';
import type { ListAnswers } from '../../application/use-cases/list-answers.js';
import type { RecordAnswers } from '../../application/use-cases/record-answers.js';
import type { ReopenQuestion } from '../../application/use-cases/reopen-question.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { signedInOf } from './request-actor.js';

// RF-1007, RF-240, RF-1105: the open questions of a run on its live page.
// - GET /api/runs/:runId/answers answers `{ questions }`: the questions the run added to the
//   project's answers.md, each with its card id, question, context and the answer recorded so far
//   (empty while it has none), its state, `Open` or `Answered` (RF-241), and `dependents`, how many
//   cards other than open questions cite a file the question's cards cite (RF-1017). A question with
//   suggested answers (RF-645) also has `options` (answer, description, recommended; the recommended
//   one first) and `chosen` (`''`, the number of the chosen option or `typed`); a question saved
//   before DEC-178 has neither and keeps its free answer.
// - PUT /api/runs/:runId/answers with `{ answers: [{ cardId, answer }] }` writes those answers into
//   answers.md, keeps every other answer, and answers the run's questions as they are now. An
//   answer is one line in the file (line breaks become spaces) and an empty one clears it. A card
//   id the run has no question for answers 404 and writes nothing; a body that breaks the limits
//   below answers 400 (RST-2000), and so does a `chosen` option the question does not offer. An entry
//   may carry `chosen`: the number (from 1) of the suggested answer chosen, whose own text is then
//   written, or `typed` for the user's own answer (RF-645).
// - POST /api/runs/:runId/answers/:cardId/reopen opens an Answered question again, so an answer edited
//   after that is used by the next re-run with answers (RF-241), and answers the run's questions as
//   they are now. A question that is still Open changes nothing; a card id the run has no question
//   for answers 404.
// - GET /api/projects/:id/answered-questions answers `{ count }`: the questions with an answer
//   whose card is still Open, which a re-run with answers would use (RF-241).
// Another user's run or project id answers 404 like an unknown one, and nothing is written.

export interface AnswerServices {
  readonly listAnswers: ListAnswers;
  readonly countAnswered: CountAnsweredQuestions;
  readonly recordAnswers: RecordAnswers;
  readonly reopenQuestion: ReopenQuestion;
}

/** The longest answer, in characters. */
const MAX_ANSWER = 4000;
/** The most answers in one request. */
const MAX_ANSWERS = 50;
/** The most suggested answers a question can offer. */
const MAX_OPTIONS = 20;
const BODY_LIMIT_BYTES = 256 * 1024;

const answersBody = z.strictObject({
  answers: z
    .array(
      z.strictObject({
        cardId: z.string().regex(/^OQ-\d{1,6}$/u),
        answer: z.string().max(MAX_ANSWER),
        // RF-645: the number of the suggested answer chosen, or `typed`; absent for a free answer.
        chosen: z.union([z.int().min(1).max(MAX_OPTIONS), z.literal('typed')]).optional(),
      }),
    )
    .max(MAX_ANSWERS)
    .refine((list) => new Set(list.map((entry) => entry.cardId)).size === list.length),
});

function questionsView(questions: readonly StatedQuestion[]): {
  readonly questions: readonly StatedQuestion[];
} {
  return {
    questions: questions.map(
      ({ cardId, question, context, answer, state, dependents, options, chosen }) => ({
        ...{ cardId, question, context, answer, state, dependents },
        ...(options === undefined ? {} : { options, chosen: chosen ?? '' }),
      }),
    ),
  };
}

// RF-241, RF-1105
function registerCountRoute(server: FastifyInstance, services: AnswerServices): void {
  server.get<{ Params: { id: string } }>(
    '/api/projects/:id/answered-questions',
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.countAnswered.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      return reply.header('cache-control', 'no-store').send({ count: outcome.value });
    },
  );
}

// RF-241, RF-1105
function registerReopenRoute(server: FastifyInstance, services: AnswerServices): void {
  server.post<{ Params: { runId: string; cardId: string } }>(
    '/api/runs/:runId/answers/:cardId/reopen',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.reopenQuestion.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        cardId: request.params.cardId,
      });
      if (!outcome.ok) {
        throw new RosettaError(
          outcome.error === 'not-found' ? ERROR_CODES.notFound : ERROR_CODES.conflict,
        );
      }
      return reply.header('cache-control', 'no-store').send(questionsView(outcome.value));
    },
  );
}

// RF-1007, RF-1105
export function registerAnswerRoutes(server: FastifyInstance, services: AnswerServices): void {
  registerCountRoute(server, services);
  registerReopenRoute(server, services);
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
      if (!outcome.ok) {
        throw new RosettaError(
          outcome.error === 'invalid-choice' ? ERROR_CODES.requestInvalid : ERROR_CODES.notFound,
        );
      }
      return reply.header('cache-control', 'no-store').send(questionsView(outcome.value));
    },
  );
}
