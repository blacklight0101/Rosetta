import type { FastifyInstance } from 'fastify';
import type { Logger } from '../../application/ports/logger.js';
import { z } from 'zod';
import type { EstimateRun } from '../../application/estimate/estimate-run.js';
import { Readable } from 'node:stream';
import type { ArchivePart } from '../../application/ports/archive-writer.js';
import type { ExportZip } from '../../application/use-cases/export-zip.js';
import type { GetRun } from '../../application/use-cases/get-run.js';
import type { StartRun } from '../../application/use-cases/start-run.js';
import type { ResumeRun } from '../../application/use-cases/resume-run.js';
import type { ContinueRun } from '../../application/use-cases/continue-run.js';
import type { StopRun } from '../../application/use-cases/stop-run.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { RUN_STAGES } from '../../domain/runs/run-states.js';
import { MAX_AREAS, MAX_AREA_NAME, START_BODY_LIMIT_BYTES } from './area-limits.js';
import { registerAnswerRoutes, type AnswerServices } from './answer-routes.js';
import { registerJourneyRoutes, type JourneyServices } from './journey-routes.js';
import { registerPlanOptionsRoutes, type PlanOptionsServices } from './plan-options-routes.js';
import { registerOverviewRoutes, type OverviewServices } from './overview-routes.js';
import { registerObservabilityRoutes, type ObservabilityServices } from './observability-routes.js';
import { registerEventRoutes, type EventRouteServices } from './run-event-routes.js';
import { registerRunFileRoutes, type RunFileServices } from './run-file-routes.js';
import { signedInOf } from './request-actor.js';
import { registerEstimateRoutes } from './estimate-routes.js';
import { registerDeepenRoutes, type DeepenServices } from './deepen-routes.js';
import { runView } from './run-view.js';

// RF-1006, RF-1108, RF-1105: the run routes.
// - POST /api/projects/:id/runs starts a run of one stage of the user's project: 202 with the run
//   and its queue position (null when it started); a stage that cannot be started yet answers 409
//   (RST-2305), another user's project 404. An understand run takes `areas` and `cloudConsent`; without `areas` it reads the own code only when
//   the project has third-party (library) areas, as the start page does by default, else every area (P3-123);
//   one whose roles need the consent and lack it answers 400 (RST-1515, RF-143); on an uploaded
//   project it also needs `privateCodeConfirmed: true`, else 400 (RST-1521, RF-132).
// - GET and POST /api/projects/:id/estimate give the estimate of an understand run (estimate-routes.ts).
// - GET /api/runs/:runId gives the run as the start answered it (stage, queue and end state, project,
//   totals so far), `reportBuilt`, whether its report exists (P1-130), and `position`, the place of a
//   queued run in the queue counted from 1 (null for any other run; the start page polls it,
//   P1-106): the live run page reads it for a run that has no event yet. Another user's run id answers 404 like an unknown one.
// - GET /api/runs/:runId/events streams the run's events as server-sent events (run-event-routes.ts).
// - GET /api/runs/:runId/zip and /api/runs/:runId/handoff.zip stream the run folder, or only its
//   handoff/ folder, as a zip download (RF-008): 409 (RST-1700) while the run is queued or
//   running, 404 for another user's run id, an unknown id and a run without that folder.
// - POST /api/runs/:runId/stop aborts a running run (202, it ends as Interrupted when its work
//   stops) or cancels a queued one (200); a run that has ended answers 409.
// - POST /api/runs/:runId/resume queues an understand run that stopped at a cap, failed or was
//   interrupted again, as the same run (202 with the run and its position; RF-006); a run that cannot
//   be resumed answers 409 (RST-2307), another user's run 404, a cloud run without consent 400.
// - POST /api/runs/:runId/continue answers Continue (+N) for a run waiting for its owner's approval
//   (RF-432): the approved amount grows by `extra` (the offered N when left out) and the run is
//   queued again (202 with the run and its position); a run that is not paused answers 409,
//   another user's run 404. Stop here is POST /stop, which ends a paused run `CapReached`.
// - POST /api/runs/:runId/deepen and /deepen/estimate: the Deepen of a completed run (deepen-routes.ts, RF-209).
// - GET and PUT /api/runs/:runId/answers: the run's open questions (answer-routes.ts, RF-1007).
// - GET /api/runs/:runId/overview: the run's overview (overview-routes.ts, RF-264).
// - POST /api/projects/:id/plan-options: the options of Plan setup (plan-options-routes.ts, RF-608).
// - GET /api/projects/:id/journey: the facts of the journey strip (journey-routes.ts, RF-615).

export interface RunServices
  extends
    RunFileServices,
    AnswerServices,
    OverviewServices,
    PlanOptionsServices,
    JourneyServices,
    ObservabilityServices,
    EventRouteServices,
    DeepenServices {
  readonly startRun: StartRun;
  readonly estimateRun: EstimateRun;
  readonly getRun: GetRun;
  readonly stopRun: StopRun;
  readonly resumeRun: ResumeRun;
  readonly continueRun: ContinueRun;
  readonly exportZip: ExportZip;
}

const areaName = z.string().min(1).max(MAX_AREA_NAME);

/** Tokens and micro-dollars of an approved amount (RF-430, RF-432). */
const amountShape = {
  tokens: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  costMicros: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
};

/** RF-200, RF-143: the stage, and for understand the areas to read and the cloud consent. */
const startBody = z.strictObject({
  stage: z.enum(RUN_STAGES),
  areas: z.array(areaName).max(MAX_AREAS).optional(),
  cloudConsent: z.boolean().optional(),
  /** RF-132: the second confirmation for the private code of an upload. */
  privateCodeConfirmed: z.boolean().optional(),
  withAnswers: z.boolean().optional(),
  /** RF-614: `plan` is written from this understand run (its id). */
  sourceRunId: z.string().min(1).max(64).optional(),
  /** RF-208, Q-43: `understand` reads again the failed areas of this run (its id) and holds its cards. */
  retryOf: z.string().min(1).max(64).optional(),
  /** RF-430, RF-432: the likely total the start button showed; the server checks it against its own. */
  approvedAmount: z.strictObject(amountShape).optional(),
});

/** Streams one part of a run as an attachment; the file name comes from the run key, cleaned. */
function registerDownload(
  server: FastifyInstance,
  services: RunServices,
  route: { readonly url: string; readonly part: ArchivePart },
): void {
  server.get<{ Params: { runId: string } }>(
    route.url,
    // A HEAD request would build the whole archive to throw it away; the route has no HEAD form.
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.exportZip.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        part: route.part,
      });
      if (!outcome.ok) {
        throw new RosettaError(
          outcome.error === 'in-progress' ? ERROR_CODES.runInProgress : ERROR_CODES.notFound,
        );
      }
      const { fileName, body } = outcome.value;
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${fileName}"`)
        .header('cache-control', 'no-store')
        .send(Readable.from(body));
    },
  );
}

function registerStop(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/stop',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.stopRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) {
        const code = outcome.error === 'not-found' ? ERROR_CODES.notFound : ERROR_CODES.conflict;
        throw new RosettaError(code);
      }
      const { kind, run } = outcome.value;
      const stopping = kind === 'stopping';
      return reply.status(stopping ? 202 : 200).send({ ...runView(run), stopRequested: stopping });
    },
  );
}

function registerResume(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/resume',
    { config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.resumeRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { run, position } = outcome.value;
      return reply.status(202).send({ ...runView(run), position: position ?? null });
    },
  );
}

/** RF-432: N of Continue (+N); at least one of its parts is above zero. */
const continueBody = z
  .strictObject({
    extra: z
      .strictObject(amountShape)
      .refine((extra) => extra.tokens > 0 || extra.costMicros > 0)
      .optional(),
  })
  .optional();

function registerContinue(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { runId: string } }>(
    '/api/runs/:runId/continue',
    { config: { access: 'user' } },
    async (request, reply) => {
      const body = continueBody.safeParse(request.body ?? undefined);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const extra = body.data?.extra;
      const outcome = await services.continueRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
        ...(extra === undefined ? {} : { extra }),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { run, position } = outcome.value;
      return reply.status(202).send({ ...runView(run), position: position ?? null });
    },
  );
}

function registerGet(server: FastifyInstance, services: RunServices): void {
  server.get<{ Params: { runId: string } }>(
    '/api/runs/:runId',
    { exposeHeadRoute: false, config: { access: 'user' } },
    async (request, reply) => {
      const outcome = await services.getRun.execute({
        actor: signedInOf(request).actor,
        runId: request.params.runId,
      });
      if (!outcome.ok) throw new RosettaError(ERROR_CODES.notFound);
      const { run, reportBuilt, position } = outcome.value;
      return reply.status(200).send({ ...runView(run), reportBuilt, position });
    },
  );
}

/** The optional fields of the start body that were sent; an absent one is left out. */
function sentOf(data: z.output<typeof startBody>) {
  const { areas, cloudConsent, privateCodeConfirmed, withAnswers } = data;
  const { sourceRunId, retryOf, approvedAmount } = data;
  return {
    ...(areas === undefined ? {} : { areas }),
    ...(cloudConsent === undefined ? {} : { cloudConsent }),
    ...(privateCodeConfirmed === undefined ? {} : { privateCodeConfirmed }),
    ...(withAnswers === undefined ? {} : { withAnswers }),
    ...(sourceRunId === undefined ? {} : { sourceRunId }),
    ...(retryOf === undefined ? {} : { retryOf }),
    ...(approvedAmount === undefined ? {} : { approvedAmount }),
  };
}

function registerStart(server: FastifyInstance, services: RunServices): void {
  server.post<{ Params: { id: string } }>(
    '/api/projects/:id/runs',
    { bodyLimit: START_BODY_LIMIT_BYTES, config: { access: 'user' } },
    async (request, reply) => {
      const body = startBody.safeParse(request.body);
      if (!body.success) throw new RosettaError(ERROR_CODES.requestInvalid);
      const outcome = await services.startRun.execute({
        actor: signedInOf(request).actor,
        projectId: request.params.id,
        stage: body.data.stage,
        ...sentOf(body.data),
      });
      if (!outcome.ok) throw new RosettaError(outcome.error);
      const { run, position } = outcome.value;
      return reply.status(202).send({ ...runView(run), position: position ?? null });
    },
  );
}

// RF-1006, RF-1108, RF-1105
export function registerRunRoutes(
  server: FastifyInstance,
  services: RunServices,
  logger: Logger,
): void {
  registerGet(server, services);
  registerEventRoutes(server, services, logger);
  registerDownload(server, services, { url: '/api/runs/:runId/zip', part: 'run' });
  registerDownload(server, services, { url: '/api/runs/:runId/handoff.zip', part: 'handoff' });
  registerRunFileRoutes(server, services);
  registerStop(server, services);
  registerResume(server, services);
  registerContinue(server, services);
  registerDeepenRoutes(server, services);
  registerStart(server, services);
  registerEstimateRoutes(server, services);
  registerAnswerRoutes(server, services);
  registerJourneyRoutes(server, services);
  registerOverviewRoutes(server, services);
  registerPlanOptionsRoutes(server, services);
  registerObservabilityRoutes(server, services);
}
